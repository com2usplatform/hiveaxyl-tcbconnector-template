import {
    createAxylHandler,
    type AxylBaseHandler,
    type AxylHttpEvent,
} from '@com2usplatform/hiveaxyl-tcbconnector-middleware';

/**
 * Echo 예제 핸들러
 *
 * 수신한 event와 미들웨어가 주입한 context 값을 그대로 응답으로 반환합니다.
 * DB나 비즈니스 로직 없이 미들웨어 체인 동작을 검증하는 데 사용합니다.
 *
 * 확인할 수 있는 항목:
 *   - traceId:   traceparent 헤더의 trace-id, 미전달 시 자동 생성 (로그 상관관계용)
 *   - playerId:  X-Hive-Player-Id 헤더값
 *   - aud:       X-Hive-Aud 파싱 결과 ({ appIndex, projectIndex, companyIndex })
 */
interface EchoReqDto extends AxylHttpEvent {
    message?: string;
}

interface EchoResDto {
    echo: {
        event: EchoReqDto;
        context: {
            traceId: string | undefined;
            playerId: string;
            aud: {
                appIndex: number;
                projectIndex: number;
                companyIndex: number;
            };
        };
    };
}

const baseHandler: AxylBaseHandler<EchoReqDto, EchoResDto> = async (
    event,
    context
) => {
    return {
        echo: {
            event,
            context: {
                traceId: context.traceId,
                playerId: context.playerId,
                aud: context.aud,
            },
        },
    };
};

// noinspection JSUnusedGlobalSymbols — TCB Cloud Function 진입점
export const main = createAxylHandler(baseHandler);
