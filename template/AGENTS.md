# AGENTS.md

이 프로젝트는 **Axyl TCB Cloud Function 예제 풀 구성**입니다 (`@com2usplatform/hiveaxyl-tcbconnector-middleware` 기반, MySQL·Cloud Storage·Document DB 예제 + 테스트 포함).
새 함수를 만들거나 고칠 때 아래 규약을 따르고, **동작하는 정답은 기존 예제 코드와 MCP 문서에서** 확인하세요.

## 상세 문서는 MCP 로 조회 (정본)

상세 가이드의 정본은 로컬 MD 가 아니라 **Axyl Docs MCP 서버**입니다. 프로젝트 루트 `.mcp.json` 에 서버(`axyl-docs`)가 등록돼 있습니다.

- **개발 흐름 전체가 궁금하면 먼저** `start_tcb_workflow(goal)` — 부트스트랩→개발→배포→테스트 플레이북과 단계 게이트를 반환합니다.
- 문서 id 를 모르면 `get_doc_tree` / `list_docs(product:'tcb')`.

| 주제 | MCP 도구 | 문서 id |
|---|---|---|
| MySQL 사용 규약·함정·테스트 | get_feature_spec | `tcb-feature-mysql` |
| MySQL 콘솔 초기 설정 | get_setup_guide | `tcb-setup-mysql` |
| Cloud Storage (경로 소유권 스코프) | get_feature_spec | `tcb-feature-storage` |
| Document DB | get_feature_spec | `tcb-feature-docdb` |
| WebSocket 설계 (실행 모델·티켓 인증·공유 상태) | get_feature_spec | `tcb-feature-websocket` |
| WebSocket 빌드·배포·Function URL·연결 테스트 | get_setup_guide | `tcb-setup-websocket-deploy` |
| 배포·invoke 절차 (셋업·함수별 예제 포함) | get_setup_guide | `tcb-setup-deploy-invoke` |
| 테스트 체크리스트 | get_setup_guide | `tcb-setup-test-checklist` |
| 에러 코드 대응 | get_error_guide | (코드·키워드로 검색) |
| npm audit 경고 설명 | get_version_requirements | `tcb-version-dependency-audit` |

⚠️ **MCP 도구(axyl-docs)가 보이지 않으면** 임의로 진행하지 말고 사용자에게 연결을 안내하세요 — Claude Code 라면 프로젝트를 다시 열거나 `/mcp` 에서 axyl-docs 를 Hive 콘솔 계정으로 인증하면 됩니다. 미연결 상태에서도 이 문서의 불변 규약은 유효하지만, 상세 절차가 필요한 작업(배포·WebSocket·스키마 설계 상세)은 정본 문서 없이 추측으로 진행하지 마세요.

## 데이터 저장소
MySQL(`@com2usplatform/hiveaxyl-tcbconnector-middleware/db`) · Cloud Storage(`@com2usplatform/hiveaxyl-tcbconnector-middleware/storage`) · Document DB(`@com2usplatform/hiveaxyl-tcbconnector-middleware/docdb`) 예제를 모두 포함합니다.
함수 성격에 맞는 모듈을 import 하세요 — 정합성·트랜잭션이 중요하면 MySQL, 파일은 Storage, 유연한 스키마는 Document DB.

⚠️ 요구사항에 **파일(이미지·문서 등) URL** 이 등장하면 저장 방식이 갈립니다 — ① 외부/CDN URL 문자열만 저장 vs ② Cloud Storage 업로드(파일 본체 보관 + 메타데이터 테이블 + 업로드/확정 함수). 스키마와 함수 구성이 달라지고 나중에 바꾸면 마이그레이션 비용이 크므로, **임의로 정하지 말고 구현 전에 사용자에게 어느 쪽인지 질의하세요.** ②를 선택하면 Storage 규약(메타데이터 테이블, 직접 업로드 흐름, 경로 소유권 스코프 — MCP 문서 tcb-feature-storage)을 따릅니다.

