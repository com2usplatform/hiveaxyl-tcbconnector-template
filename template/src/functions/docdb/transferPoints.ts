import {
    createAxylHandler,
    type AxylBaseHandler,
    type AxylHttpEvent,
    AxylMiddlewareError,
    AxylError,
    ERROR_CODES,
} from '@com2usplatform/hiveaxyl-tcbconnector-middleware';
import { db, command } from '@com2usplatform/hiveaxyl-tcbconnector-middleware/docdb';

/**
 * 요청 DTO
 */
interface ReqDto extends AxylHttpEvent {
    /** 수신자 playerId (필수) */
    toPlayerId?: string;
    /** 이체할 포인트 (0보다 큰 정수) */
    amount?: number;
}

/**
 * 응답 DTO
 */
interface ResDto {
    from: string;
    to: string;
    amount: number;
}

/**
 * 포인트 이체 핸들러 (Document DB 트랜잭션 예제)
 *
 * 호출자(playerId) 지갑에서 toPlayerId 지갑으로 amount 포인트를 이체합니다.
 * 차감과 적립을 db.runTransaction 으로 묶어 원자적으로 처리하며,
 * 콜백 안에서 예외가 발생하면 자동 롤백됩니다.
 *
 * 전제: wallets 컬렉션에 _id = playerId, { balance: number } 문서가 존재합니다.
 *
 * 트랜잭션 API (@cloudbase/database runTransaction):
 *   transaction.collection(name).doc(id).get()    → { data } 조회
 *   transaction.collection(name).doc(id).update({}) → 부분 수정
 *   콜백 정상 종료 시 commit, 예외 시 rollback (runTransaction 이 자동 처리)
 */
const baseHandler: AxylBaseHandler<ReqDto, ResDto> = async (event, context) => {
    const from = context.playerId;
    const { toPlayerId, amount } = event;

    if (!toPlayerId) {
        throw new AxylMiddlewareError(ERROR_CODES.INVALID_PARAMETER, 'toPlayerId는 필수입니다.');
    }
    if (typeof amount !== 'number' || amount <= 0) {
        throw new AxylMiddlewareError(ERROR_CODES.INVALID_PARAMETER, 'amount는 0보다 큰 숫자여야 합니다.');
    }
    if (toPlayerId === from) {
        // 비즈니스 규칙 위반 → 도메인 코드를 AxylError 로 반환
        throw new AxylError('SELF_TRANSFER_NOT_ALLOWED', '자기 자신에게는 이체할 수 없습니다.');
    }

    await db.runTransaction(async (transaction: any) => {
        const fromRef = transaction.collection('wallets').doc(from);
        const toRef   = transaction.collection('wallets').doc(toPlayerId);

        const snapshot = await fromRef.get();
        const fromDoc  = Array.isArray(snapshot.data) ? snapshot.data[0] : snapshot.data;
        // 프로젝트 격리 — 지갑 문서의 projectIndex 가 요청 프로젝트와 다르면 없는 지갑으로 취급
        const fromOk   = fromDoc && fromDoc.projectIndex === context.aud.projectIndex;
        const balance  = fromOk ? ((fromDoc.balance as number | undefined) ?? 0) : 0;

        if (balance < amount) {
            throw new AxylError('INSUFFICIENT_BALANCE', '잔액이 부족합니다.');
        }

        // 수신자 존재 확인 — 없는 문서를 update 하면 0건 처리되어 송신자만 차감될 수 있다
        const toSnapshot = await toRef.get();
        const toDoc      = Array.isArray(toSnapshot.data) ? toSnapshot.data[0] : toSnapshot.data;
        if (!toDoc || toDoc.projectIndex !== context.aud.projectIndex) {
            throw new AxylError('RECIPIENT_NOT_FOUND', '수신자 지갑이 없습니다.');
        }

        await fromRef.update({ balance: command.inc(-amount) });
        await toRef.update({ balance: command.inc(amount) });
    });

    return { from, to: toPlayerId, amount };
};

// noinspection JSUnusedGlobalSymbols — TCB Cloud Function 진입점
export const main = createAxylHandler(baseHandler);
