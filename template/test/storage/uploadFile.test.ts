import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStorage = vi.hoisted(() => ({ uploadFile: vi.fn() }));
vi.mock('@com2usplatform/hiveaxyl-tcbconnector-middleware/storage', () => mockStorage);

const mockConn = {
    query: vi.fn(),
};
const { mockTransaction } = vi.hoisted(() => ({ mockTransaction: vi.fn() }));
vi.mock('@com2usplatform/hiveaxyl-tcbconnector-middleware/db', () => ({ transaction: mockTransaction }));

import { main } from '../../src/functions/storage/uploadFile';

describe('uploadFile handler', () => {
    const baseEvent = {
        headers: {
            'X-Hive-Player-Id': '9999999999991',
            'X-Hive-Aud': '10-1001-5',
        },
        fileName:   'test.jpg',
        fileBase64: Buffer.from('fake image data').toString('base64'),
        mimeType:   'image/jpeg',
    };

    // 경로는 서버가 uploads/{projectIndex}/{playerId}/ 로 생성한다 (경로 소유권 스코프)
    const expectedPath = 'uploads/1001/9999999999991/test.jpg';
    const expectedFileID = `cloud://env.bucket/${expectedPath}`;

    beforeEach(() => {
        vi.clearAllMocks();
        mockTransaction.mockImplementation(
            (fn: (conn: typeof mockConn) => Promise<unknown>) => fn(mockConn)
        );
    });

    it('본인 경로에 업로드 후 DB 에 소유자와 함께 메타데이터를 저장한다', async () => {
        mockStorage.uploadFile.mockResolvedValue(expectedFileID);
        mockConn.query.mockResolvedValue([{ insertId: 1, affectedRows: 1 }]);

        const result = await main(baseEvent, {});

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.fileID).toBe(expectedFileID);
        expect(result.data.cloudPath).toBe(expectedPath);
        expect(result.data.id).toBe(1);
        expect(mockStorage.uploadFile).toHaveBeenCalledWith(expectedPath, expect.any(Buffer));
        // 소유자(project_index, player_id)가 함께 저장되는지 검증
        expect(mockConn.query).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO files'),
            expect.arrayContaining([1001, '9999999999991', expectedFileID, expectedPath, 'test.jpg'])
        );
    });

    it('fileName 누락 시 INVALID_PARAMETER 를 반환한다', async () => {
        const { fileName: _, ...event } = baseEvent;
        const result = await main(event, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INVALID_PARAMETER');
    });

    it('경로 구분자가 포함된 fileName 은 거부한다 (경로 주입 차단)', async () => {
        const result = await main({ ...baseEvent, fileName: 'a/b.jpg' }, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INVALID_PARAMETER');
        expect(mockStorage.uploadFile).not.toHaveBeenCalled();
    });

    it('fileBase64 누락 시 INVALID_PARAMETER 를 반환한다', async () => {
        const { fileBase64: _, ...event } = baseEvent;
        const result = await main(event, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INVALID_PARAMETER');
    });

    it('스토리지 업로드 실패 시 INTERNAL_ERROR 를 반환한다', async () => {
        mockStorage.uploadFile.mockRejectedValue(new Error('Storage error'));

        const result = await main(baseEvent, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INTERNAL_ERROR');
    });
});