## 핵심 규약 (불변)
- **일반 이벤트 함수**의 진입점은 `export const main = createAxylHandler(baseHandler)`. baseHandler 는 **비즈니스 데이터만** 반환하면 미들웨어가 `{ success, code, metadata, data }` 로 감쌉니다.
- **WebSocket Web Function은 예외**입니다. `createAxylHandler`/`context.ws`를 쓰지 않고 `scf_bootstrap`이 `0.0.0.0:9000` 서버를 시작합니다. 기본 제공 경로는 **raw `ws` 서버**(동봉 데모: `src/realtime/websocket-demo`)이고, 연결 인증은 일반 Axyl 함수(`issueWebSocketTicket`)가 발급한 짧은 수명·1회용 티켓으로 처리합니다. 공유 상태는 단일 인스턴스 메모리에 두지 않고 MySQL 정본으로 확정합니다. 방·상태 동기화 프레임워크는 이 프로젝트에 임의로 도입하지 않습니다. 실행 모델·보안·별도 배포·에러 핸들링은 MCP 문서 `tcb-feature-websocket` / `tcb-setup-websocket-deploy` 를 따릅니다.
- **데이터 격리**: 모든 WHERE/PK 에 **Gateway 가 주입한 `context.aud.projectIndex`** 와 `context.playerId` 를 함께 묶습니다. 요청 body 값은 위변조 가능하므로 격리 기준으로 쓰지 않습니다.
- **PlayerId 규격**: `context.playerId` 의 플랫폼 규격은 **`^\d{1,19}$` 인 숫자 문자열**입니다(BIGINT). **테스트 호출도 반드시 이 규격을 따릅니다** — 이름·UUID·하이픈 문자열은 테스트용으로도 쓰지 마세요(미들웨어 `withHiveHeaders` 가 `BAD_REQUEST` 로 거절). JS `number` 로 파싱하지 마세요(2^53 초과 시 정밀도 손실).
- **에러**: 핸들러의 비즈니스 검증은 `AxylMiddlewareError(ERROR_CODES.INVALID_PARAMETER, …)`, 도메인 고유 에러는 `AxylError('CODE', …)`. 게이트웨이 신뢰경계 검증 실패는 미들웨어가 `BAD_REQUEST` 로 처리하므로 직접 throw 하지 않습니다. 그 외 예외는 `INTERNAL_ERROR` 로 덮입니다.
- **멱등성**: 재화 차감·결제 등은 `(playerId, idempotencyKey)` 로 스코프합니다.
- **쿼리 설계**: 기본은 테이블별 개별 `SELECT` + 앱에서 병합(ID 를 모아 `IN (?)` 배치, 행별 쿼리=N+1 금지). **JOIN 은 ① 조인 대상 컬럼으로 필터/정렬·페이지네이션, ② 트랜잭션 내 원자적 정합성 — 이 둘일 때만.** 그 외(1:1·규모 무관 1:N·N:M) 전부 분리 조회. 게임서버 高QPS 에선 JOIN 의 fan-out·filesort 가 tail latency 를 키우고 자식 캐싱·샤딩을 막으므로 point-lookup + 병합이 기본. (MCP 문서 `tcb-feature-mysql` 참고)
- **파일명**: 함수 파일명(확장자 제외)은 전체에서 유일해야 합니다(빌드가 basename 기준 `dist/<name>.js` 생성).

## 참고 구현 (동작하는 정답)
- 트랜잭션 — `src/functions/mysql/grantItem.ts`
- 멱등성(확률성 작업 결과 캐싱) — `src/functions/mysql/drawGacha.ts`
- 스키마 단일 소스 + 온디맨드 생성 — `src/db/schema.ts` · `src/functions/setup/createTables.ts`. 셋업/시드 함수는 `.env` 의 `ALLOW_SETUP_FUNCTIONS=true` 가 배포에 주입된 환경에서만 동작합니다(`SETUP_DISABLED` 응답이면 `.env` 확인 후 재배포, 운영 전 제거)
  - ⚠️ DDL 은 `pool.query(ddl.replace(/\s+/g, ' ').trim())` 로 **한 줄로 접어** 실행합니다. 이 환경의 `mysql2` 는 멀티라인 쿼리에 `Malformed communication packet` 을 던집니다(실측: 선행 개행만 제거해도 실패). 인라인 SELECT/INSERT 도 처음부터 한 줄로 작성하세요. (→ `tcb-feature-mysql` 함정 절)
