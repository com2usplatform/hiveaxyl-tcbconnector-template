# 보안 메모 — 의존성 취약점

`npm install` 후 `npm audit` 에 `@cloudbase/node-sdk` 전이 의존 취약점 경고가 남을 수 있습니다. 이 문서는 그 출처와 대응 현황을 정리합니다.

> ⚠️ 이 문서는 **아래 표의 @cloudbase 전이 의존 항목에 한해서만** "제거 불가"를 설명합니다.
> 그 밖의 패키지(직접 의존 포함)에 대한 audit 경고는 무시하지 말고 버전을 올려 해결하세요.
> 직접 의존성(`ws` 등)은 취약 공지가 나오면 버전을 갱신해 대응합니다.

## 남은 취약점 (모두 `@cloudbase/node-sdk` 전이 의존)

| 패키지 | 심각도 | 경로 |
|---|---|---|
| `axios` (0.27.2) | high | @cloudbase/node-sdk → @cloudbase/database → axios |
| `lodash.set` (4.3.2) | high | @cloudbase/node-sdk → @cloudbase/database → lodash.set |
| `@cloudbase/database` | high | 위 두 패키지를 의존하므로 연쇄 표기 |
| `@cloudbase/node-sdk` | high | 위를 의존하므로 연쇄 표기 |

## 왜 제거되지 않나

- `@cloudbase/node-sdk` (Tencent 공식 SDK, **최신 3.18.1**)가 `axios@0.27.2` 와 `@cloudbase/database@1.4.3` 을 **정확 버전으로 고정**합니다. 상위 버전 SDK 도 동일하게 고정하고 있어 SDK 업그레이드로 해결되지 않습니다.
- `lodash.set` 은 **최신 배포가 4.3.2(= 취약 버전)이며 패치 릴리스가 존재하지 않습니다.** standalone 단일 함수 패키지라 대체 버전이 없어 `overrides` 로도 고칠 수 없습니다. → `@cloudbase/database`, `@cloudbase/node-sdk` 가 계속 high 로 표기되는 근본 원인.
- `axios` 는 패치 버전이 1.x 뿐인데, SDK 가 0.x API 에 맞춰 작성되어 `overrides` 로 1.x 를 강제하면 SDK 의 HTTP 동작이 깨질 위험이 있어 적용하지 않았습니다.

## 우리가 적용한 조치

- `form-data` — 패치 버전으로 정리 (`npm audit fix`)
- `esbuild` (devDependency) — 패치 버전(0.28.1)으로 상향
- `lodash.unset` — `overrides` 로 4.18.0 상향 (moderate 1건 제거)

> 남은 @cloudbase 전이 의존 경고는 위 사유로 템플릿 측에서 제거 불가.

## 실질 위험 평가

- `@cloudbase/node-sdk` 는 **고정된 TCB 내부 API 엔드포인트**로만 통신합니다. 사용자 입력 URL 로 요청하지 않으므로 axios 의 SSRF / NO_PROXY / 프록시 자격증명 유출류 CVE 의 실제 악용 경로는 제한적입니다.
- prototype pollution 계열(lodash.set, axios)은 공격자가 제어하는 키 경로가 SDK 내부 처리로 유입되어야 성립하며, 일반적인 사용 패턴에서 노출 가능성은 낮습니다.

## 추적

- `@cloudbase/node-sdk` 가 axios / lodash.set 의존을 패치 버전으로 갱신하면 재평가하여 본 메모를 갱신합니다.
- 운영 정책상 0 vulnerability 가 필수라면, 문서 DB/스토리지 접근을 SDK 대신 다른 경로(예: MongoDB 드라이버 직접 연결)로 대체하는 방안을 검토해야 합니다.
