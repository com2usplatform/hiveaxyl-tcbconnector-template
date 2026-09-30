import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStorage = vi.hoisted(() => ({ getTempURL: vi.fn() }));
vi.mock('@com2usplatform/hiveaxyl-tcbconnector-middleware/storage', () => mockStorage);

// 소유권 확인(files 테이블 조회)용 DB mock
const mockPool = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@com2usplatform/hiveaxyl-tcbconnector-middleware/db', () => ({ pool: mockPool }));

import { main } from '../../src/functions/storage/getFileUrl';

describe('getFileUrl handler', () => {
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
        mockPool.query.mockResolvedValue([[{ id: 1 }]]);   // 본인 소유 레코드 존재
        mockStorage.getTempURL.mockResolvedValue('https://tmp.url/test.jpg');
    });

    it('본인 파일의 임시 접근 URL 을 반환한다', async () => {
        const result = await main(baseEvent, {});

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.url).toBe('https://tmp.url/test.jpg');

        // 소유권 확인 쿼리가 (fileID, projectIndex, playerId) 로 스코프됐는지 검증
        const [, params] = mockPool.query.mock.calls[0]!;
        expect(params).toEqual([FILE_ID, 1001, '9999999999991']);
    });

    it('본인 소유가 아니면 INVALID_PARAMETER 를 반환하고 URL 을 발급하지 않는다', async () => {
        mockPool.query.mockResolvedValue([[]]);   // 소유 레코드 없음

        const result = await main(baseEvent, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INVALID_PARAMETER');
        expect(mockStorage.getTempURL).not.toHaveBeenCalled();
    });

    it('maxAge 를 getTempURL 로 전달한다', async () => {
        await main({ ...baseEvent, maxAge: 3600 }, {});

        expect(mockStorage.getTempURL).toHaveBeenCalledWith(FILE_ID, 3600);
    });

    it('fileID 누락 시 INVALID_PARAMETER 를 반환한다', async () => {
        const { fileID: _, ...event } = baseEvent;
        const result = await main(event, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INVALID_PARAMETER');
        if (result.success) return;
        expect(result.error.message).toBe('fileID는 필수입니다.');
    });

    it('오류 시 INTERNAL_ERROR 를 반환한다', async () => {
        mockStorage.getTempURL.mockRejectedValue(new Error('storage error'));

        const result = await main(baseEvent, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INTERNAL_ERROR');
    });
});
