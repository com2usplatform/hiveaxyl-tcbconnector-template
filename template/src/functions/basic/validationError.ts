import {
    createAxylHandler,
    type AxylBaseHandler,
    type AxylHttpEvent,
    AxylMiddlewareError,
    ERROR_CODES,
} from '@com2usplatform/hiveaxyl-tcbconnector-middleware';

/**
 * 요청 DTO
 *
 * itemId 가 1 이상의 정수인지 검증하는 예제입니다.
 */
interface ReqDto extends AxylHttpEvent {
    itemId?: number;
}

interface ResDto {
    itemId: number;
}

/**
 * Validation Error 예제 핸들러
 *
 * 두 가지 에러 케이스를 확인할 수 있습니다.
 *
 * 케이스 1 — 미들웨어 검증 실패:
 *   X-Hive-Player-Id 헤더 없이 호출 → BAD_REQUEST
 *
 * 케이스 2 — 비즈니스 파라미터 검증 실패:
 *   itemId 가 없거나 1 미만인 경우 → INVALID_PARAMETER
 */
const baseHandler: AxylBaseHandler<ReqDto, ResDto> = async (event) => {
    if (event.itemId === undefined || event.itemId < 1) {
        throw new AxylMiddlewareError(
            ERROR_CODES.INVALID_PARAMETER,
            'itemId는 1 이상의 정수여야 합니다.'
        );
    }

    return { itemId: event.itemId };
};

// withHiveHeaders 는 X-Hive-Player-Id 를 항상 필수로 검증합니다.
// 헤더 누락 시 별도 옵션 없이 BAD_REQUEST 가 자동으로 반환됩니다.
// noinspection JSUnusedGlobalSymbols — TCB Cloud Function 진입점
export const main = createAxylHandler(baseHandler);
