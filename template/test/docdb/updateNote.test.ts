import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockScoped = vi.hoisted(() => ({ update: vi.fn() }));
const mockColl   = vi.hoisted(() => ({ where: vi.fn(() => mockScoped) }));
vi.mock('@com2usplatform/hiveaxyl-tcbconnector-middleware/docdb', () => ({ collection: vi.fn(() => mockColl) }));

import { main } from '../../src/functions/docdb/updateNote';

describe('updateNote handler', () => {
    const baseEvent = {
        headers: {
            'X-Hive-Player-Id': '9999999999991',
            'X-Hive-Aud': '10-1001-5',
        },
        id:    'note-1',
        title: '수정된 제목',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockColl.where.mockReturnValue(mockScoped);
        mockScoped.update.mockResolvedValue({ updated: 1 });
    });

    it('전달된 필드만 부분 수정하고 updated 수를 반환한다', async () => {
        const result = await main(baseEvent, {});

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.updated).toBe(1);
        // 소유 스코프(where)가 반드시 함께 묶여야 한다 — IDOR 가드
        expect(mockColl.where).toHaveBeenCalledWith({ _id: 'note-1', playerId: '9999999999991', projectIndex: 1001 });
        expect(mockScoped.update).toHaveBeenCalledWith({ title: '수정된 제목' });
    });

    it('id 누락 시 INVALID_PARAMETER 를 반환한다', async () => {
        const { id: _, ...event } = baseEvent;
        const result = await main(event, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INVALID_PARAMETER');
    });

    it('변경 필드가 없으면 INVALID_PARAMETER 를 반환한다', async () => {
        const result = await main({ headers: baseEvent.headers, id: 'note-1' }, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INVALID_PARAMETER');
        expect(mockScoped.update).not.toHaveBeenCalled();
    });
});
