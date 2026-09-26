#!/usr/bin/env node
/**
 * build-index.mjs — 为 site 生成索引页
 *
 * 遍历 site/ 下的所有目录，把每个含有 index.html 的目录当作一篇作品，
 * 解析出 <title> 与 <meta name="description">，写入 site/index.html。
 *
 * 用法：
 *   node scripts/build-index.mjs              # 生成 / 更新 site/index.html
 *   node scripts/build-index.mjs --check      # 只校验是否最新（CI 用），过期则 exit 1
 *   node scripts/build-index.mjs --site dist  # 索引别的目录
 *   node scripts/build-index.mjs --title "作品集" --desc "一句话简介"
 *   node scripts/build-index.mjs --force      # 内容相同也强制重写
 *
 * 内容无变化时不会写盘，因此可以放心反复运行（不会污染 git diff）。
 */

import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* ------------------------------------------------------------------ 参数 */

const USAGE = `atelier 索引生成器

  --site <dir>    待索引的站点目录（默认 site）
  --out <file>    输出文件（默认 <site>/index.html）
  --title <text>  站点标题（默认取 package.json 的 name）
  --desc  <text>  站点副标题
  --check         只校验，不写盘；内容过期时以退出码 1 结束
  --force         内容相同时也强制重写
  --quiet         不输出日志
  -h, --help      显示本帮助
`;

function parseArgs(argv) {
  const opts = { site: "site", out: null, title: null, desc: null, check: false, force: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) fail(`选项 ${a} 缺少取值`);
      return v;
    };
    switch (a) {
      case "--site": opts.site = next(); break;
      case "--out": opts.out = next(); break;
      case "--title": opts.title = next(); break;
      case "--desc": case "--description": opts.desc = next(); break;
      case "--check": opts.check = true; break;
      case "--force": opts.force = true; break;
      case "--quiet": case "-q": opts.quiet = true; break;
      case "-h": case "--help": console.log(USAGE); process.exit(0); break;
      default: fail(`未知选项：${a}\n\n${USAGE}`);
    }
  }
  opts.site = path.resolve(ROOT, opts.site);
  opts.out = path.resolve(ROOT, opts.out ?? path.join(opts.site, "index.html"));
  return opts;
}

function fail(msg) {
  console.error(`build-index: ${msg}`);
  process.exit(1);
}

/* ------------------------------------------------------- HTML 解析小工具 */

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", middot: "·" };

