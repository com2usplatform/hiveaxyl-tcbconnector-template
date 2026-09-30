import {
    createAxylHandler,
    type AxylBaseHandler,
    type AxylHttpEvent,
} from '@com2usplatform/hiveaxyl-tcbconnector-middleware';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '@com2usplatform/hiveaxyl-tcbconnector-middleware/db';

/**
 * 요청 DTO
 */
interface ReqDto extends AxylHttpEvent {
    /** 최대 조회 수 (기본 20) */
    limit?: number;
}

interface FileRow extends RowDataPacket {
    id: number;
    file_id: string;
    cloud_path: string;
    file_name: string;
    mime_type: string | null;
    size: number | null;
    created_at: string;
}

interface CountRow extends RowDataPacket {
    total: number;
}

/**
 * 응답 DTO
 */
interface ResDto {
    files: FileRow[];
    total: number;
}

/**
 * 파일 목록 조회 핸들러
 *
 * TCB Cloud Storage는 파일 리스트 조회 API를 제공하지 않습니다.
 * 업로드 시 files 테이블에 메타데이터를 저장하고 DB 에서 조회합니다.
 *
 * 데이터 격리: WHERE 에 Gateway 가 주입한 project_index(aud)와 player_id 를
 * 함께 묶어 본인 파일만 조회한다 — 이 스코프 없이는 전체 파일이 노출된다.
 */
const baseHandler: AxylBaseHandler<ReqDto, ResDto> = async (event, context) => {
    const limit = event.limit ?? 20;

    const [files] = await pool.query<FileRow[]>(
        'SELECT id, file_id, cloud_path, file_name, mime_type, size, created_at FROM files WHERE project_index = ? AND player_id = ? ORDER BY created_at DESC LIMIT ?',
        [context.aud.projectIndex, context.playerId, limit]
    );

    const [countRows] = await pool.query<CountRow[]>(
        'SELECT COUNT(*) AS total FROM files WHERE project_index = ? AND player_id = ?',
        [context.aud.projectIndex, context.playerId]
    );

    const total = countRows[0]?.total ?? 0;

    return { files, total };
};

// noinspection JSUnusedGlobalSymbols — TCB Cloud Function 진입점
export const main = createAxylHandler(baseHandler);
