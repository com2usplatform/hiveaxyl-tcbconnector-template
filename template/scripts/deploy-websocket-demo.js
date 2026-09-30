'use strict';

/**
 * 일반 WebSocket 데모를 TCB HTTP+WebSocket 함수로 배포한다.
 * 일반 이벤트 함수 배포(scripts/deploy.js)와 분리해 WS 플래그(--httpFn --ws)가
 * 재배포 때 빠지지 않게 한다. (→ MCP 문서 tcb-setup-websocket-deploy '배포와 Function URL')
 */
const { execFileSync } = require('child_process');
const { existsSync, readFileSync, writeFileSync } = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
const configPath = path.join(root, 'cloudbaserc.json');
const functionName = 'websocketDemoGateway';

function parseEnv(content) {
    const values = {};
    const counts = new Map();
    for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const index = trimmed.indexOf('=');
        if (index < 0) continue;
        const key = trimmed.slice(0, index).trim();
        values[key] = trimmed.slice(index + 1).replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '');
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return {
        values,
        duplicates: [...counts].filter(([, count]) => count > 1).map(([key]) => key),
    };
}

if (!existsSync(envPath)) throw new Error(`${envPath} 파일이 없습니다.`);
const { values: env, duplicates } = parseEnv(readFileSync(envPath, 'utf8'));
const requiredKeys = ['TCB_ENV_ID', 'TCB_REGION', 'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missingKeys = requiredKeys.filter((key) => !env[key] || /^your-/.test(env[key]));
console.log(JSON.stringify({
    envPath,
    tcbEnvIdSet: Boolean(env.TCB_ENV_ID),
    tcbRegion: env.TCB_REGION || null,
    duplicateKeys: duplicates,
    dbKeysConfigured: !requiredKeys.slice(2).some((key) => missingKeys.includes(key)),
    functionName,
}, null, 2));
if (duplicates.length > 0 || missingKeys.length > 0) {
    throw new Error(`배포 사전 점검 실패: ${[...duplicates, ...missingKeys].join(', ')}`);
}

const original = readFileSync(configPath, 'utf8');
const config = JSON.parse(original);
const target = config.functions.find((fn) => fn.name === functionName);
if (!target) throw new Error(`${functionName} 설정이 없습니다.`);
config.envId = env.TCB_ENV_ID;
config.region = env.TCB_REGION;
for (const key of Object.keys(target.envVariables ?? {})) {
    if (env[key] !== undefined) target.envVariables[key] = env[key];
}

execFileSync(process.execPath, [path.join(root, 'scripts', 'build-websocket-demo.js')], {
    cwd: root,
    stdio: 'inherit',
});

function deployWithCli() {
    const args = [
        'fn', 'deploy', functionName, '--httpFn', '--ws',
        '--path', '/websocket-demo', '--force', '--yes',
    ];
    if (process.platform === 'win32') {
        execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `tcb.cmd ${args.join(' ')}`], {
            cwd: root,
            stdio: 'inherit',
        });
        return;
    }
    execFileSync('tcb', args, { cwd: root, stdio: 'inherit' });
}

writeFileSync(configPath, JSON.stringify(config, null, 2));
try {
    deployWithCli();
} finally {
    // 비밀번호가 주입된 배포 중 설정은 성공·실패와 무관하게 저장소에 남기지 않는다.
    writeFileSync(configPath, original);
}

/**
 * WSS Function URL 을 보장하고 조회한다 (실측 확정 사실):
 *   - CLI 가 배포 성공 시 찍어주는 HTTP 액세스 링크(app/service.tcloudbase.com)는
 *     이벤트 함수 전용이라 WS 함수에는 FUNCTIONS_PARAM_INVALID 400 을 반환한다.
 *   - WS 접속은 함수별 전용 Function URL(HTTP 트리거의 NetConfig.WssExtranetUrl)로만 가능하다.
 */
async function ensureFunctionUrl() {
    let CloudBase;
    try {
        CloudBase = require('@cloudbase/manager-node');
    } catch {
        console.log('※ Function URL 자동 조회에는 @cloudbase/manager-node 가 필요합니다: npm i -D @cloudbase/manager-node');
        console.log('  (또는 SCF 콘솔 → 함수 상세 → 함수 URL 에서 활성화 후 wss 주소 확인)');
        return undefined;
    }
    const os = require('os');
    // tcb login 자격증명 재사용 — 만료 시 아무 tcb 명령(tcb env list)이면 자동 갱신된다
    const auth = JSON.parse(readFileSync(path.join(os.homedir(), '.config', '.cloudbase', 'auth.json'), 'utf8'));
    const credential = auth.credential ?? auth;
    const app = CloudBase.init({
        envId: env.TCB_ENV_ID,
        region: env.TCB_REGION,
        secretId: credential.tmpSecretId,
        secretKey: credential.tmpSecretKey,
        token: credential.tmpToken,
    });
    const findUrl = (detail) => {
        for (const trigger of detail.Triggers ?? []) {
            if (trigger.Type !== 'http') continue;
            try {
                const description = JSON.parse(trigger.TriggerDesc);
                if (description.NetConfig?.WssExtranetUrl) return description.NetConfig.WssExtranetUrl;
            } catch { /* 다른 형식의 http 트리거는 무시 */ }
        }
        return undefined;
    };
    let detail = await app.functions.getFunctionDetail(functionName);
    if (!findUrl(detail)) {
        await app.functions.scfService.request('CreateTrigger', {
            Namespace: env.TCB_ENV_ID,
            FunctionName: functionName,
            TriggerName: `${functionName}-url`,
            Type: 'http',
            Enable: 'OPEN',
            TriggerDesc: JSON.stringify({ AuthType: 'NONE', NetConfig: { EnableIntranet: false, EnableExtranet: true } }),
        });
    }
    for (let attempt = 0; attempt < 20; attempt += 1) {
        detail = await app.functions.getFunctionDetail(functionName);
        const url = findUrl(detail);
        if (url) return url;
        await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    return undefined;
}

ensureFunctionUrl().then((websocketUrl) => {
    console.log(JSON.stringify({
        deployed: true,
        functionName,
        websocketUrl: websocketUrl ?? '(조회 실패 — SCF 콘솔 함수 상세에서 확인)',
        note: '접속·인증 실패는 클라이언트에 401 이 아니라 HTTP 500(bad handshake)으로 보입니다. MCP 문서 tcb-setup-websocket-deploy 의 연결 테스트 절차를 따르세요.',
    }, null, 2));
}).catch((error) => {
    console.log('Function URL 조회 실패:', error.message ?? error);
});
