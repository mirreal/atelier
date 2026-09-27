/* ============================================================
   第四章 · 色彩革命
   玩法：用三种色相给一张六边形地图三着色 —— 相邻的格子不能同色。
   立意：颜色之所以危险，是因为它让阶级瞬间可见；
        而僧侣阶层的权威，正建立在「别人看不清」之上。
   ============================================================ */
(function () {
  'use strict';
  const U = WB.util, TAU = Math.PI * 2, SQ3 = Math.sqrt(3);

  /* ---------------- 配色与常量 ---------------- */
  const HUES = [
    { name: '朱红', hex: '#b0432c' },
    { name: '靛蓝', hex: '#2f4d7d' },
    { name: '藤黄', hex: '#c08a1e' },
  ];
  const EMPTY = '#ece5d6';                       // 空格子：纸色
  const TOOL_ERASER = 3;

  // 尖顶（pointy-top）六边形的六个邻居方向（轴坐标）
  const NEI = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

  // 天然三着色 c = ((q - r) % 3 + 3) % 3。它在整张网格上都合法，
  // 所以「预涂固定格」只要取 c 的值，无论怎么挖格子都必然有解。
  const ref = (q, r) => ((q - r) % 3 + 3) % 3;

  const MAPS = [
    { radius: 1, monk: [], fixed: [],
      note: '七格，三种色相。相邻的格子不能同色。' },
    { radius: 2, monk: [], fixed: [],
      note: '十九格。约束变多了，但解法依然存在。' },
    { radius: 2,
      monk: [[0, 0], [1, 0], [1, -1], [0, 1]],              // 中央四格：僧侣领地
      fixed: [[1, -2], [2, 0], [0, 2], [-2, 0], [-1, -1]],  // 五格预涂，颜色取自天然解
      note: '中央四格属僧侣领地；另有五格已被预先涂定。' },
  ];

  // 三张图完成时各抛一句
  const LINES = [
    '七格三色，相邻者彼此可辨。Chromatistes 最先涂的是自己的房子——邻居们一眼就认出了它。',
    '十九格。颜色一旦上了身，辨认就不再需要触摸：人们隔着半条街，就能读出对面是谁。',
    '你绕开了僧侣的领地，也守住了官方预先涂定的五格。这座城市第一次能被一眼读懂——而这正是僧侣们最害怕的事。',
  ];
  const INTRO = [
    '颜料就在手边。三个色相，一张地图：相邻的格子不能同色。',
    '第二张图更大：十九格。格数越多，约束缠得越紧。',
    '第三张图。僧侣划走了中央四格作为领地，另有五格已被官方预先涂定——你只能顺着他们的意思往下涂。',
  ];

  /* ---------------- 几何 ---------------- */
  // 中心像素坐标（size = 1）：x = √3·size·(q + r/2)，y = 1.5·size·r
  function hexToUnit(q, r) { return { x: SQ3 * (q + r / 2), y: 1.5 * r }; }

  // 六个角：a = π/180 · (60i − 30)
  function hexPath(ctx, cx, cy, size) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i - 30);
      const x = cx + size * Math.cos(a), y = cy + size * Math.sin(a);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
  }

  // 像素 → 轴坐标（立方坐标取整）
  function pixelToAxial(x, y, size) {
    const fx = (SQ3 / 3 * x - y / 3) / size;
    const fz = (2 / 3 * y) / size;
    const fy = -fx - fz;
    let rx = Math.round(fx), ry = Math.round(fy), rz = Math.round(fz);
    const dx = Math.abs(rx - fx), dy = Math.abs(ry - fy), dz = Math.abs(rz - fz);
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy > dz) ry = -rx - rz;
    else rz = -rx - ry;
    return { q: rx, r: rz };
  }

  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  // WB.roundRect 由第一章挂上；这里留一份兜底，避免加载顺序出问题
  function roundRect(ctx, x, y, w, h, r) {
    if (WB.roundRect) { WB.roundRect(ctx, x, y, w, h, r); return; }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 半径 radius 的六边形区域：max(|q|,|r|,|q+r|) <= radius
  function buildCells(def) {
    const monk = {}, fixed = {};
    def.monk.forEach(p => { monk[p[0] + ',' + p[1]] = true; });
    def.fixed.forEach(p => { fixed[p[0] + ',' + p[1]] = ref(p[0], p[1]); });

    const R = def.radius, cells = [];
    for (let q = -R; q <= R; q++) {
      for (let r = -R; r <= R; r++) {
        if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) > R) continue;
        const k = q + ',' + r;
        const isMonk = !!monk[k];
        const isFixed = Object.prototype.hasOwnProperty.call(fixed, k);
        const u = hexToUnit(q, r);
        cells.push({
          q, r, ux: u.x, uy: u.y,
          monk: isMonk,
          fixed: isFixed,
          color: isMonk ? -1 : (isFixed ? fixed[k] : -1),
          bad: false,
        });
      }
    }
    return cells;
  }

  // 回溯求解器（最多 19 格）。按「候选最少的格子」优先搜索，剪枝足够狠。
  function solvable(cells) {
    const open = cells.filter(c => !c.monk);
    const id = new Map(), nb = [];
    open.forEach((c, i) => id.set(c.q + ',' + c.r, i));
    open.forEach(c => {
      nb.push(NEI.map(d => id.get((c.q + d[0]) + ',' + (c.r + d[1]))).filter(v => v !== undefined));
    });
    const col = open.map(c => c.color);
    let steps = 0;

    function go() {
      if (++steps > 40000) return false;            // 兜底：绝不让页面卡住
      let pick = -1, cand = null;
      for (let i = 0; i < open.length; i++) {
        if (col[i] >= 0) continue;
        const used = [false, false, false];
        nb[i].forEach(j => { if (col[j] >= 0) used[col[j]] = true; });
        const free = [];
        for (let c = 0; c < 3; c++) if (!used[c]) free.push(c);
        if (!free.length) return false;             // 死路，立刻回退
        if (!cand || free.length < cand.length) { pick = i; cand = free; if (free.length === 1) break; }
      }
      if (pick < 0) return true;                    // 全部涂满
      for (let k = 0; k < cand.length; k++) {
        col[pick] = cand[k];
        if (go()) return true;
      }
      col[pick] = -1;
      return false;
    }
    return { ok: go(), steps };
  }

  // 可涂格子是否连通（僧侣领地不能把地图挖碎）
  function connected(cells) {
    const open = cells.filter(c => !c.monk);
    if (!open.length) return true;
    const at = new Map(open.map(c => [c.q + ',' + c.r, c]));
    const seen = new Set();
    const stack = [open[0]];
    seen.add(open[0].q + ',' + open[0].r);
    while (stack.length) {
      const c = stack.pop();
      for (let i = 0; i < NEI.length; i++) {
        const k = (c.q + NEI[i][0]) + ',' + (c.r + NEI[i][1]);
        if (at.has(k) && !seen.has(k)) { seen.add(k); stack.push(at.get(k)); }
      }
    }
    return seen.size === open.length;
  }

  // 冲突格中心的小警告符号（三角形感叹号，纯矢量）
  function drawWarn(ctx, cx, cy, size) {
    const r = Math.max(5, size * .3);
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * .93, cy + r * .74);
    ctx.lineTo(cx - r * .93, cy + r * .74);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,253,247,.94)';
    ctx.fill();
    ctx.strokeStyle = '#b0432c';
    ctx.lineWidth = Math.max(1.2, size * .045);
    ctx.stroke();

    ctx.strokeStyle = '#b0432c';
    ctx.lineWidth = Math.max(1.4, size * .05);
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * .34);
    ctx.lineTo(cx, cy + r * .18);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy + r * .46, Math.max(1.1, size * .045), 0, TAU);
    ctx.fillStyle = '#b0432c';
    ctx.fill();
  }

  /* ---------------- 场景 ---------------- */
  WB.scene({
    id: 'ch4',
    num: '第四章',
    title: '色彩革命',
    short: '给平面国上色',
    source: '原著 §8–§10 · 论古代着色的习俗与色彩叛乱的镇压',
    epigraph: '「颜色一旦上了身，便再没有人需要去『触摸』他。」',
    brief: [
      '一位名叫 Chromatistes 的五边形偶然发现了颜料的配法。他先涂自己的房子，再涂奴隶，再涂父辈子孙，最后涂了自己。',
      '涂色之后，再没有人需要去「触摸」他——颜色让阶级一眼可见。视觉辨认的技艺、几何学与静力学，从此一起衰落。',
      '三张地图，三种色相。规则只有一条：相邻的两格不能同色。颜色若分不清相邻者，就毫无意义。',
      '第三张图上，僧侣们已经划走了自己的领地，还有几格被官方预先涂定。',
    ],
    goal: '用三种色相涂满地图，让相邻者彼此可辨',
    keys: [
      ['1 2 3', '选择色相'],
      ['0', '橡皮'],
      ['R', '重置本图'],
    ],

    create(api) {
      const S = {
        mi: 0,                 // 当前地图
        cells: [],             // 当前地图的格子
        tool: 0,               // 0..2 色相，3 橡皮
        t: 0,
        doneMap: false,        // 本图是否已完成
        doneMaps: 0,           // 累计完成张数（统计用）
        nextAt: 0,             // 自动进入下一张的时刻
        finished: false,
        pulse: 0, pulseT: 0,
        hover: null,
        paints: 0, resets: 0,
        saidMonk: false, saidFixed: false,
        solved: [],
      };

      const FS = (v, mn) => Math.max(mn || 10, v * api.s);

      /* ---------- 初始化自查：每张图都必须有解，且挖掉僧侣领地后不能碎 ---------- */
      S.solved = MAPS.map(m => {
        const probe = buildCells(m);
        if (!connected(probe)) console.warn('[ch4] 地图的可涂格子不连通：', m.radius, m.monk);
        const r = solvable(probe);
        if (!r.ok) console.warn('[ch4] 地图无解（三着色不存在）：', m.radius, m.monk, m.fixed);
        return r.ok;
      });
      if (!S.solved[2]) console.warn('[ch4] 第三张图（含预涂固定格）无解。');

      /* ---------- HUD ---------- */
      const swatches = HUES.map((h, i) => {
        const b = api.el('button', 'swatch');
        b.type = 'button';
        b.style.background = h.hex;
        b.title = h.name + '（按 ' + (i + 1) + '）';
        b.setAttribute('aria-label', h.name + '，按 ' + (i + 1));
        b.addEventListener('click', ev => { ev.preventDefault(); setTool(i); });
        api.hud.appendChild(b);
        return b;
      });

      const eraser = api.el('button', 'swatch');
      eraser.type = 'button';
      eraser.textContent = '擦';
      eraser.title = '橡皮（按 0）';
      eraser.setAttribute('aria-label', '橡皮，按 0');
      eraser.style.background = '#fffdf7';
      eraser.style.color = '#837b6c';
      eraser.style.fontSize = '13px';
      eraser.style.lineHeight = '1';
      eraser.style.backgroundImage = 'repeating-linear-gradient(45deg, rgba(28,25,21,.13) 0 3px, transparent 3px 7px)';
      eraser.addEventListener('click', ev => { ev.preventDefault(); setTool(TOOL_ERASER); });
      api.hud.appendChild(eraser);

      api.hud.appendChild(api.el('div', 'grow'));
      const info = api.el('span', 'hintline', '');
      api.hud.appendChild(info);
      api.button('重置本图', () => resetMap(true));

      // silent：初始化时只同步选中态，不出声
      function setTool(i, silent) {
        const same = S.tool === i;
        S.tool = i;
        swatches.forEach((b, k) => b.classList.toggle('on', k === i));
        eraser.classList.toggle('on', i === TOOL_ERASER);
        if (!same && !silent) api.sfx(i === TOOL_ERASER ? 'drop' : 'pick');
      }

      function syncHud() {
        const open = S.cells.filter(c => !c.monk);
        const filled = open.filter(c => c.color >= 0).length;
        info.textContent = '第 ' + (S.mi + 1) + ' / ' + MAPS.length + ' 张地图 · 已涂 '
          + filled + ' / ' + open.length;
      }

      function resetMap(announce) {
        S.cells = buildCells(MAPS[S.mi]);
        S.doneMap = false; S.nextAt = 0; S.pulse = 0; S.pulseT = 0;
        S.hover = null;
        S.saidMonk = false; S.saidFixed = false;
        if (announce) { S.resets++; api.say('你把颜料刮掉，重新开始这张图。'); }
        refresh();
        syncHud();
      }

      // 重算冲突：相邻同色的两格都标记
      function refresh() {
        const at = new Map();
        S.cells.forEach(c => at.set(c.q + ',' + c.r, c));
        S.cells.forEach(c => { c.bad = false; });
        S.cells.forEach(c => {
          if (c.monk || c.color < 0) return;
          for (let i = 0; i < NEI.length; i++) {
            const n = at.get((c.q + NEI[i][0]) + ',' + (c.r + NEI[i][1]));
            if (n && !n.monk && n.color === c.color) { c.bad = true; n.bad = true; }
          }
        });
      }

      function paint(c) {
        if (!c || S.doneMap) return;
        if (c.monk) {
          api.sfx('drop');
          if (!S.saidMonk) {
            S.saidMonk = true;
            api.say('僧侣的领地。这里的格子不上色——他们的身份，不需要被看清。');
          }
          return;
        }
        if (c.fixed) {
          api.sfx('drop');
          if (!S.saidFixed) {
            S.saidFixed = true;
            api.say('这几格由官方预先涂定，写着「封」。你要做的是顺着它们，把剩下的格子涂完。');
          }
          return;
        }
        const v = S.tool === TOOL_ERASER ? -1 : S.tool;
        if (c.color === v) return;
        c.color = v;
        S.paints++;
        api.sfx(v < 0 ? 'drop' : 'tick');
        refresh();
        syncHud();
        checkDone();
      }

      function checkDone() {
        if (S.doneMap || S.finished) return;
        const open = S.cells.filter(c => !c.monk);
        for (let i = 0; i < open.length; i++) {
          if (open[i].color < 0 || open[i].bad) return;   // 还有空格或有冲突
        }
        S.doneMap = true; S.doneMaps++; S.pulseT = 0; S.pulse = 0;
        S.nextAt = S.t + 1.4;
        api.sfx('ok');
        api.say(LINES[S.mi]);
      }

      /* ---------- 布局与命中 ---------- */
      function layout(W, H) {
        const R = MAPS[S.mi].radius;
        const padX = Math.max(12, Math.min(30 * api.s, W * .06));
        const padT = Math.max(34, Math.min(56 * api.s, H * .15));
        const padB = Math.max(24, Math.min(40 * api.s, H * .11));
        const availW = Math.max(60, W - padX * 2);
        const availH = Math.max(60, H - padT - padB);
        // 地图外框：宽 √3·size·(2R+1)，高 size·(3R+2)
        const size = Math.min(availW / (SQ3 * (2 * R + 1)), availH / (3 * R + 2));
        return { size, cx: W / 2, cy: padT + availH / 2 };
      }

      function pick(x, y) {
        const L = layout(api.w, api.h);
        const a = pixelToAxial(x - L.cx, y - L.cy, L.size);
        for (let i = 0; i < S.cells.length; i++) {
          const c = S.cells[i];
          if (c.q !== a.q || c.r !== a.r) continue;
          const d = Math.hypot(x - (L.cx + c.ux * L.size), y - (L.cy + c.uy * L.size));
          return d <= L.size * 1.02 ? c : null;          // 落在格子外的小缝里就忽略
        }
        return null;
      }

      /* ---------- 开篇 ---------- */
      resetMap(false);
      setTool(0, true);
      api.say('你手上是一份颜料、三张地图，和一条规则：相邻的格子不能同色。');
      api.say(INTRO[0]);

      return {
        state() {
          const open = S.cells.filter(c => !c.monk);
          let filled = 0, bad = 0;
          open.forEach(c => { if (c.color >= 0) filled++; if (c.bad) bad++; });
          return {
            map: S.mi + 1,
            maps: MAPS.length,
            doneMaps: S.doneMaps,
            cells: open.length,
            filled,
            conflicts: bad,
            tool: S.tool,
            paints: S.paints,
            resets: S.resets,
            seconds: Math.round(S.t * 10) / 10,
            solvable: S.solved.join(','),
            mapDone: !!S.doneMap,
            finished: !!S.finished,
          };
        },

        /* 调试出口：把每个格子的屏幕坐标交出去，自动化验收靠它点击 */
        debugCells() {
          const L = layout(api.w, api.h);
          return S.cells.map(c => ({
            q: c.q, r: c.r,
            x: Math.round(L.cx + c.ux * L.size),
            y: Math.round(L.cy + c.uy * L.size),
            monk: !!c.monk, fixed: !!c.fixed, color: c.color,
          }));
        },

        key(code, down, rep) {
          if (!down || rep) return;
          const T = { Digit1: 0, Numpad1: 0, Digit2: 1, Numpad2: 1, Digit3: 2, Numpad3: 2, Digit0: 3, Numpad0: 3 };
          if (Object.prototype.hasOwnProperty.call(T, code)) { setTool(T[code]); return; }
          if (code === 'KeyR') resetMap(true);
        },

        update(dt) {
          S.t += dt;

          // 完成一张图时的短暂提亮脉冲
          if (S.doneMap) {
            S.pulseT += dt;
            const k = U.clamp(1 - S.pulseT / .95, 0, 1);
            S.pulse = k * k * (.72 + .28 * Math.cos(S.pulseT * 15));
          } else { S.pulseT = 0; S.pulse = 0; }

          // 1.4 秒后自动进入下一张
          if (S.doneMap && !S.finished && S.t >= S.nextAt) {
            if (S.mi < MAPS.length - 1) {
              S.mi++;
              resetMap(false);
              api.sfx('page');
              api.say(INTRO[S.mi]);
            } else {
              S.finished = true;
              api.complete('你让颜色重新出现在了平面国。三张地图，没有一格与邻居同色——'
                + '任何人只要看一眼，就能读出对方是谁。而就在你收笔的时候，'
                + '圆形僧侣们的议事厅已经亮起了灯：他们已经注意到这件事了。');
            }
          }
        },

        pointer(e) {
          if (e.type === 'down') paint(pick(e.x, e.y));
          else if (e.type === 'move') S.hover = pick(e.x, e.y);
        },

        draw(ctx, W, H) {
          const L = layout(W, H), size = L.size, HR = size * .96;
          const X = c => L.cx + c.ux * size;
          const Y = c => L.cy + c.uy * size;

          // 纸面
          const bg = ctx.createLinearGradient(0, 0, 0, H);
          bg.addColorStop(0, '#fffdf7'); bg.addColorStop(.55, '#f4efe4'); bg.addColorStop(1, '#ece5d6');
          ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

          // 1) 底色：色相低透明度填充，保留纸感
          for (let i = 0; i < S.cells.length; i++) {
            const c = S.cells[i];
            hexPath(ctx, X(c), Y(c), HR);
            ctx.fillStyle = (c.monk || c.color < 0) ? EMPTY : rgba(HUES[c.color].hex, .30);
            ctx.fill();
          }

          // 2) 斜线纹理：僧侣领地（灰） + 预涂固定格（淡）
          const step = Math.max(4, size * .2);
          for (let i = 0; i < S.cells.length; i++) {
            const c = S.cells[i];
            if (!c.monk && !c.fixed) continue;
            const x = X(c), y = Y(c);
            ctx.save();
            hexPath(ctx, x, y, HR);
            ctx.clip();
            if (c.monk) {                       // 僧侣领地再压一层灰
              ctx.fillStyle = 'rgba(28,25,21,.055)';
              ctx.fillRect(x - size, y - size, size * 2, size * 2);
            }
            ctx.strokeStyle = c.monk ? 'rgba(28,25,21,.17)' : 'rgba(28,25,21,.10)';
            ctx.lineWidth = Math.max(1, size * .035);
            ctx.beginPath();
            for (let k = -2 * size; k <= 2 * size; k += step) {
              ctx.moveTo(x + k, y - size); ctx.lineTo(x + k + 2 * size, y + size);
            }
            ctx.stroke();
            ctx.restore();
          }

          // 3) 描边：冲突 → 朱红虚线
          for (let i = 0; i < S.cells.length; i++) {
            const c = S.cells[i];
            hexPath(ctx, X(c), Y(c), HR);
            if (c.bad) {
              ctx.setLineDash([Math.max(3, size * .15), Math.max(2.5, size * .1)]);
              ctx.strokeStyle = '#b0432c';
              ctx.lineWidth = Math.max(1.6, size * .07);
              ctx.stroke();
              ctx.setLineDash([]);
            } else {
              ctx.strokeStyle = c.monk ? 'rgba(28,25,21,.22)' : 'rgba(28,25,21,.34)';
              ctx.lineWidth = Math.max(1, size * .026);
              ctx.stroke();
            }
          }

          // 4) 完成脉冲：整张地图提亮
          if (S.pulse > .001) {
            for (let i = 0; i < S.cells.length; i++) {
              hexPath(ctx, X(S.cells[i]), Y(S.cells[i]), HR);
              ctx.fillStyle = 'rgba(255,253,247,' + (S.pulse * .5).toFixed(3) + ')';
              ctx.fill();
            }
          }

          // 5) 冲突格的警告符号
          for (let i = 0; i < S.cells.length; i++) {
            const c = S.cells[i];
            if (c.bad) drawWarn(ctx, X(c), Y(c), size);
          }

          // 6) 预涂固定格的「封」
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          for (let i = 0; i < S.cells.length; i++) {
            const c = S.cells[i];
            if (!c.fixed) continue;
            ctx.fillStyle = 'rgba(28,25,21,.6)';
            ctx.font = WB.font(Math.max(10, size * .46), 600, true);
            ctx.fillText('封', X(c), Y(c) + (c.bad ? -size * .34 : size * .02));
          }

          // 7) 僧侣领地标注（画在领地正中）
          const monks = S.cells.filter(c => c.monk);
          if (monks.length) {
            let sx = 0, sy = 0;
            monks.forEach(c => { sx += c.ux; sy += c.uy; });
            const lx = L.cx + (sx / monks.length) * size;
            const ly = L.cy + (sy / monks.length) * size;
            const label = '僧侣领地';
            const f = Math.max(9.5, size * .34);
            ctx.font = WB.font(f, 600);
            const bw = ctx.measureText(label).width + f, bh = f * 1.75;
            roundRect(ctx, lx - bw / 2, ly - bh / 2, bw, bh, bh * .36);
            ctx.fillStyle = 'rgba(255,253,247,.92)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(28,25,21,.16)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = '#837b6c';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(label, lx, ly + f * .04);
          }

          // 8) 鼠标悬停的格子
          if (S.hover && !S.doneMap && !S.hover.monk && !S.hover.fixed) {
            hexPath(ctx, X(S.hover), Y(S.hover), HR);
            ctx.fillStyle = 'rgba(47,77,125,.07)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(47,77,125,.55)';
            ctx.lineWidth = Math.max(1.2, size * .05);
            ctx.stroke();
          }

          // 9) 左上角图号
          const tx = Math.max(12, Math.min(20 * api.s, W * .045));
          const ty = Math.max(10, Math.min(16 * api.s, H * .04));
          ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillStyle = '#4b4439';
          ctx.font = WB.font(FS(13.5), 600, true);
          ctx.fillText('第 ' + (S.mi + 1) + ' / ' + MAPS.length + ' 张地图', tx, ty);
          ctx.fillStyle = 'rgba(28,25,21,.45)';
          ctx.font = WB.font(FS(11.5, 9.5), 500);
          ctx.fillText(MAPS[S.mi].note, tx, ty + FS(13.5) * 1.55);

          // 10) 底部提示
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(28,25,21,.42)';
          ctx.font = WB.font(FS(11.5, 9.5), 500);
          ctx.fillText('相邻的格子不能同色——颜色若分不清相邻者，就毫无意义',
            W / 2, H - Math.max(12, Math.min(20 * api.s, H * .055)));
        },
      };
    },

    stats(S) {
      const st = (S && S.state) ? S.state() : {};
      return [
        { label: '完成地图', value: (st.doneMaps || 0) + ' / 3' },
        { label: '用时', value: Math.round(st.seconds || 0) + ' 秒' },
      ];
    },

    note: {
      kicker: '原著对照',
      title: '颜色为什么必须被禁止',
      lead: '你刚刚做的事，正是平面国僧侣阶层最恐惧的那一件事：让每个人都一眼可辨。',
      body: [
        "原著第八至第十章记载，一位名叫 Chromatistes 的五边形偶然发现了颜料的配法。他先涂自己的房子，再涂奴隶，再涂父辈子孙，最后涂了自己。效果是决定性的：<q>No one now needed to 'feel' him; no one mistook his front for his back.</q>——颜色让阶级一眼可见，辨认从此不再需要触摸。",
        '但颜色真正的危险在于：它让「明暗」这门技艺作废。视觉辨认本是上流社会的学问，如今连最下等的等腰三角形也能一眼分辨出对面是谁——几何学与静力学随之衰落。于是等腰三角形借机提出《普适色彩法案》：<b>每个女人含眼与口的那一半涂红，另一半涂绿</b>，祭司也同样处理。颜色从阶级的炫耀，变成了阶级的制服。',
        '据说这部法案的真正炮制者，是一个「本该在童年就被销毁」的不规则圆形。他想用一条关于颜色的法律，把平面国的形状问题一次性解决掉——而僧侣阶层恰好需要这样一条法律。',
        "结局是 Chromatistes 在讲台上被当场刺死，<q>henceforth the use of Colour was abolished, and its possession prohibited.</q>——颜色被彻底废除，持有颜色即是犯罪；「甚至说出任何一个表示颜色的词，除圆形与合格的科学教师外，都要受到严厉惩罚。」你刚刚做的事，在平面国是要死的。",
      ],
    },
  });
})();
