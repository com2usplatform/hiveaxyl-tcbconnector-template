'use strict';

/**
 * [개발/테스트 전용] CloudBase SDK 기반 함수 invoke 헬퍼
 *
 * 일부 환경/CLI 버전에서 `tcb fn invoke` 가 "ClientContext parameter error" 를
 * 던집니다 — 함수·배포 문제가 아니라 CLI 호출 경로 문제입니다. 이때는 이 스크립트로
 * CloudBase Node SDK `app.callFunction({ name, data })` 를 직접 호출하세요.
 *
 * 사용법:
 *   node scripts/invoke.js <functionName> '<params-json>'
 *   node scripts/invoke.js <functionName> @params.json      # 파일에서 읽기 (Windows 따옴표 이슈 우회)
 *
 * 인증 — tcb login 자격증명 재사용:
 *   ~/.config/.cloudbase/auth.json 의 credential.tmpSecretId / tmpSecretKey / tmpToken 을 읽어
 *   SDK 초기화의 secretId / secretKey / sessionToken 으로 넣습니다.
 *   ⚠️ 핵심: tmpToken 은 `token` 이 아니라 `sessionToken` 필드에 넣어야 합니다.
 *   임시 자격증명이라 만료되면 인증 오류가 나며, `tcb login` 을 다시 실행하면 갱신됩니다.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

function fail(msg) {
    console.error(`오류: ${msg}`);
    process.exit(1);
}

// ── 인자 파싱 ────────────────────────────────────────────────────────────────
const [, , fnName, rawParams] = process.argv;
if (!fnName) {
    fail('사용법: node scripts/invoke.js <functionName> \'<params-json>\' (또는 @file.json)');
}

let data = {};
if (rawParams) {
    // @file 형식이면 파일에서 읽는다 — Windows 셸의 JSON 따옴표 이스케이프 지옥 우회용
    const jsonText = rawParams.startsWith('@')
        ? fs.readFileSync(rawParams.slice(1), 'utf8')
        : rawParams;
    try {
        data = JSON.parse(jsonText);
    } catch {
        fail(`params 가 유효한 JSON 이 아닙니다: ${jsonText.slice(0, 120)}`);
    }
}

// ── envId/region — 배포와 동일하게 .env 를 소스로 사용 (cloudbaserc 는 fallback) ──
function parseEnv(content) {
    const result = {};
    for (const line of content.split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const i = t.indexOf('=');
        if (i === -1) continue;
        result[t.slice(0, i).trim()] = t.slice(i + 1).replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '');
    }
    return result;
}
const envPath = path.resolve(__dirname, '..', '.env');
const dotEnv  = fs.existsSync(envPath) ? parseEnv(fs.readFileSync(envPath, 'utf8')) : {};
const rcPath  = path.resolve(__dirname, '..', 'cloudbaserc.json');
const rc      = fs.existsSync(rcPath) ? JSON.parse(fs.readFileSync(rcPath, 'utf8')) : {};
const envId   = dotEnv.TCB_ENV_ID || rc.envId;
if (!envId) fail('.env 에 TCB_ENV_ID 가 없습니다 (호출 대상 TCB 환경 ID). cp .env.example .env 후 값을 채우세요.');
// ⚠️ region 을 넘기지 않으면 SDK 기본값(ap-shanghai)으로 붙어서, 다른 리전 환경은
// "Environment create in <region> cannot access in ap-shanghai" 로 거절됩니다 (실측).
const region = dotEnv.TCB_REGION || rc.region;

// ── 인증 — tcb login 이 저장한 임시 자격증명 재사용 ─────────────────────────
const authPath = path.join(os.homedir(), '.config', '.cloudbase', 'auth.json');
if (!fs.existsSync(authPath)) {
    fail(`CLI 인증 정보가 없습니다 (${authPath}). 먼저 'tcb login' 을 실행하세요.`);
}
const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
const cred = auth.credential ?? auth;
const { tmpSecretId, tmpSecretKey, tmpToken } = cred;
if (!tmpSecretId || !tmpSecretKey || !tmpToken) {
    fail('auth.json 에 tmpSecretId/tmpSecretKey/tmpToken 이 없습니다. tcb login 을 다시 실행하세요.');
}

// ── SDK 호출 ─────────────────────────────────────────────────────────────────
let cloudbase;
try {
    cloudbase = require('@cloudbase/node-sdk');
} catch {
    fail('@cloudbase/node-sdk 가 설치돼 있지 않습니다. `npm i @cloudbase/node-sdk` 후 다시 실행하세요.');
}

const app = cloudbase.init({
    env: envId,
    ...(region ? { region } : {}), // cloudbaserc.json 의 region (미지정 시 SDK 기본 ap-shanghai)
    secretId: tmpSecretId,
    secretKey: tmpSecretKey,
    sessionToken: tmpToken, // ⚠️ token 이 아니라 sessionToken
});

app.callFunction({ name: fnName, data })
    .then((res) => {
        // res.result 는 함수의 반환값(객체) — 표준 응답 { success, code, ... } 그대로 출력
        const result = typeof res.result === 'string' ? JSON.parse(res.result) : res.result;
        console.log(JSON.stringify(result, null, 2));
        if (result && result.success === false) process.exitCode = 2;
    })
    .catch((err) => {
        // 자격증명 만료가 흔한 원인 — 재로그인 안내를 함께 출력
        console.error('callFunction 실패:', err.message ?? err);
        console.error('(인증 오류라면 임시 자격증명 만료일 수 있습니다 — tcb login 재실행)');
        process.exit(1);
    });
