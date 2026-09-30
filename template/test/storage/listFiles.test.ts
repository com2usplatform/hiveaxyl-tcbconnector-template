import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPool = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@com2usplatform/hiveaxyl-tcbconnector-middleware/db', () => ({ pool: mockPool }));

vi.mock('@cloudbase/node-sdk', () => ({ default: { init: vi.fn(() => ({})) } }));

import { main } from '../../src/functions/storage/listFiles';

describe('listFiles handler', () => {
    const baseEvent = {
        headers: {
            'X-Hive-Player-Id': '9999999999991',
            'X-Hive-Aud': '10-1001-5',
        },
    };

    const mockFiles = [
        { id: 1, file_id: 'cloud://env/uploads/1001/9999999999991/a.jpg', cloud_path: 'uploads/1001/9999999999991/a.jpg', file_name: 'a.jpg', mime_type: 'image/jpeg', size: 1024, created_at: '2026-01-01' },
        { id: 2, file_id: 'cloud://env/uploads/1001/9999999999991/b.jpg', cloud_path: 'uploads/1001/9999999999991/b.jpg', file_name: 'b.jpg', mime_type: 'image/jpeg', size: 2048, created_at: '2026-01-02' },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        mockPool.query
            .mockResolvedValueOnce([mockFiles])
            .mockResolvedValueOnce([[{ total: 2 }]]);
    });

    it('본인 파일 목록과 총 개수를 반환한다', async () => {
        const result = await main(baseEvent, {});

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.files).toHaveLength(2);
        expect(result.data.total).toBe(2);

        // 소유자(project_index, player_id) 스코프가 WHERE 에 묶였는지 검증
        const [sql, params] = mockPool.query.mock.calls[0]!;
        expect(sql).toContain('project_index = ? AND player_id = ?');
        expect(params).toEqual([1001, '9999999999991', 20]);
    });

    it('limit 을 적용한다', async () => {
        const result = await main({ ...baseEvent, limit: 5 }, {});

        expect(result.success).toBe(true);
        expect(mockPool.query).toHaveBeenCalledWith(
            expect.stringContaining('LIMIT'),
            expect.arrayContaining([5])
        );
    });

    it('DB 오류 시 INTERNAL_ERROR 를 반환한다', async () => {
        mockPool.query.mockReset();
        mockPool.query.mockRejectedValue(new Error('DB error'));

        const result = await main(baseEvent, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INTERNAL_ERROR');
    });
});
