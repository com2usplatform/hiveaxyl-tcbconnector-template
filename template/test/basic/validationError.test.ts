import { describe, it, expect } from 'vitest';
import { main } from '../../src/functions/basic/validationError';

describe('validationError handler', () => {
    const baseEvent = {
        headers: {
            'X-Hive-Player-Id': '9999999999991',
            'X-Hive-Aud': '10-1001-5',
        },
    };

    it('itemId가 유효하면 성공 응답을 반환한다', async () => {
        const event = { ...baseEvent, itemId: 42 };
        const result = await main(event, {});

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.itemId).toBe(42);
    });

    it('X-Hive-Player-Id 누락 시 BAD_REQUEST를 반환한다', async () => {
        const event = {
            headers: { 'X-Hive-Aud': '10-1001-5' },
            itemId: 42,
        };
        const result = await main(event, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('BAD_REQUEST');
    });

    it('itemId가 없으면 INVALID_PARAMETER를 반환한다', async () => {
        const result = await main(baseEvent, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INVALID_PARAMETER');
        if (result.success) return;
        expect(result.error.message).toBe('itemId는 1 이상의 정수여야 합니다.');
    });

    it('itemId가 0 이하이면 INVALID_PARAMETER를 반환한다', async () => {
        const event = { ...baseEvent, itemId: -1 };
        const result = await main(event, {});

        expect(result.success).toBe(false);
        expect(result.code).toBe('INVALID_PARAMETER');
    });
});
