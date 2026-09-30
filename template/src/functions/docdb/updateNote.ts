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
    /** 수정할 문서 _id (필수) */
    id?: string;
    /** 변경할 제목 */
    title?: string;
    /** 변경할 본문 */
    content?: string;
}

/**
 * 응답 DTO
 */
interface ResDto {
    /** 수정된 문서 수 */
    updated: number;
}

/**
 * 문서 수정 핸들러 (Document DB doc().update 예제)
 *
 * 전달된 필드만 부분 수정합니다(update 는 지정한 필드만 갱신).
 */
const baseHandler: AxylBaseHandler<ReqDto, ResDto> = async (event, context) => {
    if (!event.id) {
        throw new AxylMiddlewareError(ERROR_CODES.INVALID_PARAMETER, 'id는 필수입니다.');
    }

    const patch: Record<string, unknown> = {};
    if (event.title   !== undefined) patch.title   = event.title;
    if (event.content !== undefined) patch.content = event.content;

    if (Object.keys(patch).length === 0) {
        throw new AxylMiddlewareError(
            ERROR_CODES.INVALID_PARAMETER,
            'title 또는 content 중 하나는 필요합니다.'
        );
    }

    // where 에 소유자(playerId·projectIndex)를 함께 묶어 남의 문서는 원자적으로 0건 처리된다
    const result = await collection('notes')
        .where({ _id: event.id, playerId: context.playerId, projectIndex: context.aud.projectIndex })
        .update(patch);

    return { updated: result.updated };
};

// noinspection JSUnusedGlobalSymbols — TCB Cloud Function 진입점
export const main = createAxylHandler(baseHandler);
