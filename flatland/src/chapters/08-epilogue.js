/* ============================================================
   尾声 · 先知
   议会厅的审判、七年牢狱，和那本回忆录的最后一句。
   ============================================================ */
(function () {
  'use strict';
  const U = WB.util, V = WB.vision, RR = WB.roundRect;

  const PANELS = [
    {
      title: '议会厅',
      lines: [
        '几个月后，你站在了球体曾经站过的地方。',
        '主席问了你两个问题：「你能指出『向上，而非向北』所指的方向吗？」「你能用任何图样或描述——除了列举那些想象中的边和角——画出你所谓的立方体吗？」',
        '你回答：我无话可说。我把自己交给真理，真理的事业终将获胜。',
      ],
    },
    {
      title: '判决',
      lines: [
        '主席说他完全同意你的看法，你也确实无法做得更好。',
        '于是你被判终身监禁。若真理有意让你出狱并向世界传道，真理自会促成此事。',
        '你注意到，看守你的警察在开庭前被换成了更低等的一批——这样听过你故事的人，可以更便宜地一起消失。',
      ],
    },
    {
      title: '七年',
      lines: [
        '七年过去了，你仍是囚徒。',
        '你的兄弟每周来看你。他当时在场，见过球体变化的截面，也听过圆形们得到的解释。',
        '然而——他至今仍未把握第三维的性质，并坦率地表示不相信球体的存在。',
      ],
    },
    { title: '账目', lines: [], stats: true },
    {
      title: '尾声',
      lines: [
        '「我仍怀着希望：这些回忆录或许能以某种我尚不知晓的方式，抵达某个维度中人类的心灵，激起一代拒绝被有限维度所束缚的叛逆者。」',
        '有时他也会怀疑一切：他无法确信那个曾见过、又屡屡追悔的立方体究竟是什么形状。',
        '但那个谜一样的训诫，仍在夜里回响。',
      ],
      motto: '向上，而非向北。',
    },
  ];

  function circlesRow(ctx, W, y, n, r, lean) {
    const gap = W / (n + 1);
    for (let i = 0; i < n; i++) {
      const cx = gap * (i + 1);
      const rr = r * (1 + (lean ? 0.06 * Math.sin(i) : 0));
      ctx.beginPath(); ctx.arc(cx, y, rr, 0, U.TAU);
      ctx.fillStyle = 'rgba(28,25,21,.07)'; ctx.fill();
      ctx.strokeStyle = 'rgba(28,25,21,.6)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, y, rr * 0.55, 0, U.TAU);
      ctx.strokeStyle = 'rgba(28,25,21,.22)'; ctx.lineWidth = 1; ctx.stroke();
    }
  }
  function squareAt(ctx, x, y, s, fill) {
    ctx.beginPath(); ctx.rect(x - s / 2, y - s / 2, s, s);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    else { ctx.strokeStyle = 'rgba(28,25,21,.75)'; ctx.lineWidth = 1.6; ctx.stroke(); }
  }

  WB.scene({
    id: 'epilogue',
    num: '尾声',
    title: '先知',
    short: '狱中的回忆录',
    source: '原著 §22 · 我如何试图以其他方式传播三维理论',
    epigraph: '「可怜的平面国普罗米修斯，躺在这里，什么也没能给同胞带下来。」',
    brief: [
      '你在本地思辨学会的年会上讲完了整个故事，然后被捕。',
      '议会给了你申诉的机会——他们让你讲，因为听完的人不会活得太久。',
      '翻过这一页，就是这本书的结尾了。',
    ],
    goal: '读完这最后五页',
    keys: [['空格 / 点击', '翻页']],

    touch: {
      note: '点「翻页」按钮即可。',
    },

    create(api) {
      const S = { page: 0, t: 0, shown: 0, beats: {} };

      function buildHud() {
        api.hud.innerHTML = '';
        api.hud.appendChild(api.el('span', 'hintline',
          '第 ' + (S.page + 1) + ' / ' + PANELS.length + ' 页'));
        api.hud.appendChild(api.el('div', 'grow'));
        const last = S.page >= PANELS.length - 1;
        api.button(last ? '合上这本书' : '翻页 →', () => next(), last ? 'primary' : '');
      }
      function next() {
        if (S.page >= PANELS.length - 1) {
          api.complete('你在狱中写完了这本书。它后来流传了下来——不过不是通过平面国的书商，而是通过一个叫埃德温·艾勃特·艾勃特的英国人，在 1884 年把它译成了我们这一维的语言。');
          return;
        }
        S.page++; S.t = 0; S.shown = 0; S.beats = {};
        api.sfx('page');
        buildHud();
      }

      buildHud();
      api.say('本地思辨学会的年会上，你讲完了整个故事。');

      return {
        state() {
          return { page: S.page, shown: S.shown, total: PANELS.length };
        },
        key(code, down) {
          if (down && (code === 'Space' || code === 'ArrowRight' || code === 'Enter')) next();
        },
        pointer(e) { if (e.type === 'down') next(); },
        update(dt) {
          S.t += dt;
          const P = PANELS[S.page];
          if (!P.stats) {
            const want = Math.min(P.lines.length, Math.floor(S.t / 1.15));
            if (want > S.shown) {
              S.shown = want;
              api.say(P.lines[want - 1]);
            }
          } else if (!S.beats.stat) {
            S.beats.stat = 1;
            api.say('你的账目，被记在这里。');
          }
        },
        draw(ctx, W, H) {
          const P = PANELS[S.page];
          ctx.fillStyle = '#fbf8f0'; ctx.fillRect(0, 0, W, H);

          if (S.page === 0 || S.page === 1) {
            circlesRow(ctx, W, H * 0.22, 5, U.clamp(W * 0.032, 16, 34), S.page === 1);
            const s = U.clamp(W * 0.05, 26, 52);
            squareAt(ctx, W / 2, H * 0.66, s, '#1c1915');
            // 聚光
            const g = ctx.createRadialGradient(W / 2, H * 0.66, 4, W / 2, H * 0.66, Math.max(W, H) * 0.4);
            g.addColorStop(0, 'rgba(255,240,205,.55)'); g.addColorStop(1, 'rgba(255,240,205,0)');
            ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
            squareAt(ctx, W / 2, H * 0.66, s, '#1c1915');
            if (S.page === 1) {
              ctx.strokeStyle = 'rgba(176,67,44,.8)'; ctx.lineWidth = 2;
              ctx.setLineDash([5, 4]);
              ctx.beginPath(); ctx.arc(W / 2, H * 0.66, s * 1.35, 0, U.TAU); ctx.stroke();
              ctx.setLineDash([]);
              ctx.fillStyle = 'rgba(176,67,44,.85)';
              ctx.font = WB.font(11.5, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
              ctx.fillText('终身监禁', W / 2, H * 0.66 + s * 1.6);
            }
          } else if (S.page === 2) {
            const cw = Math.min(W * 0.44, H * 0.5), cx = W / 2, cy = H * 0.52;
            ctx.strokeStyle = 'rgba(28,25,21,.7)'; ctx.lineWidth = 2;
            ctx.strokeRect(cx - cw / 2, cy - cw / 2, cw, cw);
            for (let i = 1; i < 6; i++) {
              const x = cx - cw / 2 + (cw / 6) * i;
              ctx.strokeStyle = 'rgba(28,25,21,.28)'; ctx.lineWidth = 1.2;
              ctx.beginPath(); ctx.moveTo(x, cy - cw / 2); ctx.lineTo(x, cy + cw / 2); ctx.stroke();
            }
            squareAt(ctx, cx - cw * 0.18, cy + cw * 0.12, U.clamp(cw * 0.13, 14, 30), '#1c1915');
            squareAt(ctx, cx + cw * 0.78, cy + cw * 0.12, U.clamp(cw * 0.11, 12, 26), null);
            ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            ctx.font = WB.font(11, 500); ctx.fillStyle = 'rgba(28,25,21,.5)';
            ctx.fillText('你', cx - cw * 0.18, cy + cw * 0.12 + 24);
            ctx.fillText('每周来访的兄弟', cx + cw * 0.78, cy + cw * 0.12 + 22);
          } else if (S.page === 3) {
            // 账目
            const st = (WB.save && WB.save.data.stats) || {};
            const done = (WB.save && WB.save.data.done) || {};
            const rows = [];
            WB.scenes.forEach(sc => {
              if (sc.id === 'epilogue') return;
              const s = st[sc.id];
              if (s && s.length) {
                rows.push([sc.num + ' ' + sc.title, s.map(x => x.label + ' ' + x.value).join('　·　')]);
              } else if (done[sc.id]) {
                rows.push([sc.num + ' ' + sc.title, '已通读']);
              }
            });
            const nDone = WB.scenes.filter(sc => sc.id !== 'epilogue' && done[sc.id]).length;
            const x0 = Math.max(26, W * 0.08);
            ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            ctx.font = WB.font(U.clamp(W * 0.02, 13, 17), 600, true);
            ctx.fillStyle = '#1c1915';
            ctx.fillText('你的账目', x0, H * 0.1);
            ctx.font = WB.font(11.5, 500);
            ctx.fillStyle = 'rgba(28,25,21,.45)';
            ctx.fillText('通读 ' + nDone + ' / ' + (WB.scenes.length - 1) + ' 章', x0, H * 0.1 + 26);
            ctx.strokeStyle = 'rgba(28,25,21,.16)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x0, H * 0.1 + 46); ctx.lineTo(W - x0, H * 0.1 + 46); ctx.stroke();
            const lh = U.clamp(H * 0.082, 24, 34);
            rows.slice(0, 8).forEach((r, i) => {
              const y = H * 0.1 + 58 + i * lh;
              ctx.font = WB.font(U.clamp(W * 0.0145, 12, 14.5), 600);
              ctx.fillStyle = 'rgba(28,25,21,.82)';
              ctx.fillText(r[0], x0, y);
              ctx.font = WB.font(U.clamp(W * 0.014, 11.5, 14), 400);
              ctx.fillStyle = 'rgba(28,25,21,.5)';
              ctx.textAlign = 'right';
              ctx.fillText(r[1], W - x0, y);
              ctx.textAlign = 'left';
            });
          } else {
            // 尾声：从上方俯瞰，逐渐缩成一个点
            const p = U.clamp(S.t / 5.5, 0, 1);
            const sc = U.lerp(1, 0.05, U.ease(p));
            const half = Math.min(W, H) * 0.3 * sc;
            const cx = W / 2, cy = H * 0.42;
            ctx.strokeStyle = 'rgba(28,25,21,' + (0.7 * (1 - p * 0.5)).toFixed(2) + ')';
            ctx.lineWidth = 1.6;
            ctx.strokeRect(cx - half, cy - half, half * 2, half * 2);
            if (p > 0.75) {
              ctx.beginPath(); ctx.arc(cx, cy, 2.6, 0, U.TAU);
              ctx.fillStyle = '#b0432c'; ctx.fill();
            }
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.font = WB.font(U.clamp(Math.min(W, H) * 0.055, 20, 40), 600, true);
            ctx.fillStyle = 'rgba(28,25,21,' + U.clamp((p - 0.55) * 3, 0, 1).toFixed(2) + ')';
            ctx.fillText('向上，而非向北。', cx, H * 0.78);
          }

          // 正文
          if (!P.stats) {
            const x0 = Math.max(24, W * 0.06);
            const maxW = W - x0 * 2;
            let y = H * 0.86 - P.lines.length * 22;
            ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            ctx.font = WB.font(U.clamp(Math.min(W, H) * 0.024, 12.5, 16), 400, true);
            P.lines.forEach((ln, i) => {
              if (i >= S.shown) return;
              ctx.fillStyle = 'rgba(28,25,21,.78)';
              y = wrapText(ctx, ln, x0, y, maxW, U.clamp(Math.min(W, H) * 0.035, 19, 25)) + 8;
            });
          } else {
            ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            ctx.font = WB.font(U.clamp(Math.min(W, H) * 0.024, 12.5, 16), 400, true);
            ctx.fillStyle = 'rgba(28,25,21,.6)';
            ctx.fillText('这些数字，是你在平面国里留下的全部痕迹。', W / 2, H - 34);
          }

          // 页码
          ctx.textAlign = 'right'; ctx.textBaseline = 'top';
          ctx.font = WB.font(11, 500); ctx.fillStyle = 'rgba(28,25,21,.35)';
          ctx.fillText(P.title, W - 18, 14);

          function wrapText(c, text, x, y0, maxW, lh) {
            const chars = text.split('');
            let line = '', yy = y0;
            chars.forEach(ch => {
              const test = line + ch;
              if (c.measureText(test).width > maxW && line) {
                c.fillText(line, x, yy); yy += lh; line = ch;
              } else line = test;
            });
            if (line) { c.fillText(line, x, yy); yy += lh; }
            return yy;
          }
        },
      };
    },

    stats() {
      const done = (WB.save && WB.save.data.done) || {};
      const n = WB.scenes.filter(s => s.id !== 'epilogue' && done[s.id]).length;
      return [
        { label: '通读章节', value: n + ' / ' + (WB.scenes.length - 1) },
        { label: '结局', value: '终身监禁' },
      ];
    },

    note: {
      kicker: '关于这本书',
      title: '一本 1884 年的小书，和一个 140 年后的游戏',
      lead: '《平面国：多重维度传奇》（Flatland: A Romance of Many Dimensions）由英国校长、神学家埃德温·艾勃特·艾勃特（Edwin Abbott Abbott, 1838–1926）于 1884 年以笔名「一个正方形」出版。',
      body: [
        '它表面上是一则几何幻想，实际上是一篇伪装得相当巧妙的维多利亚社会讽刺：严格的阶级按边数划分，「不规则」被视为比犯罪更重的罪，而女性被设定为直线——艾勃特用这种极端的设定，把当时英国的阶级固化与性别等级推到了荒谬的程度。阅读时值得留意：<b>书里呈现的世界观是讽刺的对象，不是作者的主张</b>。',
        '另一条线索是认识论。全书的推动力不是「三维存在吗」，而是「一个只能接触二维证据的心智，凭什么相信三维」。球体用言语失败了，只好用行动；而 A. 方形学会第三维之后，立刻犯下与圆形们同样的错误——拒绝承认第四维。全书最后收在莎士比亚《暴风雨》的句子上：「我们这些如梦的材料，终将化为乌有。」',
        '这本游戏里出现的所有事实、引文与设定，都来自原著（Project Gutenberg 电子版，公有领域）。章节之间的「原著对照」卡片标明了大致的出处段落，供你回查。',
        '本作为基于原著的同人互动改编，非商业用途。',
      ],
    },
  });
})();
