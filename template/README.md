# hiveaxyl-tcbconnector-app

TCB(Tencent CloudBase) Cloud Function 개발을 위한 템플릿입니다.
`@com2usplatform/hiveaxyl-tcbconnector-middleware` 를 기반으로 MySQL · Cloud Storage · Document DB · WebSocket 예제와 실제 서비스에 바로 적용할 수 있는 구조를 갖춥니다.

> **상세 가이드의 정본은 Axyl Docs MCP 서버입니다.** 이 리포에는 요약과 시작 절차만 남기고, 모듈별 사용법·배포·트러블슈팅은 MCP 문서로 조회합니다 → [MCP 문서 조회](#mcp-문서-조회).

## 빠른 시작

생성된 프로젝트는 **DB·TCB 설정 없이 바로 테스트**할 수 있습니다.

```bash
npm test        # 예제 핸들러 테스트 (실제 DB/TCB 연결 불필요)
```

연결 정보는 **실제 TCB 환경에 배포할 때만** 필요합니다 → [시작하기](#시작하기).

> `npm create` 직후 `npm audit` 에 `@cloudbase/node-sdk` 의 알려진 전이 취약점 경고가 남을 수 있습니다 — 해당 건은 [SECURITY.md](./SECURITY.md) 에 설명돼 있습니다. **그 외 패키지의 경고는 무시하지 말고 확인·업데이트하세요.** `npm audit fix --force` 는 실행하지 마세요(의존성이 깨질 수 있음).

## MCP 문서 조회

프로젝트 루트의 `.mcp.json` 에 **Axyl Docs MCP 서버(axyl-docs)** 가 등록돼 있습니다. Claude Code / Codex 같은 AI 도구로 프로젝트를 열면 연결 안내가 뜨고, Hive 콘솔 계정으로 1회 인증하면 됩니다.

- AI 에게 "Axyl TCB 로 ○○ 기능을 만들고 싶어"라고 말하면 `start_tcb_workflow` 도구가 스캐폴딩부터 배포·테스트까지의 플레이북을 안내합니다.
- 사람이 직접 볼 때도 AI 에게 조회를 요청하면 됩니다. 주요 문서 id:

| 주제 | 문서 id |
|---|---|
| MySQL 사용 규약 (트랜잭션·멱등성·함정) | `tcb-feature-mysql` |
| MySQL 콘솔 초기 설정 (퍼블릭 주소·계정·DB 이름) | `tcb-setup-mysql` |
| Cloud Storage | `tcb-feature-storage` |
| Document DB | `tcb-feature-docdb` |
| WebSocket 설계 / 배포·연결 테스트 | `tcb-feature-websocket` / `tcb-setup-websocket-deploy` |
| 배포·invoke 절차 (함수별 예제 포함) | `tcb-setup-deploy-invoke` |
| 배포 후 테스트 체크리스트 | `tcb-setup-test-checklist` |

> MCP 를 쓰지 않기로 했다면(`--no-mcp` 로 생성) AI 규약 요약은 [AGENTS.md](./AGENTS.md) 에 그대로 유지됩니다. 상세 가이드가 필요한 시점에 `.mcp.json` 을 다시 등록할 수 있습니다.

## 프로젝트 구조

함수와 테스트는 **테마(basic / mysql / storage / docdb / realtime)별 디렉토리**로 구성됩니다.

> DB / Storage / Document DB 클라이언트는 `@com2usplatform/hiveaxyl-tcbconnector-middleware` 의 subpath(`/db`, `/storage`, `/docdb`)로 제공됩니다(프로젝트에 복사되지 않으며 `npm update` 로 갱신).

```
<project-name>/
├── src/
│   ├── db/schema.ts                # [개발용] MySQL DDL 단일 소스 (createTables 가 사용)
│   ├── functions/                  # 일반 이벤트 함수 (테마별)
│   │   ├── basic/ · mysql/ · storage/ · docdb/ · setup/
│   │   └── realtime/issueWebSocketTicket.ts
│   └── realtime/websocket-demo/    # 티켓 인증 raw ws 서버 (에코·하트비트 데모)
├── test/                           # src 와 동일한 테마 구조
├── dist/                           # esbuild 빌드 결과물 (배포 대상)
├── cloudbaserc.json                # TCB 배포 설정 + 환경변수 키
├── .env.example                    # 환경변수 템플릿 (커밋됨)
├── .mcp.json                       # Axyl Docs MCP 서버 등록
├── scripts/deploy.js               # .env → cloudbaserc 임시 주입 후 배포
├── scripts/invoke.js               # SDK 기반 invoke 헬퍼 (CLI invoke 실패 시 우회)
└── AGENTS.md · CLAUDE.md · SECURITY.md
```

> `npm create` 시 **테스트 미포함**을 선택하면 예제·테스트·DB 셋업 함수가 빠지고 `basic/index.ts` 중심의 최소 구성으로 생성됩니다.

## 포함된 예제 함수

| 테마 | 함수 | 설명 |
|---|---|---|
| 기본 | `index` / `echo` / `validationError` | items 조회 / 미들웨어 확인 / 검증 에러 예제 |
| MySQL | `grantItem` / `drawGacha` | 트랜잭션 / 멱등성(결과 캐싱) |
| Storage | `uploadFile` / `getUploadUrl` / `listFiles` / `getFileUrl` / `deleteFile` | 업로드·서명 URL·목록·임시 URL·삭제 |
| DocDB | `createNote` 외 CRUD 4종 / `transferPoints` | 문서 CRUD / 트랜잭션(포인트 이체) |
| 실시간 | `issueWebSocketTicket` | 60초·1회용 WebSocket 접속 티켓 |
| 개발용 | `createTables` / `seedData` / `createCollections` / `seedTestData` | 테이블·컬렉션 생성과 시드 — `.env` 의 `ALLOW_SETUP_FUNCTIONS=true` 로 배포된 환경에서만 동작 (운영 배포 전 함수와 키 모두 제거) |

함수별 invoke 명령 예제는 MCP 문서 `tcb-setup-deploy-invoke` 에 있습니다.

## 시작하기

### 1. 의존성 설치와 로컬 테스트

```bash
npm install
npm test
```

### 2. 연결 정보 설정 (.env)

```bash
cp .env.example .env
```

- `TCB_ENV_ID` / `TCB_REGION` — 배포 대상 TCB 환경 (콘솔 우측 상단 드롭다운). **cloudbaserc.json 에 하드코딩하지 않습니다.**
- `DB_*` — MySQL 연결 정보. TCB MySQL 을 처음 쓰면 퍼블릭 주소 활성화·계정·DB 이름 확인이 필요합니다 → MCP 문서 `tcb-setup-mysql`.
- `.env` 는 `.gitignore` 에 등록되어 커밋되지 않으며, 배포 시 `scripts/deploy.js` 가 값을 임시 주입 후 원본을 복원합니다.

### 3. 빌드 + 배포

배포에는 **TCB(CloudBase) CLI** 가 필요합니다. 최초 1회 설치·로그인하세요 (`tcb login` 은 대화형이라 AI 가 대신할 수 없습니다).

```bash
npm i -g @cloudbase/cli
tcb login
npm run deploy:build        # 빌드 + 전체 배포
npm run deploy -- grantItem # 특정 함수만 배포
```

### 4. 동작 확인

```bash
tcb fn invoke echo --params "{\"headers\":{\"X-Hive-Player-Id\":\"9999999999991\",\"X-Hive-Aud\":\"10-1001-5\"},\"message\":\"hello\"}"
```

`tcb fn invoke` 가 `ClientContext parameter error` 를 내면 `node scripts/invoke.js <name> "<json>"` 으로 우회하세요. 초기 셋업(createTables 등)·함수별 예제·시나리오 테스트 표준은 MCP 문서 `tcb-setup-deploy-invoke` 와 `tcb-setup-test-checklist` 를 따릅니다.

## WebSocket

실시간 기능의 기본 경로는 **SCF Web Function 위의 raw `ws` 서버**이며, 동봉 데모(`src/realtime/websocket-demo`)가 티켓 인증·에코·하트비트를 갖추고 있습니다.

- 일반 `npm run deploy` 는 WS 함수를 자동 제외합니다 — 전용 스크립트 `npm run build:websocket-demo` → `npm run deploy:websocket-demo` 로 배포하며, Function URL(`wss://`) 자동 생성·출력까지 수행합니다.
- 실행 모델 선택·티켓 인증 설계는 `tcb-feature-websocket`, 빌드·배포·연결 테스트·장애 분리는 `tcb-setup-websocket-deploy` 문서를 따릅니다.

## 새 함수 추가

1. `src/functions/<테마>/<name>.ts` 작성 — `export const main = createAxylHandler(baseHandler)` 패턴. 파일명은 전체에서 유일해야 합니다(빌드가 `dist/<name>.js` 생성).
2. `cloudbaserc.json` 의 `functions` 에 등록 — 사용하는 모듈에 맞춰 `envVariables` 지정 (MySQL=`DB_*`, Storage=`TCB_ENV_ID`, DocDB=`TCB_ENV_ID/TCB_DOCDB_*`).
3. `test/<테마>/<name>.test.ts` 작성 — 미들웨어 subpath 를 `vi.mock` 으로 대체 (기존 테스트 파일 패턴 참고).

핸들러 규약(에러 3종·데이터 격리·멱등성·PlayerId 규격)은 [AGENTS.md](./AGENTS.md) 를, 모듈별 상세는 MCP 문서를 따릅니다.

## 참고

- [AGENTS.md](./AGENTS.md) — AI 에이전트용 프로젝트 규약 (불변 규약 + MCP 문서 id 표)
- [SECURITY.md](./SECURITY.md) — npm audit 잔여 취약점(@cloudbase SDK 전이 의존) 현황·대응
- [TCB 공식 문서](https://docs.cloudbase.net)
- @com2usplatform/hiveaxyl-tcbconnector-middleware — Axyl TCB 미들웨어 패키지 (npmjs 공개 배포)
