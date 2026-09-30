# AGENTS.md

이 프로젝트는 **Axyl TCB Cloud Function** 입니다(`@com2usplatform/hiveaxyl-tcbconnector-middleware` 기반, 최소 구성).
함수를 만들거나 수정할 때 아래 규약을 따르세요.

## 상세 문서는 MCP 로 조회 (정본)

상세 가이드의 정본은 로컬 MD 가 아니라 **Axyl Docs MCP 서버**입니다. 프로젝트 루트 `.mcp.json` 에 서버(`axyl-docs`)가 등록돼 있습니다.

- **개발 흐름 전체가 궁금하면 먼저** `start_tcb_workflow(goal)` — 부트스트랩→개발→배포→테스트 플레이북과 단계 게이트를 반환합니다.
- 모듈별 문서 id 는 아래 '데이터 모듈' 절과 각 참조 지점에 표기돼 있고, 모르면 `get_doc_tree` / `list_docs(product:'tcb')` 로 찾습니다.
- ⚠️ **MCP 도구(axyl-docs)가 보이지 않으면** 임의로 진행하지 말고 사용자에게 연결을 안내하세요 — Claude Code 라면 프로젝트를 다시 열거나 `/mcp` 에서 axyl-docs 를 Hive 콘솔 계정으로 인증하면 됩니다. 미연결 상태에서도 이 문서의 규약은 유효하지만, 상세 절차가 필요한 작업(배포·WebSocket·스키마 설계 상세)은 정본 문서 없이 추측으로 진행하지 마세요.

## 핸들러 작성
- 일반 이벤트 함수의 진입점은 `export const main = createAxylHandler(baseHandler)`.
- `baseHandler: AxylBaseHandler<ReqDto, ResDto>` — `(event, context)` 를 받아 **비즈니스 데이터만** 반환하면, 미들웨어가 표준 응답 `{ success, code, metadata, data }` 로 감쌉니다.
- 함수 파일은 `src/functions/<theme>/<name>.ts` (예: `basic/index.ts` → `dist/index.js`). `npm run build` 가 자동 인식하므로 빌드 스크립트는 손대지 않습니다.
  - ⚠️ 빌드는 **파일명(basename)** 기준으로 `dist/<name>.js` 를 만듭니다. 테마가 달라도 파일명이 같으면 서로 덮어쓰므로, 함수 파일명은 전체에서 **유일**해야 합니다.
- WebSocket Web Function은 예외입니다. `createAxylHandler`가 아니라 `scf_bootstrap`이 `0.0.0.0:9000` 서버를 시작하며 별도 빌드·배포합니다. 기본 경로는 raw `ws` 서버이고 상세 규약은 MCP 문서 `tcb-feature-websocket` 을 따릅니다.

## 주석 작성
주석은 코드가 **무엇을 하는지**가 아니라 **왜 그렇게 하는지**를 적습니다. 이 프로젝트는 정합성·동시성·보안 결정이 코드 곳곳에 숨어 있어, 그 의도를 주석으로 남기지 않으면 다음 사람이 안전하게 고칠 수 없습니다.

- **파일 상단 블록 주석(필수)** — 각 함수 파일은 `/** … */` 로 시작해 ① 함수의 목적(한 줄), ② 정합성·동시성·보안 포인트를 요약합니다. 예: "동시 구매를 `FOR UPDATE` 로 직렬화한다", "멱등성 키로 재시도를 1회만 반영한다".
- **"왜"가 비자명한 곳에는 반드시 주석** — 아래는 주석 없이는 의도를 알 수 없으므로 한 줄이라도 답니다:
  - 데이터 격리: `WHERE` 에 `context.aud.projectIndex` 를 묶는 이유(위변조 차단).
  - 동시성: `SELECT … FOR UPDATE` 로 행을 잠그는 이유, 조건부 `UPDATE … WHERE balance >= ?` 의 `affectedRows` 검사가 무엇을 보장하는지.
  - 트랜잭션: 한 트랜잭션으로 묶는 단위와 롤백이 의도된 지점(예: 마감 실패 시 일부러 throw 해 롤백).
  - 멱등성: `(playerId, idempotencyKey)` 로 스코프하는 이유, 캐시된 결과를 그대로 반환하는 분기.
