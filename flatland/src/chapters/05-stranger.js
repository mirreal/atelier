/* ============================================================
   第五章 · 陌生人
   玩法：先亲手拖动球体穿越平面，再从截面序列推断立体形状。
   平面国人的全部证据，只有「一个圆在长大、缩小、消失」。
   ============================================================ */
(function () {
  'use strict';
  const U = WB.util, V = WB.vision, M = WB.m3, RR = WB.roundRect;

  const ZMIN = -1.9, ZMAX = 1.9;
  const EYE_X = 0, EYE_Y = -1.75;   // A. 方形站的位置

  const SOLIDS = {
    sphere: { name: '球', build: () => M.sphere(1.0, 28, 20) },
    cylinder: { name: '圆柱', build: () => M.cylinder(1.0, 2.6, 32) },
    cone: { name: '圆锥', build: () => M.cone(1.0, 2.6, 32, true) },
    cube: { name: '立方体', build: () => M.xform(M.box(1.7, 1.7, 1.7), M.alignZ([1, 1, 1])) },
    tetra: { name: '正四面体', build: () => M.tetra(2.6) },
  };

  const ROUNDS = [
    {
      solid: 'sphere', answer: 1,
      options: ['圆柱', '球', '圆锥', '正四面体'],
      why: '只有球会给出「点 → 长大 → 缩小 → 点」这样两端都平滑的截面序列。它在两端是渐渐化为乌有的，而不是突然消失。',
    },
    {
      solid: 'cylinder', answer: 2,
      options: ['球', '圆锥', '圆柱', '立方体'],
      why: '截面一出现就是完整的圆，大小始终不变，然后在某一瞬间整个消失——因为圆柱的两个端面是平的。',
    },
    {
      solid: 'cube', answer: 3,
      options: ['正四面体', '圆柱', '球', '立方体'],
      why: '它沿着体对角线穿过你的平面：先是三角形，中间展开成六边形，再收回三角形。原著插图里那个被剖开的立方体，正是这个样子。',
    },
    {
      solid: 'cone', answer: 0,
      options: ['圆锥', '球', '圆柱', '立方体'],
      why: '截面从一点开始长大，到最大的那一刻突然消失——因为它有一个平坦的底面。它和球的区别，只在于消失的方式。',
    },
  ];

  function radOf(cross) {
    if (!cross || cross.length < 3) return 0;
    let cx = 0, cy = 0;
    cross.forEach(p => { cx += p[0]; cy += p[1]; });
    cx /= cross.length; cy /= cross.length;
    let r = 0;
    cross.forEach(p => { r = Math.max(r, Math.hypot(p[0] - cx, p[1] - cy)); });
    return r;
  }
  function centroid(cross) {
    let cx = 0, cy = 0;
    cross.forEach(p => { cx += p[0]; cy += p[1]; });
    return [cx / cross.length, cy / cross.length];
  }

  WB.scene({
    id: 'ch5',
    num: '第五章',
    title: '陌生人',
    short: '从截面推断立体',
    source: '原著 §15–§17 · 来自空间国的陌生人',
    epigraph: '「不，不是向北；是向上——彻底离开平面国。」',
    brief: [
      '1999 年的最后一夜。你坐在妻子身旁，房间里忽然多了一个存在。',
      '你看见的，是一个圆。它出现了，长大，缩小，消失。过一会儿，它又出现了。',
      '它说它「是许多圆合而为一」。它说它可以从上方看见你锁着的碗柜里面。',
      '你只有一条线索：那个圆在出现、长大、消失之间留下的形状序列。',
    ],
    goal: '从截面序列推断出穿过你平面的四种立体',
    keys: [
      ['↑ / ↓', '拖动立体穿越平面'],
      ['拖动滑块', '手动控制高度'],
      ['点击选项', '作答'],
    ],

    touch: {
      pad: 'ud',
      padLabels: { up: '升高', down: '降低' },
      note: '也可以拖动画布下方的滑块，或直接在画面上上下拖动。',
    },

    create(api) {
      const S = {
        phase: 'demo', t: 0, phaseT: 0,
        z: ZMIN, dir: 1, pause: 0, auto: true,
        round: 0, chosen: -1, correct: 0,
        slider: null, autoBtn: null, optBtns: [], beats: {}, transits: 0,
      };

      let mesh = null, meshKey = '';
      function currentSolid() { return SOLIDS[S.phase === 'demo' ? 'sphere' : ROUNDS[S.round].solid]; }
      function ensureMesh() {
        const key = S.phase === 'demo' ? 'sphere' : ROUNDS[S.round].solid;
        if (meshKey !== key) { mesh = SOLIDS[key].build(); meshKey = key; }
        return mesh;
      }
      function crossAt(z) { return M.slice(ensureMesh(), z); }

      /* ---------- HUD ---------- */
      function clearHud() { api.hud.innerHTML = ''; S.slider = null; S.autoBtn = null; S.optBtns = []; }
      function buildDemoHud() {
        clearHud();
        const wrap = api.el('div', 'seg');
        wrap.style.padding = '0';
        const lab = api.el('span', 'hintline', '高度');
        api.hud.appendChild(lab);
        const sl = api.el('input');
        sl.type = 'range'; sl.min = '0'; sl.max = '100'; sl.step = '1';
        sl.style.width = 'min(220px, 42vw)';
        sl.setAttribute('aria-label', '让立体穿越平面的高度');
        S.slider = sl;
        sl.addEventListener('input', () => {
          S.auto = false; S.pause = 0;
          S.z = ZMIN + (Number(sl.value) / 100) * (ZMAX - ZMIN);
          if (S.autoBtn) S.autoBtn.classList.remove('on');
          syncAria();
        });
        api.hud.appendChild(sl);
        const ab = api.button('自动穿越', b => {
          S.auto = !S.auto; b.classList.toggle('on', S.auto);
        }, 'on');
        S.autoBtn = ab;
        api.hud.appendChild(api.el('div', 'grow'));
        api.button('开始推断 →', () => { if (S.phase === 'demo') toGuess(); });
        syncAria();
      }
      function syncAria() {
        if (!S.slider) return;
        S.slider.setAttribute('aria-valuetext', '高度 ' + U.fmt(S.z, 2) + '（范围 -1.9 到 1.9）');
      }
      function buildGuessHud() {
        clearHud();
        const R = ROUNDS[S.round];
        api.hud.appendChild(api.el('span', 'hintline', '它是什么？'));
        R.options.forEach((name, i) => {
          const b = api.button(name, () => answer(i));
          S.optBtns.push(b);
        });
      }
      function buildRevealHud() {
        clearHud();
        const last = S.round >= ROUNDS.length - 1;
        api.hud.appendChild(api.el('span', 'hintline',
          S.chosen === ROUNDS[S.round].answer ? '答对了。' : '不对——正确答案是「' + SOLIDS[ROUNDS[S.round].solid].name + '」。'));
        api.hud.appendChild(api.el('div', 'grow'));
        api.button(last ? '结束这一夜 →' : '下一种 →', () => {
          if (last) {
            api.complete('你答对了 ' + S.correct + ' / 4。你仍然无法理解「上方」，但你已经开始怀疑：你所看见的形状，也许只是某个更大之物的一个截面。');
          } else {
            S.round++; S.phase = 'guess'; S.phaseT = 0; S.chosen = -1; S.z = ZMIN; S.dir = 1; S.pause = 0;
            buildGuessHud();
          }
        });
      }

      function toGuess() {
        S.phase = 'guess'; S.phaseT = 0; S.round = 0; S.chosen = -1;
        S.z = ZMIN; S.dir = 1; S.pause = 0; meshKey = '';
        buildGuessHud();
        api.say('球体说：「我确实在某种意义上是一个圆，而且是比平面国任何圆都更完美的圆；但更准确地说，我是许多圆合而为一。」', 'hi');
        api.say('现在换你来做这件事：只看截面，说出它是什么。');
      }
      function answer(i) {
        if (S.phase !== 'guess') return;
        S.chosen = i;
        const R = ROUNDS[S.round];
        if (i === R.answer) { S.correct++; api.sfx('ok'); } else api.sfx('bad');
        S.phase = 'reveal'; S.phaseT = 0;
        api.say(R.why, i === R.answer ? '' : 'hi');
        buildRevealHud();
      }

      api.say('夜里，你感到房间里多了一个存在——你看不见它，但你能感觉到。');
      buildDemoHud();

      /* ---------- 面板 ---------- */
      function panelBox(ctx, r, title, sub) {
        RR(ctx, r.x, r.y, r.w, r.h, 8);
        ctx.fillStyle = '#fffdf7'; ctx.fill();
        ctx.strokeStyle = 'rgba(28,25,21,.18)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.font = WB.font(11.5, 600); ctx.fillStyle = 'rgba(28,25,21,.5)';
        ctx.fillText(title, r.x + 11, r.y + 9);
        if (sub) {
          ctx.textAlign = 'right'; ctx.font = WB.font(10.5, 500);
          ctx.fillStyle = 'rgba(28,25,21,.34)';
          ctx.fillText(sub, r.x + r.w - 11, r.y + 10);
        }
      }

      function draw3D(ctx, r) {
        panelBox(ctx, r, '空间国的视角', '读者视角 · 平面国人没有');
        ctx.save();
        ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
        ctx.translate(r.x, r.y);
        const cam = M.cam([5.6 * Math.cos(-1.0), 5.6 * Math.sin(-1.0), 3.9], [0, 0, 0], 46, r.w, r.h);

        // 平面
        const q = [[-3, -3, 0], [3, -3, 0], [3, 3, 0], [-3, 3, 0]].map(p => cam.project(p));
        if (q.every(p => p)) {
          ctx.beginPath();
          q.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
          ctx.closePath();
          ctx.fillStyle = 'rgba(236,229,214,.62)'; ctx.fill();
        }
        M.drawGrid(ctx, cam, 3, 0.5, 'rgba(28,25,21,.06)', 'rgba(28,25,21,.12)');

        // 立体
        const mk = ensureMesh();
        M.drawMesh(ctx, cam, mk, {
          face: sh => 'rgba(47,77,125,' + (0.03 + 0.11 * sh).toFixed(3) + ')',
          stroke: 'rgba(28,25,21,.4)', lw: 1, depth: 9,
        });

        // 截面
        const cross = crossAt(S.z);
        if (cross.length >= 3) {
          const pp = cross.map(p => cam.project([p[0], p[1], 0]));
          if (pp.every(p => p)) {
            ctx.beginPath();
            pp.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
            ctx.closePath();
            ctx.fillStyle = 'rgba(192,138,30,.42)'; ctx.fill();
            ctx.strokeStyle = '#c08a1e'; ctx.lineWidth = 1.8; ctx.stroke();
          }
        }

        // A. 方形
        const sq = [[-0.17, -0.17], [0.17, -0.17], [0.17, 0.17], [-0.17, 0.17]]
          .map(p => cam.project([EYE_X + p[0], EYE_Y + p[1], 0]));
        if (sq.every(p => p)) {
          ctx.beginPath();
          sq.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
          ctx.closePath(); ctx.fillStyle = '#1c1915'; ctx.fill();
        }
        ctx.restore();
      }

      function topFrame(r) {
        const pad = 26;
        const k = Math.min((r.w - pad * 2) / 4.4, (r.h - pad * 2 - 16) / 4.4);
        return { k, ox: r.x + r.w / 2, oy: r.y + r.h / 2 + 8 };
      }
      function drawTop(ctx, r, cross, opts) {
        opts = opts || {};
        panelBox(ctx, r, opts.title || '平面（俯视）', opts.sub || '你所处的平面');
        ctx.save();
        ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
        const f = topFrame(r), X = x => f.ox + x * f.k, Y = y => f.oy + y * f.k;

        ctx.strokeStyle = 'rgba(28,25,21,.07)'; ctx.lineWidth = 1;
        for (let v = -2; v <= 2; v += 0.5) {
          ctx.beginPath(); ctx.moveTo(X(v), Y(-2.2)); ctx.lineTo(X(v), Y(2.2)); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(X(-2.2), Y(v)); ctx.lineTo(X(2.2), Y(v)); ctx.stroke();
        }

        if (opts.strobe) {
          const n = 13;
          for (let i = 0; i < n; i++) {
            const z = ZMIN + (i / (n - 1)) * (ZMAX - ZMIN);
            const c = crossAt(z);
            if (c.length < 3) continue;
            ctx.beginPath();
            c.forEach((p, j) => j ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])));
            ctx.closePath();
            const a = 0.1 + 0.5 * (i / (n - 1));
            ctx.strokeStyle = 'rgba(47,77,125,' + a.toFixed(3) + ')';
            ctx.lineWidth = i === n - 1 ? 2 : 1.1;
            ctx.stroke();
          }
          ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.font = WB.font(10.5, 500); ctx.fillStyle = 'rgba(47,77,125,.75)';
          ctx.fillText('淡→深：自下而上依次留下的截面', r.x + 11, r.y + r.h - 22);
        }

        if (cross && cross.length >= 3) {
          ctx.beginPath();
          cross.forEach((p, i) => i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])));
          ctx.closePath();
          ctx.fillStyle = 'rgba(192,138,30,.38)'; ctx.fill();
          ctx.strokeStyle = '#c08a1e'; ctx.lineWidth = 2; ctx.stroke();
        }

        // 你在这里
        ctx.beginPath();
        ctx.rect(X(-0.17), Y(EYE_Y - 0.17), Math.max(4, 0.34 * f.k), Math.max(4, 0.34 * f.k));
        ctx.fillStyle = '#1c1915'; ctx.fill();
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.font = WB.font(10.5, 600); ctx.fillStyle = 'rgba(28,25,21,.6)';
        ctx.fillText('你在这里', X(0), Y(EYE_Y + 0.34));
        ctx.restore();
      }

      return {
        state() {
          return {
            phase: S.phase, round: S.round, z: Number(S.z.toFixed(3)),
            chosen: S.chosen, correct: S.correct, auto: S.auto,
            crossR: Number(radOf(crossAt(S.z)).toFixed(3)),
          };
        },

        key(code, down) {
          if (!down) return;
          if (code === 'ArrowUp' || code === 'ArrowDown') {
            if (S.phase === 'demo') {
              S.auto = false; if (S.autoBtn) S.autoBtn.classList.remove('on');
              S.z = U.clamp(S.z + (code === 'ArrowUp' ? 0.09 : -0.09), ZMIN, ZMAX);
              if (S.slider) S.slider.value = String(Math.round(((S.z - ZMIN) / (ZMAX - ZMIN)) * 100));
              syncAria();
            }
          }
          if (S.phase === 'guess' && /^Digit[1-4]$/.test(code)) {
            const i = Number(code.slice(5)) - 1;
            if (i < ROUNDS[S.round].options.length) answer(i);
          }
        },

        pointer(e) {
          if (S.phase !== 'demo') return;
          if (e.type === 'down') S.drag = e.y;
          else if (e.type === 'move' && S.drag !== null && S.drag !== undefined) {
            S.auto = false; if (S.autoBtn) S.autoBtn.classList.remove('on');
            S.z = U.clamp(S.z - (e.y - S.drag) * 0.012, ZMIN, ZMAX);
            S.drag = e.y;
            if (S.slider) S.slider.value = String(Math.round(((S.z - ZMIN) / (ZMAX - ZMIN)) * 100));
            syncAria();
          } else if (e.type === 'up') S.drag = null;
        },

        update(dt) {
          S.t += dt; S.phaseT += dt;
          if (S.phase === 'demo' && S.auto) {
            if (S.pause > 0) S.pause -= dt;
            else {
              const prev = S.z;
              S.z += S.dir * 1.05 * dt;
              if (S.z >= ZMAX) { S.z = ZMAX; S.dir = -1; S.pause = 0.7; S.transits++; }
              if (S.z <= ZMIN) { S.z = ZMIN; S.dir = 1; S.pause = 0.7; S.transits++; }
              const wasOn = radOf(crossAt(prev)) > 0.01, isOn = radOf(crossAt(S.z)) > 0.01;
              if (!wasOn && isOn && !S.beats.appear) {
                S.beats.appear = 1;
                api.say('一个圆出现了，就在你的客厅里。');
              }
              if (S.z > 0.55 && !S.beats.grow) { S.beats.grow = 1; api.say('它在长大。'); }
              if (S.dir < 0 && S.z < 0.3 && S.beats.grow && !S.beats.shrink) {
                S.beats.shrink = 1; api.say('它又在缩小。');
              }
              if (wasOn && !isOn && !S.beats.gone) {
                S.beats.gone = 1;
                api.say('它消失了。它并没有离开房间——它只是不再与你的平面相交。');
              }
              if (S.transits >= 2 && !S.beats.hint) {
                S.beats.hint = 1;
                api.say('它还会再出现。你决定记下每一次的形状。', 'hi');
              }
            }
            if (S.slider) S.slider.value = String(Math.round(((S.z - ZMIN) / (ZMAX - ZMIN)) * 100));
            syncAria();
          }
          if (S.phase === 'guess' || S.phase === 'reveal') {
            if (S.pause > 0) S.pause -= dt;
            else {
              S.z += S.dir * (S.phase === 'guess' ? 1.15 : 0.6) * dt;
              if (S.z >= ZMAX) { S.z = ZMAX; S.dir = -1; S.pause = 0.45; }
              if (S.z <= ZMIN) { S.z = ZMIN; S.dir = 1; S.pause = 0.45; }
            }
          }
        },

        draw(ctx, W, H) {
          const stripH = U.clamp(H * 0.3, 86, 158);
          const topH = H - stripH;
          const split = W > 700 ? 0.56 : 0.5;
          const rL = { x: 6, y: 4, w: Math.max(80, W * split - 10), h: topH - 8 };
          const rR = { x: W * split + 4, y: 4, w: Math.max(80, W - W * split - 10), h: topH - 8 };

          const cross = crossAt(S.z);

          if (S.phase === 'demo' || S.phase === 'reveal') draw3D(ctx, rL);
          else drawTop(ctx, rL, cross, { title: '截面记录', sub: '平面国人的全部证据', strobe: true });
          drawTop(ctx, rR, cross, {});

          // 一维视界
          ctx.save();
          ctx.translate(0, topH);
          const segs = V.project([{ pts: cross, tag: 'x' }], EYE_X, EYE_Y, Math.PI / 2, V.FOV);
          V.drawLineView(ctx, W, stripH, segs, {
            cy: stripH * 0.5, segH: U.clamp(stripH * 0.3, 18, 42),
            legend: false, caption: false,
          });
          ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.font = WB.font(11, 500); ctx.fillStyle = 'rgba(28,25,21,.42)';
          ctx.fillText('你看见的东西：一条线', 16, 12);
          ctx.restore();

          // 顶部读数
          ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          ctx.font = WB.font(11.5, 600); ctx.fillStyle = 'rgba(28,25,21,.42)';
          const label = S.phase === 'demo' ? '演示：拖动滑块，让立体穿越平面'
            : S.phase === 'guess' ? '第 ' + (S.round + 1) + ' / 4 种 · 它是什么？'
              : '第 ' + (S.round + 1) + ' / 4 种 · ' + SOLIDS[ROUNDS[S.round].solid].name;
          ctx.fillText(label, W / 2, topH - 2);
        },
      };
    },

    stats(S) {
      const st = S && S.state ? S.state() : {};
      return [
        { label: '答对', value: (st.correct || 0) + ' / 4' },
        { label: '截面推断', value: (st.correct || 0) >= 3 ? '已入门' : '仍需练习' },
      ];
    },

    note: {
      kicker: '原著对照',
      title: '为什么言语一定失败',
      lead: '球体先讲道理，讲不通；最后只能动手。原著第十六、十七章的标题本身就是这个意思。',
      body: [
        '第十六章的标题是「陌生人如何<b>徒劳地</b>试图用言语向我揭示空间国的奥秘」，第十七章是「球体如何言说无果，<b>转而付诸行动</b>」。',
        '球体做的事情是：从 A. 方形锁着的碗柜里取出账簿（他没有开锁，而是从上方「降下来」），又伸手触到 A. 方形的「胃」。原文写道：<q>What you call Solid things are really superficial; what you call Space is really nothing but a great Plane.</q>',
        '本章的谜题就是这件事的可操作版本：平面国人拿到的证据只有一维的截面序列，而「形状」是一个只在更高维度才成立的量。',
        '球体纠正 A. 方形时用的那句话，是整本书的题眼：<q>No, not Northward; upward; out of Flatland altogether.</q>',
      ],
    },
  });
})();
