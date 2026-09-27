/* ============================================================
   平面国视觉库 —— 把二维世界投影到「一条线」上
   这是全书的核心：平面国居民只能看见线，靠明暗推断远近与形状。
   ============================================================ */
(function () {
  'use strict';
  const U = window.WB.util;
  const V = (window.WB.vision = {});

  V.FOV = (150 * Math.PI) / 180;   // 视野张角（平面国人只有正前方）
  V.FAR = 1000;                    // 明暗衰减的参考距离

  // 亮度即距离：越近越亮。返回 0..1
  V.bri = function (d, far) {
    const f = far || V.FAR;
    const t = U.clamp(1 - d / f, 0, 1);
    return 0.028 + 0.972 * Math.pow(t, 1.45);
  };

  /* 把一组多边形投影成视线上的线段
     polys: [{pts:[[x,y],..], tag}]，tag 仅用于渲染区分
     返回 [{a,b,da,db,d,lo,hi,tag}]，a/b 为相对朝向的方位角（弧度） */
  V.project = function (polys, px, py, heading, fov) {
    const half = (fov || V.FOV) / 2;
    const out = [];
    for (let k = 0; k < polys.length; k++) {
      const poly = polys[k], pts = poly.pts, n = pts.length;
      for (let i = 0; i < n; i++) {
        const A = pts[i], B = pts[(i + 1) % n];
        const ax = A[0] - px, ay = A[1] - py, bx = B[0] - px, by = B[1] - py;
        const d1 = Math.hypot(ax, ay), d2 = Math.hypot(bx, by);
        if (d1 < 0.001 && d2 < 0.001) continue;
        const mx = (A[0] + B[0]) / 2 - px, my = (A[1] + B[1]) / 2 - py;
        const mb = U.angNorm(Math.atan2(my, mx) - heading);
        // 把两端点的方位角「解缠」到中点附近，避免跨越 ±π 时算错跨度
        let b1 = mb + U.angNorm(Math.atan2(ay, ax) - heading - mb);
        let b2 = mb + U.angNorm(Math.atan2(by, bx) - heading - mb);
        const lo = Math.min(b1, b2), hi = Math.max(b1, b2);
        if (hi < -half || lo > half) continue;
        const cl = Math.max(lo, -half), ch = Math.min(hi, half);
        const span = (b2 - b1) || 1e-6;
        const t1 = U.clamp((cl - b1) / span, 0, 1), t2 = U.clamp((ch - b1) / span, 0, 1);
        out.push({
          a: cl, b: ch,
          da: d1 + (d2 - d1) * t1,
          db: d1 + (d2 - d1) * t2,
          d: Math.min(d1, d2),
          tag: poly.tag || '',
        });
      }
    }
    out.sort((p, q) => q.d - p.d);   // 远的先画，近的压在上面
    return out;
  };

  /* 绘制「平面国人的视界」：整块画布就是一条线，线上是明暗不一的线段 */
  V.drawLineView = function (ctx, W, H, segs, o) {
    o = o || {};
    const half = (o.fov || V.FOV) / 2;
    const pad = Math.max(26, W * 0.055);
    const cy = o.cy !== undefined ? o.cy : H * 0.54;
    const segH = o.segH || U.clamp(H * 0.085, 20, 54);

    // 纸面
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#fffdf7'); bg.addColorStop(.52, '#fbf7ec'); bg.addColorStop(1, '#f2ebdb');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // 远处的雾（上部渐暗）
    const fog = ctx.createLinearGradient(0, 0, 0, cy);
    fog.addColorStop(0, 'rgba(120,108,88,.055)'); fog.addColorStop(1, 'rgba(120,108,88,0)');
    ctx.fillStyle = fog; ctx.fillRect(0, 0, W, cy);

    // 视平线
    ctx.strokeStyle = 'rgba(28,25,21,.5)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(pad, cy); ctx.lineTo(W - pad, cy); ctx.stroke();

    // 视野边界
    ctx.strokeStyle = 'rgba(28,25,21,.22)'; ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    [-1, 1].forEach(s => {
      const x = W / 2 + s * (W / 2 - pad);
      ctx.beginPath(); ctx.moveTo(x, cy - segH * .82); ctx.lineTo(x, cy + segH * .82); ctx.stroke();
    });
    ctx.setLineDash([]);

    // 线段
    const k = (W / 2 - pad) / half;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const x1 = W / 2 + s.a * k, x2 = W / 2 + s.b * k;
      if (x2 - x1 < 0.35) continue;
      const b1 = V.bri(s.da, o.far), b2 = V.bri(s.db, o.far);
      const g = ctx.createLinearGradient(x1, 0, x2, 0);
      g.addColorStop(0, 'rgba(40,32,20,' + b1.toFixed(3) + ')');
      g.addColorStop(.5, 'rgba(40,32,20,' + Math.max(b1, b2).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(40,32,20,' + b2.toFixed(3) + ')');
      ctx.fillStyle = g;
      const hh = segH * (0.55 + 0.45 * Math.max(b1, b2));
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x1, cy - hh / 2, Math.max(1, x2 - x1), hh, 2);
      else ctx.rect(x1, cy - hh / 2, Math.max(1, x2 - x1), hh);
      ctx.fill();
    }

    // 正前方标记
    ctx.strokeStyle = 'rgba(176,67,44,.5)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(W / 2, cy + segH * .95); ctx.lineTo(W / 2, cy + segH * .95 + 7); ctx.stroke();
    ctx.fillStyle = 'rgba(176,67,44,.75)';
    ctx.font = WB.font(10.5, 500);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('正前方', W / 2, cy + segH * .95 + 10);

    if (o.caption !== false) {
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(28,25,21,.42)';
      ctx.font = WB.font(11.5, 500);
      ctx.fillText('平面国人的全部视界', pad, 14);
    }

    // 亮度图例
    if (o.legend !== false) {
      const lw = U.clamp(W * 0.2, 110, 200), lx = pad, ly = H - 30;
      const lg = ctx.createLinearGradient(lx, 0, lx + lw, 0);
      lg.addColorStop(0, 'rgba(40,32,20,.92)'); lg.addColorStop(1, 'rgba(40,32,20,.05)');
      ctx.fillStyle = lg; ctx.fillRect(lx, ly, lw, 5);
      ctx.fillStyle = 'rgba(28,25,21,.5)'; ctx.font = WB.font(10.5, 500);
      ctx.textAlign = 'left'; ctx.fillText('近', lx, ly - 15);
      ctx.textAlign = 'right'; ctx.fillText('远', lx + lw, ly - 15);
      ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(28,25,21,.34)';
      ctx.fillText('亮度即距离', lx + lw + 12, ly - 4);
    }
    return { cy, pad, k, segH };
  };

  /* 罗盘：平面国确有北方（雨自北方来）。bearing 为弧度，0 表示正前 */
  V.drawCompass = function (ctx, cx, cy, r, heading, marks) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, U.TAU);
    ctx.fillStyle = 'rgba(255,253,247,.9)'; ctx.fill();
    ctx.strokeStyle = 'rgba(28,25,21,.28)'; ctx.lineWidth = 1; ctx.stroke();

    ctx.font = WB.font(9.5, 600);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const dirs = [['北', -Math.PI / 2], ['东', 0], ['南', Math.PI / 2], ['西', Math.PI]];
    ctx.fillStyle = 'rgba(28,25,21,.45)';
    dirs.forEach(d => {
      ctx.fillText(d[0], cx + Math.cos(d[1]) * (r - 11), cy + Math.sin(d[1]) * (r - 11));
    });
    // 北针
    ctx.strokeStyle = 'rgba(28,25,21,.55)'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx, cy + r - 16); ctx.lineTo(cx, cy - r + 16);
    ctx.stroke();

    // 目标方位（世界坐标中的方位 → 屏幕上相对朝向）
    (marks || []).forEach(m => {
      const a = m.bearing - heading - Math.PI / 2;   // 世界北方在屏幕上方
      const px = cx + Math.cos(a) * (r - 17), py = cy + Math.sin(a) * (r - 17);
      ctx.fillStyle = m.color || '#b0432c';
      ctx.beginPath(); ctx.arc(px, py, 3.4, 0, U.TAU); ctx.fill();
      if (m.label) {
        ctx.fillStyle = m.color || '#b0432c'; ctx.font = WB.font(9.5, 600);
        ctx.fillText(m.label, px, py - 9);
      }
    });

    // 朝向指针（永远朝上，因为视界中心即正前方）
    ctx.fillStyle = '#1c1915';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 3); ctx.lineTo(cx - 4.6, cy + 6); ctx.lineTo(cx + 4.6, cy + 6);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  };

  /* 把「世界方位角」换算成相对朝向的方位角（世界 x 轴向右、y 轴向下，北方为 -y） */
  V.bearingOf = function (fromX, fromY, toX, toY) {
    return Math.atan2(toY - fromY, toX - fromX);
  };

  /* 正多边形顶点 */
  V.regular = function (cx, cy, r, n, rot) {
    const p = [];
    for (let i = 0; i < n; i++) {
      const a = (rot || 0) + (i / n) * U.TAU;
      p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return p;
  };
})();
