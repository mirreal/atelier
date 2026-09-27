/* ============================================================
   第二章 · 直线国之梦
   玩法：把线上的任何东西提离这条线，让国王走完他的世界。
   直线国里没有「旁边」这个方向——那是二维生物才有的能力。
   ============================================================ */
(function () {
  'use strict';
  const U = WB.util;
  const TAU = U.TAU;

  const BASE_KING = 46;                 // 国王的身长
  const BASE_SUBS = [22, 26, 30, 32];   // 四名挡路者，各不相同
  const TOTAL = BASE_KING + BASE_SUBS.reduce((a, b) => a + b, 0);

  // 国王被挡住时说的话（轮流用）
  const ANGRY = [
    '国王恼火地喊：「让开！你挡住了朕的路——在这条线上，朕没有旁路可走。」',
    '国王说：「规矩你是知道的：一旦为邻，永为邻里。可你现在必须消失。」',
    '国王说：「站住！你没有第二个方向可以选择，朕也没有。」',
    '国王说：「谁在前面？……是朕的臣民。那就更该让开了。」',
  ];

  WB.scene({
    id: 'ch2',
    num: '第二章',
    title: '直线国之梦',
    short: '带国王走完他的世界',
    source: '原著 §13–§14 · 我如何梦见直线国',
    epigraph: '「他除直线之外既不能移动，也不能看；对于线外的一切，他毫无概念。」',
    brief: [
      '你梦见自己站在一条直线旁。这条线就是直线国：一个只有长度、没有宽度的世界。',
      '直线国的居民都是线段和点。所有人都占据整条线的宽度——因此，任何人在直线国都不可能越过另一个人。',
      '国王正沿着他的世界向右行走。他的两端各有一只眼睛，但除直线之外，他既不能移动，也不能看。',
      '你是二维生物。你可以「向旁边移动」：把线上的东西提起来，让它离开这条线。这是国王绝对无法理解的能力。',
    ],
    goal: '把国王送到直线的最右端',
    keys: [
      ['拖动', '抓起/放下任何物体'],
      ['R', '重新开始本章'],
    ],

    /* 这一章全靠拖动，触摸本来就可用，只需要一句说明 */
    touch: {
      note: '直接用手指把物体拖离那条直线。',
    },

    create(api) {
      /* ---------- 世界里的东西 ---------- */
      const king = {
        kind: 'king', label: '国王', base: BASE_KING, len: BASE_KING,
        x: 0, y: 0, on: true, dragging: false, passed: false, row: 0,
      };
      const subs = ['臣民', '王后', '一名少年', '卫兵'].map((label, i) => ({
        kind: 'sub', label, base: BASE_SUBS[i], len: BASE_SUBS[i],
        x: 0, y: 0, on: true, dragging: false, passed: false, row: i % 2,
      }));
      const OBJS = [king].concat(subs);

      /* ---------- 布局（每帧按画布重算，窗口变化时按比例搬移） ---------- */
      const L = {
        ready: false, W: 0, H: 0, k: 1, ko: 1,
        x0: 0, x1: 0, xEnd: 0, lineY: 0, span: 0, gap: 0,
        stop: 60, snap: 26, pick: 34, lineW: 4, objTh: 9, padY: 30,
      };

      const S = {
        time: 0, moves: 0, done: false,
        drag: null, hold: false,
        kingBlocked: false, blockTarget: null,
        angryTarget: null, angryIdx: 0, lastAngry: -9,
        beats: { lift: false, place: false, passed: false, last: false, kingOff: false },
      };

      const fs = (n, w, serif) => WB.font(Math.max(9, n * L.k), w, serif);

      function layout() {
        const W = api.w, H = api.h, k = api.s;
        const x0 = Math.max(44, W * 0.072);
        const x1 = Math.max(x0 + 60, W - 70);          // 国王中心的目标 ≈ W-70
        const lineY = Math.round(H * 0.5);
        const span = x1 - x0;
        const ko = Math.min(k, span / (TOTAL * 1.25));  // 极窄画布时把物体整体缩小，避免互相压住
        const gap = Math.max(3, (span - TOTAL * ko) / 5);

        if (L.ready && (W !== L.W || H !== L.H)) {
          const sx = span / Math.max(1, L.span);
          const sy = H / Math.max(1, L.H);
          OBJS.forEach(o => {
            o.x = x0 + (o.x - L.x0) * sx;
            o.y = o.on ? lineY : lineY + (o.y - L.lineY) * sy;
          });
        }
        OBJS.forEach(o => { o.len = o.base * ko; });

        L.ready = true;
        L.W = W; L.H = H; L.k = k; L.ko = ko;
        L.x0 = x0; L.x1 = x1; L.xEnd = Math.min(W - 10, x1 + 24 * k);
        L.lineY = lineY; L.span = span; L.gap = gap;
        L.stop = Math.min(60 * k, gap * 0.85);          // 国王的停步距离
        L.snap = U.clamp(26 * k, 15, 30);               // 回到直线上的吸附范围
        L.pick = Math.max(28, 34 * k);                  // 抓起物体的判定半径
        L.lineW = Math.max(2.4, 5 * k);
        L.objTh = Math.max(6, 11 * k);
        L.padY = Math.max(26, 34 * k);
      }

      // 国王在最左端，四名挡路者依次排在他前方
      function place() {
        layout();
        let cur = L.x0;
        OBJS.forEach(o => {
          o.len = o.base * L.ko;
          o.x = cur + o.len / 2;
          o.y = L.lineY;
          o.on = true;
          o.dragging = false;
          o.passed = false;
          cur += o.len + L.gap;
        });
      }

      place();
      api.say('你梦见自己站在一条直线旁。这条线就是直线国——一个只有长度、没有宽度的世界。');
      api.say('国王正沿着他的世界向右行走。他的两端各有一只眼睛，却看不见线外的任何东西。');
      api.say('拖动线上的任何物体，把它提离这条线——这是你作为二维生物才有的能力。');

      /* ---------- 直线国的规矩 ---------- */
      // 两个都在线上的物体，x 区间不许重叠
      function clashAt(o, x) {
        const a0 = x - o.len / 2, a1 = x + o.len / 2;
        for (let i = 0; i < OBJS.length; i++) {
          const b = OBJS[i];
          if (b === o || !b.on) continue;
          const b0 = b.x - b.len / 2, b1 = b.x + b.len / 2;
          if (a0 < b1 - 0.5 && a1 > b0 + 0.5) return b;
        }
        return null;
      }
      // 国王正前方 L.stop 以内、还留在线上的东西
      function blockerAhead() {
        const front = king.x + king.len / 2;
        let best = null, bd = 1e9;
        for (let i = 0; i < subs.length; i++) {
          const b = subs[i];
          if (!b.on || b.x < king.x) continue;
          const d = (b.x - b.len / 2) - front;
          if (d < L.stop && d < bd) { bd = d; best = b; }
        }
        return best;
      }

      /* ---------- 更新 ---------- */
      function stepKing(dt) {
        if (!king.on || S.hold) { S.kingBlocked = false; S.blockTarget = null; return; }
        const b = blockerAhead();
        if (b) {
          S.kingBlocked = true; S.blockTarget = b;
          if (S.angryTarget !== b && S.time - S.lastAngry > 1.4) {
            S.angryTarget = b; S.lastAngry = S.time;
            api.say(ANGRY[S.angryIdx], 'hi');
            S.angryIdx = (S.angryIdx + 1) % ANGRY.length;
          }
          return;
        }
        S.kingBlocked = false; S.blockTarget = null; S.angryTarget = null;
        king.x += 46 * L.k * dt;
        if (king.x > L.x1) king.x = L.x1;
      }

      function checkProgress() {
        subs.forEach(b => {
          if (b.passed) return;
          if (king.x - b.x > (b.len + king.len) / 2) { b.passed = true; api.sfx('point'); }
        });
        const n = subs.filter(b => b.passed).length;

        if (!S.beats.passed && n >= 1) {
          S.beats.passed = true;
          api.say('国王惊魂未定：「你是……莫大的魔术师。」——但他随即拒绝承认「旁边」是一个方向。', 'hi');
        }
        if (!S.beats.last && (n >= 3 || (L.x1 - king.x) < 200 * L.k)) {
          S.beats.last = true;
          api.say('国王说，他会把你的故事写进直线国的编年史——作为「一个无法解释的现象」。', 'hi');
        }
      }

      function checkWin() {
        if (S.done || !king.on) return;
        if (king.x < L.x1 - 0.5) return;
        S.done = true;
        api.sfx('ok');
        api.complete('国王走到了他这条直线的尽头。他承认你是「莫大的魔术师」——却依然坚持你只是一条直线，' +
          '而你说的那些，就像两个与一相加等于五，或者人眼能看见一条直线一样，不可想象。');
      }

      /* ---------- 放下物体 ---------- */
      function land(d) {
        const o = d.obj;
        const near = Math.abs(o.y - L.lineY) < L.snap;

        if (near) {
          o.y = L.lineY;
          if (clashAt(o, o.x)) {
            api.sfx('bad');
            api.toast('直线国不允许两个物体占据同一位置');
            o.x = d.ox; o.y = d.oy;
            // 原位若也已被占，就只能留在二维里
            o.on = d.oon && !clashAt(o, o.x);
            if (!o.on && Math.abs(o.y - L.lineY) < L.snap) {
              o.y = L.lineY + (d.oy >= L.lineY ? 1 : -1) * L.snap * 1.3;
            }
            if (d.moved) S.moves++;
            return;
          }
          o.on = true;
        } else {
          o.on = false;   // 悬在二维里，国王看不见，也不再挡路
        }

        if (d.moved) S.moves++;
        if (o.on !== d.oon) api.sfx(o.on ? 'drop' : 'lift');
        else api.sfx('blip');

        if (d.oon && !o.on && o !== king && !S.beats.lift) {
          S.beats.lift = true;
          api.say('国王惊叫：「你……消失了！」——他看不见线外的任何东西。', 'hi');
          api.say('在他那里，线上的一切就是存在的全部；你把它提起来，它便从世界里除名。');
        }
        if (d.oon && !o.on && o === king && !S.beats.kingOff) {
          S.beats.kingOff = true;
          api.say('国王被提离了他的直线。他既不能移动也不能看——线外的一切，对他都不存在。', 'hi');
        }
        if (o.on && o !== king && !S.beats.place && o.x - o.len / 2 > king.x + king.len / 2) {
          S.beats.place = true;
          api.say('国王愣住了：「它是从哪里来的？」——随即他坚持说：「它一直在那里。这条线上从来只有这些。」', 'hi');
        }
      }

      /* ---------- 重新开始 ---------- */
      function reset() {
        if (S.done) return;
        S.drag = null;
        if (S.hold) { S.hold = false; holdBtn.classList.remove('on'); }
        OBJS.forEach(o => { o.dragging = false; });
        place();
        S.time = 0; S.moves = 0;
        S.kingBlocked = false; S.blockTarget = null;
        S.angryTarget = null; S.angryIdx = 0; S.lastAngry = -9;
        S.beats = { lift: false, place: false, passed: false, last: false, kingOff: false };
        api.sfx('page');
        api.say('你重新开始了这一场梦。国王又站回了直线的最左端。');
      }

      /* ---------- HUD ---------- */
      // 按住不放的按钮：自己挂 pointer 事件（api.button 只在 click 时触发）
      const holdBtn = api.el('button', 'btn sm', '按住 · 国王止步');
      holdBtn.type = 'button';
      holdBtn.title = '按住不放，国王就停在原地，方便你安排这条线';
      function setHold(v) {
        if (S.hold === v) return;
        S.hold = v;
        holdBtn.classList.toggle('on', v);
        if (v) api.sfx('tick');
      }
      holdBtn.addEventListener('pointerdown', e => {
        e.preventDefault();
        try { holdBtn.setPointerCapture(e.pointerId); } catch (err) {}
        setHold(true);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(t =>
        holdBtn.addEventListener(t, () => setHold(false)));
      holdBtn.addEventListener('contextmenu', e => e.preventDefault());
      api.hud.appendChild(holdBtn);

      api.button('重新开始', () => reset());

      /* ---------- 绘制 ---------- */
      function drawObj(ctx, o, looksOn) {
        const h = L.objTh, w = o.len, r = Math.min(h * 0.36, w * 0.4);
        const x = o.x - w / 2, y = o.y - h / 2;

        ctx.save();
        ctx.globalAlpha = looksOn ? 1 : 0.5;
        WB.roundRect(ctx, x, y, w, h, r);
        if (looksOn) {
          ctx.fillStyle = '#1c1915'; ctx.fill();
        } else {
          ctx.setLineDash([5 * L.k, 4 * L.k]);
          ctx.strokeStyle = 'rgba(28,25,21,.85)';
          ctx.lineWidth = Math.max(1.1, 1.6 * L.k);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        if (o.kind === 'king') {
          if (looksOn) {
            ctx.strokeStyle = '#c08a1e';
            ctx.lineWidth = Math.max(1.1, 1.6 * L.k);
            WB.roundRect(ctx, x, y, w, h, r); ctx.stroke();
          }
          // 两端各一只眼睛（原著里国王的两端各有一眼）
          [-1, 1].forEach(d => {
            const ex = o.x + d * (w / 2), er = Math.max(3.2, 5.4 * L.k);
            ctx.beginPath(); ctx.arc(ex, o.y, er, 0, TAU);
            ctx.fillStyle = '#fffdf7'; ctx.fill();
            ctx.strokeStyle = '#2f4d7d';
            ctx.lineWidth = Math.max(1, 1.3 * L.k); ctx.stroke();
            ctx.beginPath(); ctx.arc(ex + d * er * 0.34, o.y, Math.max(1.3, 2.2 * L.k), 0, TAU);
            ctx.fillStyle = '#1c1915'; ctx.fill();
          });
        }

        // 小标签
        ctx.globalAlpha = looksOn ? 1 : 0.62;
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.font = o.kind === 'king' ? fs(12, 600, true) : fs(11, 600);
        ctx.fillStyle = looksOn ? 'rgba(28,25,21,.62)' : 'rgba(28,25,21,.42)';
        ctx.fillText(o.label, o.x, y - (o.row ? 34 : 11) * L.k);
        if (!looksOn) {
          ctx.textBaseline = 'top';
          ctx.font = fs(10, 500);
          ctx.fillStyle = 'rgba(131,123,108,.92)';
          ctx.fillText('国王看不见', o.x, y + h + 7 * L.k);
        }
        ctx.restore();
      }

      return {
        state() {
          layout();
          const passed = subs.filter(b => b.passed).length;
          return {
            time: Math.round(S.time * 10) / 10,
            moves: S.moves,
            passed, total: subs.length,
            kingX: Math.round(king.x), kingY: Math.round(king.y),
            kingLen: Math.round(king.len),
            kingOn: !!king.on, kingBlocked: !!S.kingBlocked,
            lineY: L.lineY, targetX: Math.round(L.x1),
            dragging: S.drag ? S.drag.obj.label : '',
            holding: !!S.hold,
            offLine: OBJS.filter(o => !o.on).length,
            won: !!S.done,
            beats: {
              lift: !!S.beats.lift, place: !!S.beats.place,
              passed: !!S.beats.passed, last: !!S.beats.last,
            },
            subjects: subs.map(b => ({
              label: b.label, x: Math.round(b.x), y: Math.round(b.y),
              on: !!b.on, passed: !!b.passed, len: Math.round(b.len),
            })),
          };
        },

        key(code, down, isRepeat) {
          if (code === 'KeyR' && down && !isRepeat) reset();
        },

        update(dt) {
          S.time += dt;
          layout();
          if (!S.done) stepKing(dt);
          checkProgress();
          checkWin();
        },

        pointer(e) {
          if (e.type === 'down') {
            if (S.drag || S.done) return;
            let best = null, bd = 1e9;
            OBJS.forEach(o => {
              const d = Math.hypot(e.x - o.x, e.y - o.y);
              if (d <= L.pick && d < bd) { bd = d; best = o; }
            });
            if (!best) return;
            S.drag = {
              obj: best, id: e.id, dx: e.x - best.x, dy: e.y - best.y,
              ox: best.x, oy: best.y, oon: best.on, moved: false,
            };
            best.dragging = true;
            best.on = false;            // 拿在手里 = 不在线上，国王可以走过
            api.sfx('pick');
            return;
          }

          const d = S.drag;
          if (!d) return;
          if (d.id !== undefined && e.id !== undefined && d.id !== e.id) return;

          if (e.type === 'move') {
            const o = d.obj;
            o.x = U.clamp(e.x - d.dx, L.x0 + o.len / 2, L.x1);
            o.y = U.clamp(e.y - d.dy, L.padY, api.h - L.padY);
            if (Math.abs(o.x - d.ox) > 2 || Math.abs(o.y - d.oy) > 2) d.moved = true;
          } else if (e.type === 'up') {
            S.drag = null;
            d.obj.dragging = false;
            land(d);
          }
        },

        destroy() {
          if (holdBtn.parentNode) holdBtn.parentNode.removeChild(holdBtn);
          if (againBtn.parentNode) againBtn.parentNode.removeChild(againBtn);
          S.drag = null;
          S.hold = false;
        },

        draw(ctx, W, H) {
          const k = L.k, ly = L.lineY;

          // 纸面
          const bg = ctx.createLinearGradient(0, 0, 0, H);
          bg.addColorStop(0, '#fffdf7'); bg.addColorStop(.55, '#fbf7ec'); bg.addColorStop(1, '#f2ebdb');
          ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

          // 存在只沿着这一条线
          ctx.fillStyle = 'rgba(28,25,21,.028)';
          ctx.fillRect(0, ly - L.objTh * 2.2, W, L.objTh * 4.4);

          // 线的上方与下方，都是非存在
          const off = Math.max(54, H * 0.235);
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(28,25,21,.22)';
          ctx.font = WB.font(U.clamp(W * 0.052, 19, 40), 600, true);
          ctx.fillText('非存在', W / 2, ly - off);
          ctx.fillText('非存在', W / 2, ly + off);

          // 世界：一条粗墨线，两端是断口
          ctx.strokeStyle = '#1c1915'; ctx.lineWidth = L.lineW; ctx.lineCap = 'butt';
          ctx.beginPath(); ctx.moveTo(L.x0, ly); ctx.lineTo(L.xEnd, ly); ctx.stroke();
          ctx.lineCap = 'round';
          [[L.x0, -1, '世界的这一端'], [L.xEnd, 1, '世界的那一端']].forEach(e => {
            const x = e[0], dir = e[1];
            ctx.strokeStyle = 'rgba(28,25,21,.8)';
            ctx.lineWidth = Math.max(1.3, 1.9 * k);
            ctx.beginPath();
            ctx.moveTo(x + dir * 1.5 * k, ly - 11 * k);
            ctx.lineTo(x - dir * 4 * k, ly + 11 * k);
            ctx.stroke();
            ctx.fillStyle = 'rgba(28,25,21,.34)';
            ctx.font = fs(10.5, 500);
            ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            ctx.fillText(e[2], x, ly + 15 * k);
          });

          // 拖动时标出「回到线上」的范围
          if (S.drag) {
            ctx.fillStyle = 'rgba(47,77,125,.05)';
            ctx.fillRect(0, ly - L.snap, W, L.snap * 2);
            ctx.strokeStyle = 'rgba(47,77,125,.26)';
            ctx.lineWidth = 1; ctx.setLineDash([4, 5]);
            ctx.beginPath();
            ctx.moveTo(0, ly - L.snap); ctx.lineTo(W, ly - L.snap);
            ctx.moveTo(0, ly + L.snap); ctx.lineTo(W, ly + L.snap);
            ctx.stroke(); ctx.setLineDash([]);
          }

          // 国王被挡住时，沿直线看过去
          if (S.kingBlocked && S.blockTarget && king.on) {
            const b = S.blockTarget;
            ctx.strokeStyle = 'rgba(176,67,44,.42)';
            ctx.lineWidth = Math.max(1, 1.2 * k);
            ctx.setLineDash([4 * k, 4 * k]);
            ctx.beginPath();
            ctx.moveTo(king.x + king.len / 2, ly);
            ctx.lineTo(b.x - b.len / 2, ly);
            ctx.stroke(); ctx.setLineDash([]);
          }

          // 物体：留在线上的先画，悬在二维里的压在上面
          const looksOn = o => (o.dragging ? Math.abs(o.y - ly) < L.snap : o.on);
          OBJS.slice()
            .sort((a, b) => (looksOn(a) ? 0 : 1) - (looksOn(b) ? 0 : 1))
            .forEach(o => drawObj(ctx, o, looksOn(o)));

          // 顶部进度
          const passed = subs.filter(b => b.passed).length;
          const topY = Math.max(12, 18 * k);
          const label = '已让国王越过 ' + passed + ' / ' + subs.length + ' 个挡路者';
          ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.font = fs(12.5, 600);
          ctx.fillStyle = 'rgba(28,25,21,.6)';
          ctx.fillText(label, L.x0, topY);
          const tw = ctx.measureText(label).width;
          for (let i = 0; i < subs.length; i++) {
            const cx = L.x0 + tw + 16 + i * Math.max(11, 15 * k);
            const cy = topY + Math.max(6, 7 * k);
            ctx.beginPath(); ctx.arc(cx, cy, Math.max(2.6, 3.6 * k), 0, TAU);
            if (i < passed) { ctx.fillStyle = '#4a6b4f'; ctx.fill(); }
            else { ctx.strokeStyle = 'rgba(28,25,21,.3)'; ctx.lineWidth = 1.2; ctx.stroke(); }
          }

          // 底部操作提示
          ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.font = fs(12, 500);
          ctx.fillStyle = 'rgba(28,25,21,.48)';
          const hintY = H - Math.max(9, 13 * k);
          ctx.fillText('拖动任何物体，把它移出这条线', W / 2, hintY);
          if (!king.on) {
            ctx.font = fs(12, 600);
            ctx.fillStyle = 'rgba(176,67,44,.8)';
            ctx.fillText('国王不在他的直线上——把他拖回去', W / 2, hintY - Math.max(15, 21 * k));
          }
        },
      };
    },

    stats(S) {
      const st = (S && S.state) ? S.state() : {};
      return [
        { label: '移动次数', value: (st.moves || 0) + ' 次' },
        { label: '用时', value: Math.round(st.time || 0) + ' 秒' },
      ];
    },

    note: {
      kicker: '原著对照',
      title: '一个无法解释的现象',
      lead: '你刚刚做的事，在直线国是逻辑上不可能的操作：你让一个东西「向旁边移动」了。',
      body: [
        '原著第十三章里，直线国的全部世界就是一条直线，居民都是线段和点；而关键在于——<b>所有人都占据整条线的宽度</b>，' +
          '因此任何人在直线国都不可能越过另一个人。艾勃特用一句话概括了这种处境：<q>Once neighbours, always neighbours.</q>' +
          '「一旦为邻，永为邻里；在他们那里，邻里关系就像我们这里的婚姻。」',
        '第十四章的标题是「我如何在梦中试图解释平面国的性质而未能成功」。A. 方形试图告诉国王：在他这条线之外，' +
          '还有一个「旁边」的方向，那里有宽度、有平面，而他——国王——只是那个平面上的一条线。国王的回答是：' +
          '<q>It is as inconceivable as that two and one should make five, or that the human eye should see a Straight Line.</q>' +
          '这并不愚蠢：国王除直线之外既不能移动也不能看，对线外的一切毫无概念，所以「旁边」在他的语言里根本没有对应之物。',
        '你在这一章里做的每一个动作——把线段提离直线、让它悬在「非存在」里、再放回去——都是同一个论证的演示。' +
          '这也是全书其余部分的预演：当圆球把 A. 方形拉出平面国时，他给出的方向不是「向北」，而是「向上」。',
      ],
    },
  });
})();
