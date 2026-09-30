import {
    AxylError,
    createAxylHandler,
    type AxylBaseHandler,
    type AxylHttpEvent,
} from '@com2usplatform/hiveaxyl-tcbconnector-middleware';
import { collection } from '@com2usplatform/hiveaxyl-tcbconnector-middleware/docdb';

/**
 * [개발/테스트 전용] 문서 DB 시드 함수
 *
 * 콘솔 문서 추가 폼은 `_id` 를 직접 지정할 수 없지만(언더스코어 시작 제한),
 * SDK 의 `doc(id).set()` 은 `_id = id` 로 문서를 생성/갱신할 수 있습니다.
 * transferPoints 등 wallets 가 필요한 예제를 테스트하기 위한 시드 유틸입니다.
 *
 * ⚠️ 운영 배포 전에는 제거하세요.
 */
interface WalletSeed {
    id: string;
    balance: number;
}

// 시드 값은 코드에 고정한다 — 요청 본문으로 임의 잔액을 쓸 수 있게 두면
// 이 함수가 배포된 환경에서 로그인한 누구나 재화를 만들 수 있는 경로가 된다.
type ReqDto = AxylHttpEvent;

interface ResDto {
    seeded: string[];
}

const DEFAULT_WALLETS: WalletSeed[] = [
    { id: '9999999999991', balance: 1000 },
    { id: '9999999999992', balance: 0 },
];

const baseHandler: AxylBaseHandler<ReqDto, ResDto> = async (event, context) => {
    // [가드] 셋업/시드 함수는 배포 환경변수로 명시적으로 켠 환경에서만 동작한다.
    // 운영 환경에 실수로 배포돼도 로그인한 플레이어가 스키마·시드를 만질 수 없게 하는 최소 안전장치다.
    if (process.env.ALLOW_SETUP_FUNCTIONS !== 'true') {
        throw new AxylError('SETUP_DISABLED',
            '셋업/시드 함수가 비활성화되어 있습니다. 개발 환경에서만 ALLOW_SETUP_FUNCTIONS=true 로 배포해 사용하세요.');
    }

    const wallets = DEFAULT_WALLETS;
    const seeded: string[] = [];

    for (const w of wallets) {
        // doc(id).set() 은 _id = id 로 upsert (없으면 생성, 있으면 갱신).
        // projectIndex 를 함께 저장해 transferPoints 의 프로젝트 격리 대조에 쓴다.
        await collection('wallets').doc(w.id).set({ balance: w.balance, projectIndex: context.aud.projectIndex });
        seeded.push(w.id);
    }

    return { seeded };
};

// noinspection JSUnusedGlobalSymbols — TCB Cloud Function 진입점
export const main = createAxylHandler(baseHandler);
