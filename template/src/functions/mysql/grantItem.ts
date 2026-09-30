import {
    createAxylHandler,
    type AxylBaseHandler,
    type AxylHttpEvent,
    AxylMiddlewareError,
    ERROR_CODES,
} from '@com2usplatform/hiveaxyl-tcbconnector-middleware';
import type { ResultSetHeader } from 'mysql2/promise';
import { transaction } from '@com2usplatform/hiveaxyl-tcbconnector-middleware/db';

/**
 * 요청 DTO
 */
interface ReqDto extends AxylHttpEvent {
    itemId?: number;
    quantity?: number;
}

/**
 * 응답 DTO
 */
interface ResDto {
    rewardId: number;
}

/**
 * 아이템 지급 핸들러 — 트랜잭션 예제
 *
 * rewards 테이블에 지급 이력을 삽입하고
 * items 테이블에서 해당 아이템 상태를 'granted' 로 업데이트합니다.
 * 두 작업은 하나의 트랜잭션으로 묶여 원자적으로 실행됩니다.
 */
const baseHandler: AxylBaseHandler<ReqDto, ResDto> = async (event, context) => {
    if (event.itemId === undefined || !Number.isInteger(event.itemId) || event.itemId < 1) {
        throw new AxylMiddlewareError(
            ERROR_CODES.INVALID_PARAMETER,
            'itemId는 1 이상의 정수여야 합니다.'
        );
    }
    if (event.quantity === undefined || !Number.isInteger(event.quantity) || event.quantity < 1) {
        throw new AxylMiddlewareError(
            ERROR_CODES.INVALID_PARAMETER,
            'quantity는 1 이상의 정수여야 합니다.'
        );
    }

    const rewardId = await transaction(async (conn) => {
        // 1단계: 지급 이력 삽입
        const [rewardResult] = await conn.query<ResultSetHeader>(
            'INSERT INTO rewards (player_id, project_index, item_id, quantity) VALUES (?, ?, ?, ?)',
            [context.playerId, context.aud.projectIndex, event.itemId, event.quantity]
        );

        // 2단계: 아이템 상태 업데이트
        await conn.query(
            "UPDATE items SET status = 'granted' WHERE id = ? AND project_index = ?",
            [event.itemId, context.aud.projectIndex]
        );

        return rewardResult.insertId;
    });

    return { rewardId };
};

// noinspection JSUnusedGlobalSymbols — TCB Cloud Function 진입점
export const main = createAxylHandler(baseHandler);
