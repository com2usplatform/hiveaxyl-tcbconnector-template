# Changelog

## 2.0.0

최초 공개.

- `npm create @com2usplatform/hiveaxyl-tcbconnector-template` 로 Axyl TCB Cloud Function 프로젝트를 스캐폴딩합니다.
- 전체 구성(예제 함수·테스트·DB 셋업)과 최소 구성(--no-tests, MySQL/Document DB 선택)을 지원합니다.
- Axyl Docs MCP 연결용 `.mcp.json` 을 자동 생성합니다 (`--no-mcp` 로 생략 가능).
- TCB 환경 프리셋(`--env-id`, `--region`)으로 cloudbaserc·.env 를 스캐폴딩 시점에 채울 수 있습니다.
- 예제 코드 보안 강화: 셋업/시드 함수는 `ALLOW_SETUP_FUNCTIONS=true` 환경에서만 동작하고 요청 본문으로 시드 값을 받지 않습니다. Document DB 예제에 소유자(playerId·projectIndex) 검사를 넣고, wallets·idempotency_keys 스키마에 프로젝트 스코프를 추가했습니다. WebSocket 데모의 비정상 메시지 내성(null 등)을 보강하고 `ws` 를 8.21.0 으로 올렸습니다.
