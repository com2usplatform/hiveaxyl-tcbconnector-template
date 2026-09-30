#!/usr/bin/env node
'use strict';

const path = require('path');
const readline = require('readline');
const {
    validateProjectName,
    scaffold,
    installDependencies,
} = require('../lib/scaffold');

const args        = process.argv.slice(2);
const skipInstall = args.includes('--no-install');
const flagNoTests = args.includes('--no-tests');
const flagTests   = args.includes('--tests') || args.includes('--with-tests');
const projectName = args.find((a) => !a.startsWith('--'));

// 데이터 저장소 선택 플래그 (--db=mysql|docdb, 또는 --mysql / --docdb)
const dbArg   = (args.find((a) => a.startsWith('--db=')) || '').split('=')[1];
const flagDb  = args.includes('--mysql') ? 'mysql'
              : args.includes('--docdb') ? 'docdb'
              : args.includes('--both')  ? 'both'
              : (dbArg === 'mysql' || dbArg === 'docdb' || dbArg === 'both') ? dbArg
              : undefined;

// Axyl Docs MCP 등록 (--no-mcp 옵트아웃) — 엔드포인트는 항상 운영 (writeMcpJson 참고)
const flagNoMcp = args.includes('--no-mcp');

// TCB 환경 프리셋 (--env-id=xxx --region=ap-xxx) — 사전 조회(tcb env list)한 값을
// cloudbaserc/.env 에 스캐폴딩 시점에 주입해 "빈 rc → tcb CLI 불능" 문제를 차단한다
const PRESET_VALUE = /^[A-Za-z0-9._-]+$/;
const argValue = (name) => {
    const found = args.find((a) => a.startsWith(`--${name}=`));
    return found ? found.slice(name.length + 3) : undefined;
};
const flagEnvId  = argValue('env-id');
const flagRegion = argValue('region');
for (const [flag, value] of [['--env-id', flagEnvId], ['--region', flagRegion]]) {
    if (value !== undefined && !PRESET_VALUE.test(value)) {
        console.error(`오류: ${flag} 값이 올바르지 않습니다 — 영문/숫자/._- 만 사용 가능합니다.`);
        process.exit(1);
    }
}

// stdin·stdout 중 하나라도 TTY 면 대화형으로 본다 (Windows 등 stdin.isTTY=undefined 대비)
const interactive = Boolean(process.stdin.isTTY || process.stdout.isTTY);

function ask(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        let settled = false;
        const finish = (v) => { if (!settled) { settled = true; rl.close(); resolve(v); } };
        rl.question(question, finish);
        rl.on('close', () => finish(''));
    });
}

const validationError = validateProjectName(projectName);
if (validationError) {
    console.error(validationError);
    process.exit(1);
}

// 비-TTY 가드 — AI 에이전트·CI 가 주 사용자라 비대화형이 기본 경로다.
// 프롬프트 기본값으로 조용히 진행하면 의도와 다른 구성이 생기므로,
// 필요한 답이 플래그로 오지 않으면 안내 후 중단한다 (플래그가 완비되면 무질의 진행).
if (!interactive) {
    const missing = [];
    if (!flagTests && !flagNoTests) missing.push('--tests | --no-tests   (예제·테스트 포함 여부)');
    if (flagNoTests && !flagDb)     missing.push('--db=mysql|docdb|both  (최소 구성의 데이터 저장소)');
    if (missing.length > 0) {
        console.error('비대화형 실행에는 아래 플래그가 필요합니다 (프롬프트 기본값으로 임의 진행하지 않습니다):');
        for (const m of missing) console.error(`  ${m}`);
        console.error('선택 플래그: --env-id=<id> --region=<region> --no-mcp --no-install');
        console.error('예: npm create @com2usplatform/hiveaxyl-tcbconnector-template my-game -- --tests --env-id=my-env --region=ap-singapore');
        process.exit(1);
    }
}

const targetDir   = path.resolve(process.cwd(), projectName);
const templateDir = path.resolve(__dirname, '../template');

/**
 * 테스트 파일(예제·테스트·DB 셋업) 포함 여부 결정.
 * - --tests / --no-tests 플래그가 있으면 그대로 사용
 * - 대화형이면 질의 (기본 Y)
 * - 비대화형(CI 등)이면 기본 포함(true)
 *
 * 대화형 판정은 stdin·stdout 중 하나라도 TTY 면 대화형으로 본다.
 * Windows(특히 npm create 가 cmd 셰임을 거치거나 Git Bash 등)에서는
 * process.stdin.isTTY 가 undefined 로 나오는 경우가 많아, stdin 만 보면
 * 사용자가 터미널에 있는데도 질의를 건너뛰는 문제가 있다.
 */
async function resolveIncludeTests() {
    if (flagNoTests) return false;
    if (flagTests) return true;
    if (!interactive) return true;

    const answer = await ask('  테스트 파일(예제·테스트·DB 셋업)을 포함하시겠습니까? (Y/n) ');
    const a = String(answer).trim().toLowerCase();
    return !(a === 'n' || a === 'no');
}

