'use strict';

/**
 * 일반 WebSocket 데모 서버를 TCB Web Function 배포 패키지로 만든다.
 * `ws` 는 배포 디렉터리 package.json 의 런타임 의존성으로 남기고(external),
 * 나머지(미들웨어·mysql2)는 번들에 포함한다. (→ MCP 문서 tcb-setup-websocket-deploy '빌드와 배포 패키지')
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const sourceDir = path.join(root, 'src', 'realtime', 'websocket-demo');
const outputDir = path.join(root, 'websocket', 'websocket-demo');

fs.mkdirSync(outputDir, { recursive: true });
for (const file of fs.readdirSync(outputDir)) {
    // 이 디렉터리는 생성 산출물 전용이므로 이전 번들만 제거해 오래된 코드가 함께 배포되지 않게 한다.
    fs.rmSync(path.join(outputDir, file), { recursive: true, force: true });
}

esbuild.buildSync({
    entryPoints: [path.join(sourceDir, 'server.ts')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    external: ['ws'],
    outfile: path.join(outputDir, 'index.js'),
    minify: true,
    sourcemap: false,
});

fs.writeFileSync(path.join(outputDir, 'package.json'), JSON.stringify({
    name: 'websocket-demo-web-function',
    version: '1.0.0',
    private: true,
    type: 'commonjs',
    main: 'index.js',
    dependencies: {
        // installDependency: true 인 함수라 배포 시 플랫폼이 설치한다
        ws: '8.21.0',
    },
}, null, 2) + '\n');

// 저장소가 Windows여도 TCB의 Linux 런타임에서 실행되도록 LF와 실행 가능한 shebang을 고정한다.
fs.writeFileSync(
    path.join(outputDir, 'scf_bootstrap'),
    '#!/bin/bash\nexport PORT=9000\n/var/lang/node18/bin/node index.js\n',
    { mode: 0o755 }
);

console.log(`✅ WebSocket 데모 번들 완료: ${path.relative(root, outputDir)}`);
