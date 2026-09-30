import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStorage = vi.hoisted(() => ({ deleteFiles: vi.fn() }));
vi.mock('@com2usplatform/hiveaxyl-tcbconnector-middleware/storage', () => mockStorage);

const mockPool = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@com2usplatform/hiveaxyl-tcbconnector-middleware/db', () => ({ pool: mockPool }));

import { main } from '../../src/functions/storage/deleteFile';

describe('deleteFile handler', () => {
    const FILE_ID = 'cloud://env.bucket/uploads/1001/9999999999991/test.jpg';
    const baseEvent = {
        headers: {
            'X-Hive-Player-Id': '9999999999991',
            'X-Hive-Aud': '10-1001-5',
        },
        fileID: FILE_ID,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockPool.query.mockResolvedValue([{ affectedRows: 1 }]);
        mockStorage.deleteFiles.mockResolvedValue(undefined);
    });

    it('본인 소유 DB 레코드 삭제 후 스토리지 파일을 삭제하고 deleted 수를 반환한다', async () => {
        const result = await main(baseEvent, {});

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.deleted).toBe(1);

        // DB 삭제가 스토리지 삭제보다 먼저 호출되어야 합니다
        const poolCallOrder    = mockPool.query.mock.invocationCallOrder[0];
        const storageCallOrder = mockStorage.deleteFiles.mock.invocationCallOrder[0];
        expect(poolCallOrder).toBeLessThan(storageCallOrder!);

        // DELETE 가 소유자(project_index, player_id) 스코프로 실행되는지 검증
        expect(mockPool.query).toHaveBeenCalledWith(
            expect.stringContaining('DELETE FROM files'),
            [FILE_ID, 1001, '9999999999991']
        );
        expect(mockStorage.deleteFiles).toHaveBeenCalledWith([FILE_ID]);
    });

    it('본인 소유가 아니면 INVALID_PARAMETER 를 반환하고 스토리지는 삭제하지 않는다', async () => {
        mockPool.query.mockResolvedValue([{ affectedRows: 0 }]);   // 소유 레코드 없음

        const result = await main(baseEvent, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INVALID_PARAMETER');
        expect(mockStorage.deleteFiles).not.toHaveBeenCalled();
    });

    it('fileID 누락 시 INVALID_PARAMETER 를 반환한다', async () => {
        const { fileID: _, ...event } = baseEvent;
        const result = await main(event, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INVALID_PARAMETER');
        if (result.success) return;
        expect(result.error.message).toBe('fileID는 필수입니다.');
    });

    it('DB 삭제 실패 시 INTERNAL_ERROR 를 반환하고 스토리지는 삭제하지 않는다', async () => {
        mockPool.query.mockRejectedValue(new Error('DB error'));

        const result = await main(baseEvent, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INTERNAL_ERROR');
        expect(mockStorage.deleteFiles).not.toHaveBeenCalled();
    });

    it('스토리지 삭제 실패 시 INTERNAL_ERROR 를 반환한다', async () => {
        mockStorage.deleteFiles.mockRejectedValue(new Error('Storage error'));

        const result = await main(baseEvent, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INTERNAL_ERROR');
    });
});
