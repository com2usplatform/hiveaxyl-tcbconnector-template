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
    /** 메모 제목 (필수) */
    title?: string;
    /** 메모 본문 */
    content?: string;
}

/**
 * 응답 DTO
 */
interface ResDto {
    /** 생성된 문서 _id */
    id: string;
}

/**
 * 문서 추가 핸들러 (Document DB add 예제)
 *
 * notes 컬렉션에 문서를 1건 추가합니다.
 * playerId 는 미들웨어가 주입한 컨텍스트에서 가져옵니다.
 */
const baseHandler: AxylBaseHandler<ReqDto, ResDto> = async (event, context) => {
    if (!event.title) {
        throw new AxylMiddlewareError(ERROR_CODES.INVALID_PARAMETER, 'title은 필수입니다.');
    }

    const result = await collection('notes').add({
        title:     event.title,
        content:   event.content ?? '',
        playerId:  context.playerId,
        projectIndex: context.aud.projectIndex,
        createdAt: Date.now(),
    });

    // add() 의 id 는 옵셔널 타입이므로 가드 (정상 삽입 시 항상 존재)
    if (!result.id) {
        throw new AxylMiddlewareError(ERROR_CODES.INTERNAL_ERROR, '문서 생성에 실패했습니다.');
    }

    return { id: result.id };
};

// noinspection JSUnusedGlobalSymbols — TCB Cloud Function 진입점
export const main = createAxylHandler(baseHandler);