- Cloud Storage — `src/functions/storage/*` · Document DB — `src/functions/docdb/*`
- 모듈별 상세 — 위 'MCP 로 조회' 표의 문서 id 로 조회 · npm audit 경고는 [SECURITY.md](./SECURITY.md)(로컬 유지)

## 빌드 / 배포 / 호출 테스트
- 로컬: `npm test` (DB/TCB 연결 없이 mock 으로 실행).
- 배포: TCB CLI 필요 — `npm i -g @cloudbase/cli && tcb login` 후 `npm run deploy:build`. 특정 함수만 `npm run deploy -- <name>`. **배포 전 아래 'TCB 사전 점검' MUST 를 먼저 수행하세요.**
  - ⚠️ `tcb login` 은 **대화형**이라 AI 에이전트가 대신 수행할 수 없습니다. 미인증 상태에서는 배포가 실패하므로, 사용자가 직접 1회 `tcb login` 을 실행해야 합니다.
- 호출: `tcb fn invoke <name> --params "{...}"`.
  - ⚠️ invoke 는 **배포된 `dist` 코드**를 실행합니다. 소스 수정 후 반드시 `deploy:build` 를 먼저 실행하세요.
  - 헤더 `X-Hive-Player-Id` / `X-Hive-Aud`(형식 `{appIndex}-{projectIndex}-{companyIndex}`) 필요. `X-Hive-Player-Id` 는 **`^\d{1,19}$` 숫자 문자열만 허용**(위 'PlayerId 규격' 참고). 셋업·함수별 invoke 예제는 MCP 문서 `tcb-setup-deploy-invoke`.
  - ⚠️ `tcb fn invoke` 가 **`ClientContext parameter error`** 를 내면 CLI 호출 경로 문제입니다 — 함수 코드를 의심하지 말고 `node scripts/invoke.js <name> "<json>"`(CloudBase SDK `callFunction`) 로 전환하세요. 인증은 CLI 자격증명 재사용: `~/.config/.cloudbase/auth.json` 의 `credential.tmpSecretId/tmpSecretKey/tmpToken` → SDK `secretId/secretKey/`**`sessionToken`** (⚠️ `token` 아님). (→ `tcb-setup-deploy-invoke`)
  - 배포 후 검증은 단발 invoke 반복 대신 **SDK 시나리오 스크립트**(`scripts/test-<기능>.js` — 정상 흐름/멱등성/격리/도메인 에러를 한 번에)로 표준화하세요. (→ `tcb-setup-deploy-invoke`, 체크리스트 `tcb-setup-test-checklist`)
- WebSocket Web Function은 위 일반 배포·invoke 경로의 예외입니다. 전용 산출물(`index.js`·`package.json`·`scf_bootstrap`)을 만들고 `--httpFn --ws` 로 별도 배포합니다 — 동봉 데모는 `npm run build:websocket-demo` → `npm run deploy:websocket-demo`. `ws` 는 배포 디렉터리 package.json 의존성으로 두고 `installDependency:true`, `cloudbaserc.json` 에 `type=HTTP`·`protocolType=WS` 를 영구 설정합니다. `tcb fn invoke`/`app.callFunction()` 은 WebSocket 업그레이드를 만들지 않으므로 실제 `wss://` 연결로 검증합니다. (→ `tcb-setup-websocket-deploy`)
- DB 신뢰성: TCB 첫 DB 접근은 `read ECONNRESET`/`Malformed communication packet` 으로 일시 실패할 수 있습니다 — 셋업·상태 변경 함수는 **멱등 + 해당 오류 한정 1회 재시도**. 미들웨어에 내장돼 있으니 직접 헬퍼를 만들지 마세요: 멱등 쿼리는 **`queryIdempotent`**(`@com2usplatform/hiveaxyl-tcbconnector-middleware/db`), `transaction()` 은 시작 단계 일시 오류를 자동 재시도, 풀은 keepAlive 로 하드닝. ⚠️ `queryIdempotent` 를 비멱등 쿼리에 쓰면 중복 반영됩니다. DDL 실패 시엔 로컬 mysql2 로 같은 DB 에 `SELECT 1` → 동일 DDL 순으로 실행해 **DB/쿼리/TCB 런타임 문제를 분리**하세요. (→ `tcb-feature-mysql`)
- 주기 실행(만료 데이터 정리 등)은 TCB **타이머 트리거**를 사용합니다 — cron 은 7필드(`초 분 시 일 월 요일 연`), 타이머 호출은 Gateway 헤더가 없으므로 **`createAxylHandler` 를 쓰지 않는** plain handler 로 작성. ⚠️ 타이머는 배포 즉시 계속 실행되는 능동 리소스이므로 **데모/실험용으로 배포하지 말고**, 필요 시 `tcb-feature-mysql` '만료 데이터 정리' 절 샘플을 복사해 만드세요.

