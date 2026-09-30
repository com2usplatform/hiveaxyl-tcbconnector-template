import {
    createAxylHandler,
    type AxylBaseHandler,
    type AxylHttpEvent,
    AxylMiddlewareError,
    ERROR_CODES,
} from '@com2usplatform/hiveaxyl-tcbconnector-middleware';
import { getUploadMetadata } from '@com2usplatform/hiveaxyl-tcbconnector-middleware/storage';

/**
 * 요청 DTO
 */
interface ReqDto extends AxylHttpEvent {
    /** 업로드할 파일 이름 (예: 'profile.jpg') — 경로 구분자 없이 이름만 */
    fileName?: string;
}

/**
 * 응답 DTO
 */
interface ResDto {
    /** COS 업로드 엔드포인트 URL */
    url: string;
    /** 업로드 토큰 */
    token: string;
    /** 인증 헤더 값 */
    authorization: string;
    /** TCB fileID (업로드 완료 후 참조용) */
    fileID: string;
    /** 서버가 생성한 스토리지 경로 */
    cloudPath: string;
    /** 업로드 완료 후 파일 접근 URL */
    downloadUrl: string;
}

// 경로 구분자·상위 이동을 차단 — 파일 "이름"만 허용한다
const FILE_NAME_PATTERN = /^[\w.-]{1,100}$/;

/**
 * 클라이언트 직접 업로드 URL 발급 핸들러
 *
 * 클라이언트가 이 핸들러에서 받은 url/token/authorization 을 사용해
 * COS 에 직접 PUT 요청으로 파일을 업로드합니다.
 * 함수를 통해 파일 바이트가 흐르지 않으므로 대용량 파일에 적합합니다.
 *
 * ⚠️ 경로 소유권 스코프: 클라이언트가 보낸 경로를 그대로 서명하면 남의 경로에
 * 업로드(덮어쓰기)할 수 있으므로, 경로는 서버가 uploads/{projectIndex}/{playerId}/ 로
 * 직접 생성하고 클라이언트에게는 파일 이름만 받는다. (MCP 문서 tcb-feature-storage 경로 소유권 스코프)
 *
 * 클라이언트 업로드 흐름:
 *   1. 이 핸들러 호출 → url, token, fileID 수신
 *   2. PUT url (Content-Type, x-cos-security-token 헤더 포함) 으로 직접 업로드
 *   3. 업로드 완료 후 fileID 를 서버에 저장 (별도 API 호출 — 저장 시에도 own prefix 재검증)
 */
const baseHandler: AxylBaseHandler<ReqDto, ResDto> = async (event, context) => {
    if (!event.fileName || !FILE_NAME_PATTERN.test(event.fileName)) {
        throw new AxylMiddlewareError(
            ERROR_CODES.INVALID_PARAMETER,
            'fileName은 경로 구분자 없는 1~100자 파일 이름이어야 합니다.'
        );
    }

    // 같은 이름 재업로드는 본인 경로 안에서만 덮어쓰므로 타인에게 영향이 없다
    const cloudPath = `uploads/${context.aud.projectIndex}/${context.playerId}/${event.fileName}`;
    const meta = await getUploadMetadata(cloudPath);

    return {
        url:           meta.url,
        token:         meta.token,
        authorization: meta.authorization,
        fileID:        meta.fileId,
        cloudPath,
        downloadUrl:   meta.download_url,
    };
};

// noinspection JSUnusedGlobalSymbols — TCB Cloud Function 진입점
export const main = createAxylHandler(baseHandler);