- **도메인 개념은 첫 등장 지점에 정의** — `에스크로`(등록 시 인벤토리에서 빼 매물에 보관), `정산금`(가격 − 수수료), `멱등성` 등은 처음 쓰는 곳에서 한 줄로 뜻을 밝혀 둡니다.
- **자명한 코드에는 주석 금지** — 단순 대입·게터·`const x = event.body?.x` 류에 "x를 읽는다" 같은 주석은 노이즈입니다. 달지 마세요.
- **표현 규약** — 한국어, 간결한 평서/명령형으로 기존 핸들러 톤을 유지합니다. SQL 의도가 비자명하면 쿼리 바로 위에 한 줄로 답니다.
- **주석은 코드와 함께 갱신** — 로직을 바꾸면 주석도 같이 고칩니다. 코드와 어긋난 주석은 **없느니만 못합니다**(거짓 정보).
- 참고 구현: `src/functions/mysql/grantItem.ts`·`drawGacha.ts`(트랜잭션·멱등성)와 `src/db/schema.ts`(스키마 정의 주석)가 위 규약을 따른 예시입니다.

## context — 검증 완료된 신뢰값
- `context.playerId` — Gateway 가 주입한 플레이어 ID. **플랫폼 규격은 `^\d{1,19}$` 인 숫자 문자열**(BIGINT)이며, **테스트 호출도 반드시 이 규격을 따릅니다** — 이름·UUID·하이픈 문자열은 테스트용으로도 금지(미들웨어가 `BAD_REQUEST` 로 거절). JS `number` 로 파싱하지 마세요(2^53 초과 시 정밀도 손실).
- `context.aud.projectIndex` / `aud.appIndex` / `aud.companyIndex` — Gateway 가 주입한 `X-Hive-Aud` 파싱값.
  - ⚠️ **데이터 격리(WHERE 절)에는 반드시 `context.aud.projectIndex` 를 사용**하세요. 요청 body 값은 위변조 가능하므로 격리 기준으로 쓰지 마세요.
- `context.traceId` — 로그 상관관계용(W3C `traceparent`). ⚠️ **관측 전용** — 보안 판단이나 멱등성 키로 쓰지 마세요.
- `context.logger?.info(msg, meta)` / `error`.

## 에러
- **미들웨어 표준 코드** — `ERROR_CODES` 는 닫힌 3개입니다:
  - `BAD_REQUEST` — 게이트웨이 신뢰경계 검증 실패(헤더 / aud / projectIndex 누락·형식). **미들웨어가 자동 처리**하므로 직접 throw 하지 않습니다. 어느 값이 빠졌는지 구분해 노출하지 않고 단일 코드로 통일합니다(정찰 오라클 차단).
  - `INVALID_PARAMETER` — 핸들러의 비즈니스 파라미터 검증 실패. `throw new AxylMiddlewareError(ERROR_CODES.INVALID_PARAMETER, '메시지')`.
  - `INTERNAL_ERROR` — 처리되지 않은 예외(내부 정보 비노출).
- **비즈니스 도메인 코드** — `throw new AxylError('INSUFFICIENT_BALANCE', '메시지')`. 도메인 고유 에러는 `AxylError` 로 자유롭게 정의하면 그 문자열 code 가 응답에 그대로 실립니다.
- 그 외 처리되지 않은 예외는 자동으로 `INTERNAL_ERROR` 로 덮습니다(mysql2 에러의 `.code` 도 노출되지 않음).

