/* ================================================================
   build-standalone.js
   index.html + css + js 를 하나의 HTML 파일로 합칩니다.
   실행: node build-standalone.js  →  ../youtube-channel-scanner.html
================================================================ */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

let html = read('index.html');

/* ── CSS 인라인 ── */
html = html.replace(
  /[ \t]*<link rel="stylesheet" href="css\/scanner\.css" \/>\n?/,
  () => {
    /* 단독 파일 옆에 fonts/ 폴더를 두면 그대로 동작하도록 경로 조정 */
    const css = read('css/scanner.css').replace(/url\('\.\.\/fonts\//g, "url('fonts/");
    return `  <style>\n${css}\n  </style>\n`;
  }
);

/* ── JS 인라인 (로드 순서 유지) ── */
html = html.replace(
  /[ \t]*<script src="js\/([\w.-]+)"><\/script>\n?/g,
  (_, file) => `<script>\n${read('js/' + file)}\n</script>\n`
);

const out = path.join(root, '..', 'youtube-channel-scanner.html');
fs.writeFileSync(out, html, 'utf8');

const kb = (fs.statSync(out).size / 1024).toFixed(1);
console.log(`생성 완료: ${path.relative(process.cwd(), out)} (${kb} KB)`);
if (/<link rel="stylesheet"|<script src=/.test(html)) {
  console.warn('경고: 인라인되지 않은 외부 참조가 남아 있습니다.');
  process.exitCode = 1;
}
