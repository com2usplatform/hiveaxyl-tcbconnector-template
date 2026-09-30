import {
    createAxylHandler,
    type AxylBaseHandler,
    type AxylHttpEvent,
} from '@com2usplatform/hiveaxyl-tcbconnector-middleware';
import { collection } from '@com2usplatform/hiveaxyl-tcbconnector-middleware/docdb';

/**
 * 기본 엔트리 핸들러 (Document DB)
 *
 * 인증된 본인(playerId)의 notes 문서를 최신순으로 조회합니다.
 * 데이터 격리는 Gateway 가 주입한 context.playerId 와 context.aud.projectIndex 로 보장합니다.
 */
interface NoteDoc {
    _id: string;
    playerId: string;
    [key: string]: unknown;
}

interface ResDto {
    notes: NoteDoc[];
    total: number;
}

const baseHandler: AxylBaseHandler<AxylHttpEvent, ResDto> = async (_event, context) => {
    const query = collection('notes').where({ playerId: context.playerId, projectIndex: context.aud.projectIndex });
    const { total } = await query.count();
    const { data } = await query.orderBy('createdAt', 'desc').limit(20).get();
    return { notes: data as NoteDoc[], total };
};

// noinspection JSUnusedGlobalSymbols — TCB Cloud Function 진입점
export const main = createAxylHandler(baseHandler);
