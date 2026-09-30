'use strict';

const fs            = require('fs');
const path          = require('path');
const { execSync }  = require('child_process');

/**
 * 프로젝트 이름 유효성 검사
 *
 * @param {string | undefined} name
 * @returns {string | null}  에러 메시지 (유효하면 null)
 */
function validateProjectName(name) {
    if (!name) {
        return '오류: 프로젝트 이름을 입력해주세요.\n사용법: npm create @com2usplatform/hiveaxyl-tcbconnector-template <project-name>';
    }
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) {
        return '오류: 프로젝트 이름은 소문자, 숫자, -, _, . 만 사용 가능합니다.';
    }
    return null;
}

// README.minimal.md / AGENTS.minimal.md 는 최소(N) 구성 전용 소스, .minimal/ 는 DB 변형
// 핸들러 소스 — 생성 프로젝트에 그대로 복사하지 않고 scaffold() 가 최소 모드일 때만 사용한다.
const COPY_EXCLUDE = new Set([
    'node_modules', 'dist', 'websocket', '.git', '.npmignore',
    'README.minimal.md', 'AGENTS.minimal.md', '.minimal',
    // 로컬 개발용 크리덴셜 — npm tarball 은 package.json files 목록이 막지만,
    // 로컬 템플릿 디렉토리로 scaffold 할 때도 새 프로젝트에 복사되면 안 된다
    '.env', '.npmrc',
]);

// 최소(N) 구성에서 선택한 데이터 저장소(db)에 맞춘 .env.example 내용
const ENV_EXAMPLE = {
    mysql:
`# 이 파일을 복사해 .env 를 만들고 실제 값을 채우세요.
# cp .env.example .env
# (주석은 값과 같은 줄에 쓰지 마세요 — 배포 스크립트가 값만 읽습니다)

# 배포/호출 대상 TCB 환경 (필수) — 환경 ID 는 콘솔 우측 상단 드롭다운
TCB_ENV_ID=your-env-id
# 환경 리전 (예: ap-singapore) — 미지정 시 기본 리전(ap-shanghai)으로 붙어 거절됩니다
TCB_REGION=your-region

# MySQL 연결 정보
DB_HOST=your-host
DB_PORT=your-port
DB_USER=your-user
DB_PASSWORD=your-password
DB_NAME=your-database
`,
    docdb:
`# 이 파일을 복사해 .env 를 만들고 실제 값을 채우세요.
# cp .env.example .env
# (주석은 값과 같은 줄에 쓰지 마세요 — 배포 스크립트가 값만 읽습니다)

# 배포/호출 대상 TCB 환경 (필수) — 환경 ID 는 콘솔 우측 상단 드롭다운
TCB_ENV_ID=your-env-id
# 환경 리전 (예: ap-singapore) — 미지정 시 기본 리전(ap-shanghai)으로 붙어 거절됩니다
TCB_REGION=your-region

# Document DB (MongoDB판) — 콘솔 문서형 DB 상단 드롭다운 값
# 인스턴스 이름 (예: axyl_tcb_mongo)
TCB_DOCDB_INSTANCE=your-instance
# 데이터베이스 이름 (예: axyl)
TCB_DOCDB_DATABASE=your-database
`,
    both:
`# 이 파일을 복사해 .env 를 만들고 실제 값을 채우세요.
# cp .env.example .env
# (주석은 값과 같은 줄에 쓰지 마세요 — 배포 스크립트가 값만 읽습니다)

# 배포/호출 대상 TCB 환경 (필수) — 환경 ID 는 콘솔 우측 상단 드롭다운
TCB_ENV_ID=your-env-id
# 환경 리전 (예: ap-singapore) — 미지정 시 기본 리전(ap-shanghai)으로 붙어 거절됩니다
TCB_REGION=your-region

# MySQL 연결 정보
DB_HOST=your-host
DB_PORT=your-port
DB_USER=your-user
DB_PASSWORD=your-password
DB_NAME=your-database

# Document DB (MongoDB판) — 콘솔 문서형 DB 상단 드롭다운 값
# 인스턴스 이름 (예: axyl_tcb_mongo)
TCB_DOCDB_INSTANCE=your-instance
# 데이터베이스 이름 (예: axyl)
TCB_DOCDB_DATABASE=your-database
`,
};

