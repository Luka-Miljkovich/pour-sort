// Builds the whole game as ONE self-contained HTML file (CSS, JS and the level
// worker inlined) for hosts that can't serve a PWA: dist-single/pour.html.
// It has no service worker, manifest or icons; progress is still saved in localStorage.
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = 'dist-single';
execSync(`npx vite build --mode single --outDir ${out}/build --emptyOutDir`, { stdio: 'inherit' });
const dir = join(out, 'build');
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const assets = join(dir, 'assets');
const files = readdirSync(assets);
const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
const jsFiles = files.filter((f) => f.endsWith('.js'));
if (jsFiles.length !== 1) throw new Error(`expected one JS bundle, got ${jsFiles.join(', ')}`);
// "</script" inside a string would end the inline tag early
const js = readFileSync(join(assets, jsFiles[0]), 'utf8').replace(/<\/script/gi, '<\\/script');

const page = `<title>Pour</title>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#07090f">
<meta name="apple-mobile-web-app-title" content="Pour">
<style>
${css}
</style>
<div id="app"></div>
<script type="module">
${js}
</script>
`;
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'pour.html'), page);
console.log(`wrote ${out}/pour.html (${(page.length / 1024).toFixed(1)} KB)` + (html.includes('<div id="app">') ? '' : ' [warning: unexpected index.html]'));
