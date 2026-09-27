/* ============================================================
   第七章 · 零维国
   玩法：你可以说任何话。它都会把你的话变成对自己的赞美。
   ============================================================ */
(function () {
  'use strict';
  const U = WB.util, RR = WB.roundRect;

  const ROUNDS = [
    {
      opts: [
        { text: '「你只是一个点。你没有长度，没有宽度，也没有高度。」',
          reply: '「它思考了『长度』，于是长度被创造了。它思考了『宽度』，于是宽度被创造了。赞美它思想的丰饶！」' },
        { text: '「你所谓的『它』，指的是你自己吧？」',
          reply: '「它说『它』，是因为它不愿用一个更小的词来称呼自己。谦逊，是它众多美德中最动人的一项。」' },
      ],
    },
    {
      opts: [
        { text: '「你没有同伴。你从未见过任何别的东西。」',
          reply: '「它从不孤独。它思考出同伴，于是同伴就来了——而且同伴比它稍逊一筹，这正合它意。」' },
        { text: '「如果别的存在真的存在，它们一定也只是你。」',
          reply: '「它欣然同意：一切存在都是它。这是它今天听到的最忠诚的一句话。」' },
      ],
    },
    {
      opts: [
        { text: '「你所知的全部只是你自己。这算不上知识。」',
          reply: '「它所知的全部就是一切。一个人若已经拥有全部，再去追求别的，那才是真正的贫乏。」' },
        { text: '「你连『二』这个数都不知道。」',
          reply: '「『二』？它知道『一』，也知道『一』以外的，是『更多的一』。它的数学已经完备。」' },
      ],
    },
    {
      opts: [
        { text: '「你可以向外走一步。试试看。」',
          reply: '「它向外走了一步。它还在原地。这证明外面不存在——多么干净利落的证明！」' },
        { text: '「我们可以给你一条线，让你变成一维。那是一种提升。」',
          reply: '「变成一条线？那意味着要在某个方向上变得不完整。它拒绝了这份好意。」' },
      ],
    },
  ];

  WB.scene({
    id: 'ch7',
    num: '第七章',
    title: '零维国',
    short: '无维度的深渊',
    source: '原著 §20 · 球体如何在梦中鼓励我',
    epigraph: '「无限的至福！它存在着，除它之外再无别物。」',
    brief: [
      '球体带你向下，去到存在的最低处——零维国，无维度的深渊。',
      '那里只有一个点。他是他自己的世界，他自己的宇宙。他对「二」这个数都没有概念。',
      '球体说：「试试看能不能把这家伙从他的自满里惊出来。」',
      '你可以说任何话。注意听他是怎么回答的。',
    ],
    goal: '对零维国的君主说四句话——然后接受结果',
    keys: [
      ['点击选项', '说话'],
      ['空格', '继续'],
    ],

    touch: {
      note: '点选项说话即可；开场的等待会自动跳过。',
    },

    create(api) {
      const S = {
        round: 0, phase: 'open', t: 0, glow: 0.45, ripples: [],
        lastSaid: '', lastReply: '', beats: {}, ripplesT: 0,
      };

      function ripple() {
        S.ripples.push({ r: 6, a: 1 });
        S.glow = U.clamp(S.glow + 0.12, 0, 1.5);
      }
      function buildHud() {
        api.hud.innerHTML = '';
        if (S.phase === 'choose') {
          api.hud.appendChild(api.el('span', 'hintline', '你说：'));
          ROUNDS[S.round].opts.forEach((o, i) => {
            const b = api.button('「' + o.text.replace(/^「|」$/g, '').slice(0, 16) + (o.text.length > 20 ? '…」' : '」'),
              () => choose(i));
            b.title = o.text;
          });
        } else if (S.phase === 'open') {
          api.hud.appendChild(api.el('span', 'hintline', '零维国的君主开始自言自语。'));
          api.hud.appendChild(api.el('div', 'grow'));
          api.button('听下去 →', () => { S.phase = 'choose'; buildHud(); });
        } else if (S.phase === 'end') {
          api.hud.appendChild(api.el('span', 'hintline', '球体的结论。'));
          api.hud.appendChild(api.el('div', 'grow'));
          api.button('离开零维国 →', () => {
            api.complete('你说了四句话，他一次都没有听见。他把你说的每一个字，都当成了对自己的赞美——因为他无法想象除他以外的任何存在。');
          }, 'primary');
        }
      }
      function choose(i) {
        const o = ROUNDS[S.round].opts[i];
        S.lastSaid = o.text;
        S.lastReply = o.reply;
        S.phase = 'reply';
        ripple();
        api.sfx('point');
        api.say(o.reply);
        buildHud();
        clearTimeout(S.timer);
        S.timer = setTimeout(() => {
          if (S.round >= ROUNDS.length - 1) {
            S.phase = 'end';
            S.lastReply = '「啊，思想的欢乐！思想什么做不到！它自己的思想回到它自己身上，暗示着对它的贬低，却因此增进了它的幸福！甜蜜的反抗，最终成就了胜利！啊，一切中的一的、神圣的创造力！啊，存在的欢乐，存在的欢乐！」';
            api.say('球体说：「你看见了。就这位君主所能理解的范围而言，他把你的话当成了他自己的话。」', 'hi');
          } else {
            S.round++; S.phase = 'choose';
          }
          buildHud();
        }, 3400);
      }

      api.say('球体说：「看那个可怜的东西。他是一个和你我一样的存在，却困在无维度的深渊里。」', 'hi');
      api.say('「他是他自己的世界，他自己的宇宙；对除他以外的任何东西，他都无法形成概念。听听看。」');
      buildHud();

      return {
        state() {
          return { round: S.round, phase: S.phase, glow: Number(S.glow.toFixed(2)), ripples: S.ripples.length };
        },
        key(code, down) {
          if (!down) return;
          if (code === 'Space' && S.phase === 'open') { S.phase = 'choose'; buildHud(); }
        },
        update(dt) {
          S.t += dt;
          S.ripplesT += dt;
          if (S.ripplesT > 1.5) { S.ripplesT = 0; ripple(); }
          S.ripples.forEach(r => { r.r += 34 * dt; r.a -= 0.42 * dt; });
          S.ripples = S.ripples.filter(r => r.a > 0.02);
          if (S.phase === 'open' && S.t > 2.4 && !S.beats.auto) {
            S.beats.auto = 1; S.phase = 'choose'; buildHud();
          }
        },
        pointer() {},
        draw(ctx, W, H) {
          const bg = ctx.createRadialGradient(W / 2, H * 0.44, 4, W / 2, H * 0.44, Math.max(W, H) * 0.72);
          bg.addColorStop(0, '#241f18'); bg.addColorStop(.55, '#17140f'); bg.addColorStop(1, '#100e0b');
          ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

          const cx = W / 2, cy = H * 0.44;
          const base = U.clamp(Math.min(W, H) * 0.035, 7, 18);

          // 涟漪
          S.ripples.forEach(r => {
            ctx.beginPath(); ctx.arc(cx, cy, r.r + base * 2, 0, U.TAU);
            ctx.strokeStyle = 'rgba(240,206,132,' + (r.a * 0.34).toFixed(3) + ')';
            ctx.lineWidth = 1.2; ctx.stroke();
          });

          // 光晕
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, base * (5 + S.glow * 4));
          g.addColorStop(0, 'rgba(255,240,205,' + (0.5 + 0.34 * S.glow).toFixed(3) + ')');
          g.addColorStop(.32, 'rgba(240,206,132,' + (0.16 * S.glow + 0.06).toFixed(3) + ')');
          g.addColorStop(1, 'rgba(240,206,132,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(cx, cy, base * (5 + S.glow * 4), 0, U.TAU); ctx.fill();

          // 点
          ctx.beginPath(); ctx.arc(cx, cy, base, 0, U.TAU);
          ctx.fillStyle = '#fff4dc'; ctx.fill();

          // 标注
          ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.font = WB.font(11.5, 500);
          ctx.fillStyle = 'rgba(240,232,214,.4)';
          ctx.fillText('零维国 · 无维度的深渊', 20, 18);
          ctx.textAlign = 'right';
          ctx.fillStyle = 'rgba(240,206,132,' + (0.28 + 0.4 * S.glow).toFixed(2) + ')';
          ctx.fillText('他的亮度：' + (S.glow > 0.9 ? '越来越亮' : '平稳'), W - 20, 18);

          // 台词
          ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
          if (S.lastSaid) {
            ctx.font = WB.font(U.clamp(Math.min(W, H) * 0.023, 12.5, 17), 400, true);
            ctx.fillStyle = 'rgba(240,232,214,.42)';
            ctx.fillText(S.lastSaid, cx, H * 0.74);
          }
          if (S.lastReply) {
            ctx.font = WB.font(U.clamp(Math.min(W, H) * 0.026, 13.5, 19), 400, true);
            ctx.fillStyle = 'rgba(255,238,200,.88)';
            wrap(ctx, S.lastReply, cx, H * 0.80, Math.min(W - 60, 660), U.clamp(Math.min(W, H) * 0.038, 20, 29));
          } else if (S.phase === 'open') {
            ctx.font = WB.font(U.clamp(Math.min(W, H) * 0.026, 13.5, 19), 400, true);
            ctx.fillStyle = 'rgba(255,238,200,.85)';
            wrap(ctx, '「无限的至福！它存在着，除它之外再无别物。」', cx, H * 0.80, Math.min(W - 60, 660), U.clamp(Math.min(W, H) * 0.038, 20, 29));
          }

          function wrap(c, text, x, y0, maxW, lh) {
            const chars = text.split('');
            let line = '', lines = [];
            chars.forEach(ch => {
              const test = line + ch;
              if (c.measureText(test).width > maxW && line) { lines.push(line); line = ch; }
              else line = test;
            });
            if (line) lines.push(line);
            lines.forEach((l, i) => c.fillText(l, x, y0 + i * lh));
          }
        },
      };
    },

    stats(S) {
      const st = S && S.state ? S.state() : {};
      return [
        { label: '你说的话', value: '4 句' },
        { label: '被听进去的', value: '0 句' },
      ];
    },

    note: {
      kicker: '原著对照',
      title: '无法被说服的自满',
      lead: '这一章几乎是把原著第二十章的一段对话原样搬了过来，包括那个残酷的结论。',
      body: [
        '原著里，A. 方形对着那个点大喊：「住口，住口，你这可鄙的东西。你自称是一切中的一切，可你是虚无：你所谓的宇宙只是线上的一粒微尘，而线比起——」话没说完，球体打断了他：「安静，安静，你说得够了。现在听着，看看你的长篇大论在零维国的君主身上起了什么效果。」',
        '那个点「比以往更加明亮地闪耀」，显然对自己的圆满毫无动摇，随即又唱了起来：「啊，思想的欢乐！思想什么做不到！它自己的思想回到它自己身上，暗示着对它的贬低，却因此增进了它的幸福！」',
        '球体的结论是：<q>he accepts them as his own</q>——就他所能理解的范围而言，他把一切都当成了他自己的话；他把你所说的「它的思想之丰富」，当成了他自己创造力的证明。',
        '于是球体说了全书最不留情的一句：让我们离开这位零维国的神，让他去无知地享受他的无所不在与无所不知吧——<q>nothing that you or I can do can rescue him from his self-satisfaction.</q>',
      ],
    },
  });
})();