// CLAUDE.md / AGENTS.md / README.md 에 주입할 '데이터 저장소' 선언 (AI 의 1순위 판단 신호)

// 파일 저장 방식은 스키마·함수 구성이 갈리고 나중에 바꾸면 마이그레이션 비용이 크므로,
// AI 가 임의로 정하지 않고 구현 전에 사용자에게 묻도록 모든 선언 변형에 공통으로 주입한다.
const FILE_URL_RULE =
`
⚠️ 요구사항에 **파일(이미지·문서 등) URL** 이 등장하면 저장 방식이 갈립니다 — ① 외부/CDN URL 문자열만 저장 vs ② Cloud Storage 업로드(파일 본체 보관 + 메타데이터 테이블 + 업로드/확정 함수). 스키마와 함수 구성이 달라지고 나중에 바꾸면 마이그레이션 비용이 크므로, **임의로 정하지 말고 구현 전에 사용자에게 어느 쪽인지 질의하세요.** ②를 선택하면 Storage 규약(메타데이터 테이블, 직접 업로드 흐름, 경로 소유권 스코프 — MCP 문서 tcb-feature-storage)을 따릅니다.
`;

const DB_DECL = {
    mysql:
`## 데이터 저장소
이 프로젝트는 **MySQL** (\`@com2usplatform/hiveaxyl-tcbconnector-middleware/db\`)을 사용합니다. 새 함수도 \`/db\` 로 작성하세요.
\`/docdb\`(Document DB)·\`/storage\` 는 이 프로젝트에서 쓰지 않습니다. 나중에 추가하려면 아래 '다른 데이터 저장소 추가하기' 절차를 따르고 **이 선언을 갱신**하세요.
` + FILE_URL_RULE,
    docdb:
`## 데이터 저장소
이 프로젝트는 **Document DB** (\`@com2usplatform/hiveaxyl-tcbconnector-middleware/docdb\`)를 사용합니다. 새 함수도 \`/docdb\` 로 작성하세요.
\`/db\`(MySQL)·\`/storage\` 는 이 프로젝트에서 쓰지 않습니다. 나중에 추가하려면 아래 '다른 데이터 저장소 추가하기' 절차를 따르고 **이 선언을 갱신**하세요.
` + FILE_URL_RULE,
    both:
`## 데이터 저장소
이 프로젝트는 **MySQL** (\`@com2usplatform/hiveaxyl-tcbconnector-middleware/db\`)과 **Document DB** (\`@com2usplatform/hiveaxyl-tcbconnector-middleware/docdb\`)를 **둘 다** 사용합니다.
함수 성격에 맞는 모듈을 import 하세요 — 정합성·트랜잭션이 중요하면 MySQL, 스키마가 유연하면 Document DB. (MCP 문서 tcb-feature-mysql / tcb-feature-docdb 참고)
` + FILE_URL_RULE,
};

/**
 * AI 에이전트용 프로젝트 가이드에 선택한 데이터 저장소 선언을 주입한다.
 * Claude/Codex 가 같은 1순위 신호를 보도록 CLAUDE.md 와 AGENTS.md 에 동일하게 적용한다.
 *
 * @param {string} filePath
 * @param {string} declaration
 */
function injectDbDeclaration(filePath, declaration) {
    if (!fs.existsSync(filePath)) return;

    let content = fs.readFileSync(filePath, 'utf8');
    const anchor = '함수를 만들거나 수정할 때 아래 규약을 따르세요.';
    content = content.includes(anchor)
        ? content.replace(anchor, anchor + '\n\n' + declaration)
        : declaration + '\n' + content;
    fs.writeFileSync(filePath, content);
}

/**
 * 디렉토리를 재귀적으로 복사한다.
 * node_modules, dist, .git 은 제외한다.
 *
 * @param {string} src
 * @param {string} dest
 */