## 데이터 모듈 (subpath)
- MySQL: `import { pool, transaction } from '@com2usplatform/hiveaxyl-tcbconnector-middleware/db'` (`mysql2` 포함). → MCP `tcb-feature-mysql`
- Cloud Storage: `@com2usplatform/hiveaxyl-tcbconnector-middleware/storage` — `npm i @cloudbase/node-sdk` 필요. → MCP `tcb-feature-storage`
- Document DB: `@com2usplatform/hiveaxyl-tcbconnector-middleware/docdb` — `npm i @cloudbase/node-sdk` 필요. → MCP `tcb-feature-docdb`
- 파라미터는 항상 `?` 플레이스홀더로 바인딩(문자열 연결 금지). 멱등성은 클라이언트가 보낸 `idempotencyKey` 를 `(playerId, idempotencyKey)` 로 스코프합니다.
- **쿼리 설계**: 기본은 테이블별 개별 `SELECT` + 앱에서 병합(ID 를 모아 `IN (?)` 배치, 행별 쿼리=N+1 금지). **JOIN 은 ① 조인 대상 컬럼으로 필터/정렬·페이지네이션, ② 트랜잭션 내 원자적 정합성 — 이 둘일 때만.** 그 외(1:1·규모 무관 1:N·N:M) 전부 분리 조회. 게임서버 高QPS 에선 JOIN 의 fan-out·filesort 가 tail latency 를 키우고 자식 캐싱·샤딩을 막으므로 point-lookup + 병합이 기본. (→ MCP `tcb-feature-mysql`)
- ⚠️ **MySQL 쿼리 문자열에 개행을 남기지 마세요.** 이 환경의 `mysql2` 는 멀티라인 쿼리에 `Malformed communication packet`(→ `INTERNAL_ERROR`)을 던집니다. 연결은 멀쩡한데 쿼리만 실패해 원인 파악이 까다롭습니다. **실측(2026-07, CynosDB 게이트웨이 경유 실 배포 환경)**: 들여쓴 멀티라인 DDL은 `.trim()`(선행 개행 제거)만으로도 실패했고, **내부 개행·들여쓰기까지 전부 접어 한 줄로** 보내야 성공했습니다:
  ```ts
  const ddl = `CREATE TABLE IF NOT EXISTS items (
      id INT ...
  )`;
  await pool.query(ddl.trim());                        // ❌ 내부 개행 때문에 실패 (실측)
  await pool.query(ddl.replace(/\s+/g, ' ').trim());   // ✅ 공백을 한 칸으로 접어 한 줄로
  ```
  SQL 은 공백 개수에 의미가 없으므로 접어도 안전합니다. `schema.ts` 의 멀티라인 DDL을 실행하는 `setup/createTables` 가 이 방식을 사용합니다. 인라인 SELECT/INSERT 는 처음부터 한 줄로 작성하세요.

## 다른 데이터 저장소 추가하기
처음에 하나만 골랐어도 나중에 다른 저장소를 추가할 수 있습니다(가산적).

**Document DB 추가** (MySQL 프로젝트에):
1. `npm i @cloudbase/node-sdk`
2. `.env` 와 새 함수의 `cloudbaserc.json` envVariables 에 `TCB_ENV_ID`·`TCB_DOCDB_INSTANCE`·`TCB_DOCDB_DATABASE` 추가
3. 핸들러에서 `import { collection } from '@com2usplatform/hiveaxyl-tcbconnector-middleware/docdb'` (사용법 → MCP `tcb-feature-docdb`)

**MySQL 추가** (Document DB 프로젝트에):
1. `npm i mysql2`
2. `.env` 와 새 함수의 `cloudbaserc.json` envVariables 에 `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME` 추가
3. 핸들러에서 `import { pool, transaction } from '@com2usplatform/hiveaxyl-tcbconnector-middleware/db'` (사용법 → MCP `tcb-feature-mysql`)

> ⚠️ **추가한 뒤 위 '데이터 저장소' 선언을 반드시 갱신**하세요(둘 다 쓰면 "MySQL·Document DB 둘 다"로). 이 선언은 연결된 AI 의 1순위 판단 신호라, 갱신하지 않으면 새로 추가한 저장소를 계속 쓰지 않습니다.

