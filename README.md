# @com2usplatform/create-hiveaxyl-tcbconnector-template

> **Com2uS Platform Official** · Canonical: <https://github.com/com2usplatform/hiveaxyl-tcbconnector-template>
> Product: `hiveaxyl` · Domain: `tcbconnector` · Version: 2.0.0 · Lifecycle: preparing
> 관련 저장소: [hiveaxyl-tcbconnector-middleware](https://github.com/com2usplatform/hiveaxyl-tcbconnector-middleware)

`npm create @com2usplatform/hiveaxyl-tcbconnector-template` 명령으로 Axyl TCB Cloud Function 프로젝트를 스캐폴딩하는 CLI 패키지입니다.

## 사용법

```bash
npm create @com2usplatform/hiveaxyl-tcbconnector-template <project-name>
```

> 공개 npm 패키지이므로 별도 레지스트리 설정이나 인증이 필요 없습니다.

실행하면 **테스트 파일 포함 여부**를 묻습니다.

```
테스트 파일(예제·테스트·DB 셋업)을 포함하시겠습니까? (Y/n)
```

| 선택 | 생성 내용 |
|---|---|
| **Y** (기본) | 테마별 예제 함수(MySQL·Document DB·Storage·WebSocket 데모) + 테스트 + DB 셋업 함수(createTables/createCollections) 포함 |
| **N** | `basic/index.ts` 기본 핸들러 + 미들웨어 패키지만의 최소 구성. 이때 데이터 저장소(MySQL/Document DB)를 추가로 선택합니다 |

상세 가이드 문서는 로컬 파일 대신 **Axyl Docs MCP** 로 제공됩니다 — 스캐폴딩이 `.mcp.json` 을
자동 생성하므로, MCP 를 지원하는 AI 도구로 프로젝트를 열면 모듈 가이드·배포 절차·워크플로 문서를
바로 조회할 수 있습니다 (원치 않으면 `--no-mcp`). MCP 문서 조회에는 **Hive 콘솔 계정 인증**이
필요합니다 — 계정이 없다면 아래 지원 채널로 문의하세요.

스캐폴딩 후 의존성(`npm install`)은 **자동 설치**됩니다.

```
cd <project-name>
cp .env.example .env   # DB 연결 정보 입력
npm test               # (테스트 포함 시)
```

비대화형(CI) 또는 명시 지정용 플래그:

```bash
npm create @com2usplatform/hiveaxyl-tcbconnector-template <project-name> -- --tests            # 테스트 포함 강제
npm create @com2usplatform/hiveaxyl-tcbconnector-template <project-name> -- --no-tests --db=mysql   # 최소 구성 (db: mysql|docdb|both)
npm create @com2usplatform/hiveaxyl-tcbconnector-template <project-name> -- --no-install       # 자동 설치 생략
npm create @com2usplatform/hiveaxyl-tcbconnector-template <project-name> -- --no-mcp           # .mcp.json 생성 생략
```

> 비대화형 환경에서는 `--tests` 또는 `--no-tests` 를 명시해야 하며(`--no-tests` 는 `--db` 필수), 미지정 시 안내 후 종료합니다.

### TCB 환경 프리셋 (--env-id / --region)

환경 ID·리전을 미리 알고 있으면(`tcb env list` 로 조회 — **cloudbaserc 가 없는 디렉토리**에서 실행)
스캐폴딩 시점에 주입할 수 있습니다. 대화형 실행 시 인자가 없으면 질문으로도 받습니다
(모르면 Enter 로 건너뜀 — 기존 동작과 동일):

```bash
npm create @com2usplatform/hiveaxyl-tcbconnector-template <project-name> -- --env-id=<envId> --region=<region>
```

- `cloudbaserc.json` 의 envId/region 이 채워집니다 — **envId 가 빈 rc 가 있는 프로젝트 안에서는
  `tcb login` 을 포함한 tcb CLI 가 동작하지 않으므로**, 프리셋 사용을 권장합니다
- `.env` 가 자동 생성됩니다 — `TCB_ENV_ID`/`TCB_REGION` 과 `DB_NAME`(규약: DB 이름 = 환경 ID)은
  채워지고, 나머지 연결 정보(DB 호스트/계정 등)만 채우면 됩니다
- AI 에이전트 워크플로우: 에이전트가 `tcb env list` 로 값을 조회해 이 플래그로 전달하면
  `.env` 셋업 질의가 "나머지 연결 정보"로 압축됩니다

---

## 생성되는 프로젝트에 대한 안내

스캐폴딩된 프로젝트의 사용법은 생성된 디렉토리 안의 `README.md` 와 `AGENTS.md` 를 참고하세요.

실시간/멀티플레이 기능은 동봉된 raw `ws` WebSocket 데모(`src/realtime/websocket-demo`)와
MCP 문서 `tcb-feature-websocket` / `tcb-setup-websocket-deploy` 를 기준으로 구현합니다.
일반 Axyl 이벤트 함수와 WebSocket Web Function 은 진입점·인증·배포·테스트 경로가 다릅니다.

## 문의와 기여 (Support)

이 저장소의 **GitHub Issues 는 사용하지 않으며**, GitHub 은 공식 고객 지원 채널이 아닙니다. 아래 채널을 이용해 주세요.

| 용도 | 채널 |
|---|---|
| 제품 정보 | <https://hiveplatform.ai/hiveaxyl> |
| 개발자 문서 | <https://developers.hiveplatform.ai/axyl/ko/> |
| 사용 문의·버그 제보·기능 요청 | <cs-platform@com2us.com> |

- **외부 Pull Request 는 검토·병합하지 않습니다** — [CONTRIBUTING.md](CONTRIBUTING.md) 참고.
- 보안 취약점은 [SECURITY.md](SECURITY.md) 의 비공개 채널로만 신고해 주세요.
