import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockQueryIdempotent } = vi.hoisted(() => ({
    mockQueryIdempotent: vi.fn(),
}));

vi.mock('@com2usplatform/hiveaxyl-tcbconnector-middleware/db', () => ({ queryIdempotent: mockQueryIdempotent }));

import { main } from '../../src/functions/realtime/issueWebSocketTicket';

describe('issueWebSocketTicket handler', () => {
    const baseEvent = {
        headers: {
            'X-Hive-Player-Id': '9999999999991',
            'X-Hive-Aud': '10-1001-5',
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockQueryIdempotent.mockResolvedValue([{ affectedRows: 1 }, []]);
    });

    it('검증된 playerId/projectIndex 에 묶인 60초 티켓을 발급한다', async () => {
        const result = await main(baseEvent, {});

        expect(result.success).toBe(true);
        if (!result.success) return;
        // 티켓 원문은 base64url 43자 — 서버(websocket-demo)의 인증 regex 와 동일 규격
        expect(result.data.ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(result.data.playerId).toBe('9999999999991');
        expect(result.data.projectIndex).toBe(1001);
        expect(result.data.expiresInSeconds).toBe(60);
    });

    it('DB 에는 원문이 아닌 SHA-256 해시만, Gateway 주입 projectIndex 스코프로 저장한다', async () => {
        const result = await main(baseEvent, {});
        expect(result.success).toBe(true);
        if (!result.success) return;

        const [sql, params] = mockQueryIdempotent.mock.calls[0]!;
        expect(sql).toContain('INSERT INTO websocket_tickets');
        expect(params[0]).toBe(1001);                       // Gateway 주입 aud.projectIndex
        expect(params[1]).toBe('9999999999991');
        expect(params[2]).toMatch(/^[0-9a-f]{64}$/);        // 해시(hex 64)
        expect(params[2]).not.toBe(result.data.ticket);     // 원문 미저장
    });

    it('호출마다 서로 다른 티켓을 발급한다 (재사용 불가 전제)', async () => {
        const r1 = await main(baseEvent, {});
        const r2 = await main(baseEvent, {});
        expect(r1.success && r2.success).toBe(true);
        if (!r1.success || !r2.success) return;
        expect(r1.data.ticket).not.toBe(r2.data.ticket);
    });

    it('헤더 누락 시 BAD_REQUEST 로 거절하고 DB 를 건드리지 않는다', async () => {
        const result = await main({ headers: { 'X-Hive-Aud': '10-1001-5' } }, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('BAD_REQUEST');
        expect(mockQueryIdempotent).not.toHaveBeenCalled();
    });
});