## 데이터베이스 스키마 / 테이블 생성
로직이 **새 테이블을 필요로 하면** 아래 패턴을 따르고, 사용자에게 셋업 함수 배포·호출까지 함께 제안하세요.
- **DDL 단일 소스**: `src/db/schema.ts` 에 `CREATE TABLE IF NOT EXISTS` 로 선언합니다. 테이블은 여러 함수가 공유하는 cross-cutting 자산이므로 함수 폴더가 아니라 여기에 모읍니다. `src/db` 는 `src/functions` 바깥이라 클라우드 함수로 빌드되지 않고 import 번들에만 포함됩니다.
- **온디맨드 생성 함수**: `src/functions/setup/createTables.ts` 가 `schema.ts` 를 읽어 전체 테이블을 생성합니다. `cloudbaserc.json` 에 등록해 배포한 뒤, 원하는 시점(최초 셋업·스키마 변경 후)에 **1회 호출**합니다.
- **비즈니스 핸들러는 스키마를 만들지 않습니다** — 요청 경로 오버헤드 0, 평소 CREATE 권한 불필요. 매 호출마다 ensure 하는 방식은 콜드스타트 비용이 테이블 수에 비례해 커지므로 쓰지 않습니다.
- 워크플로: 테이블 필요 → `schema.ts` 에 DDL 추가 → `deploy:build` → `tcb fn invoke createTables ...` 1회. 셋업 함수는 `.env` 의 `ALLOW_SETUP_FUNCTIONS=true` 가 주입된 배포에서만 동작합니다(운영 전 제거).
- 테이블에는 `project_index`(Gateway 주입 aud)·`player_id`(Gateway 주입) 컬럼을 두고 WHERE 에 항상 함께 묶어 데이터 격리를 보장합니다.
- 위 `src/db/schema.ts`·`src/functions/setup/createTables.ts` 는 최소 구성에 미리 들어있지 않으므로, 처음 테이블이 필요할 때 이 규약대로 생성하세요.
- 참고: 테스트 포함(Y) 템플릿도 동일한 구조(`src/db/schema.ts` + `src/functions/setup/createTables.ts`)를 사용하므로, 풀 구성을 받아 본 적이 있다면 그 패턴을 그대로 따르면 됩니다.

## cloudbaserc.json 등록
새 함수는 `functions` 배열에 추가합니다.
```json
{ "name": "<name>", "dir": "./dist", "handler": "<name>.main", "runtime": "Nodejs18.15", "timeout": 30, "memorySize": 256, "installDependency": false }
```
`<name>` 은 함수 파일명(확장자 제외, = `dist/<name>.js`)과 일치시킵니다.
`envVariables` 는 사용하는 모듈에 맞춰: MySQL=`DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME`, Storage=`TCB_ENV_ID`, Document DB=`TCB_ENV_ID/TCB_DOCDB_INSTANCE/TCB_DOCDB_DATABASE`.

