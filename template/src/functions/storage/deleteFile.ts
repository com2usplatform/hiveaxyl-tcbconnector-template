import {
    createAxylHandler,
    type AxylBaseHandler,
    type AxylHttpEvent,
    AxylMiddlewareError,
    ERROR_CODES,
} from '@com2usplatform/hiveaxyl-tcbconnector-middleware';
import type { ResultSetHeader } from 'mysql2/promise';
import { deleteFiles } from '@com2usplatform/hiveaxyl-tcbconnector-middleware/storage';
import { pool } from '@com2usplatform/hiveaxyl-tcbconnector-middleware/db';

/**
 * 요청 DTO
 */
interface ReqDto extends AxylHttpEvent {
    /** 삭제할 TCB fileID */
    fileID?: string;
}

/**
 * 응답 DTO
 */
interface ResDto {
    /** 삭제된 DB 레코드 수 */
    deleted: number;
}

/**
 * 파일 삭제 핸들러
 *
 * DB 레코드를 먼저 삭제한 후 스토리지에서 파일을 삭제합니다.
 *
 * 소유권 스코프: fileID 는 클라이언트가 보내는 값이므로 DELETE 의 WHERE 에
 * project_index + player_id 를 함께 묶고, **본인 레코드가 실제로 지워졌을 때만**
 * 스토리지 삭제를 실행한다 — 이 검증 없이 deleteFiles 를 호출하면 남의 fileID 로
 * 남의 파일을 지울 수 있다. 소유권 위반은 형식 오류와 같은 INVALID_PARAMETER 로
 * 통일해 fileID 존재 여부 탐색 오라클을 주지 않는다.
 *
 * 순서 근거:
 *   - DB 삭제 실패 시: 스토리지 미삭제 → 양쪽 데이터 일관성 유지, 재시도 가능
 *   - DB 삭제 성공 후 스토리지 삭제 실패 시: orphan 파일 발생 가능성 있음
 *     → DB 참조는 없으므로 사용자에게 노출되지 않으며, 정기 정리 작업으로 처리 가능
 */
const baseHandler: AxylBaseHandler<ReqDto, ResDto> = async (event, context) => {
    if (!event.fileID) {
        throw new AxylMiddlewareError(ERROR_CODES.INVALID_PARAMETER, 'fileID는 필수입니다.');
    }

    // 1단계: 본인 소유 레코드만 삭제 (소유권 검증을 겸한다)
    const [result] = await pool.query<ResultSetHeader>(
        'DELETE FROM files WHERE file_id = ? AND project_index = ? AND player_id = ?',
        [event.fileID, context.aud.projectIndex, context.playerId]
    );

    if (result.affectedRows === 0) {
        throw new AxylMiddlewareError(ERROR_CODES.INVALID_PARAMETER, 'fileID가 올바르지 않습니다.');
    }

    // 2단계: 스토리지 파일 삭제 (본인 소유가 확인된 fileID 만 도달한다)
    await deleteFiles([event.fileID]);

    return { deleted: result.affectedRows };
};

// noinspection JSUnusedGlobalSymbols — TCB Cloud Function 진입점
export const main = createAxylHandler(baseHandler);
