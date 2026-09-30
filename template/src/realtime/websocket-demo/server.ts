/**
 * [일반 WebSocket 데모] Web Function의 9000번 포트에서 인증된 WebSocket 연결을 처리한다.
 *
 * 정합성·동시성·보안 포인트 (→ MCP 문서 tcb-setup-websocket-deploy):
 *   - 연결 인증은 issueWebSocketTicket 이 발급한 1회용 티켓을 조건부 UPDATE 로 원자 소비한다
 *     (미사용·미만료·소유자 일치를 한 쿼리로 보장 — 실패 사유는 세분화하지 않는다: 탐색 오라클 방지).
 *   - 연결이 여러 인스턴스로 분리될 수 있으므로 공유 상태를 프로세스 메모리에 두지 않는다.
 *     이 데모는 인증 확인·에코·하트비트까지만 보여준다 — 정본이 필요한 상태는 MySQL 에 둔다.
 *   - 티켓 소비는 queryIdempotent 로 실행한다 — 조건부 UPDATE 라 재시도해도 이중 소비가
 *     불가능하고(재실행 시 affectedRows=0), 콜드스타트 폭주의 일시 커넥션 오류가 재시도로
 *     흡수된다 (실측: 500 동시 연결에서 실패 27건이 전부 이 구간).
 *   - 티켓이 무효면 401, 티켓 저장소(DB) 접근이 실패하면 503 — 401 로 뭉개면 클라이언트가
 *     멀쩡한 티켓을 버리고 재발급 루프를 탄다. 503 은 잠시 후 재시도 신호다.
 */
import { createServer, type IncomingMessage } from 'node:http';
import { createHash } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { queryIdempotent } from '@com2usplatform/hiveaxyl-tcbconnector-middleware/db';
import type { ResultSetHeader } from 'mysql2/promise';

interface Identity {
    projectIndex: number;
    playerId: string;
}

/** 티켓 판정이 아닌 일시 인프라 오류 — 업그레이드 거절 시 401 이 아니라 503 으로 응답한다. */
class ServiceUnavailableError extends Error {}

const identities = new WeakMap<WebSocket, Identity>();
const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 64 * 1024 });

async function authenticate(request: IncomingMessage): Promise<Identity> {
    const url = new URL(request.url ?? '/', 'https://websocket.invalid');
    const ticket = url.searchParams.get('ticket');
    const playerId = url.searchParams.get('playerId');
    const projectText = url.searchParams.get('projectIndex');

    if (!ticket || !/^[A-Za-z0-9_-]{43}$/.test(ticket)
        || !playerId || !/^\d{1,19}$/.test(playerId)
        || !projectText || !/^\d{1,10}$/.test(projectText)) {
        throw new Error('Unauthorized');
    }

    const projectIndex = Number(projectText);
    if (!Number.isSafeInteger(projectIndex) || projectIndex < 1) throw new Error('Unauthorized');
    const ticketHash = createHash('sha256').update(ticket).digest('hex');
    let result: ResultSetHeader;
    try {
        [result] = await queryIdempotent<ResultSetHeader>(
            'UPDATE websocket_tickets SET consumed_at = NOW() WHERE project_index = ? AND player_id = ? AND ticket_hash = ? AND consumed_at IS NULL AND expires_at > NOW()',
            [projectIndex, playerId, ticketHash]
        );
    } catch {
        // DB 접근 실패는 티켓 판정이 아니다 — 401 로 응답하면 클라이언트가 티켓 재발급 루프를 탄다
        throw new ServiceUnavailableError('ticket store unavailable');
    }
    // 조건부 UPDATE의 affectedRows=1은 같은 티켓으로 연결을 하나만 열었음을 보장한다.
    // (재시도의 최악 경로 — 1차 시도가 서버에서 실행된 뒤 오류 — 도 affectedRows=0 → 401 fail-closed)
    if (result.affectedRows !== 1) throw new Error('Unauthorized');
    return { projectIndex, playerId };
}

