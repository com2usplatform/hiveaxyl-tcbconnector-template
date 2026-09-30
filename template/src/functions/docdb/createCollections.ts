import {
    AxylError,
    createAxylHandler,
    type AxylBaseHandler,
    type AxylHttpEvent,
} from '@com2usplatform/hiveaxyl-tcbconnector-middleware';
import { db } from '@com2usplatform/hiveaxyl-tcbconnector-middleware/docdb';

/**
 * [개발/테스트 전용] Document DB 컬렉션 생성 대행 함수
 *
 * 예제 함수들이 사용하는 컬렉션을 생성합니다.
 * 콘솔 문서 추가 폼은 _id 지정이 막혀 있고 컬렉션도 미리 있어야 하므로,
 * 테스트 환경 초기 셋업용으로 SDK 의 createCollection 을 대행합니다.
 * ⚠️ 운영 배포 전에는 제거하세요.
 */
interface ResDto {
    created: string[];
    existed: string[];
}

const COLLECTIONS = ['notes', 'wallets'];

const baseHandler: AxylBaseHandler<AxylHttpEvent, ResDto> = async () => {
    // [가드] 셋업/시드 함수는 배포 환경변수로 명시적으로 켠 환경에서만 동작한다.
    // 운영 환경에 실수로 배포돼도 로그인한 플레이어가 스키마·시드를 만질 수 없게 하는 최소 안전장치다.
    if (process.env.ALLOW_SETUP_FUNCTIONS !== 'true') {
        throw new AxylError('SETUP_DISABLED',
            '셋업/시드 함수가 비활성화되어 있습니다. 개발 환경에서만 ALLOW_SETUP_FUNCTIONS=true 로 배포해 사용하세요.');
    }

    const created: string[] = [];
    const existed: string[] = [];

    for (const name of COLLECTIONS) {
        try {
            await db.createCollection(name);
            created.push(name);
        } catch {
            // 이미 존재하는 컬렉션이면 무시
            existed.push(name);
        }
    }

    return { created, existed };
};

// noinspection JSUnusedGlobalSymbols — TCB Cloud Function 진입점
export const main = createAxylHandler(baseHandler);
