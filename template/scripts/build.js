'use strict';

/**
 * 함수 빌드 스크립트
 *
 * src/functions/ 아래의 모든 *.ts 핸들러를 esbuild 로 번들링해
 * dist/<파일명>.js 로 출력합니다. (예: src/functions/basic/index.ts → dist/index.js)
 *
 * 함수를 추가/삭제해도 이 스크립트가 자동으로 인식하므로
 * package.json 의 빌드 스크립트를 손볼 필요가 없습니다.
 *
 * 사용법:
 *   npm run build              → 전체 함수 빌드
 *   node scripts/build.js echo → 특정 함수만 빌드 (파일명, 확장자 제외)
 */

const { readdirSync } = require('fs');
const path            = require('path');
const esbuild         = require('esbuild');

const SRC_DIR  = path.join(__dirname, '..', 'src', 'functions');
const OUT_DIR  = path.join(__dirname, '..', 'dist');

/** src/functions 를 재귀 순회해 핸들러(.ts) 파일 경로를 모은다. */
function collectHandlers(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    const files   = [];
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...collectHandlers(full));
        } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
            files.push(full);
        }
    }
    return files;
}

async function run() {
    const only     = process.argv[2]; // 선택: 특정 함수명만 빌드
    const handlers = collectHandlers(SRC_DIR).filter((file) => {
        const name = path.basename(file, '.ts');
        return only ? name === only : true;
    });

    if (handlers.length === 0) {
        console.error(only ? `함수를 찾을 수 없습니다: ${only}` : '빌드할 함수가 없습니다.');
        process.exit(1);
    }

    await Promise.all(
        handlers.map((entry) => {
            const name = path.basename(entry, '.ts');
            return esbuild.build({
                entryPoints: [entry],
                bundle: true,
                platform: 'node',
                target: 'node18',
                outfile: path.join(OUT_DIR, `${name}.js`),
            });
        })
    );

    const names = handlers.map((f) => path.basename(f, '.ts')).sort();
    console.log(`✅ ${handlers.length}개 함수 빌드 완료: ${names.join(', ')}`);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
