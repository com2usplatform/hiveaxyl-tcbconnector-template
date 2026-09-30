import {
    createAxylHandler,
    type AxylBaseHandler,
    type AxylHttpEvent,
    AxylMiddlewareError,
    AxylError,
    ERROR_CODES,
} from '@com2usplatform/hiveaxyl-tcbconnector-middleware';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { pool, transaction } from '@com2usplatform/hiveaxyl-tcbconnector-middleware/db';

/**
 * 요청 DTO
 */
interface ReqDto extends AxylHttpEvent {
    /**
     * 멱등성 키 (필수) — 클라이언트/SDK 가 논리적 작업당 1개 생성하고
     * 재시도 시 동일 값을 재전송합니다. 추적값(traceparent)을 쓰지 마세요.
     */
    idempotencyKey?: string;
}

interface GachaResult {
    itemId: string;
    rarity: string;
    cost: number;
}

interface CachedRow extends RowDataPacket {
    // mysql2 는 JSON 타입 컬럼을 기본적으로 JS 객체로 자동 파싱해 반환한다
    // (드라이버/게이트웨이에 따라 문자열로 올 수도 있어 양쪽 모두 허용).
    result: string | GachaResult;
}

const COST = 1000;

/** 가챠 풀 (가중치 기반) */
const POOL = [
    { itemId: 'sword_legendary', rarity: 'LEGENDARY', weight: 1 },
    { itemId: 'armor_epic',      rarity: 'EPIC',      weight: 9 },
    { itemId: 'potion_common',   rarity: 'COMMON',    weight: 90 },
];

/** 가중치 기반 1회 추첨 */
function roll(): { itemId: string; rarity: string } {
    const total = POOL.reduce((sum, p) => sum + p.weight, 0);
    let r = Math.random() * total;
    for (const p of POOL) {
        if (r < p.weight) return { itemId: p.itemId, rarity: p.rarity };
        r -= p.weight;
    }
    const last = POOL[POOL.length - 1]!;
    return { itemId: last.itemId, rarity: last.rarity };
}

/**
 * 가챠 뽑기 핸들러 — 멱등성(결과 캐싱) 예제
 *
 * 확률성 작업은 재시도 시 재실행하면 결과가 달라지므로, 멱등성 키로
 * **원래 뽑힌 결과를 그대로 재반환**해야 합니다(단순 중복 차단으론 부족).
 *
 * 흐름:
 *   1. (playerId, idempotencyKey) 로 캐시된 결과 조회 → 있으면 그대로 반환
 *   2. 없으면 트랜잭션으로 [재화 차감 + 추첨 + 이력 기록 + 멱등성 키 저장] 원자 실행
 *
 * 전제 테이블:
 *   wallets(PK project_index+player_id), gacha_logs, idempotency_keys(PK project_index+player_id+idempotency_key)
 */
const baseHandler: AxylBaseHandler<ReqDto, GachaResult> = async (event, context) => {
    if (!event.idempotencyKey) {
        throw new AxylMiddlewareError(ERROR_CODES.INVALID_PARAMETER, 'idempotencyKey는 필수입니다.');
    }
    const key          = event.idempotencyKey;
    const playerId     = context.playerId;             // Gateway 주입 신뢰값으로 스코프
    const projectIndex = context.aud.projectIndex;     // 모든 WHERE/PK 에 프로젝트 스코프를 함께 묶는다

    // 1. 이미 처리된 요청이면 원래 결과를 그대로 반환 (재추첨 금지)
    const [cached] = await pool.query<CachedRow[]>(
        'SELECT result FROM idempotency_keys WHERE project_index = ? AND player_id = ? AND idempotency_key = ?',
        [projectIndex, playerId, key]
    );
    if (cached[0]) {
        context.logger?.info('idempotent gacha replay', { playerId, idempotencyKey: key });
        // JSON 컬럼이 객체로 오면 그대로, 문자열로 오면 파싱 — 객체에 JSON.parse 를
        // 호출하면 "[object Object]" 파싱 시도로 SyntaxError(→ INTERNAL_ERROR)가 난다.
        const raw = cached[0].result;
        return (typeof raw === 'string' ? JSON.parse(raw) : raw) as GachaResult;
    }

    // 2. 차감 + 추첨 + 기록 + 멱등성 저장을 원자적으로 실행
    return transaction(async (conn) => {
        // 잔액이 충분할 때만 차감 (조건부 UPDATE 로 음수 방지)
        const [dec] = await conn.query<ResultSetHeader>(
            'UPDATE wallets SET balance = balance - ? WHERE project_index = ? AND player_id = ? AND balance >= ?',
            [COST, projectIndex, playerId, COST]
        );
        if (dec.affectedRows === 0) {
            // 비즈니스 규칙 위반 → 도메인 코드를 AxylError 로 반환 (표준 3개에 없음)
            throw new AxylError('INSUFFICIENT_BALANCE', '재화가 부족합니다.');
        }

        const drawn  = roll();
        const result: GachaResult = { ...drawn, cost: COST };

        await conn.query(
            'INSERT INTO gacha_logs (player_id, project_index, item_id, rarity) VALUES (?, ?, ?, ?)',
            [playerId, projectIndex, drawn.itemId, drawn.rarity]
        );

        await conn.query(
            'INSERT INTO idempotency_keys (project_index, player_id, idempotency_key, result, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 DAY))',
            [projectIndex, playerId, key, JSON.stringify(result)]
        );

        return result;
    });
};

// noinspection JSUnusedGlobalSymbols — TCB Cloud Function 진입점
export const main = createAxylHandler(baseHandler);
