import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStorage = vi.hoisted(() => ({ getUploadMetadata: vi.fn() }));
vi.mock('@com2usplatform/hiveaxyl-tcbconnector-middleware/storage', () => mockStorage);

import { main } from '../../src/functions/storage/getUploadUrl';

describe('getUploadUrl handler', () => {
    const baseEvent = {
        headers: {
            'X-Hive-Player-Id': '9999999999991',
            'X-Hive-Aud': '10-1001-5',
        },
        fileName: 'profile.jpg',
    };

    // 경로는 서버가 uploads/{projectIndex}/{playerId}/ 로 생성한다 (경로 소유권 스코프)
    const expectedPath = 'uploads/1001/9999999999991/profile.jpg';

    const mockMeta = {
        url:           `https://cos.ap-singapore.myqcloud.com/bucket/${expectedPath}`,
        token:         'mock-token',
        authorization: 'q-sign-algorithm=sha1&...',
        fileId:        `cloud://env.bucket/${expectedPath}`,
        cosFileId:     'cos-file-id',
        download_url:  `https://env.tcb.qcloud.la/${expectedPath}`,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockStorage.getUploadMetadata.mockResolvedValue(mockMeta);
    });

    it('서버가 생성한 본인 경로로 업로드 메타데이터를 반환한다', async () => {
        const result = await main(baseEvent, {});

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.url).toBe(mockMeta.url);
        expect(result.data.token).toBe(mockMeta.token);
        expect(result.data.authorization).toBe(mockMeta.authorization);
        expect(result.data.fileID).toBe(mockMeta.fileId);
        expect(result.data.cloudPath).toBe(expectedPath);
        expect(result.data.downloadUrl).toBe(mockMeta.download_url);
        expect(mockStorage.getUploadMetadata).toHaveBeenCalledWith(expectedPath);
    });

    it('fileName 누락 시 INVALID_PARAMETER 를 반환한다', async () => {
        const { fileName: _, ...event } = baseEvent;
        const result = await main(event, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INVALID_PARAMETER');
    });

    it('경로 구분자가 포함된 fileName 은 거부한다 (경로 주입 차단)', async () => {
        const result = await main({ ...baseEvent, fileName: '../other-player/x.jpg' }, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INVALID_PARAMETER');
        expect(mockStorage.getUploadMetadata).not.toHaveBeenCalled();
    });

    it('오류 시 INTERNAL_ERROR 를 반환한다', async () => {
        mockStorage.getUploadMetadata.mockRejectedValue(new Error('storage error'));

        const result = await main(baseEvent, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INTERNAL_ERROR');
    });
});
