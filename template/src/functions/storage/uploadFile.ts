import {
    createAxylHandler,
    type AxylBaseHandler,
    type AxylHttpEvent,
    AxylMiddlewareError,
    ERROR_CODES,
} from '@com2usplatform/hiveaxyl-tcbconnector-middleware';
import type { ResultSetHeader } from 'mysql2/promise';
import { uploadFile } from '@com2usplatform/hiveaxyl-tcbconnector-middleware/storage';
import { transaction } from '@com2usplatform/hiveaxyl-tcbconnector-middleware/db';

/**
 * 요청 DTO
 */
interface ReqDto extends AxylHttpEvent {
    /** 파일 이름 (예: 'profile.jpg') — 경로 구분자 없이 이름만 */
    fileName?: string;
    /** base64 인코딩 파일 내용 */
    fileBase64?: string;
    /** MIME 타입 (예: 'image/jpeg') */
    mimeType?: string;
}

/**
 * 응답 DTO
 */
interface ResDto {
    /** TCB fileID */
    fileID: string;
    /** 서버가 생성한 스토리지 경로 */
    cloudPath: string;
    /** files 테이블 PK */
    id: number;
}

// 경로 구분자·상위 이동을 차단 — 파일 "이름"만 허용한다
const FILE_NAME_PATTERN = /^[\w.-]{1,100}$/;

/**
 * 파일 업로드 핸들러 — 함수 경유 업로드 예제
 *
 * base64 인코딩된 파일을 수신해 TCB 스토리지에 업로드하고
 * files 테이블에 소유자(project_index, player_id)와 함께 메타데이터를 저장합니다.
 *
 * ⚠️ 경로 소유권 스코프: 경로는 서버가 uploads/{projectIndex}/{playerId}/ 로 직접
 * 생성한다 — 클라이언트가 보낸 경로를 그대로 쓰면 남의 파일을 덮어쓸 수 있다.
 *
 * 소용량 파일(수 MB 이하)에 적합합니다.
 * 대용량 파일은 getUploadUrl 핸들러로 클라이언트 직접 업로드를 사용하세요.
 */
const baseHandler: AxylBaseHandler<ReqDto, ResDto> = async (event, context) => {
    if (!event.fileName || !FILE_NAME_PATTERN.test(event.fileName)) {
        throw new AxylMiddlewareError(
            ERROR_CODES.INVALID_PARAMETER,
            'fileName은 경로 구분자 없는 1~100자 파일 이름이어야 합니다.'
        );
    }
    if (!event.fileBase64) {
        throw new AxylMiddlewareError(ERROR_CODES.INVALID_PARAMETER, 'fileBase64는 필수입니다.');
    }

    const cloudPath = `uploads/${context.aud.projectIndex}/${context.playerId}/${event.fileName}`;
    const fileContent = Buffer.from(event.fileBase64, 'base64');
    const fileID = await uploadFile(cloudPath, fileContent);

    const id = await transaction(async (conn) => {
        // 같은 경로 재업로드(본인 파일 덮어쓰기) 시 메타데이터도 최신으로 갱신한다
        const [result] = await conn.query<ResultSetHeader>(
            'INSERT INTO files (project_index, player_id, file_id, cloud_path, file_name, mime_type, size) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE mime_type = VALUES(mime_type), size = VALUES(size)',
            [
                context.aud.projectIndex,
                context.playerId,
                fileID,
                cloudPath,
                event.fileName,
                event.mimeType ?? null,
                fileContent.length,
            ]
        );
        return result.insertId;
    });

    return { fileID, cloudPath, id };
};

// noinspection JSUnusedGlobalSymbols — TCB Cloud Function 진입점
export const main = createAxylHandler(baseHandler);
