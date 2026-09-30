import {
    createAxylHandler,
    type AxylBaseHandler,
    type AxylHttpEvent,
} from '@com2usplatform/hiveaxyl-tcbconnector-middleware';
import { collection } from '@com2usplatform/hiveaxyl-tcbconnector-middleware/docdb';

/**
 * 요청 DTO
 */
interface ReqDto extends AxylHttpEvent {
    /** 최대 조회 수 (기본 20, 최대 1000) */
    limit?: number;
    /** 건너뛸 문서 수 (페이지네이션, 기본 0) */
    skip?: number;
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
    notes: Note[];
    total: number;
}

/**
 * 문서 목록 조회 핸들러 (Document DB where + orderBy + limit + skip + count 예제)
 *
 * 미들웨어가 주입한 playerId 로 본인 메모만 조회합니다.
 * count() 로 전체 개수를, get() 으로 페이지 데이터를 가져옵니다.
 */
const baseHandler: AxylBaseHandler<ReqDto, ResDto> = async (event, context) => {
    // 주석의 규격(최대 1000)을 코드로 강제한다 — 임의 큰 값이 그대로 흘러가지 않게 clamp
    const limit = Math.min(Math.max(Math.trunc(event.limit ?? 20), 1), 1000);
    const skip  = Math.max(Math.trunc(event.skip ?? 0), 0);

    const query = collection('notes').where({ playerId: context.playerId, projectIndex: context.aud.projectIndex });

    const { total } = await query.count();
    const { data }  = await query
        .orderBy('createdAt', 'desc')
        .skip(skip)
        .limit(limit)
        .get();

    return { notes: data as Note[], total };
};

// noinspection JSUnusedGlobalSymbols — TCB Cloud Function 진입점
export const main = createAxylHandler(baseHandler);
