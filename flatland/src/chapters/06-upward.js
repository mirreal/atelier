/* ============================================================
   第六章 · 向上，而非向北
   玩法：把视角从「贴地」升到「俯视」，看见平面国看不见的东西。
   ============================================================ */
(function () {
  'use strict';
  const U = WB.util, V = WB.vision, M = WB.m3, RR = WB.roundRect;

  WB.scene({
    id: 'ch6',
    num: '第六章',
    title: '向上，而非向北',
    short: '把视角升起来',
    source: '原著 §18–§19 · 我如何来到空间国及所见之景',
    epigraph: '「看哪，我变得像神一样了。」——而球体的回答并不客气。',
    brief: [
      '球体把你托出了平面。你第一次离开了自己的世界。',
      '从这里往下看，封闭的房屋敞开着，每个人的内部都摊在你眼前——那些你从前只能「推断」的东西。',
      '但注意：你现在的视角，平面国里没有任何人拥有过。',
      '把视角从贴地升到俯视，找两样东西：五边形住宅里藏着的箱子，和人群中唯一的不规则图形。',
    ],
    goal: '升起视角，找到屋内藏着的箱子与人群中唯一的不规则图形',
    keys: [
      ['拖动 / ← →', '绕行'],
      ['上下拖动 / ↑ ↓', '升高与降低视角'],
      ['滚轮', '远近'],
      ['点击', '指认目标'],
    ],

    /* 手机没有滚轮，「远近」改由双指捏合给出（引擎把捏合翻译成 scene.wheel）。 */
    touch: {
      pad: 'all',
      padLabels: { up: '抬高视角', down: '压低视角', left: '左绕', right: '右绕' },
      note: '双指捏合可以拉远拉近；直接拖动画面也能绕行。',
    },

    create(api) {
      const S = {
        az: -1.02, ang: 0.075, dist: 92,
        thick: 0, phase: 'explore', t: 0, riseT: 0, beats: {},
        found: { chest: false, irregular: false },
        drag: null, tween: null, hits: [], flash: null, msg: {},
      };

      const houses = [
        { pts: V.regular(-27, 9, 13.5, 5, -Math.PI / 2), name: '五边形住宅' },
        { pts: V.regular(24, -19, 12, 4, 0.3), name: '方形住宅' },
        { pts: V.regular(9, 31, 10, 6, 0), name: '六边形住宅' },
      ];
      const chest = { x: -25.5, y: 10.5, w: 3.6, h: 2.4 };
      const you = { x: 0, y: 17 };

      const crowd = [];
      for (let i = 0; i < 7; i++) {
        const x = -27 + i * 9, y = -34 + Math.sin(i * 0.9) * 3.2;
        let pts;
        if (i === 4) {
          // 唯一的不规则图形：三边不等，角度也不等
          pts = [[x + 5.2, y - 0.7], [x - 2.7, y - 4.2], [x - 1.7, y + 4.6]];
        } else {
          pts = V.regular(x, y, 4.4, i % 2 === 0 ? 3 : 4, i * 0.62);
        }
        crowd.push({ pts, irregular: i === 4, i });
      }

      function vis() { return U.smoothstep(0.10, 0.44, S.ang); }
      function cam(W, H) {
        const d = S.dist * (1 + 0.42 * Math.sin(S.ang));
        const eye = [d * Math.cos(S.ang) * Math.cos(S.az), d * Math.cos(S.ang) * Math.sin(S.az), d * Math.sin(S.ang)];
        return M.cam(eye, [0, 0, 0], 46, W, H);
      }

      api.say('你被托到了平面上方。风从北方来——雨也是。但这里没有北方。');

      /* ---------- HUD ---------- */
      function buildHud() {
        api.hud.innerHTML = '';
        api.button('升到高处', () => { S.tween = { ang: 1.12, dist: 96, sp: 1.6 }; api.sfx('lift'); });
        api.button('降到地面', () => { S.tween = { ang: 0.06, dist: 92, sp: 2.0 }; api.sfx('drop'); });
        api.hud.appendChild(api.el('div', 'grow'));
        if (S.found.chest && S.found.irregular && S.phase === 'explore') {
          api.button('随球体继续上升 →', () => {
            S.phase = 'rise'; S.riseT = 0; S.beats = {}; S.tween = null;
            api.sfx('lift');
            buildHud();
          }, 'primary');
        }
      }
      buildHud();

      function markFound(key, line) {
        if (S.found[key]) return;
        S.found[key] = true;
        api.sfx('ok');
        api.say(line, 'hi');
        buildHud();
      }

      return {
        state() {
          return {
            az: Number(S.az.toFixed(3)), ang: Number(S.ang.toFixed(3)),
            /* dist 是相机距离，也就是滚轮/双指捏合控制的那个「远近」。
               暴露出来才能断言「捏合真的拉近了」—— 否则只能间接看画面，很容易假绿。 */
            dist: Number(S.dist.toFixed(2)),
            vis: Number(vis().toFixed(3)), thick: Number(S.thick.toFixed(3)),
            phase: S.phase, chest: S.found.chest, irregular: S.found.irregular,
            targets: S.hits.map(h => h.key),
            hits: S.hits.map(h => ({ key: h.key, x: Math.round(h.x), y: Math.round(h.y) })),
          };
        },

        key(code, down) {
          if (!down || S.phase === 'rise') return;
          const st = 0.07;
          if (code === 'ArrowLeft') { S.az -= st; S.tween = null; }
          if (code === 'ArrowRight') { S.az += st; S.tween = null; }
          if (code === 'ArrowUp') { S.ang = U.clamp(S.ang + 0.045, 0.02, 1.45); S.tween = null; }
          if (code === 'ArrowDown') { S.ang = U.clamp(S.ang - 0.045, 0.02, 1.45); S.tween = null; }
        },

        wheel(d) {
          if (S.phase === 'rise') return;
          S.dist = U.clamp(S.dist * (d > 0 ? 1.08 : 0.925), 42, 190);
        },

        pointer(e) {
          if (S.phase === 'rise') return;
          if (e.type === 'down') { S.drag = { x: e.x, y: e.y, moved: 0 }; return; }
          if (e.type === 'move' && S.drag) {
            const dx = e.x - S.drag.x, dy = e.y - S.drag.y;
            S.drag.moved += Math.abs(dx) + Math.abs(dy);
            S.az -= dx * 0.006;
            S.ang = U.clamp(S.ang + dy * 0.0038, 0.02, 1.45);
            S.drag.x = e.x; S.drag.y = e.y;
            S.tween = null;
            return;
          }
          if (e.type === 'up') {
            const wasDrag = S.drag && S.drag.moved > 8;
            S.drag = null;
            if (wasDrag) return;
            let best = null, bd = 1e9;
            S.hits.forEach(h => {
              const d = Math.hypot(h.x - e.x, h.y - e.y);
              if (d < 30 && d < bd) { bd = d; best = h; }
            });
            if (!best) return;
            if (best.key === 'chest') {
              if (vis() < 0.5) {
                api.toast('你还看不见屋里——把视角升起来');
                if (!S.msg.chestLow) { S.msg.chestLow = 1; api.say('你从地面上方一点点往下看。墙挡住了里面的东西。'); }
              } else markFound('chest', '箱子里装着账本和两箱金币。你从来没有「看见」过它们——你只知道它们在那里。');
            } else if (best.key === 'irregular') {
              if (vis() < 0.5) {
                api.toast('所有图形挤成了一条线，你分不出谁是谁');
                if (!S.msg.irrLow) { S.msg.irrLow = 1; api.say('在这个角度，所有图形都挤成了同一条线。'); }
              } else markFound('irregular', '在平面国，不规则是重罪——不规则者的后代一出生就会被检查，超出偏差就要被销毁。但在这个高度上，你看一眼就知道了。');
            } else if (best.key && best.key.indexOf('house') === 0) {
              api.say(best.label + '。平面国的房子没有屋顶——四面墙就是一个封闭的世界。');
            } else if (best.key === 'you') {
              api.say('那是一个方形。那是你。你现在同时看见了他的外面和里面。');
            }
          }
        },

        update(dt) {
          S.t += dt;
          if (S.tween) {
            const t = S.tween;
            const da = t.ang - S.ang, dd = t.dist - S.dist;
            const step = t.sp * dt;
            if (Math.abs(da) < step && Math.abs(dd) < 40 * dt + 0.4) {
              S.ang = t.ang; S.dist = t.dist; S.tween = null;
            } else {
              S.ang += U.clamp(da, -step, step);
              S.dist += U.clamp(dd, -140 * dt, 140 * dt);
            }
          }
          if (S.flash) { S.flash.t += dt; if (S.flash.t > 0.6) S.flash = null; }

          if (S.phase === 'rise') {
            S.riseT += dt;
            const p = U.clamp(S.riseT / 6.0, 0, 1);
            S.ang = U.lerp(S.ang, 1.44, Math.min(1, dt * 0.9));
            S.dist = U.lerp(S.dist, 168, Math.min(1, dt * 0.8));
            S.thick = U.smoothstep(0.22, 0.72, p);
            const beats = [
              [0.2, '球体托着你，继续向上。'],
              [1.5, '城市在你脚下摊开。你同时看见了每一条街、每一栋房子、每一个人的内部。'],
              [2.9, '你从前只能「推断」的东西，现在全都摊在眼前。'],
              [4.1, '你看见了：他们都有厚度。你自己也有。而你在平面国里，从未看见过它。'],
              [5.2, '你在此处说了一句话：「看哪，我变得像神一样了。」'],
            ];
            beats.forEach(b => {
              if (p * 6 >= b[0] && !S.beats[b[0]]) { S.beats[b[0]] = 1; api.say(b[1], b[0] >= 4 ? 'hi' : ''); }
            });
            if (S.riseT > 6.6) {
              api.complete('球体的回答是：你们国家的智者说「全视」是神独有的属性——可是在我国，扒手和刽子手看见的，和你现在看见的一样多。');
            }
          }
        },

        draw(ctx, W, H) {
          const v = vis();
          const cm = cam(W, H);
          ctx.fillStyle = '#fbf8f0'; ctx.fillRect(0, 0, W, H);
          S.hits = [];

          // 地面
          const q = [[-62, -62, 0], [62, -62, 0], [62, 62, 0], [-62, 62, 0]].map(p => cm.project(p));
          if (q.every(p => p)) {
            ctx.beginPath();
            q.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
            ctx.closePath();
            ctx.fillStyle = 'rgba(236,229,214,.5)'; ctx.fill();
          }
          M.drawGrid(ctx, cm, 60, 6, 'rgba(28,25,21,.05)', 'rgba(28,25,21,.1)');

          // 按深度排序绘制
          const items = [];
          houses.forEach((h, i) => items.push({ z: (cm.project([h.pts[0][0], h.pts[0][1], 0]) || { z: 99 }).z, kind: 'house', o: h, i }));
          crowd.forEach((c, i) => items.push({ z: (cm.project([c.pts[0][0], c.pts[0][1], 0]) || { z: 99 }).z, kind: 'figure', o: c, i }));
          items.push({ z: (cm.project([chest.x, chest.y, 0]) || { z: 99 }).z, kind: 'chest' });
          items.push({ z: (cm.project([you.x, you.y, 0]) || { z: 99 }).z, kind: 'you' });
          items.sort((a, b) => b.z - a.z);

          function flat(pts, z) {
            return pts.map(p => cm.project([p[0], p[1], z === undefined ? 0 : z]));
          }
          function trace(pp) {
            ctx.beginPath();
            pp.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
            ctx.closePath();
          }

          items.forEach(it => {
            if (it.kind === 'house') {
              const h = it.o;
              const pp = flat(h.pts);
              if (!pp.every(p => p)) return;
              trace(pp);
              ctx.fillStyle = 'rgba(240,234,220,' + (0.96 - 0.86 * v).toFixed(3) + ')';
              ctx.fill();
              ctx.strokeStyle = 'rgba(28,25,21,' + (0.72 - 0.28 * v).toFixed(3) + ')';
              ctx.lineWidth = 3.4 - 2.4 * v;
              ctx.stroke();
              const c = cm.project([h.pts.reduce((s, p) => s + p[0], 0) / h.pts.length,
                                    h.pts.reduce((s, p) => s + p[1], 0) / h.pts.length, 0]);
              if (c && v > 0.35) {
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.font = WB.font(11, 600); ctx.fillStyle = 'rgba(28,25,21,.42)';
                ctx.fillText(h.name, c.x, c.y);
              }
              S.hits.push({ key: 'house' + it.i, label: h.name, x: c ? c.x : -999, y: c ? c.y : -999 });
            } else if (it.kind === 'figure') {
              const c = it.o;
              if (S.thick > 0.02) {
                const prism = M.prism(c.pts, S.thick * 0.85);
                M.drawMesh(ctx, cm, prism, {
                  face: sh => 'rgba(28,25,21,' + (0.06 + 0.1 * sh).toFixed(3) + ')',
                  stroke: 'rgba(28,25,21,.5)', lw: 1, depth: 120,
                });
              } else {
                const pp = flat(c.pts);
                if (!pp.every(p => p)) return;
                trace(pp);
                ctx.fillStyle = 'rgba(28,25,21,.07)'; ctx.fill();
                ctx.strokeStyle = 'rgba(28,25,21,.62)'; ctx.lineWidth = 1.5; ctx.stroke();
              }
              if (c.irregular && S.found.irregular && S.flash) {
                const pp = flat(c.pts);
                trace(pp);
                ctx.strokeStyle = 'rgba(176,67,44,' + (1 - S.flash.t / 0.6).toFixed(2) + ')';
                ctx.lineWidth = 3; ctx.stroke();
              }
              const cen = cm.project([c.pts.reduce((s, p) => s + p[0], 0) / c.pts.length,
                                      c.pts.reduce((s, p) => s + p[1], 0) / c.pts.length, 0]);
              if (cen) S.hits.push({ key: c.irregular ? 'irregular' : 'fig' + it.i, x: cen.x, y: cen.y });
            } else if (it.kind === 'chest') {
              if (v < 0.05) return;
              ctx.globalAlpha = U.clamp(v * 1.2, 0, 1);
              const prism = M.prism([[chest.x - chest.w / 2, chest.y - chest.h / 2],
                                     [chest.x + chest.w / 2, chest.y - chest.h / 2],
                                     [chest.x + chest.w / 2, chest.y + chest.h / 2],
                                     [chest.x - chest.w / 2, chest.y + chest.h / 2]], 1.6);
              M.drawMesh(ctx, cm, prism, {
                face: sh => 'rgba(192,138,30,' + (0.2 + 0.3 * sh).toFixed(3) + ')',
                stroke: 'rgba(141,51,32,.9)', lw: 1.4, depth: 120,
              });
              ctx.globalAlpha = 1;
              const c = cm.project([chest.x, chest.y, 1.6]);
              if (c) S.hits.push({ key: 'chest', x: c.x, y: c.y });
            } else if (it.kind === 'you') {
              const pp = flat(V.regular(you.x, you.y, 2.4, 4, 0.4));
              if (!pp.every(p => p)) return;
              trace(pp); ctx.fillStyle = '#1c1915'; ctx.fill();
              const c = cm.project([you.x, you.y, 0]);
              if (c) {
                ctx.textAlign = 'center'; ctx.textBaseline = 'top';
                ctx.font = WB.font(10.5, 600); ctx.fillStyle = 'rgba(28,25,21,.55)';
                ctx.fillText('你', c.x, c.y + 8);
                S.hits.push({ key: 'you', x: c.x, y: c.y });
              }
            }
          });

          // 顶部状态
          ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          ctx.font = WB.font(12, 600); ctx.fillStyle = 'rgba(28,25,21,.45)';
          const deg = Math.round(S.ang * 180 / Math.PI);
          const label = S.phase === 'rise' ? '向上，而非向北'
            : '视角高度 ' + deg + '°　·　' + (v < 0.5 ? '贴地：墙挡住了里面' : '俯视：一切摊开');
          ctx.fillText(label, W / 2, 12);

          // 任务勾选
          ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.font = WB.font(12, 500);
          [['找到屋内的箱子', S.found.chest], ['找出不规则图形', S.found.irregular]].forEach((r, i) => {
            const y = 38 + i * 20;
            ctx.beginPath(); ctx.arc(24, y + 7, 4, 0, U.TAU);
            ctx.fillStyle = r[1] ? '#4a6b4f' : 'rgba(28,25,21,.28)'; ctx.fill();
            ctx.fillStyle = r[1] ? '#4a6b4f' : 'rgba(28,25,21,.5)';
            ctx.fillText(r[0], 36, y);
          });

          if (S.phase === 'rise') {
            const p = U.clamp(S.riseT / 6.6, 0, 1);
            ctx.fillStyle = 'rgba(28,25,21,' + (0.05 * (1 - p)).toFixed(3) + ')';
            ctx.fillRect(0, 0, W, H);
          }
        },
      };
    },

    stats(S) {
      const st = S && S.state ? S.state() : {};
      return [
        { label: '屋内箱子', value: st.chest ? '已看见' : '未找到' },
        { label: '不规则图形', value: st.irregular ? '已认出' : '未找到' },
      ];
    },

    note: {
      kicker: '原著对照',
      title: '全视，并不使人更像神',
      lead: '这一章的场景几乎逐句对应原著第十八章「我如何来到空间国及所见之景」。',
      body: [
        '原著里，球体带 A. 方形升到空中，让他看见自己五边形的住宅和里面的每一个人：「这一切我现在都能<b>看见</b>，而不只是推断。」再升高一些，「我出生的城市，连同每一栋房子、每一个生灵的内部，都缩成微缩景观摊开在我眼前」。',
        'A. 方形在这里说出本章的题眼：<q>Behold, I am become as a God.</q>（看哪，我变得像神一样了。）球体的回答是整本书最锋利的一段：在我国，没有一个扒手或刽子手看不见你所看见的这些——<q>Then the very pick-pockets and cut-throats of my country are to be worshipped by your wise men as being Gods.</q> 全视并不会让人更公正、更仁慈、更不自私。',
        '书里还有一个细节值得注意：球体说「我离你的平面越高、走得越远，能看见的就越多，<b>当然也就看得越小</b>」。这一章把这一点保留在了相机的行为里。',
        '最后，全书的收尾引用了莎士比亚《暴风雨》的句子——「我们这些如梦的材料，终将化为乌有」。A. 方形在狱中写道：有时他连自己是否真的见过那个立方体都不再确定。',
      ],
    },
  });
})();
