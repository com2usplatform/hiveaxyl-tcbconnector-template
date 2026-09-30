import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockColl = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('@com2usplatform/hiveaxyl-tcbconnector-middleware/docdb', () => ({ collection: vi.fn(() => mockColl) }));

import { main } from '../../src/functions/docdb/createNote';

describe('createNote handler', () => {
    const baseEvent = {
        headers: {
            'X-Hive-Player-Id': '9999999999991',
            'X-Hive-Aud': '10-1001-5',
        },
        title:   '첫 메모',
        content: '내용입니다',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockColl.add.mockResolvedValue({ id: 'note-1' });
    });

    it('문서를 추가하고 id 를 반환한다', async () => {
        const result = await main(baseEvent, {});

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.id).toBe('note-1');
        expect(mockColl.add).toHaveBeenCalledWith(
            expect.objectContaining({ title: '첫 메모', content: '내용입니다', playerId: '9999999999991' })
        );
    });

    it('title 누락 시 INVALID_PARAMETER 를 반환한다', async () => {
        const { title: _, ...event } = baseEvent;
        const result = await main(event, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INVALID_PARAMETER');
        if (result.success) return;
        expect(result.error.message).toBe('title은 필수입니다.');
    });

    it('DB 오류 시 INTERNAL_ERROR 를 반환한다', async () => {
        mockColl.add.mockRejectedValue(new Error('db error'));

        const result = await main(baseEvent, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INTERNAL_ERROR');
    });
});
