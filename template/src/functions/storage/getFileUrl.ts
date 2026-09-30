import {
    createAxylHandler,
    type AxylBaseHandler,
    type AxylHttpEvent,
    AxylMiddlewareError,
    ERROR_CODES,
} from '@com2usplatform/hiveaxyl-tcbconnector-middleware';
import type { RowDataPacket } from 'mysql2/promise';
import { getTempURL } from '@com2usplatform/hiveaxyl-tcbconnector-middleware/storage';
import { pool } from '@com2usplatform/hiveaxyl-tcbconnector-middleware/db';

/**
 * 요청 DTO
 */
interface ReqDto extends AxylHttpEvent {
    /** TCB fileID */
    fileID?: string;
    /** URL 유효 시간 (초, 기본 600) */
    maxAge?: number;
}

/**
 * 응답 DTO
 */
interface ResDto {
    /** 임시 접근 URL */
    url: string;
}

/**
 * 파일 임시 접근 URL 조회 핸들러
 *
 * fileID 로 COS 임시 다운로드 URL 을 발급합니다.
 * maxAge 초 후 만료됩니다 (기본 600초) — 클라이언트는 URL 을 영속 저장하지 말고
 * 만료 전 재조회로 갱신해야 합니다.
 *
 * 소유권 스코프: fileID 는 클라이언트가 보내는 값이므로 files 테이블에서
 * (project_index, player_id) 소유 레코드를 먼저 확인한다 — 이 검증 없이는 남의
 * fileID 로 비공개 파일의 접근 URL 을 발급받을 수 있다. 소유권 위반은 형식
 * 오류와 같은 INVALID_PARAMETER 로 통일한다(존재 여부 탐색 오라클 차단).
 */
const baseHandler: AxylBaseHandler<ReqDto, ResDto> = async (event, context) => {
    if (!event.fileID) {
        throw new AxylMiddlewareError(ERROR_CODES.INVALID_PARAMETER, 'fileID는 필수입니다.');
    }

    const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM files WHERE file_id = ? AND project_index = ? AND player_id = ?',
        [event.fileID, context.aud.projectIndex, context.playerId]
    );
    if (!rows[0]) {
        throw new AxylMiddlewareError(ERROR_CODES.INVALID_PARAMETER, 'fileID가 올바르지 않습니다.');
    }

    // maxAge 는 정수 초만 허용하고 상한(24h)을 둔다 — 임의 값이 SDK 로 흘러가지 않게 한다
    if (event.maxAge !== undefined
        && (!Number.isInteger(event.maxAge) || event.maxAge < 1 || event.maxAge > 86_400)) {
        throw new AxylMiddlewareError(ERROR_CODES.INVALID_PARAMETER, 'maxAge는 1~86400 사이의 정수여야 합니다.');
    }
    const url = await getTempURL(event.fileID, event.maxAge);
    return { url };
};

// noinspection JSUnusedGlobalSymbols — TCB Cloud Function 진입점
export const main = createAxylHandler(baseHandler);
