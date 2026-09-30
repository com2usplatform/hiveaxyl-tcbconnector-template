import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPool, mockConn, mockTransaction } = vi.hoisted(() => ({
    mockPool:        { query: vi.fn() },
    mockConn:        { query: vi.fn() },
    mockTransaction: vi.fn(),
}));

vi.mock('@com2usplatform/hiveaxyl-tcbconnector-middleware/db', () => ({ pool: mockPool, transaction: mockTransaction }));

import { main } from '../../src/functions/mysql/drawGacha';

const POOL_ITEM_IDS = ['sword_legendary', 'armor_epic', 'potion_common'];

describe('drawGacha handler', () => {
    const baseEvent = {
        headers: {
            'X-Hive-Player-Id': '9999999999991',
            'X-Hive-Aud': '10-1001-5',
        },
        idempotencyKey: 'gacha-req-001',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockTransaction.mockImplementation(
            (fn: (conn: typeof mockConn) => Promise<unknown>) => fn(mockConn)
        );
    });

    it('캐시된 결과가 있으면 재추첨 없이 원래 결과를 그대로 반환한다', async () => {
        const cachedResult = { itemId: 'sword_legendary', rarity: 'LEGENDARY', cost: 1000 };
        mockPool.query.mockResolvedValueOnce([[{ result: JSON.stringify(cachedResult) }]]);

        const result = await main(baseEvent, {});

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data).toEqual(cachedResult);
        // 핵심: 멱등 재요청은 트랜잭션(차감·추첨)을 실행하지 않음
        expect(mockTransaction).not.toHaveBeenCalled();
        // 캐시 조회는 (project_index, player_id, idempotency_key) 로 스코프
        expect(mockPool.query).toHaveBeenCalledWith(
            expect.stringContaining('WHERE project_index = ? AND player_id = ? AND idempotency_key = ?'),
            [1001, '9999999999991', 'gacha-req-001']
        );
    });

    it('mysql2 가 JSON 컬럼을 객체로 자동 파싱해 반환해도 캐시 재생이 동작한다', async () => {
        // 실 DB 의 mysql2 는 JSON 타입 컬럼을 문자열이 아닌 객체로 돌려준다 — 문자열 가정 시
        // JSON.parse("[object Object]") SyntaxError 로 멱등 재생 경로가 깨지는 회귀를 방지
        const cachedResult = { itemId: 'armor_epic', rarity: 'EPIC', cost: 1000 };
        mockPool.query.mockResolvedValueOnce([[{ result: cachedResult }]]);

        const result = await main(baseEvent, {});

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data).toEqual(cachedResult);
        expect(mockTransaction).not.toHaveBeenCalled();
    });

    it('캐시가 없으면 차감·추첨·기록·멱등성 저장을 트랜잭션으로 실행한다', async () => {
        mockPool.query.mockResolvedValueOnce([[]]); // 캐시 미스
        mockConn.query
            .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE wallets
            .mockResolvedValueOnce([{ insertId: 1 }])     // INSERT gacha_logs
            .mockResolvedValueOnce([{ insertId: 1 }]);    // INSERT idempotency_keys

        const result = await main(baseEvent, {});

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(POOL_ITEM_IDS).toContain(result.data.itemId);
        expect(result.data.cost).toBe(1000);

        const calls = mockConn.query.mock.calls;
        expect(calls[0]?.[0]).toContain('UPDATE wallets');
        expect(calls[1]?.[0]).toContain('INSERT INTO gacha_logs');
        expect(calls[2]?.[0]).toContain('INSERT INTO idempotency_keys');
    });

    it('재화가 부족하면 도메인 코드 INSUFFICIENT_BALANCE 를 반환한다', async () => {
        mockPool.query.mockResolvedValueOnce([[]]);          // 캐시 미스
        mockConn.query.mockResolvedValueOnce([{ affectedRows: 0 }]); // 차감 0건

        const result = await main(baseEvent, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INSUFFICIENT_BALANCE');   // AxylError 커스텀 코드
        if (result.success) return;
        expect(result.error.message).toBe('재화가 부족합니다.');
    });

    it('idempotencyKey 누락 시 INVALID_PARAMETER 를 반환하고 조회·트랜잭션을 하지 않는다', async () => {
        const { idempotencyKey: _, ...event } = baseEvent;
        const result = await main(event, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INVALID_PARAMETER');
        expect(mockPool.query).not.toHaveBeenCalled();
        expect(mockTransaction).not.toHaveBeenCalled();
    });
});
