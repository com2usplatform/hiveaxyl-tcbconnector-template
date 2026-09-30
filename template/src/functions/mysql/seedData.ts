import {
    AxylError,
    createAxylHandler,
    type AxylBaseHandler,
    type AxylHttpEvent,
} from '@com2usplatform/hiveaxyl-tcbconnector-middleware';
import { queryIdempotent } from '@com2usplatform/hiveaxyl-tcbconnector-middleware/db';

/**
 * [개발/테스트 전용] MySQL 시드 데이터 주입 함수
 *
 * createTables 로 만든 빈 테이블에 예제 함수 테스트용 행을 넣습니다.
 *   - items   : grantItem(itemId) 대상 아이템
 *   - wallets : drawGacha(재화 차감)·transferPoints 대상 잔액
 * 모두 멱등(ON DUPLICATE KEY UPDATE)하게 동작하므로 여러 번 호출해도 안전합니다.
 *
 * ⚠️ 운영 배포 전에는 제거하세요.
 */
interface ItemSeed {
    id: number;
    projectIndex: number;
    name: string;
}

interface WalletSeed {
    projectIndex: number;
    playerId: string;
    balance: number;
}

// 시드 값은 코드에 고정한다 — 요청 본문으로 임의 잔액을 쓸 수 있게 두면
// 이 함수가 배포된 환경에서 로그인한 누구나 재화를 만들 수 있는 경로가 된다.
type ReqDto = AxylHttpEvent;

interface ResDto {
    items: number[];
    wallets: string[];
}

const DEFAULT_ITEMS: ItemSeed[] = [
    { id: 10, projectIndex: 1001, name: 'sword' },
];

const DEFAULT_WALLETS: WalletSeed[] = [
    { projectIndex: 1001, playerId: '9999999999991', balance: 100000 },
    { projectIndex: 1001, playerId: '9999999999992', balance: 0 },
];

const baseHandler: AxylBaseHandler<ReqDto, ResDto> = async () => {
    // [가드] 셋업/시드 함수는 배포 환경변수로 명시적으로 켠 환경에서만 동작한다.
    // 운영 환경에 실수로 배포돼도 로그인한 플레이어가 스키마·시드를 만질 수 없게 하는 최소 안전장치다.
    if (process.env.ALLOW_SETUP_FUNCTIONS !== 'true') {
        throw new AxylError('SETUP_DISABLED',
            '셋업/시드 함수가 비활성화되어 있습니다. 개발 환경에서만 ALLOW_SETUP_FUNCTIONS=true 로 배포해 사용하세요.');
    }

    const items   = DEFAULT_ITEMS;
    const wallets = DEFAULT_WALLETS;

    // 멀티라인 쿼리는 이 환경에서 Malformed communication packet 을 유발하므로 한 줄로 작성 (→ MCP 문서 tcb-feature-mysql 함정 절)
    // queryIdempotent: 시드는 ON DUPLICATE KEY UPDATE 로 멱등하므로, 콜드 커넥션의
    // 일시 오류를 미들웨어가 1회 재시도로 흡수합니다. (→ MCP 문서 tcb-feature-mysql)
    for (const it of items) {
        await queryIdempotent(
            "INSERT INTO items (id, project_index, name, status) VALUES (?, ?, ?, 'available') ON DUPLICATE KEY UPDATE name = VALUES(name), status = 'available'",
            [it.id, it.projectIndex, it.name]
        );
    }

    for (const w of wallets) {
        await queryIdempotent(
            'INSERT INTO wallets (project_index, player_id, balance) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE balance = VALUES(balance)',
            [w.projectIndex, w.playerId, w.balance]
        );
    }

    return { items: items.map((i) => i.id), wallets: wallets.map((w) => w.playerId) };
};

// noinspection JSUnusedGlobalSymbols — TCB Cloud Function 진입점
export const main = createAxylHandler(baseHandler);
