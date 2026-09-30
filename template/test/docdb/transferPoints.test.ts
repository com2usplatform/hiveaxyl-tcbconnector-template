import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDoc    = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
const mockTxColl = vi.hoisted(() => ({ doc: vi.fn(() => mockDoc) }));
const mockTx     = vi.hoisted(() => ({ collection: vi.fn(() => mockTxColl) }));
const mockDb     = vi.hoisted(() => ({
    // 콜백을 그대로 실행 — 콜백이 throw 하면 rejected 로 전파 (롤백 동작 대용)
    runTransaction: vi.fn(async (cb: (t: unknown) => unknown) => cb(mockTx)),
}));
vi.mock('@com2usplatform/hiveaxyl-tcbconnector-middleware/docdb', () => ({
    db:      mockDb,
    command: { inc: vi.fn((n: number) => ({ __inc: n })) },
}));

import { main } from '../../src/functions/docdb/transferPoints';

describe('transferPoints handler', () => {
    const baseEvent = {
        headers: {
            'X-Hive-Player-Id': '9999999999991',
            'X-Hive-Aud': '10-1001-5',
        },
        toPlayerId: '9999999999992',
        amount:     100,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockTx.collection.mockReturnValue(mockTxColl);
        mockTxColl.doc.mockReturnValue(mockDoc);
        mockDoc.get.mockResolvedValue({ data: [{ balance: 500, projectIndex: 1001 }] });
        mockDoc.update.mockResolvedValue({ updated: 1 });
    });

    it('잔액이 충분하면 트랜잭션으로 차감·적립하고 결과를 반환한다', async () => {
        const result = await main(baseEvent, {});

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data).toEqual({ from: '9999999999991', to: '9999999999992', amount: 100 });
        expect(mockDb.runTransaction).toHaveBeenCalledTimes(1);
        expect(mockDoc.update).toHaveBeenCalledTimes(2); // 차감 + 적립
    });

    it('잔액이 부족하면 도메인 코드 INSUFFICIENT_BALANCE 를 반환하고 update 하지 않는다', async () => {
        mockDoc.get.mockResolvedValue({ data: [{ balance: 50, projectIndex: 1001 }] });

        const result = await main(baseEvent, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INSUFFICIENT_BALANCE');   // AxylError 커스텀 코드
        expect(mockDoc.update).not.toHaveBeenCalled();
    });

    it('toPlayerId 누락 시 INVALID_PARAMETER 를 반환하고 트랜잭션을 시작하지 않는다', async () => {
        const { toPlayerId: _, ...event } = baseEvent;
        const result = await main(event, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INVALID_PARAMETER');
        expect(mockDb.runTransaction).not.toHaveBeenCalled();
    });

    it('amount 가 0 이하면 INVALID_PARAMETER 를 반환한다', async () => {
        const result = await main({ ...baseEvent, amount: 0 }, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INVALID_PARAMETER');
    });

    it('자기 자신에게 이체 시 도메인 코드 SELF_TRANSFER_NOT_ALLOWED 를 반환한다', async () => {
        const result = await main({ ...baseEvent, toPlayerId: '9999999999991' }, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('SELF_TRANSFER_NOT_ALLOWED');   // AxylError 커스텀 코드
    });

    it('수신자 지갑이 없으면 RECIPIENT_NOT_FOUND 를 반환하고 차감하지 않는다', async () => {
        // 송신자 조회는 성공, 수신자 조회는 빈 결과
        mockDoc.get
            .mockResolvedValueOnce({ data: [{ balance: 500, projectIndex: 1001 }] })
            .mockResolvedValueOnce({ data: [] });

        const result = await main(baseEvent, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('RECIPIENT_NOT_FOUND');
        expect(mockDoc.update).not.toHaveBeenCalled();
    });
});