// Function URL 헬스체크 및 매치메이킹류 HTTP 요청 응답용 (Web Function은 HTTP+WS 겸용)
const httpServer = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true }));
});

httpServer.on('upgrade', (request, socket, head) => {
    void authenticate(request).then((identity) => {
        wss.handleUpgrade(request, socket, head, (ws) => {
            identities.set(ws, identity);
            wss.emit('connection', ws, request);
        });
    }).catch((err: unknown) => {
        // 티켓 무효(401)와 일시 인프라 오류(503, 잠시 후 재시도)만 구분한다.
        // 티켓 실패 사유(만료·소유자 불일치 등)는 세분화하지 않는다 — 탐색 오라클 방지.
        // 참고: 플랫폼 워커가 비-101 응답을 500 으로 감싸 클라이언트에서는 코드가 안 보일 수
        // 있다(실측) — 그래도 로그·로컬 테스트·직접 접근 경로에서는 이 구분이 정확해야 한다.
        socket.write(err instanceof ServiceUnavailableError
            ? 'HTTP/1.1 503 Service Unavailable\r\nRetry-After: 1\r\nConnection: close\r\n\r\n'
            : 'HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
    });
});

wss.on('connection', (ws) => {
    const identity = identities.get(ws);
    if (!identity) {
        ws.close(1008, 'Unauthorized');
        return;
    }

    ws.send(JSON.stringify({ type: 'connected', protocolVersion: 1 }));

    // 핸들러에서 던져진 예외가 프로세스를 죽이지 않게 리스너 전체를 감싼다 —
    // 인증된 클라이언트 하나의 비정상 입력이 WebSocket Function 전체를 멈추면 안 된다
    ws.on('message', (raw) => {
        try {
        // 크기 → JSON → type 순으로 검증하고, 실패 사유는 close code 로만 알린다.
        const bytes = Array.isArray(raw)
            ? raw.reduce((total, chunk) => total + chunk.byteLength, 0)
            : raw.byteLength;
        if (bytes > 16 * 1024) {
            ws.close(1009, 'Message Too Big');
            return;
        }
        let message: { type?: unknown; payload?: unknown };
        try {
            message = JSON.parse(raw.toString());
        } catch {
            ws.close(1003, 'Invalid JSON');
            return;
        }
        // JSON.parse("null") 은 성공적으로 null 을 돌려준다 — 비객체는 여기서 걸러야
        // 아래 프로퍼티 접근이 프로세스를 죽이지 않는다
        if (message === null || typeof message !== 'object' || typeof message.type !== 'string') {
            ws.close(1003, 'Invalid Message');
            return;
        }

        // 데모: 인증된 identity 를 붙여 에코한다. 실제 기능은 여기서 type 별로 분기한다.
        ws.send(JSON.stringify({
            type: 'echo',
            from: { playerId: identity.playerId, projectIndex: identity.projectIndex },
            received: message.type,
            payload: message.payload ?? null,
        }));
        } catch {
            // 원인 상세는 클라이언트에 노출하지 않는다
            ws.close(1011, 'Internal Error');
        }
    });
});

// 하트비트 — 죽은 연결을 정리해 유휴 제한(idleTimeOut) 안에서 슬롯이 새지 않게 한다 (→ MCP 문서 tcb-feature-websocket 하트비트 절)
const alive = new WeakSet<WebSocket>();
wss.on('connection', (ws) => {
    alive.add(ws);
    ws.on('pong', () => alive.add(ws));
});
setInterval(() => {
    for (const ws of wss.clients) {
        if (!alive.has(ws)) {
            ws.terminate();
            continue;
        }
        alive.delete(ws);
        ws.ping();
    }
}, 30_000);

httpServer.listen(9000, '0.0.0.0', () => {
    console.log('websocket server listening on 0.0.0.0:9000');
});
