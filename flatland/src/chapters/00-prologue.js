/* ============================================================
   序幕 · 一条直线
   冷开场：先让玩家亲手体验「平面国视觉」这件事本身。
   机制：方形在你面前自转。你不能看见它，只能看见它投在视线上的那条线。
   ============================================================ */
(function () {
  'use strict';
  const U = WB.util, V = WB.vision;

  const CENTER = 190;   // 方形中心离你多远
  const RADIUS = 150;   // 方形半对角线
  const HEAD = Math.PI / 2;   // 你朝着 +y 看

  function squarePts(rot) { return V.regular(0, CENTER, RADIUS, 4, rot); }

  function spanAt(rot) {
    const segs = V.project([{ pts: squarePts(rot) }], 0, 0, HEAD, Math.PI);
    if (!segs.length) return 0;
    let lo = 1e9, hi = -1e9;
    segs.forEach(s => { lo = Math.min(lo, s.a); hi = Math.max(hi, s.b); });
    return hi - lo;
  }

  WB.scene({
    id: 'prologue',
    num: '序幕',
    title: '一条直线',
    short: '认识平面国的视觉',
    source: '原著 §1 · 论平面国的性质',
    epigraph: '「你们这些有幸生活在空间里的读者，请设想一张巨大的纸……」',
    brief: [
      '在平面国，没有人见过「图形」。',
      '我们看见的一切，都是视野正中一条水平线上的明暗变化——长度、亮度，仅此而已。',
      '你面前立着一个方形。转动它，看看你能读到什么。',
    ],
    goal: '转动方形，分别读到「最宽」与「最窄」两种投影',
    keys: [
      ['A / D', '转动'],
      ['← / →', '转动'],
      ['拖动画面', '转动'],
    ],

    /* 触屏设备上的操作方式。pad 决定屏幕上出现哪些方向键，
       padLabels 既当方向键的 aria-label，也当侧栏「操作」卡片的说明。 */
    touch: {
      pad: 'lr',
      padLabels: { left: '逆时针', right: '顺时针' },
      note: '也可以直接用手指拖动画面转动。',
    },

    create(api) {
      // 先采样一整圈，拿到真实的极值，再据此定判据（免得写死一个拍脑袋的阈值）
      let tMin = Infinity, tMax = -Infinity;
      for (let i = 0; i < 720; i++) {
        const w = spanAt((i / 720) * Math.PI * 2);
        tMin = Math.min(tMin, w); tMax = Math.max(tMax, w);
      }
      const hiT = tMin + 0.80 * (tMax - tMin);
      const loT = tMax - 0.80 * (tMax - tMin);

      const S = {
        rot: 0, spin: 0, t: 0, hold: 0, sent: false,
        best: { max: 0, min: 99 }, marks: { max: false, min: false },
        dragging: false, lastX: 0,
      };

      api.say('这里是平面国。');
      api.say('你面前立着一个方形——但在你的视界里，它只是一条线。');
      api.say('转动它。');

      function measure() {
        const w = spanAt(S.rot);
        S.best.max = Math.max(S.best.max, w);
        S.best.min = Math.min(S.best.min, w);
        if (Math.abs(S.spin) < 1.1) return;      // 先转过一个明显的角度再判定
        if (!S.marks.max && w >= hiT) {
          S.marks.max = true; api.sfx('blip');
          api.say('最宽的时候，你看到的是一条很长的线——那是方形的一整条边正对着你。');
        }
        if (!S.marks.min && w <= loT) {
          S.marks.min = true; api.sfx('blip');
          api.say('最窄的时候，它缩成了一条短线——那是方形的一个角正对着你。');
        }
      }

      return {
        state() {
          return {
            rot: Number(S.rot.toFixed(3)), spin: Number(S.spin.toFixed(2)),
            width: Number(spanAt(S.rot).toFixed(3)),
            trueMin: Number(tMin.toFixed(3)), trueMax: Number(tMax.toFixed(3)),
            max: S.marks.max, min: S.marks.min,
          };
        },
        update(dt) {
          S.t += dt;
          const turn = 1.9 * dt;
          if (api.input.down('KeyA') || api.input.down('ArrowLeft')) { S.rot -= turn; S.spin -= turn; }
          if (api.input.down('KeyD') || api.input.down('ArrowRight')) { S.rot += turn; S.spin += turn; }
          measure();
          if (S.marks.max && S.marks.min && !S.sent) {
            S.hold += dt;
            if (S.hold > 1.0) {
              S.sent = true;
              api.complete('你刚刚读到的，就是平面国居民一生的全部视觉经验。他们没有「俯视」这个词——因为那件事在他们的世界里不存在。');
            }
          }
        },
        pointer(e) {
          if (e.type === 'down') { S.dragging = true; S.lastX = e.x; }
          else if (e.type === 'move' && S.dragging) {
            const d = (e.x - S.lastX) * 0.012;
            S.rot += d; S.spin += d; S.lastX = e.x;
          } else if (e.type === 'up') S.dragging = false;
        },
        draw(ctx, W, H) {
          const segs = V.project([{ pts: squarePts(S.rot) }], 0, 0, HEAD, Math.PI);
          V.drawLineView(ctx, W, H, segs, { caption: true, legend: true, cy: H * 0.56 });
          const pad = Math.max(26, W * 0.055);

          // 左上角：三条自检
          ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.font = WB.font(12, 500);
          [['转过一个明显的角度', Math.abs(S.spin) > 1.1],
           ['读到最宽的投影', S.marks.max],
           ['读到最窄的投影', S.marks.min]].forEach((r, i) => {
            const y = 40 + i * 21;
            ctx.beginPath(); ctx.arc(pad + 5, y + 7, 4, 0, U.TAU);
            ctx.fillStyle = r[1] ? '#4a6b4f' : 'rgba(28,25,21,.24)'; ctx.fill();
            ctx.fillStyle = r[1] ? '#4a6b4f' : 'rgba(28,25,21,.5)';
            ctx.fillText(r[0], pad + 17, y);
          });

          // 右上角：当前投影宽度 + 转动刻度盘
          const w = spanAt(S.rot);
          ctx.textAlign = 'right'; ctx.font = WB.font(11.5, 500);
          ctx.fillStyle = 'rgba(28,25,21,.42)';
          ctx.fillText('当前投影宽度  ' + U.fmt(w, 2) + ' 弧度', W - pad, 40);
          ctx.fillText('最窄 ' + U.fmt(tMin, 2) + '　·　最宽 ' + U.fmt(tMax, 2), W - pad, 60);

          const dx = W - pad - 26, dy = 112, dr = 20;
          ctx.beginPath(); ctx.arc(dx, dy, dr, 0, U.TAU);
          ctx.strokeStyle = 'rgba(28,25,21,.22)'; ctx.lineWidth = 1; ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(dx, dy);
          ctx.lineTo(dx + Math.cos(S.rot) * (dr - 4), dy - Math.sin(S.rot) * (dr - 4));
          ctx.strokeStyle = '#b0432c'; ctx.lineWidth = 2; ctx.stroke();
          ctx.beginPath(); ctx.arc(dx, dy, 2.4, 0, U.TAU);
          ctx.fillStyle = '#b0432c'; ctx.fill();
        },
      };
    },

    stats() { return []; },

    note: {
      kicker: '原著对照',
      title: '为什么平面国人看不见图形',
      lead: '艾勃特用一枚硬币来解释这件事：把眼睛放到桌面高度，硬币就「变成了一条直线」。',
      body: [
        '原著第一章写道，平面国里一切生物与非生物，「无论其形状如何，呈现给我们的外观都是一条直线」。',
        '那么他们如何分辨对方？靠<b>雾</b>。第二章说，雾在空间国是纯粹的祸害，在平面国却被视为「仅次于空气的恩赐，是技艺的乳母、科学的父母」。雾使远处变暗，于是形状的边缘会「迅速隐入昏暗」——边数越少，两端越快地暗下去；边数越多、越接近圆，两端就暗得越慢。',
        '所以平面国的「视觉辨认」本质上是一道逆问题：从明暗分布反推边数。这也解释了为什么这本书会把「不规则图形」视为重罪——一旦有人形状不规则，这套推断体系就会失效。',
        '你刚刚做的那个动作——转动方形，看它的投影变宽变窄——正是平面国人辨认彼此的唯一办法，也是他们把「触摸」称为一门手艺的原因。',
      ],
    },
  });
})();
