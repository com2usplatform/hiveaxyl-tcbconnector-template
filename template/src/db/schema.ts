/**
 * [개발/테스트 전용] MySQL 테이블 DDL 단일 소스
 *
 * 예제 함수들이 공유하는 테이블 정의를 한곳에 모읍니다. 테이블은 여러 함수가
 * 공유하는 cross-cutting 자산이므로 함수 폴더가 아니라 여기에 둡니다.
 * `src/db` 는 `src/functions` 바깥이라 클라우드 함수로 빌드되지 않고,
 * 이를 import 하는 setup/createTables 의 번들에만 포함됩니다.
 *
 * 새 테이블이 필요하면 여기에 `CREATE TABLE IF NOT EXISTS` 로 추가한 뒤
 * `createTables` 를 재배포·1회 호출하세요. ⚠️ 운영 배포 전에는 제거하세요.
 */
export const SCHEMA: Record<string, string> = {
    items: `
        CREATE TABLE IF NOT EXISTS items (
            id         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
            project_index INT           NOT NULL,
            name       VARCHAR(255)      NULL,
            status     VARCHAR(32)   NOT NULL DEFAULT 'available',
            PRIMARY KEY (id),
            INDEX idx_project_index (project_index)
        )`,
    rewards: `
        CREATE TABLE IF NOT EXISTS rewards (
            id         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
            player_id  BIGINT   NOT NULL,
            project_index INT           NOT NULL,
            item_id    INT           NOT NULL,
            quantity   INT           NOT NULL DEFAULT 1,
            created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            INDEX idx_owner (project_index, player_id)
        )`,
    // project_index·player_id 로 소유자를 기록해 조회·삭제·URL 발급을 본인 파일로만 스코프한다
    // (fileID 는 클라이언트가 보내는 값이라, 이 컬럼 없이는 남의 파일을 지우거나 열람할 수 있다)
    files: `
        CREATE TABLE IF NOT EXISTS files (
            id         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
            project_index INT           NOT NULL,
            player_id  BIGINT   NOT NULL,
            file_id    VARCHAR(512)  NOT NULL UNIQUE,
            cloud_path VARCHAR(512)  NOT NULL,
            file_name  VARCHAR(255)  NOT NULL,
            mime_type  VARCHAR(128)      NULL,
            size       INT UNSIGNED      NULL,
            created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            INDEX idx_file_owner (project_index, player_id),
            INDEX idx_cloud_path (cloud_path)
        )`,
    // expires_at 이 지나도 행은 자동 삭제되지 않는다 — 운영에서는 TCB 타이머 트리거로
    // 주기 정리하세요 (샘플: MCP 문서 tcb-feature-mysql '만료 데이터 정리' 절. 타이머 함수는 능동 리소스라 데모 미포함)
    idempotency_keys: `
        CREATE TABLE IF NOT EXISTS idempotency_keys (
            project_index   INT          NOT NULL,
            player_id       BIGINT  NOT NULL,
            idempotency_key VARCHAR(64)  NOT NULL,
            result          JSON         NOT NULL,
            created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at      DATETIME     NOT NULL,
            PRIMARY KEY (project_index, player_id, idempotency_key)
        )`,
    wallets: `
        CREATE TABLE IF NOT EXISTS wallets (
            project_index INT          NOT NULL,
            player_id BIGINT   NOT NULL,
            balance   INT UNSIGNED  NOT NULL DEFAULT 0,
            PRIMARY KEY (project_index, player_id)
        )`,
    gacha_logs: `
        CREATE TABLE IF NOT EXISTS gacha_logs (
            id         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
            player_id  BIGINT   NOT NULL,
            project_index INT           NOT NULL,
            item_id    VARCHAR(64)   NOT NULL,
            rarity     VARCHAR(32)   NOT NULL,
            created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            INDEX idx_owner (project_index, player_id)
        )`,
    // WebSocket 연결 인증용 1회용 티켓 — 원문은 저장하지 않고 해시만 두며 조건부 UPDATE로 한 연결에서만 소비한다.
    // 만료·소비된 행은 자동 삭제되지 않는다 — 운영 시 타이머 트리거로 정리 (→ MCP 문서 tcb-feature-mysql '만료 데이터 정리')
    websocket_tickets: `
        CREATE TABLE IF NOT EXISTS websocket_tickets (
            project_index INT          NOT NULL,
            player_id     BIGINT       NOT NULL,
            ticket_hash   CHAR(64)     NOT NULL,
            expires_at    DATETIME     NOT NULL,
            consumed_at   DATETIME         NULL,
            created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (project_index, ticket_hash),
            INDEX idx_ws_ticket_owner (project_index, player_id, expires_at)
        )`,
};
