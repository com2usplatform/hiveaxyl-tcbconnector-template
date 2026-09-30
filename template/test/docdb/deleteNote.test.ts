import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockScoped = vi.hoisted(() => ({ remove: vi.fn() }));
const mockColl   = vi.hoisted(() => ({ where: vi.fn(() => mockScoped) }));
vi.mock('@com2usplatform/hiveaxyl-tcbconnector-middleware/docdb', () => ({ collection: vi.fn(() => mockColl) }));

import { main } from '../../src/functions/docdb/deleteNote';

describe('deleteNote handler', () => {
    const baseEvent = {
        headers: {
            'X-Hive-Player-Id': '9999999999991',
            'X-Hive-Aud': '10-1001-5',
        },
        id: 'note-1',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockColl.where.mockReturnValue(mockScoped);
        mockScoped.remove.mockResolvedValue({ deleted: 1 });
    });

    it('문서를 삭제하고 deleted 수를 반환한다', async () => {
        const result = await main(baseEvent, {});

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.deleted).toBe(1);
        // 소유 스코프(where)가 반드시 함께 묶여야 한다 — IDOR 가드
        expect(mockColl.where).toHaveBeenCalledWith({ _id: 'note-1', playerId: '9999999999991', projectIndex: 1001 });
        expect(mockScoped.remove).toHaveBeenCalled();
    });

    it('id 누락 시 INVALID_PARAMETER 를 반환한다', async () => {
        const { id: _, ...event } = baseEvent;
        const result = await main(event, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INVALID_PARAMETER');
    });

    it('DB 오류 시 INTERNAL_ERROR 를 반환한다', async () => {
        mockScoped.remove.mockRejectedValue(new Error('db error'));

        const result = await main(baseEvent, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INTERNAL_ERROR');
    });
});