function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (COPY_EXCLUDE.has(entry.name)) continue;
        const srcPath  = path.join(src,  entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

/**
 * 테스트 미포함(N) 스캐폴드 정리.
 *
 * 예제 함수·테스트·DB 셋업 함수·테스트 인프라를 제거하고,
 * 기본 핸들러(basic/index.ts) 중심의 최소 구성으로 cloudbaserc/package 를 맞춘다.
 *
 * @param {string} targetDir  절대 경로
 */
function pruneTestArtifacts(targetDir) {
    const rm = (...p) => fs.rmSync(path.join(targetDir, ...p), { recursive: true, force: true });

    // 테스트 / 테스트 인프라 (호출 가이드는 MCP 문서 tcb-setup-deploy-invoke 로 이관돼 로컬 MD 가 없다)
    rm('test');
    rm('vitest.config.ts');

    // 예제·셋업 함수 (기본 핸들러 basic/index.ts 만 유지)
    rm('src', 'functions', 'basic', 'echo.ts');
    rm('src', 'functions', 'basic', 'validationError.ts');
    rm('src', 'functions', 'mysql');
    rm('src', 'functions', 'storage');
    rm('src', 'functions', 'docdb');
    rm('src', 'functions', 'realtime');
    rm('src', 'realtime');
    rm('src', 'functions', 'setup');   // 예제 테이블 생성 함수 (createTables)
    rm('src', 'db');                    // 예제 DDL 단일 소스 (schema.ts)
    rm('scripts', 'build-websocket-demo.js');
    rm('scripts', 'deploy-websocket-demo.js');

    // cloudbaserc.json — 기본 함수(index.main)만 유지
    const rcPath = path.join(targetDir, 'cloudbaserc.json');
    if (fs.existsSync(rcPath)) {
        const rc = JSON.parse(fs.readFileSync(rcPath, 'utf8'));
        // HTTP Web Function도 호환용 handler가 index.main일 수 있으므로 함수 이름까지 묶어 기본 함수만 남긴다.
        rc.functions = (rc.functions || []).filter((f) => f.name === 'index' && f.handler === 'index.main');
        fs.writeFileSync(rcPath, JSON.stringify(rc, null, 2) + '\n');
    }

    // package.json — test 스크립트 제거, 미사용 의존성 정리
    // (build 는 src/functions 를 자동 순회하므로 별도 조정 불필요)
    const pkgPath = path.join(targetDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.scripts) {
            for (const k of ['test', 'test:watch', 'test:coverage']) {
                delete pkg.scripts[k];
            }
        }
        // Storage/Document DB 예제가 빠졌으므로 @cloudbase/node-sdk 불필요
        if (pkg.dependencies) {
            delete pkg.dependencies['@cloudbase/node-sdk'];
            // WebSocket 데모(src/realtime)가 빠졌으므로 ws 도 불필요
            delete pkg.dependencies['ws'];
        }
        if (pkg.scripts) {
            delete pkg.scripts['build:websocket-demo'];
            delete pkg.scripts['deploy:websocket-demo'];
        }
        // 테스트가 없는 최소 구성이므로 vitest 도 불필요 (설치만 되고 못 돌리는 상태 방지)
        if (pkg.devDependencies) {
            delete pkg.devDependencies['vitest'];
            delete pkg.devDependencies['@types/ws'];
        }
        // lodash.unset override 는 @cloudbase/database 전이 의존 대상 → 함께 제거
        delete pkg.overrides;
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    }
}

/**
 * 최소(N) 구성에서 선택한 데이터 저장소(db)에 맞춰 모든 신호를 정렬한다.
 * - .env.example: 해당 DB 키만
 * - docdb 선택 시: 기본 핸들러를 Document DB 버전으로 교체, 의존성(mysql2→@cloudbase),
 *   cloudbaserc 의 index envVariables(DB_*→TCB_*) 조정
 * - CLAUDE.md / AGENTS.md / README.md 에 '데이터 저장소' 선언 주입 (AI 의 1순위 판단 신호)
 *
 * @param {string} targetDir
 * @param {string} templateDir
 * @param {'mysql'|'docdb'} db
 */