/**
 * TCB 환경 프리셋(envId/region) 결정.
 * - --env-id / --region 플래그가 있으면 그대로 (형식은 위에서 이미 검증)
 * - 대화형이면 질의 — 모르면 Enter 로 건너뜀 (형식 오류도 안내 후 건너뜀)
 * - 비대화형이면 미지정 (기존 동작 유지)
 *
 * 값이 있으면 cloudbaserc/.env 에 사전 주입되어, envId 가 빈 cloudbaserc 때문에
 * 프로젝트 안에서 tcb CLI(login 포함)가 막히는 문제를 피할 수 있다.
 */
async function resolveEnvPreset() {
    let envId  = flagEnvId;
    let region = flagRegion;

    const askPreset = async (question, flag) => {
        const answer = String(await ask(question)).trim();
        if (!answer) return undefined;
        if (!PRESET_VALUE.test(answer)) {
            console.log(`  ⚠️  ${flag} 형식이 올바르지 않아 건너뜁니다 (영문/숫자/._- 만 가능) — 생성 후 .env 에서 채우세요.`);
            return undefined;
        }
        return answer;
    };

    if (interactive) {
        if (envId === undefined) {
            envId = await askPreset(
                '  TCB 환경 ID를 아시나요? (tcb env list 로 조회 가능, 모르면 Enter) ', '--env-id');
        }
        if (region === undefined) {
            region = await askPreset(
                '  환경 리전을 아시나요? (예: ap-singapore, 모르면 Enter) ', '--region');
        }
    }
    return { envId, region };
}

/**
 * 최소(N) 구성에서 사용할 데이터 저장소 결정.
 * - --db / --mysql / --docdb 플래그가 있으면 그대로
 * - 대화형이면 질의 (기본 MySQL)
 * - 비대화형이면 기본 mysql (기존 동작 유지)
 */
async function resolveDb() {
    if (flagDb) return flagDb;
    if (!interactive) return 'mysql';

    const answer = await ask('  데이터 저장소를 선택하세요  1) MySQL   2) Document DB   3) 둘 다  (기본: 1) ');
    const a = String(answer).trim();
    return a === '2' ? 'docdb' : a === '3' ? 'both' : 'mysql';
}

(async () => {
    const includeTests = await resolveIncludeTests();
    // 데이터 저장소 선택은 최소(N) 구성에서만 의미가 있다 (Y 는 전체 예제 포함)
    const db = includeTests ? undefined : await resolveDb();
    const { envId, region } = await resolveEnvPreset();

    console.log(`\n  creating ${projectName}...\n`);

    try {
        scaffold(projectName, targetDir, templateDir, {
            includeTests, db, envId, region,
            mcp: !flagNoMcp,
        });
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }

    const dbLabel = db === 'docdb' ? 'Document DB' : db === 'both' ? 'MySQL + Document DB' : 'MySQL';
    const variantLabel = includeTests ? '예제·테스트 포함' : `최소 구성 · ${dbLabel}`;
    console.log(`  ✅ ${projectName} 생성 완료 (${variantLabel})\n`);

    let installed = false;
    if (!skipInstall) {
        console.log('  의존성 설치 중 (npm install)...\n');
        installed = installDependencies(targetDir);
        if (!installed) {
            console.log('\n  ⚠️  자동 설치에 실패했습니다. 생성된 디렉토리에서 직접 npm install 을 실행하세요.\n');
        }
    }

    console.log('  다음 단계:\n');
    console.log(`    cd ${projectName}`);
    if (!installed) {
        console.log('    npm install');
    }
    if (includeTests) {
        console.log('    npm test                   # DB 설정 없이 바로 실행됩니다');
    }
    console.log('');
    console.log('  실제 TCB 배포 시 (MySQL/Storage/DocDB 연결 필요):');
    if (envId || region) {
        console.log('    .env 가 생성되었습니다 — TCB_ENV_ID/TCB_REGION/DB_NAME 은 채워져 있고,');
        console.log('    나머지 연결 정보(DB_HOST 등)만 채우면 됩니다 — README 참고');
    } else {
        console.log('    cp .env.example .env        # 연결 정보 입력 — README 참고');
    }
    console.log('    npm run deploy:build');
    console.log('');
    if (!flagNoMcp) {
        console.log('  상세 가이드는 Axyl Docs MCP 로 조회합니다 (.mcp.json 등록됨):');
        console.log('    AI 도구(Claude Code/Codex)로 프로젝트를 열고 axyl-docs 서버를 Hive 콘솔 계정으로 1회 인증하세요.');
        console.log('');
    }
    // 최소 구성은 @cloudbase/node-sdk 를 포함하지 않아 audit 가 깨끗하므로 안내 불필요
    if (includeTests) {
        console.log('  ※ npm audit 의 @cloudbase SDK 전이 취약점 경고는 SECURITY.md 에 설명돼 있습니다.');
        console.log('     그 외 패키지의 경고는 확인·업데이트하세요 — `npm audit fix --force` 는 금지(의존성 파손 위험).');
        console.log('');
    }
})();
