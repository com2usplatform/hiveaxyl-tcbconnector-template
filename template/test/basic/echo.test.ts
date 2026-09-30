import { describe, it, expect } from 'vitest';
import { main } from '../../src/functions/basic/echo';

describe('echo handler', () => {
    const baseEvent = {
        headers: {
            'X-Hive-Player-Id': '9999999999991',
            'X-Hive-Aud': '10-1001-5',
        },
    };

    it('event와 context 값을 echo로 반환한다', async () => {
        const event = { ...baseEvent, message: 'hello' };
        const result = await main(event, {});

        expect(result.success).toBe(true);
        if (!result.success) return;

        expect(result.data.echo.event.message).toBe('hello');
        expect(result.data.echo.context.playerId).toBe('9999999999991');
        expect(result.data.echo.context.aud.projectIndex).toBe(1001);
        expect(result.metadata.traceId).toEqual(expect.any(String));
    });

    it('traceparent 헤더가 있으면 trace-id를 traceId로 사용한다', async () => {
        const event = {
            ...baseEvent,
            headers: {
                ...baseEvent.headers,
                traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
            },
        };
        const result = await main(event, {});

        expect(result.success).toBe(true);
        expect(result.metadata.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    });

    it('traceparent 헤더가 없으면 trace-id(32 hex)를 자동 생성한다', async () => {
        const result = await main(baseEvent, {});

        expect(result.success).toBe(true);
        expect(result.metadata.traceId).toMatch(/^[0-9a-f]{32}$/);
    });

    it('X-Hive-Aud를 appIndex / projectIndex / companyIndex 로 파싱한다', async () => {
        const result = await main(baseEvent, {});

        expect(result.success).toBe(true);
        if (!result.success) return;

        const aud = result.data.echo.context.aud;
        expect(aud.appIndex).toBe(10);
        expect(aud.projectIndex).toBe(1001);
        expect(aud.companyIndex).toBe(5);
    });
});