function decode(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

function safeChar(code) {
  return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
}

function collapse(s) {
  return s.replace(/\s+/g, " ").trim();
}

function attrs(tag) {
  const out = {};
  const re = /([a-zA-Z_:][-\w:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return out;
}

function metaContent(html, name) {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    if ((a.name || a.property || "").toLowerCase() === name) return collapse(decode(a.content ?? ""));
  }
  return "";
}

function firstMatch(html, re) {
  const m = html.match(re);
  return m ? collapse(decode(m[1])) : "";
}

/** 解析一个页面，取出索引需要的元信息。 */
async function readMeta(file, rel) {
  const html = await readFile(file, "utf8");
  const raw = firstMatch(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i)
    || metaContent(html, "og:title")
    || firstMatch(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i);

  // "逻辑哲学论 · 一架梯子" → 主标题 + 副标
  const split = raw.match(/^(.*?)\s*[·・—–|｜]\s*(.+)$/);
  const title = (split ? split[1] : raw) || rel;

  return {
    rel,
    file,
    title,
    kicker: split ? split[2] : "",
    desc: metaContent(html, "description") || metaContent(html, "og:description"),
    mtime: (await stat(file)).mtime,
  };
}

/* ------------------------------------------------------------ 目录遍历 */

const SKIP = new Set(["node_modules", "dist", "build", "out", "coverage", "vendor"]);
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

const isSkipped = (name) => name.startsWith(".") || SKIP.has(name);

async function collect(siteDir) {
  const pages = [];
  async function walk(dir, rel) {
    let items;
    try {
      items = await readdir(dir, { withFileTypes: true });
    } catch (e) {
      if (rel) console.error(`build-index: 跳过无法读取的目录 ${rel}/ (${e.code})`);
      return;
    }
    const dirs = items.filter((d) => d.isDirectory() && !isSkipped(d.name));
    dirs.sort((a, b) => collator.compare(a.name, b.name));
    for (const d of dirs) {
      const childRel = rel ? `${rel}/${d.name}` : d.name;
      const childAbs = path.join(dir, d.name);
      const entry = path.join(childAbs, "index.html");
      if (existsSync(entry)) pages.push(await readMeta(entry, childRel));
      await walk(childAbs, childRel); // 目录里可能还有子目录
    }
  }
  await walk(siteDir, "");
  return pages.sort((a, b) => collator.compare(a.rel, b.rel));
}

/* ------------------------------------------------------------- 输出组装 */

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const pad = (n) => String(n).padStart(2, "0");

/** 按首层目录分组；全部都在顶层时不分组，直接平铺。 */
function group(pages) {
  if (!pages.some((p) => p.rel.includes("/"))) return [{ name: "", items: pages }];
  const map = new Map();
  for (const p of pages) {
    const key = p.rel.split("/")[0];
    if (!map.has(key)) map.set(key, { name: key, items: [] });
    map.get(key).items.push(p);
  }
  return [...map.values()].sort((a, b) => collator.compare(a.name, b.name));
}

function renderEntry(p, n) {
  const href = p.rel + "/";
  const search = [p.title, p.kicker, p.rel].join(" ").toLowerCase();
  const lines = [
    `      <li class="entry" data-search="${esc(search)}">`,
    `        <a href="${esc(href)}">`,
    `          <span class="n">${pad(n)}</span>`,
    `          <span class="hd">`,
    `            <span class="title">${esc(p.title)}</span>`,
  ];
  if (p.kicker) lines.push(`            <span class="kicker">${esc(p.kicker)}</span>`);
  lines.push(`          </span>`);
  if (p.desc) lines.push(`          <span class="desc">${esc(p.desc)}</span>`);
  lines.push(
    `          <span class="path">${esc(p.rel)}/</span>`,
    `        </a>`,
    `      </li>`
  );
  return lines.join("\n");
}

function render(pages, opts) {
  const groups = group(pages);
  const name = opts.title;
  const mark = opts.mark || "";
  const works = pages.length;
  const sections = groups.filter((g) => g.name).length || 1;
  const stamp = pages.reduce((a, p) => (p.mtime > a ? p.mtime : a), new Date(0));
  const updated = Number.isNaN(+stamp) || +stamp === 0 ? "" : stamp.toISOString().slice(0, 10);

  let n = 0;
  const body = works ? groups.map((g) => {
    const items = g.items.map((p) => renderEntry(p, ++n)).join("\n");
    const head = g.name ? `      <h2 class="grp"><span>${esc(g.name)}</span></h2>\n` : "";
    return `${head}      <ul class="list">\n${items}\n      </ul>`;
  }) : [];

  const listing = pages
    .map((p, i) => `   ${pad(i + 1)}  ${p.rel}/`)
    .join("\n");

  const summary = works
    ? `共 <b>${works}</b> 篇作品，收在 <b>${sections}</b> 个目录里`
    : "这里还没有作品";

  const heroPre = listing ? `\n    <pre>${esc(listing)}</pre>` : "";
  const lockup = `    <div class="lockup">\n${mark ? `      ${mark}\n` : ""}      <h1>${esc(name)}</h1>\n    </div>`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="scripts/build-index.mjs">
${opts.icon ? `<link rel="icon" href="${esc(opts.icon)}" type="image/svg+xml">\n` : ""}${opts.touch ? `<link rel="apple-touch-icon" href="${esc(opts.touch)}">\n` : ""}<meta name="theme-color" content="#f6f1e7">
<title>${esc(name)}</title>
${opts.desc ? `<meta name="description" content="${esc(opts.desc)}">\n` : ""}<style>
:root{
  --paper:#f6f1e7;--paper-2:#fffdf7;--paper-3:#efe8da;
  --ink:#1b1916;--ink-2:#4b453c;--ink-3:#8d8577;
  --line:#ded5c4;--line-2:#c9bfab;
  --accent:#b0432c;--gold:#9c7b32;
  --serif:"Iowan Old Style","Palatino Linotype",Palatino,"Songti SC","Source Han Serif SC",Georgia,"Times New Roman",serif;
  --mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
}
*{box-sizing:border-box}
body{
  margin:0;background:var(--paper);color:var(--ink);
  font-family:var(--serif);font-size:17px;line-height:1.85;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
}
body::before{
  content:"";position:fixed;inset:0;z-index:0;pointer-events:none;opacity:.055;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E");
}
body::after{
  content:"";position:fixed;inset:0;z-index:0;pointer-events:none;
  background:radial-gradient(120% 90% at 50% 0%,rgba(255,255,255,.85),rgba(255,255,255,0) 60%),
             radial-gradient(100% 80% at 50% 100%,rgba(160,140,100,.10),rgba(255,255,255,0) 55%);
}
.wrap{max-width:820px;margin:0 auto;padding:0 30px;position:relative;z-index:2}

/* ---------- 首屏 ---------- */
.hero{padding:110px 0 54px;position:relative;z-index:2}
.hero .tag{
  font-family:var(--mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;
  color:var(--accent);display:block;margin-bottom:18px;
}
.hero h1{
  font-size:clamp(30px,6vw,50px);line-height:1.2;margin:0 0 10px;font-weight:600;letter-spacing:.03em;
}
.hero .lockup{display:flex;align-items:center;gap:20px;margin-bottom:10px}
.hero .lockup h1{margin:0}
.hero .lockup .mark{width:52px;height:52px;flex:none;display:block}
.hero .sub{color:var(--ink-3);font-size:15.5px;font-style:italic;margin:0 0 34px}
.hero .sub b{color:var(--ink-2);font-style:normal;font-weight:600}
.hero pre{
  font-family:var(--mono);font-size:12px;line-height:1.6;color:var(--ink-3);
  margin:0;white-space:pre;overflow:auto hidden;
  background:var(--paper-2);border:1px solid var(--line);border-radius:6px;padding:18px 20px;
}

/* ---------- 检索 ---------- */
.find{
  display:flex;align-items:center;gap:12px;flex-wrap:wrap;
  border-bottom:1px solid var(--line);padding-bottom:16px;margin-bottom:8px;
}
.find input{
  flex:1;min-width:180px;font-family:var(--mono);font-size:13.5px;
  background:transparent;border:0;border-bottom:1px solid var(--line-2);
  color:var(--ink);padding:7px 2px;outline:none;transition:border-color .2s;
}
.find input:focus{border-color:var(--accent)}
.find input::placeholder{color:var(--ink-3)}
.find .count{font-family:var(--mono);font-size:11.5px;color:var(--ink-3);letter-spacing:.06em}
.find .none{font-family:var(--serif);color:var(--ink-3);padding:26px 0;font-style:italic;display:none}

/* ---------- 列表 ---------- */
h2.grp{
  font-family:var(--mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;
  color:var(--ink-3);font-weight:500;margin:44px 0 14px;display:flex;align-items:center;gap:12px;
}
h2.grp::after{content:"";flex:1;height:1px;background:var(--line)}
ul.list{list-style:none;margin:0;padding:0}
.entry{border-bottom:1px solid var(--line)}
.entry:first-child{border-top:1px solid var(--line)}
.entry a{
  display:grid;grid-template-columns:52px 1fr;gap:3px 20px;align-items:baseline;
  text-decoration:none;color:inherit;padding:20px 12px 20px 0;margin-left:-12px;
  border-radius:6px;transition:background .2s,transform .2s;
}
.entry a:hover{background:var(--paper-2);transform:translateX(3px)}
.entry a:hover .title{color:var(--accent)}
.entry a:hover .n{opacity:1}
.entry .n{
  grid-column:1;grid-row:1;
  font-family:var(--mono);font-size:13px;color:var(--accent);opacity:.55;
  letter-spacing:.02em;transition:.2s;
}
.entry .hd{grid-column:2;grid-row:1;display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;min-width:0}
.entry .title{font-size:20px;font-weight:600;line-height:1.45;transition:color .2s}
.entry .kicker{
  font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);
}
.entry .desc{
  grid-column:2;
  color:var(--ink-2);font-size:15.5px;line-height:1.8;max-width:58ch;
}
.entry .path{
  grid-column:2;
  font-family:var(--mono);font-size:11.5px;color:var(--ink-3);
  letter-spacing:.02em;word-break:break-all;
}
.entry.hide{display:none}
p.blank{
  color:var(--ink-2);font-size:16px;border:1px dashed var(--line-2);
  border-radius:6px;padding:26px 22px;margin:0;
}
p.blank code{
  font-family:var(--mono);font-size:.85em;background:var(--paper-3);
  padding:1px 5px;border-radius:3px;color:var(--accent-2);
}

/* ---------- 页脚 ---------- */
footer{
  margin-top:64px;padding:40px 0 70px;border-top:1px solid var(--line);
  font-family:var(--mono);font-size:11.5px;color:var(--ink-3);line-height:2.1;position:relative;z-index:2;
}
footer .gen{opacity:.75}

@media (max-width:640px){
  body{font-size:16.5px}
  .wrap{padding:0 20px}
  .hero{padding:76px 0 40px}
  .hero pre{font-size:10.5px;padding:14px 12px}
  .hero .lockup{gap:14px}
  .hero .lockup .mark{width:42px;height:42px}
  .entry a{grid-template-columns:34px 1fr;gap:4px 12px;padding:16px 8px 16px 0;margin-left:0}
  .entry .title{font-size:18px}
}
@media (prefers-reduced-motion:reduce){
  *{animation-duration:.001s !important;transition-duration:.001s !important}
}
</style>
</head>
<body>

<header class="hero">
  <div class="wrap">
    <span class="tag">Index</span>
${lockup}
    <p class="sub">${opts.desc ? esc(opts.desc) : summary}</p>${heroPre}
  </div>
</header>

<main class="wrap">
${works ? `  <div class="find">
    <input id="q" type="search" placeholder="筛选标题或目录名…" aria-label="筛选作品" autocomplete="off">
    <span class="count" id="count"></span>
  </div>
  <p class="none" id="none">没有匹配的作品。</p>
` : `  <p class="blank">在 <code>site/</code> 下新建一个目录，放一个 <code>index.html</code>，然后运行 <code>npm run index</code>。</p>
`}
${body.join("\n\n")}
</main>

<footer>
  <div class="wrap">
    ${updated ? `<div>索引于 ${updated} · ${works} 篇 / ${sections} 节</div>\n    ` : ""}<div><a href="./" style="color:inherit">回到顶部</a></div>
  </div>
</footer>

<script>
(function(){
  "use strict";
  var q=document.getElementById("q");
  if(!q) return;
  var counter=document.getElementById("count"),
      none=document.getElementById("none"),
      rows=[].slice.call(document.querySelectorAll(".entry"));
  function apply(){
    var s=q.value.trim().toLowerCase(), hit=0;
    rows.forEach(function(row){
      var ok=!s||row.dataset.search.indexOf(s)>-1;
      row.classList.toggle("hide",!ok);
      if(ok) hit++;
    });
    counter.textContent=hit===rows.length?(rows.length+" 篇"):(hit+" / "+rows.length+" 篇");
    none.style.display=hit?"none":"block";
  }
  q.addEventListener("input",apply);
  apply();
})();
</script>
</body>
</html>
`;
}

/* ----------------------------------------------------------------- main */

/**
 * 读取 site/favicon.svg，作为页头 logo 内联进索引页 ——
 * favicon 和 logo 只有这一份源文件，改一处两处都跟着变。
 */
async function readMark(siteDir) {
  const file = path.join(siteDir, "favicon.svg");
  if (!existsSync(file)) return "";
  let svg = (await readFile(file, "utf8"))
    .trim()
    .replace(/<\?xml[^>]*\?>\s*/g, "")
    .replace(/\s+role="[^"]*"/gi, "")
    .replace(/\s+aria-label="[^"]*"/gi, "");
  if (!/<svg\b/i.test(svg)) return "";
  if (!/<svg\b[^>]*\bclass\s*=/i.test(svg)) svg = svg.replace(/<svg\b/i, '<svg class="mark"');
  return svg.replace(/<svg\b/i, '<svg aria-hidden="true" focusable="false"');
}

/** 输出文件 → 站点内某个文件的相对路径（正斜杠）。 */
function hrefTo(from, to) {
  return path.relative(from, to).split(path.sep).join("/");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const log = (m) => { if (!opts.quiet) console.log(m); };

  if (!existsSync(opts.site)) fail(`站点目录不存在：${path.relative(ROOT, opts.site) || opts.site}`);

  let title = opts.title;
  if (!title) {
    const pkg = path.join(ROOT, "package.json");
    title = existsSync(pkg) ? JSON.parse(readFileSync(pkg, "utf8")).name || path.basename(ROOT) : path.basename(opts.site);
  }

  const pages = await collect(opts.site);
  if (!pages.length) {
    console.error(`build-index: ${path.relative(ROOT, opts.site)} 下没有找到任何含 index.html 的目录`);
  }

  const outDir = path.dirname(opts.out);
  const iconPath = path.join(opts.site, "favicon.svg");
  const touchPath = path.join(opts.site, "apple-touch-icon.png");
  const mark = await readMark(opts.site);

  const html = render(pages, {
    ...opts,
    title,
    mark,
    icon: existsSync(iconPath) ? hrefTo(outDir, iconPath) : null,
    touch: existsSync(touchPath) ? hrefTo(outDir, touchPath) : null,
  });
  const current = existsSync(opts.out) ? readFileSync(opts.out, "utf8") : null;
  const outRel = path.relative(ROOT, opts.out) || opts.out;

  if (current === html) {
    if (!opts.force) {
      log(`· 索引已是最新：${outRel}（${pages.length} 篇）`);
      return;
    }
    log(`· 内容无变化，按 --force 重写：${outRel}`);
  } else if (opts.check) {
    console.error(`build-index: ${outRel} 已过期，请运行 npm run index`);
    process.exit(1);
  }
  await writeFile(opts.out, html, "utf8");
  log(`${current === null ? "已创建" : "已更新"}：${outRel}`);
  for (const p of pages) log(`  · ${p.rel}/  —  ${p.title}${p.kicker ? " · " + p.kicker : ""}`);
}

main().catch((e) => fail(e.stack ?? String(e)));