function applyMinimalDb(targetDir, templateDir, db) {
    const which = (db === 'docdb' || db === 'both') ? db : 'mysql';
    const pkgPath = path.join(targetDir, 'package.json');
    const rcPath  = path.join(targetDir, 'cloudbaserc.json');

    // .env.example 를 선택한 DB 키만 남기도록 교체
    fs.writeFileSync(path.join(targetDir, '.env.example'), ENV_EXAMPLE[which]);

    if (which === 'docdb') {
        // 기본 핸들러를 Document DB 버전으로 교체
        const variant = path.join(templateDir, '.minimal', 'index.docdb.ts');
        if (fs.existsSync(variant)) {
            fs.copyFileSync(variant, path.join(targetDir, 'src', 'functions', 'basic', 'index.ts'));
        }
        // 의존성: mysql2 → @cloudbase/node-sdk (+ 전이 의존 취약점 완화 override)
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        pkg.dependencies = pkg.dependencies || {};
        delete pkg.dependencies['mysql2'];
        pkg.dependencies['@cloudbase/node-sdk'] = '^3.18.1';
        pkg.overrides = { 'lodash.unset': '^4.18.0' };
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
        // cloudbaserc: index 함수 envVariables 를 Document DB 키로 교체
        if (fs.existsSync(rcPath)) {
            const rc = JSON.parse(fs.readFileSync(rcPath, 'utf8'));
            for (const f of rc.functions || []) {
                if (f.handler === 'index.main') {
                    f.envVariables = { TCB_ENV_ID: '', TCB_DOCDB_INSTANCE: '', TCB_DOCDB_DATABASE: '' };
                }
            }
            fs.writeFileSync(rcPath, JSON.stringify(rc, null, 2) + '\n');
        }
    } else if (which === 'both') {
        // 기본 핸들러는 MySQL(items 조회) 유지. Document DB 도 쓸 수 있도록 의존성만 추가.
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        pkg.dependencies = pkg.dependencies || {};
        pkg.dependencies['@cloudbase/node-sdk'] = '^3.18.1';   // mysql2 는 유지
        pkg.overrides = { 'lodash.unset': '^4.18.0' };
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
        // cloudbaserc index env(DB_*)는 그대로 — 기본 핸들러가 MySQL 이므로
    }

    // '데이터 저장소' 선언은 정본(AGENTS.md)에만 주입 (인트로 직후) — AI 의 1순위 판단 신호.
    // CLAUDE.md 는 @AGENTS.md 어댑터라 주입 대상이 아니다.
    injectDbDeclaration(path.join(targetDir, 'AGENTS.md'), DB_DECL[which]);

    // README.md(최소) 에도 '데이터 저장소' 선언 주입 (빠른 시작 직전)
    const readmePath = path.join(targetDir, 'README.md');
    if (fs.existsSync(readmePath)) {
        let r = fs.readFileSync(readmePath, 'utf8');
        const anchor = '## 빠른 시작';
        if (r.includes(anchor)) {
            r = r.replace(anchor, DB_DECL[which] + '\n' + anchor);
            fs.writeFileSync(readmePath, r);
        }
    }
}

// Axyl Docs MCP 엔드포인트 — 스캐폴딩이 .mcp.json 을 자동 생성해 AI 도구가
// 프로젝트를 열자마자 정본 문서(모듈 가이드·배포 절차·워크플로)를 조회할 수 있게 한다.
// 고객은 항상 운영 엔드포인트를 쓴다 — 환경 선택지는 고객 인터페이스가 아니다.
const MCP_URL = 'https://mcp.hiveaxyl.com/mcp/v1/mcp';

/**
 * .mcp.json 을 생성한다 (--no-mcp 옵트아웃 시 호출하지 않음).
 * 이미 있으면 덮어쓰지 않는다 — 사용자가 손본 등록을 스캐폴딩이 지우면 안 된다.
 * AXYL_MCP_URL 환경변수로 엔드포인트를 오버라이드할 수 있다 (테스트 용도).
 *
 * @param {string} targetDir  절대 경로
 */