### TCB 사전 점검 — 배포·호출 전 MUST

**첫 세션이라도** 배포(`deploy`)·실 환경 호출(invoke) 전에 아래를 반드시 수행합니다. **하나라도 불명확하면 배포를 시작하지 않습니다** — 먼저 해소하거나 사용자에게 물어보세요.

1. **PlayerId 규격 검증 (MUST)** — `X-Hive-Player-Id` 는 **숫자 1~19자리 문자열만 허용**합니다 (정규식 `^\d{1,19}$`). 테스트용 ID 에도 이름·UUID·하이픈 문자열을 사용하지 않습니다. 호출 전에 미들웨어 `withHiveHeaders` 의 검증 규칙(`node_modules/@com2usplatform/hiveaxyl-tcbconnector-middleware/dist/middlewares/withHiveHeaders.js`)과 대조하세요 — 규격 위반은 원인 구분 없이 `BAD_REQUEST` 로 거절되므로, 헤더 문제를 함수 버그로 오인하고 삽질하게 됩니다.
2. **실사용 `.env` 확인 (MUST)** — 현재 작업 디렉터리부터 상위 workspace 까지 `.env` 후보를 모두 확인합니다. **단순 문자열 검색으로 끝내지 말고, 실제 배포 스크립트(`scripts/deploy.js`)가 어느 `.env` 를 읽는지 먼저 확인**하세요(이 프로젝트는 프로젝트 루트의 `.env` 를 읽습니다). 그런 다음 **배포 스크립트와 동일한 파싱 규칙**으로 `TCB_ENV_ID` 와 `TCB_REGION` 의 최종값을 검증합니다 — 주석 안의 값, 줄이 합쳐진 값, 빈 값은 "설정됨"으로 판단하지 않습니다. 같은 키가 중복되면 마지막 값을 임의로 사용하지 말고 **중복 사실과 각 파일 위치를 먼저 보고**합니다.
3. **REGION 은 추론하지 않습니다 (MUST)** — 기존 함수 호출 성공 여부, 사용자 시간대, DB 주소, SDK 기본 리전만으로 리전을 결정하지 않습니다. `.env` 에 명시된 값을 우선 사용하고, 명시값이 정말 없을 때만 읽기 전용 환경 조회(예: `tcb env list`)로 확인하며, 그래도 확인되지 않으면 **사용자에게 묻습니다**.
   > ⚠ REGION 누락 여부를 보고하기 전에 실제 배포 스크립트가 읽는 `.env` 와 상위 workspace 의 `.env` 를 모두 확인하고, 배포 스크립트와 동일한 파서로 최종값을 계산한다. REGION 을 추론하거나 확인 전에 `.env` 를 수정하지 않는다.
4. **프리플라이트 결과 보고 (MUST)** — 배포 전에 아래 형식으로 출력합니다. **비밀번호·인증 정보는 출력하지 않습니다.**
   ```
   [TCB 사전 점검]
   - 사용 .env       : <실제 배포 스크립트가 읽는 경로>
   - TCB_ENV_ID      : 설정됨 / 미설정
   - TCB_REGION      : <최종값> (출처: <.env 경로>)
   - 동일 키 중복     : 없음 / <키> — <파일별 위치 나열>
   - 테스트 PlayerId : <값> → ^\d{1,19}$ 통과/실패
   ```
5. **불명확하면 배포 금지 (MUST)** — 위 항목 중 하나라도 확인되지 않으면 배포를 시작하지 않습니다.