## WebSocket
- 요구사항에 실시간/WebSocket/멀티플레이가 등장하면 **Cloud Function Web Function**과 **CloudBase Run** 중 실행 모델을 먼저 확인합니다. 이 프로젝트 안에 추가하는 기본 경로는 Web Function이고, 사용자가 제공한 CloudBase Run 문서의 `context.ws`와 섞지 않습니다.
- 기본 제공 경로는 **raw `ws` 서버**입니다. 방 생성·좌석 예약·서버 권위 상태 동기화 프레임워크가 필요해 보이면 임의로 도입하지 말고 사용자에게 먼저 확인하세요.
- Web Function은 `scf_bootstrap`과 독립 배포 디렉터리의 `index.js`·`package.json`이 필요하며 `0.0.0.0:9000`에서 수신합니다.
- 브라우저는 임의의 `X-Hive-*` 헤더를 보낼 수 없으므로, 일반 Axyl 이벤트 함수가 검증된 `context.playerId`/`context.aud.projectIndex`에 묶인 짧은 수명·1회용 티켓을 발급합니다. DB에는 티켓 해시만 저장하고 조건부 UPDATE로 한 번만 소비합니다.
- Web Function의 기본 요청 동시성은 1이며, 장기 연결 하나가 요청 슬롯 하나를 점유합니다. 진행 상태는 단일 프로세스 안에서만 유효하므로 공유 상태를 프로세스 메모리에 두지 말고 최종 결과·보상은 MySQL 트랜잭션에 확정합니다.
- `ws` 는 배포 디렉터리 package.json 의 런타임 의존성으로 남기고(`installDependency:true`), 서버 코드는 esbuild 로 `index.js` 하나로 번들합니다(`external: ['ws']`).
- 일반 `npm run deploy`/`tcb fn invoke` 경로를 쓰지 않습니다. `tcb fn deploy <name> --httpFn --ws ...`로 배포하고 함수 상세의 HTTP+WS 설정을 확인한 뒤, 실제 `wss://` Function URL 로 연결 → 티켓 재사용 거부 → 2개 이상 동시 연결까지 테스트합니다.
- 제한값·하트비트·재연결·메시지 프로토콜과 단계별 장애 분리는 MCP 문서 `tcb-feature-websocket` / `tcb-setup-websocket-deploy` 를 그대로 따릅니다.

## 빌드 / 배포 / 호출 테스트
- 빌드: `npm run build` (esbuild, `dist/<name>.js`). 특정 함수만: `node scripts/build.js <name>` (파일명, 확장자 제외).
- 배포: TCB CLI 필요 — `npm i -g @cloudbase/cli && tcb login` 후 `npm run deploy:build`. 특정 함수만: `npm run deploy -- <name>`. 대상 환경은 `.env` 의 `TCB_ENV_ID`/`TCB_REGION` 으로 지정합니다(cloudbaserc 에 하드코딩하지 않음).
- **TCB 사전 점검 (배포·호출 전 MUST)** — 첫 세션이라도 배포/invoke 전에 반드시 수행하고, **하나라도 불명확하면 배포를 시작하지 않습니다**:
  - **PlayerId 규격**: `X-Hive-Player-Id` 는 `^\d{1,19}$` 숫자 문자열만 허용. 테스트용 ID 에도 이름·UUID·하이픈 문자열 금지. 호출 전 미들웨어 `withHiveHeaders` 검증 규칙과 대조(위반 시 단일 `BAD_REQUEST` 라 함수 버그로 오인하기 쉬움).
  - **실사용 `.env` 확인**: 현재 디렉터리부터 상위 workspace 까지 `.env` 후보를 모두 확인하되, 단순 문자열 검색 대신 **실제 배포 스크립트(`scripts/deploy.js`)가 읽는 `.env` 가 무엇인지 먼저 확인**하고, **동일한 파싱 규칙**으로 `TCB_ENV_ID`/`TCB_REGION` 최종값을 검증. 주석 안의 값·줄 합쳐진 값·빈 값은 미설정으로 취급. 키 중복 시 마지막 값을 임의 사용하지 말고 중복 사실과 파일 위치를 먼저 보고.
  - **REGION 추론 금지**: 함수 호출 성공 여부·사용자 시간대·DB 주소·SDK 기본 리전으로 리전을 결정하지 않습니다. `.env` 명시값 우선 → 정말 없으면 읽기 전용 조회(`tcb env list`) → 그래도 불확실하면 **사용자에게 질문**. ⚠ REGION 누락을 보고하기 전에 실제 배포 스크립트가 읽는 `.env` 와 상위 workspace 의 `.env` 를 모두 확인하고 동일한 파서로 최종값을 계산하세요. **확인 전에 `.env` 에 REGION 을 추가·수정하지 않습니다.**
  - **프리플라이트 보고**: 배포 전에 `사용 .env 경로 / TCB_ENV_ID 설정 여부 / 최종 TCB_REGION / 동일 키 중복 여부 / 테스트 PlayerId 와 정규식 통과 여부` 를 출력합니다(비밀번호·인증 정보 출력 금지).
  - ⚠️ `tcb login` 은 **대화형**이라 AI 에이전트가 대신 수행할 수 없습니다. 미인증 상태에서는 배포가 실패하므로, 사용자가 직접 1회 `tcb login` 을 실행해야 합니다.