function writeMcpJson(targetDir) {
    const mcpPath = path.join(targetDir, '.mcp.json');
    if (fs.existsSync(mcpPath)) return;
    const url = process.env.AXYL_MCP_URL || MCP_URL;
    const config = { mcpServers: { 'axyl-docs': { type: 'http', url } } };
    fs.writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n');
}

/**
 * 스캐폴딩 시점에 확보된 TCB 환경 값(envId/region)을 프로젝트에 주입한다.
 *
 * - cloudbaserc.json 의 envId/region 을 채운다 — envId 가 빈 rc 가 프로젝트에 존재하면
 *   그 안에서 tcb CLI(login 포함)가 동작하지 않는 문제를 스캐폴딩 시점에 차단한다.
 *   (값은 `tcb env list` 로 사전 조회 가능 — rc 가 없는 디렉토리에서 실행)
 * - .env 를 .env.example 로부터 생성하며 TCB_ENV_ID/TCB_REGION 을 채우고,
 *   DB_NAME 은 규약(DB 이름 = 환경 ID)에 따라 envId 로 채운다.
 *   나머지 항목(DB 호스트/계정 등)은 placeholder 그대로 남아 셋업 인터뷰 대상이 된다.
 *
 * @param {string} targetDir  절대 경로
 * @param {string} [envId]
 * @param {string} [region]
 */
function applyEnvPreset(targetDir, envId, region) {
    const rcPath = path.join(targetDir, 'cloudbaserc.json');
    if (fs.existsSync(rcPath)) {
        const rc = JSON.parse(fs.readFileSync(rcPath, 'utf8'));
        if (envId)  rc.envId  = envId;
        if (region) rc.region = region;
        fs.writeFileSync(rcPath, JSON.stringify(rc, null, 2) + '\n');
    }

    const examplePath = path.join(targetDir, '.env.example');
    const envPath     = path.join(targetDir, '.env');
    if (!fs.existsSync(examplePath) || fs.existsSync(envPath)) return;

    // 라인 단위 치환 — TCB_DOCDB_DATABASE 등 다른 your-* placeholder 를 건드리지 않는다
    const lines = fs.readFileSync(examplePath, 'utf8').split('\n').map((line) => {
        if (envId  && line.startsWith('TCB_ENV_ID=')) return `TCB_ENV_ID=${envId}`;
        if (region && line.startsWith('TCB_REGION=')) return `TCB_REGION=${region}`;
        if (envId  && line.startsWith('DB_NAME='))    return `DB_NAME=${envId}`;
        return line;
    });
    fs.writeFileSync(envPath, lines.join('\n'));
}

/**
 * 템플릿을 targetDir 에 스캐폴딩한다.
 *
 * @param {string} projectName
 * @param {string} targetDir    절대 경로
 * @param {string} templateDir  절대 경로
 * @param {{ includeTests?: boolean, db?: 'mysql'|'docdb', envId?: string, region?: string,
 *           mcp?: boolean }} [options]
 *        includeTests=false 시 최소 구성, db 로 데이터 저장소 선택(기본 mysql).
 *        envId/region 지정 시 cloudbaserc 와 .env 에 사전 주입(applyEnvPreset).
 *        mcp=false 면 .mcp.json 을 생성하지 않음(기본 생성, 운영 엔드포인트).
 */
