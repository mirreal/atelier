/* ============================================================
   第一章 · 平面国
   玩法：用「一维视界」在平面国里走回家。
   你只有一条线和线上的明暗；按 V 可以切到读者视角（平面国人没有这个能力）。
   ============================================================ */
(function () {
  'use strict';
  const U = WB.util, V = WB.vision;

  const WORLD = { w: 1500, h: 1050 };
  const R_PLAYER = 34;

  function polySquare(cx, cy, side, rot) {
    const h = side / 2, p = [[-h, -h], [h, -h], [h, h], [-h, h]];
    const c = Math.cos(rot || 0), s = Math.sin(rot || 0);
    return p.map(q => [cx + q[0] * c - q[1] * s, cy + q[0] * s + q[1] * c]);
  }
  function closestOnPoly(px, py, pts) {
    let bx = 0, by = 0, bd = 1e9;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const abx = b[0] - a[0], aby = b[1] - a[1];
      const L = abx * abx + aby * aby || 1e-9;
      let t = ((px - a[0]) * abx + (py - a[1]) * aby) / L;
      t = U.clamp(t, 0, 1);
      const cx = a[0] + abx * t, cy = a[1] + aby * t;
      const d = Math.hypot(px - cx, py - cy);
      if (d < bd) { bd = d; bx = cx; by = cy; }
    }
    return { d: bd, x: bx, y: by };
  }
  function insidePoly(px, py, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  WB.roundRect = roundRect;

  WB.scene({
    id: 'ch1',
    num: '第一章',
    title: '平面国',
    short: '用一条线走回家',
    source: '原著 §1–§6 · 论平面国的性质与辨认方法',
    epigraph: '「一切生物与非生物，无论其形状如何，呈现给我们的外观都是一条直线。」',
    brief: [
      '你是 A. 方形，一位体面的中产阶级。今天是 1999 年的最后一天，你要从城郊走回自己的家。',
      '你的视界里没有形状，只有一条水平线，和线上因雾而起的明暗。近的亮，远的暗。',
      '罗盘上有北方——平面国的雨总是从北方来，所以北方是我们唯一可靠的方向。',
      '绕开房屋与行人。撞到一位圆形僧侣，会被课以罚款，还会被记上一笔。',
    ],
    goal: '走到东边的家（罗盘上的红点）',
    keys: [
      ['W / ↑', '前进'],
      ['S / ↓', '后退'],
      ['A D / ← →', '左右转身'],
      ['V', '读者视角（平面国人没有这个能力）'],
    ],

    create(api) {
      const S = {
        px: 150, py: 525, heading: 0,
        bumps: 0, reader: false, readerTime: 0, t: 0,
        lastBump: -9, done: false, msgStep: 0, walking: 0, drag: null, hi: false,
        held: { f: false, b: false, l: false, r: false },
      };

      const houses = [
        { pts: polySquare(400, 250, 130), tag: 'house', label: '住宅' },
        { pts: polySquare(400, 810, 130), tag: 'house' },
        { pts: V.regular(650, 525, 100, 5, -Math.PI / 2), tag: 'house' },
        { pts: V.regular(890, 240, 95, 6, 0), tag: 'house' },
        { pts: V.regular(890, 810, 95, 6, 0), tag: 'house' },
        { pts: polySquare(1100, 525, 120), tag: 'house' },
        { pts: polySquare(650, 130, 100), tag: 'house' },
      ];
      const irregular = { pts: [[760 + 78, 400], [760 + 62 * Math.cos(2.4), 400 + 62 * Math.sin(2.4)],
                                [760 + 70 * Math.cos(4.6), 400 + 70 * Math.sin(4.6)]], tag: 'irregular' };
      const home = { pts: polySquare(1330, 525, 150), tag: 'home' };

      const wanderers = [
        { pts: [], tag: 'priest', x: 1000, y: 400, r: 58, n: 32, vx: 62, vy: 40, rot: 0, spin: .5, label: '圆形僧侣' },
        { pts: [], tag: 'tri', x: 520, y: 380, r: 52, n: 3, vx: -70, vy: 55, rot: 0, spin: .8, label: '等腰三角形' },
        { pts: [], tag: 'pent', x: 1180, y: 250, r: 50, n: 5, vx: 48, vy: -62, rot: 0, spin: .35, label: '五边形' },
      ];
      wanderers.forEach(w => { w.pts = V.regular(w.x, w.y, w.r, w.n, w.rot); });

      function solids() { return houses.concat(wanderers); }
      function allPolys() { return houses.concat(wanderers, [irregular, home]); }

      api.say('你站在城西。家在东方，直线距离约一千一百单位。');
      api.say('按 W 前进。你看不到形状——只有那条线上的明暗。');

      function turnTo() {
        return U.angNorm(V.bearingOf(S.px, S.py, 1330, 525));
      }

      function move(dt) {
        const turn = 2.25 * dt;
        let d = 0;
        if (api.input.down('KeyA') || api.input.down('ArrowLeft') || S.held.l) d -= turn;
        if (api.input.down('KeyD') || api.input.down('ArrowRight') || S.held.r) d += turn;
        S.heading += d;

        const sp = 205 * dt;
        let mv = 0;
        if (api.input.down('KeyW') || api.input.down('ArrowUp') || S.held.f) mv += sp;
        if (api.input.down('KeyS') || api.input.down('ArrowDown') || S.held.b) mv -= sp;
        if (mv) S.walking += dt; else S.walking = 0;
        S.px += Math.cos(S.heading) * mv;
        S.py += Math.sin(S.heading) * mv;
        S.px = U.clamp(S.px, 40, WORLD.w - 40);
        S.py = U.clamp(S.py, 40, WORLD.h - 40);
      }

      function collide() {
        for (let i = 0; i < solids().length; i++) {
          const o = solids()[i];
          const r = closestOnPoly(S.px, S.py, o.pts);
          const inside = insidePoly(S.px, S.py, o.pts);
          if (!inside && r.d >= R_PLAYER) continue;
          let nx, ny;
          if (inside) {
            nx = S.px - r.x; ny = S.py - r.y;
            const L = Math.hypot(nx, ny) || 1;
            nx /= L; ny /= L;
            S.px = r.x + nx * (R_PLAYER + 2); S.py = r.y + ny * (R_PLAYER + 2);
          } else {
            nx = (S.px - r.x) / (r.d || 1); ny = (S.py - r.y) / (r.d || 1);
            S.px = r.x + nx * R_PLAYER; S.py = r.y + ny * R_PLAYER;
          }
          if (S.t - S.lastBump > 0.9) {
            S.lastBump = S.t; S.bumps++;
            api.sfx('bad');
            if (o.tag === 'priest') {
              api.say('你撞上了一位圆形僧侣。他的边缘光滑得没有一丝角度——这是最高贵的血统。', 'hi');
              api.say('按照惯例，你要为这次失礼支付一笔罚款。', 'hi');
            } else if (o.tag === 'tri') {
              api.say('你碰到一位等腰三角形的尖角。底层阶级的角很尖锐，这在平面国是危险的。');
            } else if (o.tag === 'pent') {
              api.say('一位五边形向你致意。你们同为体面人，但他觉得你走得有些急。');
            } else {
              api.say('你撞上了一堵墙。平面国的房子没有屋顶，四面墙就是一整个封闭的世界。');
            }
          }
          break;
        }
      }

      function stepWander(dt) {
        wanderers.forEach(w => {
          w.x += w.vx * dt; w.y += w.vy * dt; w.rot += w.spin * dt;
          if (w.x < 90) { w.x = 90; w.vx = Math.abs(w.vx); }
          if (w.x > WORLD.w - 90) { w.x = WORLD.w - 90; w.vx = -Math.abs(w.vx); }
          if (w.y < 90) { w.y = 90; w.vy = Math.abs(w.vy); }
          if (w.y > WORLD.h - 90) { w.y = WORLD.h - 90; w.vy = -Math.abs(w.vy); }
          w.pts = V.regular(w.x, w.y, w.r, w.n, w.rot);
        });
      }

      /* ---------- 读者视角面板 ---------- */
      function drawReader(ctx, W, H, ph) {
        const pad = 14;
        const pw = W - pad * 2, phh = ph - pad * 2;
        roundRect(ctx, pad, pad, pw, phh, 9);
        ctx.fillStyle = 'rgba(255,253,247,.96)'; ctx.fill();
        ctx.strokeStyle = 'rgba(28,25,21,.22)'; ctx.lineWidth = 1; ctx.stroke();

        const k = Math.min(pw / WORLD.w, phh / WORLD.h) * 0.93;
        const ox = pad + (pw - WORLD.w * k) / 2, oy = pad + (phh - WORLD.h * k) / 2;
        const X = x => ox + x * k, Y = y => oy + y * k;

        ctx.strokeStyle = 'rgba(28,25,21,.1)'; ctx.lineWidth = 1;
        for (let gx = 0; gx <= WORLD.w; gx += 250) { ctx.beginPath(); ctx.moveTo(X(gx), Y(0)); ctx.lineTo(X(gx), Y(WORLD.h)); ctx.stroke(); }
        for (let gy = 0; gy <= WORLD.h; gy += 250) { ctx.beginPath(); ctx.moveTo(X(0), Y(gy)); ctx.lineTo(X(WORLD.w), Y(gy)); ctx.stroke(); }

        function path(pts) {
          ctx.beginPath();
          pts.forEach((p, i) => { i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])); });
          ctx.closePath();
        }
        houses.forEach(h => { path(h.pts); ctx.fillStyle = 'rgba(28,25,21,.07)'; ctx.fill(); ctx.strokeStyle = 'rgba(28,25,21,.6)'; ctx.lineWidth = 1.3; ctx.stroke(); });
        path(home.pts); ctx.fillStyle = 'rgba(74,107,79,.16)'; ctx.fill();
        ctx.strokeStyle = '#4a6b4f'; ctx.lineWidth = 1.8; ctx.stroke();
        ctx.fillStyle = '#3c5a41'; ctx.font = WB.font(11, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('你的家', X(1330), Y(525));

        wanderers.forEach(w => {
          path(w.pts);
          ctx.fillStyle = w.tag === 'priest' ? 'rgba(47,77,125,.18)' : 'rgba(28,25,21,.12)';
          ctx.fill();
          ctx.strokeStyle = w.tag === 'priest' ? '#2f4d7d' : 'rgba(28,25,21,.65)';
          ctx.lineWidth = 1.3; ctx.stroke();
        });

        path(irregular.pts);
        ctx.setLineDash([4, 3]); ctx.strokeStyle = '#b0432c'; ctx.lineWidth = 1.8; ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#b0432c'; ctx.font = WB.font(10.5, 600);
        ctx.fillText('不规则图形', X(760), Y(400) - 46);

        // 玩家
        ctx.save();
        ctx.translate(X(S.px), Y(S.py)); ctx.rotate(S.heading);
        const half = (R_PLAYER * k) * 0.72;
        ctx.beginPath(); ctx.rect(-half, -half, half * 2, half * 2);
        ctx.fillStyle = '#1c1915'; ctx.fill();
        ctx.restore();
        ctx.strokeStyle = 'rgba(176,67,44,.8)'; ctx.lineWidth = 1.4; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(X(S.px), Y(S.py));
        ctx.lineTo(X(S.px + Math.cos(S.heading) * 190), Y(S.py + Math.sin(S.heading) * 190));
        ctx.stroke(); ctx.setLineDash([]);

        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(28,25,21,.55)'; ctx.font = WB.font(11, 500);
        ctx.fillText('读者视角 · 平面国人没有这个能力', pad + 12, pad + 10);
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(176,67,44,.8)';
        ctx.fillText('按 V 关闭', W - pad - 12, pad + 10);
      }

      return {
        state() {
          return {
            px: Math.round(S.px), py: Math.round(S.py), heading: S.heading,
            bumps: S.bumps, reader: S.reader, readerTime: S.readerTime,
            homeDist: Math.round(Math.hypot(S.px - 1330, S.py - 525)),
          };
        },

        key(code, down) {
          if (code === 'KeyV' && down && !api.input.hit('__v')) { /* 由 update 处理更稳 */ }
          if (code === 'KeyV' && down) { /* 在 update 里读 hit */ }
        },

        update(dt) {
          S.t += dt;
          if (api.input.hit('KeyV')) {
            S.reader = !S.reader;
            api.sfx('pick');
            if (S.reader && !S.hi) {
              S.hi = true;
              api.say('你暂时借用了空间国读者的眼睛。平面国人终其一生都没有这个视角。', 'hi');
            }
          }
          if (S.reader) S.readerTime += dt;

          move(dt);
          stepWander(dt);
          collide();

          if (S.t - S.lastBump > 0.9 && S.walking > 3 && S.msgStep === 0) {
            S.msgStep = 1;
            api.say('你走了一会儿。注意看线上的明暗：亮的近，暗的远——这是平面国唯一的距离线索。');
          }

          const dHome = Math.hypot(S.px - 1330, S.py - 525);
          if (dHome < 66 && !S.done) {
            S.done = true;
            api.sfx('ok');
            api.complete('你到家了。这一路上你绕开了房屋、行人和一位圆形僧侣——而你从头到尾，没有「看见」过任何一个形状。');
          }
        },

        pointer(e) {
          if (e.type === 'down') S.drag = { x: e.x, y: e.y };
          else if (e.type === 'move' && S.drag) {
            const dx = e.x - S.drag.x, dy = e.y - S.drag.y;
            S.heading += dx * 0.012;
            const mv = -dy * 1.7;
            S.px += Math.cos(S.heading) * mv; S.py += Math.sin(S.heading) * mv;
            S.drag = { x: e.x, y: e.y };
          } else if (e.type === 'up') S.drag = null;
        },

        draw(ctx, W, H) {
          const polys = allPolys();
          const segs = V.project(polys, S.px, S.py, S.heading, V.FOV);

          if (S.reader) {
            const rh = Math.max(96, H * 0.3);
            ctx.save(); ctx.translate(0, H - rh);
            V.drawLineView(ctx, W, rh, segs, { cy: rh * 0.5, segH: 22, legend: false, caption: false });
            ctx.restore();
            drawReader(ctx, W, H, H - rh);
          } else {
            V.drawLineView(ctx, W, H, segs, { cy: H * 0.56, segH: U.clamp(H * 0.1, 22, 56) });
          }

          // 罗盘
          const cx = W - 62, cy = S.reader ? (H - Math.max(96, H * 0.3)) / 2 : H - 74;
          V.drawCompass(ctx, cx, cy, 38, S.heading, [
            { bearing: turnTo(), color: '#b0432c', label: '家' },
          ]);

          // 距离读数
          ctx.textAlign = 'right'; ctx.textBaseline = 'top';
          ctx.font = WB.font(11.5, 500); ctx.fillStyle = 'rgba(28,25,21,.42)';
          const d = Math.hypot(S.px - 1330, S.py - 525);
          ctx.fillText('离家 ' + Math.round(d) + ' 单位', W - 18, S.reader ? H - 26 : 40);
        },
      };
    },

    stats(S) {
      const st = S && S.state ? S.state() : {};
      return [
        { label: '撞到别人', value: (st.bumps || 0) + ' 次' },
        { label: '用读者视角', value: (st.readerTime || 0) > 0.5 ? Math.round(st.readerTime) + ' 秒' : '没用过' },
      ];
    },

    note: {
      kicker: '原著对照',
      title: '平面国人的眼睛，和那场色彩革命',
      lead: '你刚刚用「明暗」导航了一整章。这正是艾勃特设计的核心机制。',
      body: [
        '原著第二章把雾说成平面国的恩赐：若没有雾，所有线都同样清晰，一切形状都无法区分。有了雾，边缘便「迅速隐入昏暗」——边数越少，两端暗得越快；边数越多、越接近圆，两端暗得越慢。',
        '但视觉辨认是<b>上流社会的技艺</b>。原著第五章写道：「触觉，在妇女与下层阶级中，是辨认彼此的主要方式。」而且「早年习惯触觉的人，永远无法精通视觉」——所以大学里触摸他人是严重过失，初犯停学，再犯开除。',
        '这也解释了第八章至第十章那场<b>色彩革命</b>：一位叫 Chromatistes 的五边形发现了颜料，涂色之后「再没有人需要去『触摸』他」。视觉技艺、几何学与静力学随之衰落，等腰三角形借机提出《普适色彩法案》。结局是 Chromatistes 被当场刺死，颜色被彻底禁止——「甚至说出任何一个表示颜色的词，除圆形与合格的科学教师外，都要受到严厉惩罚。」',
        '你在这一章里能随时按 V 俯视。平面国人不能。这不是能力差距，这是这本书全部悲剧的来源。',
      ],
    },
  });
})();