- 실 환경 호출: `tcb fn invoke <name> --params "{...}"`.
  - ⚠️ invoke 는 **배포된 `dist` 코드**를 실행합니다. 코드 수정 후에는 반드시 `deploy:build`(또는 `build` + `deploy`)를 먼저 실행하세요.
  - 모든 함수는 검증된 Hive 헤더가 필요합니다 — `params` 에 `headers.X-Hive-Player-Id` 와 `headers.X-Hive-Aud` 를 포함하세요. `X-Hive-Player-Id` 는 **`^\d{1,19}$` 숫자 문자열만 허용**(위 context 규칙 참고).
  - `X-Hive-Aud` 포맷: `{appIndex}-{projectIndex}-{companyIndex}` (예: `123-456-7` → `projectIndex` 456).
  - 예: `tcb fn invoke index --params "{\"headers\":{\"X-Hive-Player-Id\":\"9999999999991\",\"X-Hive-Aud\":\"10-1001-5\"}}"`
  - ⚠️ `tcb fn invoke` 가 **`ClientContext parameter error`** 를 내면 CLI 호출 경로 문제입니다 — 함수 코드를 의심하지 말고 `node scripts/invoke.js <name> "<json>"`(CloudBase SDK `callFunction`, `@cloudbase/node-sdk` 필요) 로 전환하세요. 인증은 CLI 자격증명 재사용: `~/.config/.cloudbase/auth.json` 의 `credential.tmpSecretId/tmpSecretKey/tmpToken` → SDK `secretId/secretKey/`**`sessionToken`** (⚠️ `token` 아님, 만료 시 `tcb login` 재실행).
  - 배포 후 검증은 단발 invoke 반복 대신 **SDK 시나리오 스크립트**(`scripts/test-<기능>.js` — 정상 흐름/멱등성/격리/도메인 에러를 한 번에)로 표준화하세요.
