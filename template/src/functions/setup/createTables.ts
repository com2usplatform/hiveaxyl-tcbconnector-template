import {
    AxylError,
    createAxylHandler,
    type AxylBaseHandler,
    type AxylHttpEvent,
} from '@com2usplatform/hiveaxyl-tcbconnector-middleware';
import { queryIdempotent } from '@com2usplatform/hiveaxyl-tcbconnector-middleware/db';
import { SCHEMA } from '../../db/schema';

/**
 * [개발/테스트 전용] MySQL 테이블 생성 대행 함수
 *
 * DDL 단일 소스(src/db/schema.ts)를 읽어 예제 함수들이 사용하는 테이블을
 * 한 번에 생성합니다(CREATE TABLE IF NOT EXISTS). 최초 셋업·스키마 변경 후
 * 1회 호출하면 됩니다. ⚠️ 운영 배포 전에는 제거하세요.
 */
interface ResDto {
    created: string[];
}

const baseHandler: AxylBaseHandler<AxylHttpEvent, ResDto> = async () => {
    // [가드] 셋업/시드 함수는 배포 환경변수로 명시적으로 켠 환경에서만 동작한다.
    // 운영 환경에 실수로 배포돼도 로그인한 플레이어가 스키마·시드를 만질 수 없게 하는 최소 안전장치다.
    if (process.env.ALLOW_SETUP_FUNCTIONS !== 'true') {
        throw new AxylError('SETUP_DISABLED',
            '셋업/시드 함수가 비활성화되어 있습니다. 개발 환경에서만 ALLOW_SETUP_FUNCTIONS=true 로 배포해 사용하세요.');
    }

    const created: string[] = [];
    for (const [name, ddl] of Object.entries(SCHEMA)) {
        // ⚠️ 이 환경의 mysql2 는 멀티라인 쿼리를 "Malformed communication packet" 으로
        //    거부합니다(실측: 선행 개행만 제거해도 실패). schema.ts 의 들여쓴 템플릿
        //    리터럴 DDL 은 공백을 한 칸으로 접어 한 줄로 보냅니다. (→ MCP 문서 tcb-feature-mysql 함정 절)
        // queryIdempotent: DDL 은 IF NOT EXISTS 로 멱등하므로, 콜드 커넥션의 일시 오류
        // (read ECONNRESET 등)를 미들웨어가 1회 재시도로 흡수합니다. (→ MCP 문서 tcb-feature-mysql)
        await queryIdempotent(ddl.replace(/\s+/g, ' ').trim());
        created.push(name);
    }
    return { created };
};

// noinspection JSUnusedGlobalSymbols — TCB Cloud Function 진입점
export const main = createAxylHandler(baseHandler);
