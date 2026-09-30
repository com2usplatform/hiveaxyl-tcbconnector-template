import {
    createAxylHandler,
    type AxylBaseHandler,
    type AxylHttpEvent,
    AxylMiddlewareError,
    ERROR_CODES,
} from '@com2usplatform/hiveaxyl-tcbconnector-middleware';
import { collection } from '@com2usplatform/hiveaxyl-tcbconnector-middleware/docdb';

/**
 * 요청 DTO
 */
interface ReqDto extends AxylHttpEvent {
    /** 삭제할 문서 _id (필수) */
    id?: string;
}

/**
 * 응답 DTO
 */
interface ResDto {
    /** 삭제된 문서 수 */
    deleted: number;
}

/**
 * 문서 삭제 핸들러 (Document DB doc().remove 예제)
 */
const baseHandler: AxylBaseHandler<ReqDto, ResDto> = async (event, context) => {
    if (!event.id) {
        throw new AxylMiddlewareError(ERROR_CODES.INVALID_PARAMETER, 'id는 필수입니다.');
    }

    // where 에 소유자(playerId·projectIndex)를 함께 묶어 남의 문서는 원자적으로 0건 처리된다
    const result = await collection('notes')
        .where({ _id: event.id, playerId: context.playerId, projectIndex: context.aud.projectIndex })
        .remove();

    return { deleted: result.deleted };
};

// noinspection JSUnusedGlobalSymbols — TCB Cloud Function 진입점
export const main = createAxylHandler(baseHandler);