function scaffold(projectName, targetDir, templateDir, options = {}) {
    if (fs.existsSync(targetDir)) {
        throw new Error(`오류: 이미 존재하는 디렉토리입니다 — ${projectName}`);
    }

    copyDir(templateDir, targetDir);

    // _gitignore → .gitignore
    const gitignoreSrc = path.join(targetDir, '_gitignore');
    if (fs.existsSync(gitignoreSrc)) {
        fs.renameSync(gitignoreSrc, path.join(targetDir, '.gitignore'));
    }

    // _env.example → .env.example — 공개 저장소의 전역 금지 패턴(**/.env.*)을 피하기 위해
    // 템플릿에는 _env.example 로 두고 스캐폴딩 시점에 본래 이름으로 되돌린다 (_gitignore 와 동일 방식)
    const envExampleSrc = path.join(targetDir, '_env.example');
    if (fs.existsSync(envExampleSrc)) {
        fs.renameSync(envExampleSrc, path.join(targetDir, '.env.example'));
    }

    // 테스트 미포함 선택 시 최소 구성으로 정리
    if (options.includeTests === false) {
        pruneTestArtifacts(targetDir);
        // 풀 README(예제·테스트 중심)는 최소 구성과 맞지 않으므로 전용 README 로 교체.
        // 상세 가이드는 MCP 정본이라 로컬에는 SECURITY.md 만 남는다.
        const minReadme = path.join(templateDir, 'README.minimal.md');
        if (fs.existsSync(minReadme)) {
            fs.copyFileSync(minReadme, path.join(targetDir, 'README.md'));
        }
        // 풀 구성용 AGENTS.md(예제 인덱스형)를 최소 구성 전용 정본으로 교체한다.
        // (CLAUDE.md @import 어댑터는 아래에서 풀·최소 공통으로 생성)
        const minGuide = path.join(templateDir, 'AGENTS.minimal.md');
        if (fs.existsSync(minGuide)) {
            fs.copyFileSync(minGuide, path.join(targetDir, 'AGENTS.md'));
        }
        // 선택한 데이터 저장소로 신호 정렬 + '데이터 저장소' 선언 주입
        const dbChoice = (options.db === 'docdb' || options.db === 'both') ? options.db : 'mysql';
        applyMinimalDb(targetDir, templateDir, dbChoice);
    }

    // 정본은 AGENTS.md(벤더 중립). Claude Code 는 AGENTS.md 를 자동 로드하지 않으므로
    // @import 어댑터 CLAUDE.md 를 둬 단일 소스를 유지한다 (풀·최소 공통).
    if (fs.existsSync(path.join(targetDir, 'AGENTS.md'))) {
        fs.writeFileSync(path.join(targetDir, 'CLAUDE.md'), '@AGENTS.md\n');
    }

    // package.json name 업데이트
    const pkgPath = path.join(targetDir, 'package.json');
    const pkg     = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.name      = projectName;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

    // README.md 프로젝트명 교체 (h1 제목 + 프로젝트 구조 트리)
    const readmePath = path.join(targetDir, 'README.md');
    if (fs.existsSync(readmePath)) {
        let readme = fs.readFileSync(readmePath, 'utf8');
        readme = readme.replace(/^# .+/m, `# ${projectName}`);
        readme = readme.replace('<project-name>/', `${projectName}/`);
        fs.writeFileSync(readmePath, readme);
    }

    // 사전 조회된 TCB 환경 값 주입 (.env.example 변형이 끝난 뒤에 실행해야 한다)
    if (options.envId || options.region) {
        applyEnvPreset(targetDir, options.envId, options.region);
    }

    // Axyl Docs MCP 등록 파일 생성 (옵트아웃: --no-mcp)
    if (options.mcp !== false) {
        writeMcpJson(targetDir);
    }
}

/**
 * 생성된 프로젝트 디렉토리에서 npm install 을 실행한다.
 * 실패해도 예외를 던지지 않고 false 를 반환한다(스캐폴딩 자체는 성공으로 취급).
 *
 * @param {string} targetDir  절대 경로
 * @returns {boolean}  설치 성공 여부
 */
function installDependencies(targetDir) {
    try {
        // --no-audit/--no-fund: 스캐폴딩 직후 화면에 npm 의 audit(@cloudbase 전이 취약점)·
        // funding 안내가 뜨면 신입이 불필요하게 놀라므로 억제한다(별도로 안내·문서화함).
        execSync('npm install --no-audit --no-fund', { cwd: targetDir, stdio: 'inherit' });
        return true;
    } catch {
        return false;
    }
}

module.exports = { validateProjectName, copyDir, scaffold, pruneTestArtifacts, applyMinimalDb, applyEnvPreset, writeMcpJson, MCP_URL, installDependencies };
