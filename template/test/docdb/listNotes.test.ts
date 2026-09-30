import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.hoisted(() => ({
    count:   vi.fn(),
    orderBy: vi.fn(),
    skip:    vi.fn(),
    limit:   vi.fn(),
    get:     vi.fn(),
}));
const mockColl = vi.hoisted(() => ({ where: vi.fn(() => mockQuery) }));
vi.mock('@com2usplatform/hiveaxyl-tcbconnector-middleware/docdb', () => ({ collection: vi.fn(() => mockColl), command: {} }));

import { main } from '../../src/functions/docdb/listNotes';

describe('listNotes handler', () => {
    const baseEvent = {
        headers: {
            'X-Hive-Player-Id': '9999999999991',
            'X-Hive-Aud': '10-1001-5',
        },
    };

    const notes = [
        { _id: 'n1', title: 'a', content: '', playerId: '9999999999991', createdAt: 2 },
        { _id: 'n2', title: 'b', content: '', playerId: '9999999999991', createdAt: 1 },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        // 체이닝: orderBy/skip/limit 는 자기 자신을 반환
        mockQuery.orderBy.mockReturnValue(mockQuery);
        mockQuery.skip.mockReturnValue(mockQuery);
        mockQuery.limit.mockReturnValue(mockQuery);
        mockQuery.count.mockResolvedValue({ total: 2 });
        mockQuery.get.mockResolvedValue({ data: notes });
    });

    it('본인 playerId 로 필터해 목록과 총 개수를 반환한다', async () => {
        const result = await main(baseEvent, {});

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.notes).toHaveLength(2);
        expect(result.data.total).toBe(2);
        expect(mockColl.where).toHaveBeenCalledWith({ playerId: '9999999999991', projectIndex: 1001 });
    });

    it('limit / skip 을 적용한다', async () => {
        await main({ ...baseEvent, limit: 5, skip: 10 }, {});

        expect(mockQuery.limit).toHaveBeenCalledWith(5);
        expect(mockQuery.skip).toHaveBeenCalledWith(10);
        expect(mockQuery.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
    });

    it('DB 오류 시 INTERNAL_ERROR 를 반환한다', async () => {
        mockQuery.count.mockRejectedValue(new Error('db error'));

        const result = await main(baseEvent, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INTERNAL_ERROR');
    });
});
