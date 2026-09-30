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
    /** 조회할 문서 _id (필수) */
    id?: string;
}

interface Note {
    _id: string;
    title: string;
    content: string;
    playerId: string;
    createdAt: number;
}

/**
 * 응답 DTO
 */
interface ResDto {
    /** 문서 (없으면 null) */
    note: Note | null;
}

/**
 * 문서 단건 조회 핸들러 (Document DB doc().get 예제)
 *
 * doc(id).get() 은 data 배열을 반환하며, 존재하지 않으면 빈 배열입니다.
 */
const baseHandler: AxylBaseHandler<ReqDto, ResDto> = async (event, context) => {
    if (!event.id) {
        throw new AxylMiddlewareError(ERROR_CODES.INVALID_PARAMETER, 'id는 필수입니다.');
    }

    const result = await collection('notes').doc(event.id).get();
    const found = (result.data[0] as (Note & { projectIndex?: number }) | undefined) ?? null;

    // 소유자 대조 — id 는 클라이언트 입력이므로 본인(playerId)·프로젝트 스코프가 아니면 없는 문서로 취급한다
    // (존재 여부를 구분해 주면 타인 문서 id 탐색 오라클이 된다)
    const note = found
        && found.playerId === context.playerId
        && found.projectIndex === context.aud.projectIndex
        ? found
        : null;

    return { note };
};

// noinspection JSUnusedGlobalSymbols — TCB Cloud Function 진입점
export const main = createAxylHandler(baseHandler);
