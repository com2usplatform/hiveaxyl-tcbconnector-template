import {
    createAxylHandler,
    type AxylBaseHandler,
    type AxylHttpEvent,
} from '@com2usplatform/hiveaxyl-tcbconnector-middleware';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '@com2usplatform/hiveaxyl-tcbconnector-middleware/db';

/**
 * 요청 DTO — Gateway 가 callFunction 으로 전달하는 비즈니스 파라미터
 */
interface ExampleReqDto extends AxylHttpEvent {
    itemId?: number;
}

/**
 * 응답 DTO — baseHandler 가 반환하는 비즈니스 데이터
 * createAxylHandler 가 Axyl 표준 포맷으로 감쌉니다.
 */
interface ExampleResDto {
    items: RowDataPacket[];
}

const baseHandler: AxylBaseHandler<ExampleReqDto, ExampleResDto> = async (
    _event,
    context
) => {
    // projectIndex 는 Gateway 가 주입한 X-Hive-Aud 에서 파싱한 context.aud.projectIndex 를 사용합니다.
    // 클라이언트가 body 로 보낸 값은 위변조될 수 있으므로 데이터 격리(WHERE 절)에 쓰지 않습니다.
    context.logger?.info('business logic start', {
        playerId: context.playerId,
        projectIndex: context.aud.projectIndex,
    });

    const [items] = await pool.query<RowDataPacket[]>(
        'SELECT id, name, status FROM items WHERE project_index = ? ORDER BY id DESC LIMIT 20',
        [context.aud.projectIndex]
    );

    return { items };
};

// noinspection JSUnusedGlobalSymbols — TCB Cloud Function 진입점
export const main = createAxylHandler(baseHandler);
