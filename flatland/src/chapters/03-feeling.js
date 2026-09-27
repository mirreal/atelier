/* ============================================================
   第三章 · 触觉与礼数
   玩法：按住空格「触摸」旋转中的来客，数出他有多少条边，再判断他的阶级。
   在平面国，触觉是妇女与下层阶级辨认彼此的主要方式，上流社会视之为粗鲁；
   而被触摸的人必须完全静止——一次颤抖或一个喷嚏都可能致命。
   ============================================================ */
(function () {
  'use strict';
  const U = WB.util, V = WB.vision;
  const TAU = U.TAU;

  /* ---------------- 本章参数 ---------------- */
  const ROUNDS = 5;
  /* 五轮来客的边数。刻意打乱顺序：若按 3/4/5/6/8 递增出场，选项按钮又固定按
     同样的顺序排列，玩家点两轮就会发现「第 N 轮选第 N 项」，等于白送满分。
     按钮顺序保持规范顺序，靠 SIDES 的置换来打散正确答案的位置。 */
  const SIDES = [5, 3, 8, 4, 6];
  const OPTION_SIDES = [3, 4, 5, 6, 8];          // OPTIONS[i] 对应的边数
  const SPEED = [1.9, 2.4, 2.9, 3.4, 4.0];       // 每轮的角速度（弧度 / 秒）
  const OPTIONS = ['三角形', '正方形', '五边形', '六边形', '八边形及以上'];
  const CLASS_OF = [
    '等边三角形 · 中产阶级',
    '正方形 · 专业人员与绅士',
    '五边形 · 体面人家',
    '六边形 · 贵族的第一级',
    '八边形及以上 · 接近圆形的僧侣阶层',
  ];
  /* 第一位来客那一句要教人「怎么触摸」。桌面是空格，手机是屏幕上那个键 ——
     对手机用户说「按住空格」等于什么都没说。 */
  const holdHint = touch => (touch ? '按住屏幕右下角的「触摸」键' : '按住空格');
  const ROUND_INTRO = touch => ({
    3: '第一位来客。他薄得像一张纸，边缘是一圈折线。' + holdHint(touch) + '，用指尖去数他的角。',
    4: '下一位来客。他一动不动地站着——这是规矩，也是他给你的善意。',
    5: '这一位站得很正。边数越多，棱角越钝，指尖上的感觉也越含糊。',
    6: '到了这一档，你已经该称他一声「老爷」了。',
    8: '最后一位。他几乎摸不出棱角——但别急着把他当成圆形。',
  });
  const FEEDBACK = {
    3: { ok: '三边——等边三角形，中产阶级。平面国里最不稳的一档，再降半级就是等腰三角形。',
         no: '不对。三个角：等边三角形，中产阶级。别小看这一档，所有上升与下降都从它开始。' },
    4: { ok: '四边——正方形，专业人员与绅士。你自己就属于这一档。',
         no: '不对。四条边：正方形，专业人员与绅士。平面国的中坚，也是最容易自满的一档。' },
    5: { ok: '五边——五边形，比绅士再高一档，已经算得上体面人家了。',
         no: '不对。五条边：五边形。在平面国，多一条边就多一分体面。' },
    6: { ok: '六边——六边形。从六条边起，就踏进了贵族的门槛。',
         no: '不对。六条边：六边形，贵族的第一级。再往上，每多一条边，血统就更「圆」一点。' },
    8: { ok: '八边——你数得已经吃力了，而这正是重点：棱角小到看不出来，就成了「圆形」的僧侣阶层。',
         no: '不对。八条边及以上：边多到数不清的时候，他就接近圆了——那是僧侣阶层，平面国的最高处。' },
  };
  const COST_PER_SEC = 3.5;                 // 触摸每秒扣掉的礼数
  const COST_WRONG = 14;                    // 答错扣掉的礼数
  const HALF_FAN = (35 * Math.PI) / 180;    // 指尖扇形的半角
  const FB_TIME = 2.9;                      // 答完到下一轮的停顿（秒）

  /* ---------------- 配色（纸本 · 墨线） ---------------- */
  const PAPER = '#fffdf7', PAPER2 = '#f4efe4', PAPER3 = '#ece5d6';
  const INK = '#1c1915', INK2 = '#4b4439', INK3 = '#837b6c', INK4 = '#a99f8d';
  const RULE = '#ded5c3', ACCENT = '#b0432c', GOLD = '#c08a1e', GREEN = '#4a6b4f';

  // WB.roundRect 由第一章提供；这里留个同名兜底，免得章节加载顺序一变就画崩
  const rr = WB.roundRect || function (ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  };

  WB.scene({
    id: 'ch3',
    num: '第三章',
    title: '触觉与礼数',
    short: '数出边数，认对阶级',
    source: '原著 §5–§6 · 论我们彼此辨认的方法',
    epigraph: '「触觉，在妇女与下层阶级中，是辨认彼此的主要方式。」',
    brief: [
      '下午茶之后，五位来客依次登门。按平面国的规矩，你要靠触觉辨认他们的阶级。',
      '上流社会认为触摸粗鲁——大学里触摸他人是严重过失，初犯停学，再犯开除。可你没有别的办法：视觉辨认是一门要练一辈子的技艺。',
      '触摸对方。指尖的扇形里每扫过一个角，你都会感觉到一次。数清它有几个角——具体按哪里，右侧「操作」里写着。',
      '还要记住那条最要紧的安全规则：被触摸的人必须完全静止。所以你每多摸一秒，都是在赌对方不会颤抖。',
    ],
    goal: '在不过分失礼的前提下，认对 5 位来客的阶级',
    keys: [
      ['空格', '触摸（按住）'],
      ['1–5', '选择阶级'],
      ['R', '重新开始本章'],
    ],

    /* 空格要「按住不放」才数得清边，所以屏幕键标成 hold，视觉上多一条下划线。
       选择阶级的选项本来就是画布下方的按钮，手机上直接点。 */
    touch: {
      actions: [{ code: 'Space', label: '按住触摸', desc: '按住不放，摸清来客的边数', hold: true }],
      note: '按住上面那个键，或者直接按住画面；阶级选项在画布下方。',
    },

    create(api) {
      const S = {
        t: 0,
        round: 0,              // 0..4
        rot: 0,                // 图形当前的旋转角
        phase: 'ask',          // ask | feedback | done
        touching: false,
        touched: false,        // 本轮是否触摸过
        turn: 0,               // 本次触摸累计转过的角度
        tickLocal: 0,          // 起始刻度在图形上的材料方向
        prevRel: [],           // 各顶点相对指尖的方位角（上一帧）
        pulses: [],            // 顶点脉冲
        flash: 0,              // 扇形闪光
        courtesy: 100,
        correct: 0, wrong: 0, answered: false,
        touchTime: 0, totalTouch: 0, roundsPlayed: 0,
        fbT: 0, lastPick: '', lastOk: false,
        canvasHold: false, hudHold: false, needRelease: false,
        warned: false,
      };
      const H = { hold: null, picks: [] };

      /* ---------- 版面：图形永远在画布中央偏上 ---------- */
      function geom() {
        const W = api.w, Hh = api.h;
        const cx = W * 0.5, cy = Hh * 0.46;
        const R = U.clamp(Math.min(W * 0.185, Hh * 0.245), 26, 175);
        return { W: W, H: Hh, cx: cx, cy: cy, R: R, ring: R * 1.4, fanIn: R * 0.5, fanOut: R * 1.15 };
      }

      /* ---------- HUD ---------- */
      function syncHud() {
        const canPick = S.phase === 'ask' && S.touched && !S.touching && !S.answered;
        // 高亮要落在「本轮正确答案」那一格。按钮按 OPTIONS 规范顺序固定排列，
        // 打散发生在 SIDES 上，所以这里必须用 canon()，不能再用 i === S.round。
        const right = canon();
        for (let i = 0; i < H.picks.length; i++) {
          H.picks[i].disabled = !canPick;
          H.picks[i].classList.toggle('on', S.phase === 'feedback' && i === right);
        }
        if (H.hold) {
          H.hold.disabled = S.phase !== 'ask';
          H.hold.classList.toggle('on', S.touching);
        }
      }

      // 「按住不放」的按钮：自己挂指针事件（api.button 只在 click 时触发）
      function buildHud() {
        /* 触屏设备上不建这个按钮：引擎的触控层已经在画布右下角放了一个更大的
           「按住触摸」键，位置更顺手。这里再放一个，除了重复，还会挤占选项按钮的
           横向空间 —— 390px 宽的屏上五个选项本来就要折成三行。
           H.hold 保持 null 是安全的：syncHud 里对它判了空。 */
        if (!api.touch) {
          const hold = api.el('button', 'btn sm', '触摸（按住空格）');
          hold.type = 'button';
          hold.style.touchAction = 'none';
          hold.style.userSelect = 'none';
          const grab = ev => { ev.preventDefault(); if (S.phase !== 'ask') return; S.hudHold = true; syncHud(); };
          const rel = () => { S.hudHold = false; syncHud(); };
          hold.addEventListener('pointerdown', grab);
          hold.addEventListener('pointerup', rel);
          hold.addEventListener('pointerleave', rel);
          hold.addEventListener('pointercancel', rel);
          H.hold = hold;
          api.hud.appendChild(hold);

          api.hud.appendChild(api.el('div', 'grow'));
        }

        OPTIONS.forEach((label, i) => {
          const b = api.el('button', 'btn sm', (i + 1) + ' ' + label);
          b.type = 'button';
          b.addEventListener('click', ev => {
            ev.preventDefault();
            answer(i);
            b.blur();          // 别让空格键又把焦点上的按钮再点一次
          });
          api.hud.appendChild(b);
          H.picks.push(b);
        });
        syncHud();
      }

      /* ---------- 轮次 ---------- */
      function setupRound(quiet) {
        S.phase = 'ask';
        S.touching = false; S.touched = false; S.turn = 0;
        S.answered = false; S.lastPick = ''; S.touchTime = 0;
        S.pulses.length = 0; S.flash = 0; S.fbT = 0; S.warned = false;
        S.prevRel = [];
        S.canvasHold = false; S.hudHold = false;
        // 换轮时手还按在空格上：等松开再算数，免得白白掉礼数
        S.needRelease = api.input.down('Space');
        // 起始刻度：先偏开半个夹角，免得一开始就压在指尖或顶点上
        S.tickLocal = -S.rot + Math.PI / SIDES[S.round];
        syncHud();
        if (!quiet) api.say(ROUND_INTRO(api.touch)[SIDES[S.round]]);
      }

      function beginTouch() {
        S.touching = true;
        S.touched = true;
        S.turn = 0;
        S.tickLocal = -S.rot;      // 刻度落在「此刻指尖对着的那个材料方向」上
        const n = SIDES[S.round];
        S.prevRel = [];
        for (let i = 0; i < n; i++) S.prevRel.push(U.angNorm(S.rot + (i * TAU) / n));
        api.sfx('pick');
        syncHud();
      }

      function endTouch() {
        S.touching = false;
        api.sfx('drop');
        syncHud();
      }

      // 顶点扫过指尖（相对方位角由负转正）时，就是「摸到一个角」
      function scanVertices() {
        const g = geom();
        const n = SIDES[S.round];
        for (let i = 0; i < n; i++) {
          const a = U.angNorm(S.rot + (i * TAU) / n);
          const prev = S.prevRel[i];
          if (prev !== undefined && prev < 0 && a >= 0 && a - prev < 1.0) {
            S.pulses.push({
              x: g.cx + Math.cos(a) * g.R,
              y: g.cy + Math.sin(a) * g.R,
              t: 0, life: 0.8,
            });
            S.flash = 1;
            api.sfx('tick');
          }
          S.prevRel[i] = a;
        }
      }

      // 本轮的正确选项，在 OPTIONS 里的规范下标
      function canon() { return OPTION_SIDES.indexOf(SIDES[S.round]); }

      function answer(i) {
        if (S.phase !== 'ask' || S.answered || S.touching || !S.touched) return;
        S.answered = true;
        S.lastPick = OPTIONS[i];
        // 本轮的正确选项 = 边数 SIDES[S.round] 在 OPTIONS 里的规范下标
        S.lastOk = (i === canon());
        if (S.lastOk) {
          S.correct++;
          api.sfx('ok');
          api.say(FEEDBACK[SIDES[S.round]].ok, 'hi');
        } else {
          S.wrong++;
          S.courtesy = U.clamp(S.courtesy - COST_WRONG, 0, 100);
          api.sfx('bad');
          api.say(FEEDBACK[SIDES[S.round]].no, 'hi');
        }
        S.roundsPlayed = S.round + 1;
        S.phase = 'feedback'; S.fbT = 0;
        syncHud();
      }

      function nextRound() {
        if (S.round >= ROUNDS - 1) { finish(); return; }
        S.round++;
        setupRound(false);
      }

      function finish() {
        S.phase = 'done';
        S.touching = false; S.canvasHold = false; S.hudHold = false;
        syncHud();
        api.complete(
          '五位来客都走了。你的礼数得分是 ' + Math.round(S.courtesy) + ' 分，答对了 ' +
          S.correct + ' / 5 位。在平面国，礼数不是修养，而是一道筛选：大学把触摸他人定为过失，' +
          '于是「早年习惯触觉的人永远无法精通视觉」就成了一道天花板——靠手认人的人，' +
          '一辈子学不会用眼睛认人，也就一辈子进不了那个靠视觉辨认的圈子。'
        );
      }

      function restart() {
        S.round = 0; S.courtesy = 100; S.correct = 0; S.wrong = 0;
        S.totalTouch = 0; S.roundsPlayed = 0; S.answered = false;
        S.pulses.length = 0;
        setupRound(true);
        api.say('你重新站好，请下一位来客上前。', 'hi');
        syncHud();
      }

      /* ---------- 绘图小件 ---------- */
      function drawFinger(ctx, x, y, R, active) {
        const len = R * 0.58, hgt = R * 0.22;
        ctx.beginPath();
        rr(ctx, x - hgt * 0.15, y - hgt * 0.5, len, hgt, hgt * 0.5);
        ctx.fillStyle = active ? PAPER : 'rgba(255,253,247,.7)';
        ctx.fill();
        ctx.strokeStyle = active ? 'rgba(28,25,21,.7)' : 'rgba(28,25,21,.32)';
        ctx.lineWidth = Math.max(1, R * 0.013);
        ctx.stroke();
        // 指节
        ctx.beginPath();
        ctx.moveTo(x + len * 0.5, y - hgt * 0.32);
        ctx.lineTo(x + len * 0.5, y + hgt * 0.32);
        ctx.strokeStyle = 'rgba(28,25,21,.2)';
        ctx.lineWidth = Math.max(1, R * 0.009);
        ctx.stroke();
        // 指腹
        ctx.beginPath(); ctx.arc(x, y, hgt * 0.5, 0, TAU);
        ctx.fillStyle = active ? GOLD : 'rgba(192,138,30,.42)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(28,25,21,.45)';
        ctx.lineWidth = Math.max(1, R * 0.011);
        ctx.stroke();
      }

      function pill(ctx, text, cx, cy, font, fg, bg, border) {
        ctx.font = font;
        const w = ctx.measureText(text).width + 26, h = 25;
        ctx.beginPath();
        rr(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
        ctx.fillStyle = bg; ctx.fill();
        if (border) { ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.stroke(); }
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = fg;
        ctx.fillText(text, cx, cy + 0.5);
      }

      /* ---------- 开场 ---------- */
      buildHud();
      api.say('五位来客依次登门。按平面国的规矩，你要靠触觉辨认他们的阶级。');
      api.say(holdHint(api.touch) + '触摸对方，指尖的扇形里每扫过一个角，你都会感觉到一次——数清它有几个角。');
      api.say('记住：被触摸的人必须完全静止。你每多摸一秒，都是在赌对方不会颤抖。', 'hi');
      setupRound(false);

      return {
        state() {
          const i = U.clamp(S.round, 0, ROUNDS - 1);
          return {
            round: i + 1,
            sides: SIDES[i],
            phase: S.phase,
            touching: !!S.touching,
            touched: !!S.touched,
            answered: !!S.answered,
            turn: Math.round(S.turn * 100) / 100,
            courtesy: Math.round(S.courtesy * 10) / 10,
            correct: S.correct,
            wrong: S.wrong,
            lastPick: S.lastPick,
            lastOk: !!S.lastOk,
            touchTime: Math.round(S.touchTime * 10) / 10,
            totalTouch: Math.round(S.totalTouch * 10) / 10,
            answeredRounds: S.roundsPlayed,
            finished: S.phase === 'done',
          };
        },

        key(code, down) {
          if (!down) return;
          if (code === 'KeyR') { if (S.phase !== 'done') restart(); return; }
          if (S.phase !== 'ask') return;
          for (let i = 0; i < OPTIONS.length; i++) {
            if (code === 'Digit' + (i + 1) || code === 'Numpad' + (i + 1)) { answer(i); return; }
          }
        },

        pointer(e) {
          if (e.type === 'down') {
            if (S.phase === 'ask') { S.canvasHold = true; syncHud(); }
          } else if (e.type === 'up') {
            S.canvasHold = false; syncHud();
          }
        },

        update(dt) {
          S.t += dt;
          S.rot += SPEED[U.clamp(S.round, 0, ROUNDS - 1)] * dt;   // 来客始终匀速旋转

          for (let i = S.pulses.length - 1; i >= 0; i--) {
            const p = S.pulses[i];
            p.t += dt;
            if (p.t >= p.life) S.pulses.splice(i, 1);
          }
          if (S.flash > 0) S.flash = Math.max(0, S.flash - dt * 3.4);

          if (S.phase === 'done') { syncHud(); return; }

          if (S.phase === 'feedback') {
            S.fbT += dt;
            if (S.fbT >= FB_TIME) nextRound();
            return;
          }

          const raw = api.input.down('Space') || S.canvasHold || S.hudHold;
          let want = raw;
          if (S.needRelease) {          // 换轮时手还没松开：等松开再算数
            if (!raw) S.needRelease = false;
            want = false;
          }

          if (want && !S.touching) beginTouch();
          else if (!want && S.touching) endTouch();

          if (S.touching) {
            S.turn += SPEED[S.round] * dt;
            S.touchTime += dt;
            S.totalTouch += dt;
            S.courtesy = U.clamp(S.courtesy - COST_PER_SEC * dt, 0, 100);
            scanVertices();
            if (!S.warned && S.touchTime > 3.2) {
              S.warned = true;
              api.say('你摸得有点久了。平面国的规矩要求被触摸的人完全静止——他一直在忍，而这不是一件容易的事。', 'hi');
            }
          }
          syncHud();
        },

        draw(ctx, W, Hh) {
          const g = geom();
          const R = g.R, cx = g.cx, cy = g.cy;
          const pad = Math.max(14, Math.min(W, Hh) * 0.045);
          const fs = U.clamp(R * 0.09, 10, 14.5);
          const n = SIDES[U.clamp(S.round, 0, ROUNDS - 1)];

          /* ---- 纸面 ---- */
          const bg = ctx.createLinearGradient(0, 0, 0, Hh);
          bg.addColorStop(0, PAPER); bg.addColorStop(.55, PAPER2); bg.addColorStop(1, PAPER3);
          ctx.fillStyle = bg; ctx.fillRect(0, 0, W, Hh);
          const halo = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 2.1);
          halo.addColorStop(0, 'rgba(255,253,247,.92)');
          halo.addColorStop(1, 'rgba(255,253,247,0)');
          ctx.fillStyle = halo; ctx.fillRect(0, 0, W, Hh);

          /* ---- 旋转进度环：本次触摸转满一圈为满 ---- */
          ctx.globalAlpha = S.phase === 'feedback' ? 0.35 : 1;
          ctx.strokeStyle = RULE;
          ctx.lineWidth = Math.max(2, R * 0.026);
          ctx.beginPath(); ctx.arc(cx, cy, g.ring, 0, TAU); ctx.stroke();

          const frac = U.clamp(S.turn / TAU, 0, 1);
          if (frac > 0.001) {
            ctx.strokeStyle = frac >= 0.999 ? GREEN : GOLD;
            ctx.lineWidth = Math.max(2.4, R * 0.036);
            ctx.beginPath();
            ctx.arc(cx, cy, g.ring, -Math.PI / 2, -Math.PI / 2 + frac * TAU);
            ctx.stroke();
          }
          ctx.fillStyle = INK4;
          for (let q = 0; q < 4; q++) {
            const a = -Math.PI / 2 + q * (TAU / 4);
            ctx.beginPath();
            ctx.arc(cx + Math.cos(a) * g.ring, cy + Math.sin(a) * g.ring, Math.max(1.4, R * 0.012), 0, TAU);
            ctx.fill();
          }
          ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.font = WB.font(10.5, 500);
          ctx.fillStyle = INK4;
          ctx.fillText(frac >= 0.999 ? '触摸进度 · 已满一圈' : '触摸进度', cx, cy - g.ring - 7);
          ctx.globalAlpha = 1;

          /* ---- 正多边形 ---- */
          const pts = V.regular(cx, cy, R, n, S.rot);
          ctx.beginPath();
          pts.forEach((p, i) => { i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
          ctx.closePath();
          ctx.fillStyle = 'rgba(28,25,21,.035)';
          ctx.fill();
          ctx.strokeStyle = S.touching ? INK : INK2;
          ctx.lineWidth = S.touching ? Math.max(2.4, R * 0.034) : Math.max(1.4, R * 0.018);
          ctx.stroke();

          /* ---- 指尖扇形（±35°） ---- */
          const fa = (S.touching ? 0.13 : 0.05) + 0.3 * S.flash;
          ctx.beginPath();
          ctx.arc(cx, cy, g.fanOut, -HALF_FAN, HALF_FAN);
          ctx.arc(cx, cy, g.fanIn, HALF_FAN, -HALF_FAN, true);
          ctx.closePath();
          ctx.fillStyle = 'rgba(192,138,30,' + fa.toFixed(3) + ')';
          ctx.fill();
          ctx.strokeStyle = S.touching ? 'rgba(192,138,30,.85)' : 'rgba(192,138,30,.38)';
          ctx.lineWidth = Math.max(1, R * 0.014);
          ctx.stroke();

          /* ---- 起始刻度（随图形旋转，用来判断转满一圈） ---- */
          // 沿该方向的边界半径：顶点方向为 R，边中点方向为内切半径 R·cos(π/n)
          const tickA = S.rot + S.tickLocal;
          const stepA = TAU / n;
          const psi = (((tickA - S.rot) % stepA) + stepA) % stepA - Math.PI / n;
          const rb = (R * Math.cos(Math.PI / n)) / Math.cos(psi);
          const tickHalf = R * 0.17;
          ctx.strokeStyle = GOLD;
          ctx.lineWidth = Math.max(2, R * 0.024);
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(tickA) * (rb - tickHalf), cy + Math.sin(tickA) * (rb - tickHalf));
          ctx.lineTo(cx + Math.cos(tickA) * (rb + tickHalf), cy + Math.sin(tickA) * (rb + tickHalf));
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(cx + Math.cos(tickA) * (rb + tickHalf), cy + Math.sin(tickA) * (rb + tickHalf), Math.max(1.8, R * 0.018), 0, TAU);
          ctx.fillStyle = GOLD; ctx.fill();

          /* ---- 顶点 ---- */
          const vr = Math.max(2.2, R * (S.touching ? 0.032 : 0.024));
          pts.forEach(p => {
            ctx.beginPath(); ctx.arc(p[0], p[1], vr, 0, TAU);
            ctx.fillStyle = S.touching ? GOLD : INK2;
            ctx.fill();
            if (S.touching) {
              ctx.strokeStyle = 'rgba(28,25,21,.45)';
              ctx.lineWidth = Math.max(1, R * 0.009);
              ctx.stroke();
            }
          });

          /* ---- 顶点脉冲 ---- */
          S.pulses.forEach(p => {
            const k = p.t / p.life;
            ctx.beginPath();
            ctx.arc(p.x, p.y, R * (0.08 + k * 0.5), 0, TAU);
            ctx.strokeStyle = 'rgba(192,138,30,' + ((1 - k) * 0.85).toFixed(3) + ')';
            ctx.lineWidth = Math.max(1, R * 0.022 * (1 - k) + 0.7);
            ctx.stroke();
          });

          /* ---- 手指 ---- */
          const fx = cx + g.fanOut;
          drawFinger(ctx, fx, cy, R, S.touching);
          ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          ctx.font = WB.font(Math.max(10, fs * 0.92), 600);
          ctx.fillStyle = S.touching ? GOLD : 'rgba(28,25,21,.36)';
          ctx.fillText('指尖', fx + R * 0.28, cy + R * 0.4);

          /* ---- 左上角读数 ---- */
          ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.font = WB.font(Math.max(13, fs * 1.2), 600, true);
          ctx.fillStyle = INK;
          ctx.fillText('第 ' + (S.round + 1) + ' / 5 位', pad, pad);
          ctx.font = WB.font(Math.max(11, fs * 0.95), 500);
          ctx.fillStyle = INK3;
          const y2 = pad + Math.max(17, fs * 1.55);
          ctx.fillText('礼数 ' + Math.round(S.courtesy) + ' 分', pad, y2);

          const bw = U.clamp(W * 0.16, 76, 120), by = y2 + Math.max(16, fs * 1.4);
          ctx.fillStyle = RULE; ctx.fillRect(pad, by, bw, 3.5);
          ctx.fillStyle = S.courtesy >= 80 ? GREEN : (S.courtesy >= 50 ? GOLD : ACCENT);
          ctx.fillRect(pad, by, bw * U.clamp(S.courtesy / 100, 0, 1), 3.5);

          /* ---- 底部提示 / 反馈 ---- */
          ctx.textAlign = 'center';
          if (S.phase === 'feedback') {
            const ok = S.lastOk;
            const cd = S.round >= ROUNDS - 1
              ? '正在结算礼数…'
              : '下一位来客 · ' + Math.max(0, FB_TIME - S.fbT).toFixed(1) + ' 秒';
            pill(ctx, (ok ? '答对了 · ' : '答错了 · 正确答案：') + OPTIONS[canon()],
                 W / 2, Hh - pad - 47, WB.font(Math.max(12, fs), 600),
                 ok ? '#3c5a41' : '#8d3320',
                 ok ? 'rgba(74,107,79,.12)' : 'rgba(176,67,44,.10)',
                 ok ? 'rgba(74,107,79,.4)' : 'rgba(176,67,44,.35)');
            pill(ctx, CLASS_OF[canon()] + '　' + cd, W / 2, Hh - pad - 16,
                 WB.font(Math.max(11, fs * 0.94), 500), INK2, 'rgba(255,253,247,.9)', RULE);
          } else if (S.phase === 'done') {
            ctx.textBaseline = 'bottom';
            ctx.font = WB.font(Math.max(12, fs), 500);
            ctx.fillStyle = INK3;
            ctx.fillText('五位来客都走了。', W / 2, Hh - pad);
          } else if (S.touching) {
            ctx.textBaseline = 'bottom';
            ctx.font = WB.font(Math.max(12, fs), 600);
            ctx.fillStyle = GOLD;
            ctx.fillText('● 正在触摸 · 松开后从下方按钮作答', W / 2, Hh - pad);
          } else {
            ctx.textBaseline = 'bottom';
            ctx.font = WB.font(Math.max(12, fs), 500);
            ctx.fillStyle = S.touched ? INK2 : INK3;
            ctx.fillText(api.touch ? '按住「触摸」键，数清它有几个角' : '按住空格触摸它，数清它有几个角', W / 2, Hh - pad);
          }
        },
      };
    },

    stats(S) {
      const st = (S && S.state) ? S.state() : {};
      const played = Math.max(1, st.answeredRounds || 0);
      return [
        { label: '礼数', value: Math.round(st.courtesy || 0) + ' 分' },
        { label: '答对', value: (st.correct || 0) + ' / 5' },
        { label: '平均触摸', value: U.fmt((st.totalTouch || 0) / played, 1) + ' 秒' },
      ];
    },

    note: {
      kicker: '原著对照',
      title: '摸出来的阶级',
      lead: '你刚刚数的不是角，是阶级。而这套辨认方式，在平面国本身就是一种失礼。',
      body: [
        '原著第五章把这件事说得很清楚：<q>Feeling is, among our Women and lower classes … the principal test of recognition.</q> 触觉，在妇女与下层阶级中，是辨认彼此的主要方式。对她们来说，「摸」不是粗鲁，而是唯一可靠的知识来源。（省略号处原文有一句插入语，作者在这里顺手把上层阶级也摘了出去——「至于上层阶级，我稍后再说」——而这正是本章要讲的那道分界线。）',
        '也正因为如此，它在上流社会成了禁忌。大学把触摸他人定为严重过失：初犯停学，再犯开除。理由是第六章那句冷静得近乎残酷的判词——<q>None who in early life resort to \'Feeling\' will ever learn \'Seeing\' in perfection.</q> 一个从小靠触摸认人的人，永远无法精通视觉；于是「用什么方式辨认」就变成了一道阶级天花板。',
        '触摸还有一条更硬的安全规则：<b>被触摸的人必须完全静止</b>。平面国的居民都是薄片，棱角就是刀刃；被摸的人只要一颤、一个喷嚏，就可能把对方刺穿。作者的祖先就因为在被一个多边形触碰时抖了一下，酿成事故，家族因此被降了一级半——这条规则不是礼貌，是保命。',
        '而阶级本身就是一道边的阶梯：等边三角形是中产阶级，正方形是专业人员与绅士，五边形更高，六边形起进入贵族；边数一路加上去，直到棱角小得看不出来——那就是「圆形」的僧侣阶层，平面国的最高处。',
      ],
    },
  });
})();
