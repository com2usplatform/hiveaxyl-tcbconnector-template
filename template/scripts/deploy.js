'use strict';

/**
 * TCB 배포 스크립트
 *
 * .env 파일에서 환경변수를 읽어 cloudbaserc.json 의 envVariables 에 임시 주입 후 배포합니다.
 * 배포 완료(또는 실패) 후 cloudbaserc.json 을 원본으로 복원합니다.
 *
 * 사용법:
 *   npm run deploy              → 전체 배포 (확인 프롬프트 있음)
 *   npm run deploy -- grantItem → 특정 함수만 배포
 */

const { readFileSync, writeFileSync, existsSync } = require('fs');
const { execSync } = require('child_process');
const readline = require('readline');

// ── .env 파싱 ──────────────────────────────────────────────────────────────

function parseEnv(content) {
    const result = {};
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx === -1) continue;
        const key = trimmed.slice(0, idx).trim();
        // 인라인 주석 제거: "값   # 설명" 형태가 값에 딸려 들어가면 envVariables 가 조용히
        // 깨진다. 값 안의 #(예: 비밀번호의 !@#)은 앞에 공백이 없으므로 보존된다.
        result[key] = trimmed
            .slice(idx + 1)
            .replace(/\s+#.*$/, '')
            .trim()
            .replace(/^["']|["']$/g, '');
    }
    return result;
}

// ── 검증 ───────────────────────────────────────────────────────────────────

if (!existsSync('.env')) {
    console.error('.env 파일이 없습니다. .env.example 을 복사해 값을 채우세요.');
    console.error('cp .env.example .env');
    process.exit(1);
}

// ── 주입 준비 ──────────────────────────────────────────────────────────────

const env      = parseEnv(readFileSync('.env', 'utf8'));
const original = readFileSync('cloudbaserc.json', 'utf8');
const rc       = JSON.parse(original);

// 배포 대상 환경(envId/region)도 DB 접속정보처럼 .env 에서 주입한다 —
// 템플릿 cloudbaserc.json 에 특정 환경을 하드코딩하지 않기 위함.
if (env.TCB_ENV_ID) rc.envId  = env.TCB_ENV_ID;
if (env.TCB_REGION) rc.region = env.TCB_REGION;
if (!rc.envId) {
    console.error('.env 에 TCB_ENV_ID 가 없습니다 (배포 대상 TCB 환경 ID — 콘솔 우측 상단 드롭다운).');
    process.exit(1);
}
if (!rc.region) {
    console.error('.env 에 TCB_REGION 이 없습니다 (예: ap-singapore). 미지정 시 다른 리전으로 배포될 수 있어 필수로 받습니다.');
    process.exit(1);
}

rc.functions = rc.functions.map((fn) => {
    if (!fn.envVariables) return fn;
    const injected = { ...fn.envVariables };
    for (const key of Object.keys(injected)) {
        if (env[key] !== undefined) injected[key] = env[key];
    }
    return { ...fn, envVariables: injected };
});

// WebSocket Web Function(protocolType=WS)은 이 일반 배포 경로에서 제외한다 —
// 산출물(./websocket/*)이 별도 빌드 대상(gitignore)이고 --httpFn --ws 플래그가 필요해서,
// tcb fn deploy --all 에 포함되면 신규 프로젝트의 첫 전체 배포가 실패한다. (→ MCP 문서 tcb-setup-websocket-deploy)
const wsFunctions = rc.functions.filter((fn) => fn.protocolType === 'WS');
rc.functions = rc.functions.filter((fn) => fn.protocolType !== 'WS');

// ── 배포 ───────────────────────────────────────────────────────────────────

const fnName = process.argv[2];

if (fnName && wsFunctions.some((fn) => fn.name === fnName)) {
    console.error(`'${fnName}' 은 WebSocket Web Function 이라 이 스크립트로 배포할 수 없습니다.`);
    console.error('전용 WS 배포 스크립트를 사용하세요 — 기본 데모: npm run deploy:websocket-demo (상세: MCP 문서 tcb-setup-websocket-deploy)');
    process.exit(1);
}
const cmd    = fnName
    ? `tcb fn deploy ${fnName} --force`
    : 'tcb fn deploy --all --force';

async function confirm(message) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(message, (answer) => {
            rl.close();
            resolve(answer.trim().toLowerCase());
        });
    });
}

async function run() {
    if (!fnName) {
        const list = rc.functions.map(f => `  - ${f.name}`).join('\n');
        console.log(`\n배포 대상 함수 (${rc.functions.length}개):\n${list}\n`);
        if (wsFunctions.length > 0) {
            const wsList = wsFunctions.map(f => f.name).join(', ');
            console.log(`※ WebSocket Web Function 은 전체 배포에서 제외됩니다: ${wsList}`);
            console.log('  → 전용 WS 배포 스크립트로 별도 배포하세요 (deploy:websocket-demo 등 — MCP 문서 tcb-setup-websocket-deploy 참고)\n');
        }
        const answer = await confirm('전체 배포를 진행하시겠습니까? (y/N) ');
        if (answer !== 'y') {
            console.log('배포가 취소되었습니다.');
            process.exit(0);
        }
    }

    console.log(`\n${cmd}\n`);
    // 배포 중 중단(Ctrl+C 등)돼도 .env 값이 주입된 cloudbaserc.json 이 남지 않게 복원을 보장한다
    const restoreRc = () => { try { writeFileSync('cloudbaserc.json', original); } catch { /* 복원 실패는 무시 */ } };
    process.on('SIGINT',  () => { restoreRc(); process.exit(130); });
    process.on('SIGTERM', () => { restoreRc(); process.exit(143); });
    process.on('exit', restoreRc);

    writeFileSync('cloudbaserc.json', JSON.stringify(rc, null, 2));

    try {
        execSync(cmd, { stdio: 'inherit' });
    } catch (err) {
        // 배포 실패 시 원인 파악을 돕는 안내. 가장 흔한 원인은 TCB 미인증인데,
        // `tcb login` 은 대화형이라 AI 에이전트가 대신 수행할 수 없다 → 사용자에게 넘겨야 한다.
        console.error('\n──────────────────────────────────────────────');
        console.error('❌ 배포에 실패했습니다. 아래를 확인하세요:');
        console.error('  1) `tcb login` 이 완료되어 있나요? (미인증이 가장 흔한 원인)');
        console.error('     └ tcb login 은 대화형이라 AI 에이전트가 대신 못 합니다 — 사용자가 직접 1회 실행하세요.');
        console.error('  2) `.env` 의 DB/TCB 연결 값이 채워져 있나요? (cp .env.example .env)');
        console.error('  3) `.env` 의 TCB_ENV_ID / TCB_REGION 이 배포 대상 환경과 일치하나요?');
        console.error('──────────────────────────────────────────────');
        process.exitCode = 1;
    } finally {
        writeFileSync('cloudbaserc.json', original);
        console.log('\ncloudbaserc.json 복원 완료');
    }
}

run();
