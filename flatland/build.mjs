/* 构建：把 style.css + 引擎 + 库 + 各章拼成一个自包含的单文件 HTML */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = p => fs.readFileSync(path.join(here, p), 'utf8');

const JS_ORDER = [
  'src/engine.js',
  'src/lib/vision.js',
  'src/lib/mini3d.js',
  'src/chapters/00-prologue.js',
  'src/chapters/01-flatland.js',
  'src/chapters/02-lineland.js',
  'src/chapters/03-feeling.js',
  'src/chapters/04-colour.js',
  'src/chapters/05-stranger.js',
  'src/chapters/06-upward.js',
  'src/chapters/07-pointland.js',
  'src/chapters/08-epilogue.js',
];

for (const f of JS_ORDER) {
  if (!fs.existsSync(path.join(here, f))) {
    console.error('缺少文件：' + f);
    process.exit(1);
  }
}

const css = src('src/style.css');
const js = JS_ORDER.map(f => '/* ===== ' + f + ' ===== */\n' + src(f)).join('\n\n');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>平面国：向上，而非向北</title>
<meta name="description" content="以埃德温·艾勃特 1884 年小说《平面国》为蓝本的互动游戏：一维视觉导航、直线国、触觉辨认、色彩革命、截面推断，以及向上而非向北。">
<meta name="color-scheme" content="light">
<style>
${css}
</style>
</head>
<body>
<div class="grain" aria-hidden="true"></div>

<div class="shell" id="shell" hidden>
  <div class="topbar">
    <div class="brand"><b>平面国</b><span>向上，而非向北</span></div>
    <div class="dots" id="dots" role="group" aria-label="章节进度"></div>
    <div class="tools">
      <button class="btn sm ghost" id="btnSound" type="button">♪ 音效</button>
      <button class="btn sm ghost" id="btnMenu" type="button">章节</button>
    </div>
  </div>
  <div class="grid">
    <div class="stage">
      <div class="canvasWrap"><canvas id="cv" tabindex="0" aria-label="游戏画面"></canvas></div>
      <div class="hud" id="hud"></div>
    </div>
    <aside class="side" id="side">
      <div class="card">
        <div class="chapterHead"><em id="chNum">序幕</em><h2 id="chTitle">一条直线</h2></div>
        <div class="sub" id="chSrc"></div>
        <p class="epigraph" id="chEpi"></p>
      </div>
      <div class="card">
        <h3>任务</h3>
        <div class="brief" id="chBrief"></div>
        <div class="goal" id="chGoal"><span class="tick">◆</span><span></span></div>
      </div>
      <div class="card"><h3>操作</h3><div class="keys" id="chKeys"></div></div>
      <div class="card"><h3>见闻</h3><div class="ticker" id="ticker"></div></div>
    </aside>
  </div>
</div>

<div class="cover" id="cover">
  <div class="coverInner">
    <svg class="coverArt" viewBox="0 0 320 150" role="img" aria-label="从零维到三维：点、线、方形，以及方形上方的圆">
      <g fill="none" stroke="#1c1915" stroke-width="1.5">
        <circle cx="34" cy="112" r="3.2" fill="#1c1915" stroke="none"/>
        <line x1="74" y1="112" x2="126" y2="112"/>
        <rect x="166" y="94" width="36" height="36"/>
        <circle cx="184" cy="44" r="24"/>
      </g>
      <path d="M184 90 L184 76" stroke="#b0432c" stroke-width="1.5"/>
      <path d="M179 81 L184 73 L189 81" fill="none" stroke="#b0432c" stroke-width="1.5" stroke-linejoin="round"/>
      <text x="196" y="70" font-size="10" fill="#b0432c" font-family="PingFang SC,sans-serif">向上，而非向北</text>
      <g font-size="10.5" fill="#837b6c" text-anchor="middle" font-family="PingFang SC,sans-serif">
        <text x="34" y="140">零维</text>
        <text x="100" y="140">一维</text>
        <text x="184" y="140">二维</text>
        <text x="184" y="12">三维</text>
      </g>
    </svg>
    <div class="coverTitle">
      <h1>平面国</h1>
      <div class="sub">向上，而非向北</div>
      <div class="by">以埃德温·艾勃特 1884 年小说《平面国：多重维度传奇》为蓝本的互动游戏</div>
    </div>
    <div class="coverBtns">
      <button class="btn primary" id="btnStart" type="button">开始阅读</button>
      <button class="btn" id="btnContinue" type="button" hidden>继续</button>
      <button class="btn ghost" id="btnReset" type="button">清空进度</button>
    </div>
    <p class="coverNote">
      七个章节，每一章把原著里的一个机制做成可以上手的东西：<b>用一条线导航</b>、<b>把国王搬出他的世界</b>、<b>数着边数辨认阶级</b>、<b>给平面国上色</b>、<b>从截面推断立体</b>、<b>把视角升起来</b>、<b>对着一句话也说不动的人说话</b>。
      每章结束都会给一张「原著对照」卡片，标明出处。
    </p>
    <div class="pick" id="pick">
      <h3>章节</h3>
      <div class="pickGrid" id="pickGrid"></div>
    </div>
  </div>
</div>

<div class="veil" id="veil" hidden><div class="veilCard" id="veilCard"></div></div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<div class="sr" id="live" role="status" aria-live="polite"></div>

<script>
${js.replace(/<\/script>/gi, '<\\/script>')}
</script>
</body>
</html>
`;

const outDir = path.join(here, '../site');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'flatland.html');
fs.writeFileSync(out, html, 'utf8');
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log('已生成 ' + out + '  (' + kb + ' KB)');
console.log('场景数：' + JS_ORDER.filter(f => f.includes('chapters/')).length + ' 个章节文件');