### 리눅스/WSL 셸에서 직접 빌드·배포해야 할 때 (AI 샌드박스)

일부 AI 에이전트 셸(WSL 샌드박스)은 Windows 상호운용이 꺼져 있습니다(`/proc/sys/fs/binfmt_misc/WSLInterop` 미등록). 이 경우 `node.exe`·`tcb`·`cmd.exe` 등 **Windows 실행파일이 전부 `Exec format error` 로 실패**하고 리눅스 node 도 기본 미설치라, 아래 셋업 없이는 셸에서 직접 빌드/배포할 수 없습니다. 사용자 Windows 터미널에서 실행할 때는 해당 없음. (아래는 실측으로 확인된 절차)

- **빌드**: sudo 없이 portable 리눅스 node(nodejs.org dist tarball, 예: `v20.x-linux-x64`)를 로컬에 풀어 PATH 앞에 추가합니다. 프로젝트 node_modules 의 esbuild 는 Windows 바이너리(`@esbuild/win32-x64`)라 리눅스에서 실행되지 않으므로, **프로젝트 esbuild 와 같은 버전의 `@esbuild/linux-x64` 를 격리 설치**한 뒤 `ESBUILD_BINARY_PATH` 로 지정하면 `npm run build` 가 성공합니다.
- **⚠ 배포는 `tcb` CLI 로 안 됩니다**: 이런 환경/자격증명에서 tcb 제품 API `DescribeEnvInfo` 가 **모든 리전에서 `InternalError`** 로 실패합니다(`tcb env list` = `DescribeEnvs` 는 정상이라 착각하기 쉬움). `tcb fn deploy` 와 `@cloudbase/manager-node` 의 `createFunction` 이 내부적으로 이 API 를 호출해 함께 막힙니다. **SCF 제품 API 는 정상**이므로 우회합니다 — `@cloudbase/manager-node` 의 `app.functions.scfService.request(...)` 로 SCF `CreateFunction`/`UpdateFunctionCode`/`UpdateFunctionConfiguration` 을 직접 호출합니다. TCB 관리형 함수의 SCF `Namespace` 는 **envId** 입니다. 코드는 `archiver` 로 zip 해 `Code.ZipFile`(base64)로 넘깁니다 — esbuild 번들이 ~2.2MB 여도 zip 후 ~0.4MB 로 1.5MB 한도 이내입니다. 코드/설정 갱신 사이에는 `GetFunction` 의 `Status` 가 `Active` 가 될 때까지 대기하세요 — 안 기다리면 `current function status is Updating` 으로 거부됩니다.
- **인증·region**: 위 invoke 불릿과 동일합니다 — `~/.config/.cloudbase/auth.json` 의 임시 자격증명을 `secretId/secretKey/`**`sessionToken`** 으로 재사용하고, region(`.env` 의 `TCB_REGION` 값)을 **모든 호출에 반드시 지정**합니다(미지정 시 SDK 기본 ap-shanghai 로 붙어 거절). 리눅스 홈에 auth.json 이 없으면 Windows 쪽(`/mnt/c/Users/<user>/.config/.cloudbase/auth.json`)을 복사하고, 만료되면 **사용자가 Windows 에서 `tcb login` 을 다시 실행**해야 갱신됩니다.
- **Document DB 컬렉션 사전 생성**: 컬렉션이 없으면 `ResourceNotFound: Db or Table not exist` 가 납니다. invoke 가 가능하면 예제 `createCollections` 함수로, 셸에서 직접 하려면 `@cloudbase/node-sdk` 의 `app.database({ instance, database }).createCollection(name)` 으로 생성합니다 — instance/database 는 `.env` 의 `TCB_DOCDB_INSTANCE`/`TCB_DOCDB_DATABASE` 값을 지정해야 합니다.

## 정확한 타입이 필요하면
모든 타입의 정답은 `@com2usplatform/hiveaxyl-tcbconnector-middleware` 의 타입 선언입니다 — `node_modules/@com2usplatform/hiveaxyl-tcbconnector-middleware/dist/*.d.ts`. 불확실하면 추측하지 말고 여기서 확인하세요.
