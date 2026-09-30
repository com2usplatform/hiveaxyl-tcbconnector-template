import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDoc  = vi.hoisted(() => ({ get: vi.fn() }));
const mockColl = vi.hoisted(() => ({ doc: vi.fn(() => mockDoc) }));
vi.mock('@com2usplatform/hiveaxyl-tcbconnector-middleware/docdb', () => ({ collection: vi.fn(() => mockColl) }));

import { main } from '../../src/functions/docdb/getNote';

describe('getNote handler', () => {
    const baseEvent = {
        headers: {
            'X-Hive-Player-Id': '9999999999991',
            'X-Hive-Aud': '10-1001-5',
        },
        id: 'note-1',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockColl.doc.mockReturnValue(mockDoc);
        mockDoc.get.mockResolvedValue({
            data: [{ _id: 'note-1', title: '첫 메모', content: '내용', playerId: '9999999999991', projectIndex: 1001, createdAt: 1 }],
        });
    });

    it('문서를 반환한다', async () => {
        const result = await main(baseEvent, {});

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.note?._id).toBe('note-1');
        expect(mockColl.doc).toHaveBeenCalledWith('note-1');
    });

    it('문서가 없으면 note 는 null 이다', async () => {
        mockDoc.get.mockResolvedValue({ data: [] });

        const result = await main(baseEvent, {});

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.note).toBeNull();
    });

    it('남의 문서(소유자 불일치)면 존재해도 null 을 반환한다', async () => {
        mockDoc.get.mockResolvedValue({
            data: [{ _id: 'note-1', title: '남의 메모', content: '내용', playerId: '1111111111111', projectIndex: 1001, createdAt: 1 }],
        });

        const result = await main(baseEvent, {});

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.note).toBeNull();
    });

    it('다른 프로젝트의 문서면 존재해도 null 을 반환한다', async () => {
        mockDoc.get.mockResolvedValue({
            data: [{ _id: 'note-1', title: '메모', content: '내용', playerId: '9999999999991', projectIndex: 2002, createdAt: 1 }],
        });

        const result = await main(baseEvent, {});

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.note).toBeNull();
    });

    it('id 누락 시 INVALID_PARAMETER 를 반환한다', async () => {
        const { id: _, ...event } = baseEvent;
        const result = await main(event, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INVALID_PARAMETER');
    });
});
