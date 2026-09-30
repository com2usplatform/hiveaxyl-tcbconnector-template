/**
 * WebSocket 접속에 사용할 60초·1회용 티켓을 발급한다.
 * Gateway가 검증한 플레이어·프로젝트에 티켓을 묶고 원문 대신 SHA-256 해시만 저장한다.
 * (연결 시 소비는 src/realtime/websocket-demo/server.ts 의 조건부 UPDATE 참고 → MCP 문서 tcb-feature-websocket)
 */
import { createHash, randomBytes } from 'node:crypto';
import {
    createAxylHandler,
    type AxylBaseHandler,
    type AxylHttpEvent,
} from '@com2usplatform/hiveaxyl-tcbconnector-middleware';
import { queryIdempotent } from '@com2usplatform/hiveaxyl-tcbconnector-middleware/db';
import type { ResultSetHeader } from 'mysql2/promise';

interface TicketResponse {
    ticket: string;
    playerId: string;
    projectIndex: number;
    expiresInSeconds: number;
}

const TICKET_TTL_SECONDS = 60;

const baseHandler: AxylBaseHandler<AxylHttpEvent, TicketResponse> = async (_event, context) => {
    const ticket = randomBytes(32).toString('base64url');
    const ticketHash = createHash('sha256').update(ticket).digest('hex');

    // 같은 해시로 재실행해도 한 행만 남는 UPSERT라 첫 DB 연결의 일시 오류를 안전하게 1회 재시도할 수 있다.
    await queryIdempotent<ResultSetHeader>(
        'INSERT INTO websocket_tickets (project_index, player_id, ticket_hash, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 60 SECOND)) ON DUPLICATE KEY UPDATE ticket_hash = VALUES(ticket_hash)',
        [context.aud.projectIndex, context.playerId, ticketHash]
    );

    context.logger?.info('websocket ticket issued', {
        projectIndex: context.aud.projectIndex,
        playerId: context.playerId,
        expiresInSeconds: TICKET_TTL_SECONDS,
    });

    return {
        ticket,
        playerId: context.playerId,
        projectIndex: context.aud.projectIndex,
        expiresInSeconds: TICKET_TTL_SECONDS,
    };
};

// noinspection JSUnusedGlobalSymbols — TCB Cloud Function 진입점
export const main = createAxylHandler(baseHandler);