- DB 신뢰성: TCB 첫 DB 접근은 `read ECONNRESET`/`Malformed communication packet` 으로 일시 실패할 수 있습니다 — 셋업·상태 변경 함수는 **멱등(IF NOT EXISTS·ON DUPLICATE KEY·멱등성 키) + 해당 오류 한정 1회 재시도**로 작성하세요. 미들웨어에 내장: 멱등 쿼리는 **`queryIdempotent`**(`@com2usplatform/hiveaxyl-tcbconnector-middleware/db`, ⚠️ 비멱등 쿼리 사용 금지 — 중복 반영 위험), `transaction()` 은 시작 단계 일시 오류 자동 재시도, 풀 keepAlive 하드닝. DDL 실패 시엔 로컬 mysql2 로 같은 DB 에 `SELECT 1` → 동일 DDL 순으로 실행해 **연결/쿼리/TCB 런타임 문제를 분리**하세요.
- 주기 실행(만료 데이터 정리 등)은 TCB **타이머 트리거**(cloudbaserc `triggers`, cron 7필드 `초 분 시 일 월 요일 연`)를 사용합니다. 타이머 호출은 Gateway 헤더가 없으므로 **`createAxylHandler` 를 쓰지 않는** plain handler 로 작성하세요. ⚠️ 타이머는 배포 즉시 계속 실행되는 능동 리소스 — 데모/실험용으로 배포하지 말고, 필요 시 MCP `tcb-feature-mysql` '만료 데이터 정리' 절 샘플을 복사해 만드세요.
- WebSocket Web Function은 일반 이벤트 함수와 배포·검증 경로가 다릅니다. 전용 산출물과 `--httpFn --ws`, 실제 `wss://` Function URL 연결 테스트(티켓 재사용 거부·프로젝트 격리 포함)가 모두 확인돼야 배포 검증이 끝납니다. (→ MCP `tcb-setup-websocket-deploy`)
- **리눅스/WSL 셸(AI 샌드박스)에서 직접 빌드·배포해야 할 때** — Windows 상호운용이 꺼진 셸(`/proc/sys/fs/binfmt_misc/WSLInterop` 미등록)에서는 `node.exe`·`tcb` 등 Windows 실행파일이 전부 `Exec format error` 로 실패합니다(사용자 Windows 터미널에서는 해당 없음). 실측 우회 절차:
  - 빌드: sudo 없이 portable 리눅스 node(nodejs.org tarball)를 PATH 앞에 추가. esbuild 는 node_modules 에 Windows 바이너리만 있으므로 **같은 버전의 `@esbuild/linux-x64` 격리 설치 + `ESBUILD_BINARY_PATH` 지정** 후 `npm run build`.
  - ⚠ 배포는 `tcb` CLI 로 안 됩니다 — tcb 제품 API `DescribeEnvInfo` 가 모든 리전에서 `InternalError`(`tcb env list` 는 정상이라 착각 주의). `tcb fn deploy`·manager-node `createFunction` 이 같이 막히므로, **SCF 제품 API 로 우회**: `@cloudbase/manager-node` 의 `app.functions.scfService.request(...)` 로 `CreateFunction`/`UpdateFunctionCode`/`UpdateFunctionConfiguration` 직접 호출(`Namespace` = envId, 코드는 `archiver` zip → `Code.ZipFile` base64, 갱신 사이 `GetFunction` `Status=Active` 대기 — 안 기다리면 `current function status is Updating` 거부).
  - 인증·region: 위 invoke 항목과 동일(`auth.json` 임시 자격증명 → `sessionToken`, region 필수). 리눅스 홈에 auth.json 이 없으면 `/mnt/c/Users/<user>/.config/.cloudbase/auth.json` 복사, 만료 시 사용자가 Windows 에서 `tcb login` 재실행.
  - Document DB 컬렉션은 사전 생성 필요(없으면 `ResourceNotFound: Db or Table not exist`) — `@cloudbase/node-sdk` 의 `app.database({ instance, database }).createCollection(name)`, instance/database 는 `.env` 의 `TCB_DOCDB_INSTANCE`/`TCB_DOCDB_DATABASE`.
  - ⚠ TCB Mongo 에서 `doc(id).set(body)`/`update(body)` 의 body 에 `_id` 를 넣으면 `不能更新_id的值` 로 실패합니다 — `_id` 는 `doc(id)` 로만 지정하고 본문에서 제외하세요.

## 정확한 타입이 필요하면
모든 타입의 정답은 `@com2usplatform/hiveaxyl-tcbconnector-middleware` 의 타입 선언입니다 — `node_modules/@com2usplatform/hiveaxyl-tcbconnector-middleware/dist/*.d.ts` (예: `types.d.ts`, `factory/createAxylHandler.d.ts`, `lib/db.d.ts`). 불확실하면 추측하지 말고 여기서 확인하세요.

## 이 프로젝트의 특성
- **테스트가 없는 최소 구성**입니다(vitest 미설치). 테스트를 추가하려면 `npm i -D vitest` 후 MCP 문서(`tcb-feature-mysql`/`tcb-feature-storage`/`tcb-feature-docdb`)의 *테스트* 섹션 mock 패턴을 사용하세요. WebSocket 은 `tcb-setup-websocket-deploy` 의 로컬·실환경 다중 연결 시나리오를 별도로 검증합니다.
- 예제·테스트가 포함된 풀 구성이 필요하면 `npm create @com2usplatform/hiveaxyl-tcbconnector-template` 를 테스트 포함(Y)으로 다시 실행하면 됩니다.
