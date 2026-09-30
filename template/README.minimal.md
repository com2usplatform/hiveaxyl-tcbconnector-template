# <project-name>

TCB(Tencent CloudBase) Cloud Function 프로젝트 — **최소 구성**입니다.
`@com2usplatform/hiveaxyl-tcbconnector-middleware` 기반 기본 핸들러(`src/functions/basic/index.ts`) 하나로 시작합니다.

> **상세 가이드의 정본은 Axyl Docs MCP 서버입니다.** 프로젝트 루트 `.mcp.json` 에 서버(axyl-docs)가 등록돼 있어, AI 도구(Claude Code / Codex)로 열고 Hive 콘솔 계정으로 1회 인증하면 모듈별 사용법·배포·트러블슈팅 문서를 조회할 수 있습니다. AI 에게 "Axyl TCB 로 ○○ 기능을 만들고 싶어"라고 말하면 start_tcb_workflow 도구가 전체 플레이북을 안내합니다.

## 빠른 시작

```bash
npm install
npm run build      # src/functions 의 핸들러를 dist 로 번들
```

> 예제(MySQL·Storage·Document DB)와 테스트까지 포함한 풀 구성이 필요하면
> `npm create @com2usplatform/hiveaxyl-tcbconnector-template` 실행 시 **테스트 포함(Y)** 을 선택해 다시 생성하세요.

## 구조

```
<project-name>/
├── src/functions/basic/index.ts   # 기본 AxylHandler (선택한 저장소 기준)
├── scripts/build.js · deploy.js
├── cloudbaserc.json               # TCB 배포 설정 + 환경변수 키
├── .env.example
├── .mcp.json                      # Axyl Docs MCP 서버 등록
└── AGENTS.md · CLAUDE.md · SECURITY.md
```

## 핸들러 작성

```ts
import { createAxylHandler, type AxylBaseHandler, type AxylHttpEvent } from '@com2usplatform/hiveaxyl-tcbconnector-middleware';
// 데이터 접근은 선택한 저장소 모듈을 import 해 사용:
//   MySQL       → import { pool, transaction } from '@com2usplatform/hiveaxyl-tcbconnector-middleware/db'
//   Document DB → import { collection } from '@com2usplatform/hiveaxyl-tcbconnector-middleware/docdb'

interface ResDto { ok: true }

const baseHandler: AxylBaseHandler<AxylHttpEvent, ResDto> = async (event, context) => {
    // context.playerId / context.aud.projectIndex 는 검증 완료된 신뢰값
    return { ok: true };
};

export const main = createAxylHandler(baseHandler);
```

새 함수는 `src/functions/<name>.ts` (또는 테마 디렉토리 하위)로 추가하고 `cloudbaserc.json` 에 등록하면 됩니다(`npm run build` 가 자동 인식). 빌드 산출물은 파일명 기준 `dist/<name>.js` 이므로, 함수 파일명은 테마가 달라도 전체에서 **유일**해야 합니다.

> 위 패턴은 일반 이벤트 함수용입니다. WebSocket Web Function 은 `createAxylHandler` 대신 `scf_bootstrap` 이 `0.0.0.0:9000` 서버를 시작하며 별도 빌드·배포합니다 (MCP 문서 `tcb-feature-websocket`).

## 모듈 가이드 (MCP 문서 id)

| 모듈 | 문서 id | 비고 |
| --- | --- | --- |
| MySQL | `tcb-feature-mysql` | MySQL 구성에는 `mysql2` 포함 — 바로 사용 가능. 콘솔 초기 설정은 `tcb-setup-mysql` |
| Cloud Storage | `tcb-feature-storage` | Document DB/Storage 구성에는 `@cloudbase/node-sdk` 포함(그 외 구성은 `npm i @cloudbase/node-sdk`) 후 `.../storage` 사용 |
| Document DB | `tcb-feature-docdb` | 위와 동일 — `.../docdb` 사용 |
| WebSocket | `tcb-feature-websocket` / `tcb-setup-websocket-deploy` | raw ws 기본 경로, 1회용 티켓, `--httpFn --ws` 별도 배포 |
| 배포·invoke | `tcb-setup-deploy-invoke` | CLI invoke 실패 시 SDK 우회 포함 |

> Storage/Document DB 예제는 `src/functions/storage/` · `src/functions/docdb/` 경로를 쓰므로, 최소 구성에 추가할 때는 해당 디렉토리를 새로 만들면 됩니다(`npm run build` 가 자동 인식).

> **Document DB / Storage** 를 쓰는 구성은 `@cloudbase/node-sdk` 의 알려진 전이 취약점 경고가 함께 들어옵니다 — 해당 건은 불가피하며 [SECURITY.md](./SECURITY.md) 에 설명돼 있습니다. 그 외 패키지의 audit 경고는 무시하지 말고 확인·업데이트하세요.

## 배포

TCB(CloudBase) CLI 설치·로그인 후 배포합니다. 배포 대상 환경은 `.env` 의 `TCB_ENV_ID` / `TCB_REGION` 으로 지정됩니다.

```bash
npm i -g @cloudbase/cli   # tcb 명령 설치
tcb login                 # 최초 1회 인증
cp .env.example .env       # DB/TCB 연결 정보 입력
npm run deploy:build       # 빌드 + 배포
```

> 위 명령은 일반 이벤트 함수용입니다. WebSocket 은 전용 배포 패키지를 만든 뒤 `tcb fn deploy <name> --httpFn --ws ...` 로 배포합니다 (MCP 문서 `tcb-setup-websocket-deploy`).
