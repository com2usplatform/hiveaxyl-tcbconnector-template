import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ResultSetHeader } from 'mysql2';

const mockConn = {
    query: vi.fn(),
};

const { mockTransaction } = vi.hoisted(() => ({
    mockTransaction: vi.fn(),
}));

vi.mock('@com2usplatform/hiveaxyl-tcbconnector-middleware/db', () => ({
    transaction: mockTransaction,
}));

import { main } from '../../src/functions/mysql/grantItem';

describe('grantItem handler', () => {
    const baseEvent = {
        headers: {
            'X-Hive-Player-Id': '9999999999991',
            'X-Hive-Aud': '10-1001-5',
        },
        itemId: 10,
        quantity: 3,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockTransaction.mockImplementation(
            (fn: (conn: typeof mockConn) => Promise<unknown>) => fn(mockConn)
        );
    });

    it('트랜잭션 내에서 rewards 삽입 후 items 를 업데이트하고 rewardId 를 반환한다', async () => {
        (mockConn.query as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce([{ insertId: 99 } as ResultSetHeader])
            .mockResolvedValueOnce([{ affectedRows: 1 } as ResultSetHeader]);

        const result = await main(baseEvent, {});

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.rewardId).toBe(99);
        expect(mockConn.query).toHaveBeenCalledTimes(2);
        const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls[0]?.[0]).toContain('INSERT INTO rewards');
        expect(calls[1]?.[0]).toContain('UPDATE items');
    });

    it('DB 오류 발생 시 트랜잭션이 롤백되고 INTERNAL_ERROR 를 반환한다', async () => {
        mockTransaction.mockRejectedValueOnce(new Error('Deadlock found'));

        const result = await main(baseEvent, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INTERNAL_ERROR');
    });

    it('itemId 가 없으면 INVALID_PARAMETER 를 반환하고 트랜잭션을 실행하지 않는다', async () => {
        const { itemId: _itemId, ...event } = baseEvent;
        const result = await main(event, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INVALID_PARAMETER');
        if (result.success) return;
        expect(result.error.message).toBe('itemId는 1 이상의 정수여야 합니다.');
        expect(mockTransaction).not.toHaveBeenCalled();
    });

    it('quantity 가 없으면 INVALID_PARAMETER 를 반환하고 트랜잭션을 실행하지 않는다', async () => {
        const { quantity: _quantity, ...event } = baseEvent;
        const result = await main(event, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INVALID_PARAMETER');
        if (result.success) return;
        expect(result.error.message).toBe('quantity는 1 이상의 정수여야 합니다.');
        expect(mockTransaction).not.toHaveBeenCalled();
    });

    it('X-Hive-Player-Id 누락 시 BAD_REQUEST 를 반환하고 트랜잭션을 실행하지 않는다', async () => {
        const event = {
            headers: { 'X-Hive-Aud': '10-1001-5' },
            itemId: 10,
            quantity: 3,
        };
        const result = await main(event, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('BAD_REQUEST');
        expect(mockTransaction).not.toHaveBeenCalled();
    });
});
