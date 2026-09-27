/* =========================================================================
   ui.js —— 渲染层（只负责画，不含游戏流程控制）
   ========================================================================= */
(function (root) {
  "use strict";

  var E = root.TMEngine, D = root.TMCards;
  var byId = D.byId, TAGS = D.TAGS;
  var RES_NAME = E.RES_NAME;
  /* 颜色一律引用 CSS token，不再抄字面量。
     之前这里把 #b7791f / #3f7d20 各抄了一份，结果 token 调深后这两处仍是旧值，
     对比度依旧不达标 —— 同一份配色散成两份实现必然漂移。
     （inline style 里 var() 能正常解析，已实测。）
     steel/titan 只在这里用一次，保留字面量。 */
  var RES_COLOR = { mc: "var(--gold)", steel: "#6b7280", titan: "#4a6f8a", plant: "var(--green)", energy: "var(--purple)", heat: "var(--rust)" };
  var RES_ABBR = { mc: "M€", steel: "钢", titan: "钛", plant: "植", energy: "电", heat: "热" };
  /* 这三色只用作卡牌顶部色条（--cc），不带文字，但仍走 token 以免和别处漂移。 */
  var TYPE_COLOR = { automated: "var(--green)", active: "var(--blue)", event: "var(--red)" };
  var TYPE_NAME = { automated: "自动化", active: "主动", event: "事件" };
  var BONUS_LABEL = { mc: "€", steel: "钢", titan: "钛", plant: "植", energy: "电", heat: "热", card: "卡" };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var cellEls = {};
  var mapBuilt = false;

  /* ---------------- 通用 ---------------- */
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  /* 人类玩家本身就叫「你」，避免渲染成「你（你）」 */
  function who(p) {
    var n = String(p.name == null ? "" : p.name);
    if (p.isAI || n.indexOf("你") >= 0) return esc(n);
    return esc(n) + "（你）";
  }

  var toastTimer = null;
  function toast(msg, kind) {
    var t = $("#toast");
    t.textContent = msg;
    t.className = "toast" + (kind ? " " + kind : "");
    t.hidden = false;
    /* 顶栏是常驻信息条，弹条若停在 top:18px 会正好压住温度/氧气轨道，
       所以按顶栏实际底边把它往下推。顶栏高度随换行变化，不能写死。
       这里留 24px：入场动画会从上方 -8px 滑下来，留少了刚出现那一瞬还是会蹭到。 */
    var bar = document.querySelector(".topbar");
    if (bar && !$("#gameScreen").hidden) {
      t.style.top = Math.round(bar.getBoundingClientRect().bottom + 24) + "px";
    } else {
      t.style.top = "";
    }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2400);
  }

  /* ---------------- 弹窗 ----------------
     role="dialog" 只声明了语义，键盘可用性还得自己做三件事：
       ① 焦点移进弹窗（不移的话焦点留在被遮住的页面上，Tab 会在背景内容里游走）
       ② 焦点陷阱（Tab / Shift+Tab 在弹窗内循环，跑不出去）
       ③ 可访问名称（指向内部标题，否则读屏只念"对话框"）                        */
  var lastFocused = null;
  /* 可见性判断用 getClientRects()，不用 offsetParent ——
     .modal 是 position:fixed，其子元素的 offsetParent 行为有浏览器差异，容易误判成不可见。 */
  function focusablesIn(root) {
    return Array.prototype.slice.call(root.querySelectorAll(
      'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
    )).filter(function (el) { return el.getClientRects().length > 0; });
  }
  function onModalKeydown(e) {
    if (e.key !== "Tab") return;
    var box = $("#modalBox");
    var list = focusablesIn(box);
    if (!list.length) { e.preventDefault(); return; }
    var first = list[0], last = list[list.length - 1], active = document.activeElement;
    if (e.shiftKey && (active === first || !box.contains(active))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (active === last || !box.contains(active))) { e.preventDefault(); first.focus(); }
  }
  function openModal(html) {
    var box = $("#modalBox");
    lastFocused = document.activeElement;
    box.innerHTML = html;
    var head = box.querySelector("h2,h3");
    if (head) {
      if (!head.id) head.id = "modalTitle";
      box.setAttribute("aria-labelledby", head.id);
    } else {
      box.removeAttribute("aria-labelledby");
    }
    $("#modal").hidden = false;
    (focusablesIn(box)[0] || box).focus();
    document.addEventListener("keydown", onModalKeydown, true);
  }
  function closeModal() {
    document.removeEventListener("keydown", onModalKeydown, true);
    $("#modal").hidden = true;
    $("#modalBox").innerHTML = "";
    $("#modalBox").removeAttribute("aria-labelledby");
    /* 焦点归还给打开弹窗前的元素。元素可能已被隐藏（比如开始界面），
       这时不硬点，让浏览器自然把焦点留在 body。 */
    if (lastFocused && document.contains(lastFocused) && lastFocused.getClientRects().length > 0) lastFocused.focus();
    lastFocused = null;
  }

  /* ---------------- 开始界面的火星 ---------------- */
  function renderStartMars(svg) {
    var NS = "http://www.w3.org/2000/svg";
    var mk = function (tag, attrs, parent) {
      var n = document.createElementNS(NS, tag);
      for (var k in attrs) n.setAttribute(k, attrs[k]);
      (parent || svg).appendChild(n);
      return n;
    };
    var defs = mk("defs", {});
    var stop = function (grad, offset, color, opacity) {
      var st = document.createElementNS(NS, "stop");
      st.setAttribute("offset", offset);
      st.setAttribute("stop-color", color);
      if (opacity != null) st.setAttribute("stop-opacity", opacity);
      grad.appendChild(st);
    };
    var ell = function (parent, cx, cy, rx, ry, fill, rot, opacity) {
      var e = document.createElementNS(NS, "ellipse");
      e.setAttribute("cx", cx); e.setAttribute("cy", cy);
      e.setAttribute("rx", rx); e.setAttribute("ry", ry);
      e.setAttribute("fill", fill);
      if (rot) e.setAttribute("transform", "rotate(" + rot + " " + cx + " " + cy + ")");
      if (opacity != null) e.setAttribute("opacity", opacity);
      parent.appendChild(e);
      return e;
    };

    /* 球体底色：左上受光，右下转暗 */
    var gBase = mk("radialGradient", { id: "smBase", cx: "34%", cy: "26%", r: "82%" }, defs);
    stop(gBase, "0%", "#f4b184");
    stop(gBase, "34%", "#d97a41");
    stop(gBase, "68%", "#b8521d");
    stop(gBase, "100%", "#7c3110");

    /* 立体明暗：高光 + 边缘暗角 */
    var gShade = mk("radialGradient", { id: "smShade", cx: "32%", cy: "24%", r: "88%" }, defs);
    stop(gShade, "0%", "#ffffff", .38);
    stop(gShade, "28%", "#ffffff", 0);
    stop(gShade, "72%", "#3a1200", 0);
    stop(gShade, "100%", "#38110a", .56);

    /* 大气边缘辉光 */
    var gHaze = mk("radialGradient", { id: "smHaze", cx: "50%", cy: "50%", r: "50%" }, defs);
    stop(gHaze, "0%", "#9ec9ea", 0);
    stop(gHaze, "82%", "#9ec9ea", 0);
    stop(gHaze, "94%", "#bcdcf5", .28);
    stop(gHaze, "100%", "#d6ecfb", .55);

    /* 大块暗区要柔化，否则像贴上去的斑点；但糊过头就成一团泥，4 左右刚好 */
    var fSoft = mk("filter", { id: "smSoft", x: "-30%", y: "-30%", width: "160%", height: "160%" }, defs);
    var blur = document.createElementNS(NS, "feGaussianBlur");
    blur.setAttribute("stdDeviation", "3.5");
    fSoft.appendChild(blur);

    /* 极冠要的是"雾"而不是"色带"：给一个大半径羽化，让下缘自然融进地表 */
    var fFeather = mk("filter", { id: "smFeather", x: "-60%", y: "-60%", width: "220%", height: "220%" }, defs);
    var fBlur = document.createElementNS(NS, "feGaussianBlur");
    fBlur.setAttribute("stdDeviation", "11");
    fFeather.appendChild(fBlur);

    var clip = mk("clipPath", { id: "smClip" }, defs);
    var cc = document.createElementNS(NS, "circle");
    cc.setAttribute("cx", 210); cc.setAttribute("cy", 210); cc.setAttribute("r", 150);
    clip.appendChild(cc);

    mk("circle", { cx: 210, cy: 210, r: 150, fill: "url(#smBase)" });

    /* ---- 地形（裁剪在球体轮廓内）---- */
    var terr = mk("g", { "clip-path": "url(#smClip)" });

    /* 深色反照率：主暗区 + 几块分散暗斑，模仿火星表面的明暗分布 */
    var alb = mk("g", { filter: "url(#smSoft)" }, terr);
    [[176, 206, 34, 62, -22, .40], [256, 168, 26, 34, 10, .34], [280, 268, 30, 26, -10, .30],
     [130, 150, 20, 26, 0, .26], [232, 306, 24, 20, 0, .24], [318, 226, 16, 22, 6, .22]
    ].forEach(function (c) {
      ell(alb, c[0], c[1], c[2], c[3], "rgba(84,32,8," + c[5] + ")", c[4]);
    });

    /* 亮色高原（类似 Tharsis / Hellas 的高反照率区） */
    var bright = mk("g", { filter: "url(#smSoft)" }, terr);
    [[272, 214, 32, 30, -8, .18], [140, 288, 22, 18, 0, .13]].forEach(function (c) {
      ell(bright, c[0], c[1], c[2], c[3], "rgba(255,224,188," + c[5] + ")", c[4]);
    });

    /* 环形山：光从左上来，坑内壁因此是"左上暗、右下亮" */
    [[152, 172, 13, 9.5, -14], [276, 148, 10, 7.5, 8], [214, 254, 16, 11, 0],
     [120, 238, 9.5, 7, 0], [300, 248, 12, 8.5, -6], [180, 308, 11, 7.5, 5],
     [258, 302, 8.5, 6.5, 0], [316, 200, 7.5, 6, 0], [206, 126, 7, 5.5, 0], [150, 272, 6, 4.5, 0]
    ].forEach(function (c) {
      ell(terr, c[0], c[1], c[2], c[3], "rgba(80,28,6,.38)", c[4]);
      ell(terr, c[0] + c[2] * .22, c[1] + c[3] * .24, c[2] * .62, c[3] * .56,
          "rgba(255,226,196,.16)", c[4]);
    });

    /* ---- 球体明暗：压在极冠之下，免得极冠被暗角染成灰盘 ---- */
    mk("circle", { cx: 210, cy: 210, r: 150, fill: "url(#smShade)" }, terr.parentNode);

    /* ---- 极冠：羽化椭圆，下缘融进地表；位置刻意不对称，避免读成"上下两片面包" ---- */
    var caps = mk("g", { "clip-path": "url(#smClip)", filter: "url(#smFeather)" });
    ell(caps, 200, 26, 104, 74, "#ffffff", 0, .95);          // 北极：主冠
    ell(caps, 168, 34, 46, 40, "#ffffff", 0, .9);            // 北极：西侧伸出的舌状冰盖
    ell(caps, 216, 392, 86, 66, "#f2f8fd", 0, .88);          // 南极：略小、略暖
    ell(caps, 254, 384, 40, 34, "#f6fbfe", 0, .8);           // 南极：东侧伸出

    /* ---- 大气边缘辉光 + 轮廓线 ---- */
    mk("circle", { cx: 210, cy: 210, r: 150, fill: "url(#smHaze)" });
    mk("circle", { cx: 210, cy: 210, r: 150, fill: "none", stroke: "rgba(255,255,255,.42)", "stroke-width": 1.2 });
  }

  /* ---------------- 六角地图 ---------------- */
  function hexPoints(cx, cy, size) {
    var pts = [];
    for (var i = 0; i < 6; i++) {
      var a = Math.PI / 180 * (60 * i);
      pts.push((cx + size * Math.cos(a)).toFixed(1) + "," + (cy + size * Math.sin(a)).toFixed(1));
    }
    return pts.join(" ");
  }

  /* 给地图格子生成读屏能听懂的说明：第几格、现在是什么、能不能放 */
  var TILE_CN = { city: "城市", greenery: "绿化", ocean: "海洋" };
  function cellLabel(c, idx, placing, isValid) {
    var parts = ["第 " + (idx + 1) + " 格"];
    if (c.tile) parts.push(TILE_CN[c.tile] + "板块");
    else if (c.oceanReserved) parts.push("海洋保留区");
    else parts.push("空地");
    if (placing) parts.push(isValid ? "可以放这里" : "不能放");
    return parts.join("，");
  }

  function buildMap(G, svg, onCellClick) {
    var NS = "http://www.w3.org/2000/svg";
    svg.innerHTML = "";
    cellEls = {};
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    var size = E.HEX_SIZE;
    G.map.order.forEach(function (k) {
      var c = G.map.cells[k];
      minX = Math.min(minX, c.x - size); maxX = Math.max(maxX, c.x + size);
      minY = Math.min(minY, c.y - size); maxY = Math.max(maxY, c.y + size);
    });
    var pad = 10;
    svg.setAttribute("viewBox", (minX - pad) + " " + (minY - pad) + " " + (maxX - minX + pad * 2) + " " + (maxY - minY + pad * 2));
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    G.map.order.forEach(function (k) {
      var c = G.map.cells[k];
      var poly = document.createElementNS(NS, "polygon");
      poly.setAttribute("points", hexPoints(c.x, c.y, size - 1.5));
      poly.setAttribute("class", "hex");
      poly.dataset.key = k;
      /* 键盘可达性：默认 tabindex="-1"（不进 Tab 序列，否则 61 个格子会把 Tab 顺序撑爆），
         只在放置模式下由 updateMap 把合法格子改成 0。回车/空格等同于点击。 */
      poly.setAttribute("tabindex", "-1");
      poly.setAttribute("role", "button");
      poly.addEventListener("click", function () { onCellClick(k); });
      poly.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " " || ev.key === "Spacebar") {
          ev.preventDefault();
          onCellClick(k);
        }
      });
      poly.addEventListener("mouseenter", function () {
        var lab = cellEls[k] && cellEls[k].lab;
        if (lab && lab.textContent) svg.appendChild(lab);
      });
      svg.appendChild(poly);
      var lab = document.createElementNS(NS, "text");
      lab.setAttribute("x", c.x); lab.setAttribute("y", c.y);
      lab.setAttribute("class", "hex-lab");
      svg.appendChild(lab);
      var own = document.createElementNS(NS, "text");
      own.setAttribute("x", c.x); own.setAttribute("y", c.y + 1);
      own.setAttribute("class", "hex-own");
      svg.appendChild(own);
      cellEls[k] = { poly: poly, lab: lab, own: own };
    });
    mapBuilt = true;
  }

  function updateMap(G, opts) {
    if (!mapBuilt) return;
    opts = opts || {};
    var valid = {};
    (opts.validCells || []).forEach(function (k) { valid[k] = true; });
    var placing = !!opts.placeMode;

    G.map.order.forEach(function (k, idx) {
      var c = G.map.cells[k];
      var ref = cellEls[k];
      if (!ref) return;
      var cls = "hex";
      if (c.tile === "ocean") cls += " tile-ocean";
      else if (c.tile === "greenery") cls += " tile-greenery";
      else if (c.tile === "city") cls += " tile-city";
      else if (c.oceanReserved) cls += " ocean-res";
      if (placing) cls += valid[k] ? " valid" : " dim";
      /* 只给「价值够高」的空格描金边。判据不能写成 c.bonus 是否存在——
         每个格子都有印刷奖励，那样会把整张地图点亮，高亮就失去意义了。 */
      else if (!c.tile && !c.oceanReserved && E.bonusValue(c.bonus) >= E.HOT_BONUS_VALUE) cls += " bonus-hot";
      ref.poly.setAttribute("class", cls);
      ref.poly.style.cursor = placing && valid[k] ? "pointer" : "default";

      /* 放置模式下：只有合法格子进 Tab 序列，并带上"第几格、能不能放"的说明。
         不用 aria-label 描述的话，读屏只会念一串没有意义的"按钮"。 */
      var target = placing && !!valid[k];
      ref.poly.setAttribute("tabindex", target ? "0" : "-1");
      ref.poly.setAttribute("aria-label", cellLabel(c, idx, placing, !!valid[k]));
      if (placing) ref.poly.setAttribute("aria-disabled", target ? "false" : "true");
      else ref.poly.removeAttribute("aria-disabled");

      if (c.tile) {
        ref.lab.textContent = "";
        ref.own.textContent = c.tile === "ocean" ? "" : playerMark(G, c.owner);
        /* 这里原本写 setAttribute("fill", c.tile === "city" ? "#fff" : "#fff")：
           两个分支同值，而且 CSS 规则（.hex-own）本来就覆盖表现属性，
           所以它从来没起过作用。颜色统一由 CSS 管，删掉免得下次有人以为它是白色的。 */
      } else {
        ref.own.textContent = "";
        var b = c.bonus || {};
        var txt = [];
        for (var bk in b) txt.push(BONUS_LABEL[bk] + (b[bk] > 1 ? b[bk] : ""));
        ref.lab.textContent = txt.join(" ");
        /* 同上：原来写 setAttribute("fill", c.oceanReserved ? "#5d8fb0" : "#8a6a52")，
           但 CSS 的 .hex-lab{fill:...} 一直覆盖着它 —— 也就是说「海洋预留格的标签变蓝」
           这条分支从未生效（实测所有 .hex-lab 都是 #8a6a52）。
           顺带一提，那个 #5d8fb0 压在 #dfe9f0 上只有 2.83:1，本来也不该用。
           现在颜色只由 CSS 决定，这里不再设 fill。 */
      }
    });
  }

  function playerMark(G, idx) {
    var p = G.players[idx];
    if (!p) return "";
    return "①②③④".charAt(idx);
  }

  /* ---------------- 地图图例 ---------------- */
  /* 地图图例。三种地块色必须和 CSS 的 .hex.tile-* 用同一个来源，
     否则图例色块和地图上的实际颜色会各走各的（原本就是各抄一份字面量）。 */
  var MAP_LEGEND = [
    { c: "var(--tile-ocean)", t: "海洋" },
    { c: "var(--tile-green)", t: "绿化" },
    { c: "var(--tile-city)", t: "城市" },
    { c: "var(--gold)", t: "好奖励格", ring: true }
  ];
  function renderMapLegend() {
    var box = $("#mapLegend");
    if (!box) return;
    box.innerHTML = MAP_LEGEND.map(function (x) {
      var style = x.ring
        ? "background:transparent;box-shadow:inset 0 0 0 2px " + x.c
        : "background:" + x.c;
      return '<span><i style="' + style + '"></i>' + x.t + "</span>";
    }).join("");
  }

  /* ---------------- 顶栏参数 ---------------- */
  function renderParams(G) {
    var box = $("#tbParams");
    var temp = G.board.temp, oxy = G.board.oxygen, ocn = G.board.ocean;
    var tempC = E.stepToTemp(temp);

    /* 奖励步：温度轨道上有 8 个格子会额外给热量，氧气到 8% 会把温度顶一级。
       把这两类格子标出来，玩家才知道自己在追什么。 */
    var gainText = function (gain) {
      var out = [];
      if (gain.prod) for (var a in gain.prod) out.push(RES_NAME[a] + "产量 +" + gain.prod[a]);
      if (gain.res) for (var b in gain.res) out.push(RES_NAME[b] + " +" + gain.res[b]);
      return out.join("、");
    };
    var hotT = {}, hotO = {};
    for (var st in E.TEMP_BONUS) {
      hotT[st] = "奖励步 " + E.TEMP_BONUS[st].label + "：额外获得 " + gainText(E.TEMP_BONUS[st].gain);
    }
    hotO[E.OXYGEN_BONUS_STEP] = "奖励步 8%：温室效应生效，温度额外 +1 级";

    var mk = function (label, cls, cur, max, valTxt, hot) {
      var ticks = "";
      for (var i = 1; i <= max; i++) {
        var tip = hot && hot[i];
        ticks += '<i class="' + (i <= cur ? "f" : "") + (tip ? " b" : "") + '"' +
                 (tip ? ' title="' + esc(tip) + '"' : "") + "></i>";
      }
      return '<div class="param">' +
        '<span class="param-lab">' + label + "</span>" +
        '<div class="param-track ' + cls + '">' + ticks + "</div>" +
        '<span class="param-val mono">' + valTxt + "</span></div>";
    };
    box.innerHTML =
      mk("温度", "", temp, E.TEMP_STEPS, (tempC > 0 ? "+" : "") + tempC + "°C", hotT) +
      mk("氧气", "o", oxy, E.OXY_STEPS, oxy + "%", hotO) +
      mk("海洋", "c", ocn, E.OCEAN_MAX, ocn + "/9");
    var pct = Math.round(E.progress(G) * 100);
    $("#tbPct").textContent = pct + "%";
    $("#tbPctFill").style.width = pct + "%";
    $("#tbGen").textContent = G.gen;
    $("#tbPhase").textContent = ({ research: "研究阶段", action: "行动阶段", production: "生产阶段", ended: "游戏结束" })[G.phase] || "";
  }

  /* ---------------- 玩家列表 ---------------- */
  function renderPlayers(G) {
    var box = $("#playersCol");
    box.innerHTML = G.players.map(function (p) {
      var corp = p.corpId ? D.corpById[p.corpId] : null;
      var tags = E.allTags(G, p);
      var tagHtml = D.TAG_KEYS.filter(function (t) { return tags[t] > 0; }).map(function (t) {
        return '<span class="pc-tag" style="background:' + TAGS[t].c + '">' + TAGS[t].n + tags[t] + "</span>";
      }).join("");
      var prod = E.RES_KEYS.map(function (k) {
        return '<div class="pc-p"><b style="color:' + RES_COLOR[k] + '">' + p.prod[k] + '</b><span>' + RES_ABBR[k] + "</span></div>";
      }).join("");
      var res = E.RES_KEYS.map(function (k) {
        return "<span>" + RES_NAME[k] + " " + p.res[k] + "</span>";
      }).join("");
      var badges = p.milestones.map(function (i) { return '<span class="pc-badge">' + E.MILESTONES[i].n + "</span>"; }).join("") +
        p.awardsFunded.map(function (i) { return '<span class="pc-badge aw">' + E.AWARDS[i].n + "</span>"; }).join("");
      var cls = "pcard";
      if (G.phase === "action" && G.activePlayer === p.idx) cls += " active";
      if (p.passed) cls += " passed";
      /* 「已跳过」必须写成文字。原来只有 .passed{opacity:.52} 这一个视觉线索，
         读屏用户完全不知道谁跳过了本世代。 */
      var passedTag = p.passed ? '<span class="pc-passed">已跳过</span>' : "";
      return '<div class="' + cls + '" style="--pc:' + p.color + '">' +
        '<div class="pc-top"><span class="pc-dot"></span>' +
        '<span class="pc-name">' + who(p) +
        (corp ? '<span class="pc-corp">' + corp.name + "</span>" : "") + "</span>" +
        passedTag +
        '<span class="pc-tr">TR ' + p.tr + "</span></div>" +
        '<div class="pc-prod">' + prod + "</div>" +
        '<div class="pc-res">' + res + "</div>" +
        (tagHtml ? '<div class="pc-tags">' + tagHtml + "</div>" : "") +
        (badges ? '<div class="pc-badges">' + badges + "</div>" : "") +
        "</div>";
    }).join("");
  }

  /* ---------------- 手牌 ---------------- */
  function cardHTML(G, p, card, opts) {
    opts = opts || {};
    var tags = card.tags.map(function (t) {
      return '<span class="ci-tag" style="background:' + TAGS[t].c + '">' + TAGS[t].n + "</span>";
    }).join("");
    var req = "";
    if (card.req) {
      var chk = E.checkReq(G, p, card);
      var parts = [];
      if (card.req.temp != null) parts.push("温" + card.req.temp + "°C");
      if (card.req.oxygen != null) parts.push("氧" + card.req.oxygen + "%");
      if (card.req.ocean != null) parts.push("海" + card.req.ocean);
      if (card.req.tr != null) parts.push("TR" + card.req.tr);
      if (card.req.tags) for (var t in card.req.tags) parts.push(TAGS[t].n + "×" + card.req.tags[t]);
      req = '<span class="ci-req' + (chk.ok ? " ok" : "") + '">需 ' + parts.join(" ") + "</span>";
    }
    var vp = "";
    if (card.vp) vp = '<span class="ci-vp">' + card.vp + " 分</span>";
    else if (card.vpPer) vp = '<span class="ci-vp">每' + TAGS[card.vpPer.tag].n + " " + card.vpPer.per + " 分</span>";
    var act = card.action ? '<span class="ci-act">▸ ' + esc(card.action.label) + "</span>" : "";
    var cost = opts.costOverride != null ? opts.costOverride : card.cost;
    return '<div class="ci-top"><span class="ci-cost">' + cost + '</span><span class="ci-name">' + esc(card.name) + "</span></div>" +
      '<div class="ci-tags">' + tags + "</div>" +
      '<div class="ci-text">' + esc(card.text) + "</div>" +
      '<div class="ci-foot">' + (req || "<span></span>") + vp + "</div>" + act;
  }

  function renderHand(G, pIdx, onCardClick) {
    var box = $("#handArea");
    var p = G.players[pIdx];
    $("#handCount").textContent = p.hand.length + " 张";
    if (!p.hand.length) {
      box.innerHTML = '<div class="hand-empty">手牌是空的。研究阶段会抽新卡。</div>';
      return;
    }
    box.innerHTML = "";
    p.hand.forEach(function (id) {
      var card = byId[id];
      var chk = E.canPlay(G, p, card);
      var b = document.createElement("button");
      b.type = "button";
      b.className = "card-item " + (chk.ok ? "playable" : "blocked");
      b.style.setProperty("--cc", TYPE_COLOR[card.type]);
      b.dataset.id = id;
      b.innerHTML = cardHTML(G, p, card, { costOverride: E.effectiveCost(G, p, card) });
      b.title = chk.ok ? "点击打出《" + card.name + "》" : chk.msg;
      if (chk.ok) b.addEventListener("click", function () { onCardClick(id); });
      box.appendChild(b);
    });
  }

  /* ---------------- 行动区 ---------------- */
  function renderActions(G, pIdx, H) {
    var p = G.players[pIdx];
    var isTurn = G.phase === "action" && G.activePlayer === pIdx && !p.passed;
    $("#actionCount").textContent = isTurn ? ("本回合剩余 " + (2 - G.turnActions) + " 次行动") : "等待中";
    var box = $("#actionArea");

    var spChips = Object.keys(E.STANDARD_PROJECTS).map(function (k) {
      var sp = E.STANDARD_PROJECTS[k];
      var dis = !isTurn || p.res.mc < sp.cost;
      return '<button class="chip" type="button" data-sp="' + k + '"' + (dis ? " disabled" : "") +
        ">" + sp.n + "<small>" + (sp.cost ? sp.cost + " M€" : "免费") + "</small></button>";
    }).join("");

    var msChips = E.MILESTONES.map(function (m, i) {
      var claimed = G.milestonesClaimed.indexOf(i) >= 0;
      var mine = p.milestones.indexOf(i) >= 0;
      var full = G.milestonesClaimed.length >= E.MAX_MILESTONES;
      var can = !claimed && !full && m.check(G, p) && p.res.mc >= E.MILESTONE_COST && isTurn;
      var cls = mine ? "chip done" : (claimed ? "chip taken" : "chip");
      return '<button class="' + cls + '" type="button" data-ms="' + i + '"' + (can ? "" : " disabled") +
        ' title="' + esc(m.text) + '">' + m.n + "<small>" + (mine ? "已宣称" : claimed ? "已被抢" : E.MILESTONE_COST + " M€") + "</small></button>";
    }).join("");

    var awChips = E.AWARDS.map(function (a, i) {
      var funded = G.awardsFunded.indexOf(i) >= 0;
      var mine = p.awardsFunded.indexOf(i) >= 0;
      var full = G.awardsFunded.length >= E.MAX_AWARDS;
      var cost = E.AWARD_COSTS[G.awardsFunded.length];
      var can = !funded && !full && p.res.mc >= cost && isTurn;
      var cls = mine ? "chip done" : (funded ? "chip taken" : "chip");
      return '<button class="' + cls + '" type="button" data-aw="' + i + '"' + (can ? "" : " disabled") +
        ' title="' + esc(a.text) + '">' + a.n + "<small>" + (mine ? "你资助" : funded ? "已资助" : cost + " M€") + "</small></button>";
    }).join("");

    var actCards = p.played.map(function (id) {
      var c = byId[id];
      if (!c || !c.action) return "";
      var used = !!p.usedActions[id];
      var cost = (c.action.cost && c.action.cost.mc) || 0;
      var can = isTurn && !used && p.res.mc >= cost;
      return '<button class="chip' + (used ? " done" : "") + '" type="button" data-cact="' + id + '"' + (can ? "" : " disabled") +
        ">" + esc(c.name) + "<small>" + esc(c.action.label) + "</small></button>";
    }).join("");

    box.innerHTML =
      '<div class="act-group"><span class="act-title">标准项目</span><div class="act-row">' + spChips + "</div></div>" +
      '<div class="act-group"><span class="act-title">里程碑 · 每个 5 分，全桌限 3 个</span><div class="act-row">' + msChips + "</div></div>" +
      '<div class="act-group"><span class="act-title">奖项 · 第一名 5 分，全桌限 3 个</span><div class="act-row">' + awChips + "</div></div>" +
      (actCards ? '<div class="act-group"><span class="act-title">卡牌行动（每世代一次）</span><div class="act-row">' + actCards + "</div></div>" : "") +
      '<div class="act-group"><span class="act-title">资源转换</span><div class="act-row">' +
      '<button class="chip" type="button" data-conv="plant"' + (isTurn && p.res.plant >= 8 && E.validCells(G, "greenery", p).length ? "" : " disabled") + ">8 植物 → 绿化<small>氧气 +1 · TR +1</small></button>" +
      '<button class="chip" type="button" data-conv="heat"' + (isTurn && p.res.heat >= 8 && G.board.temp < E.TEMP_STEPS ? "" : " disabled") + ">8 热量 → 升温<small>TR +1</small></button>" +
      "</div></div>" +
      '<div class="act-group"><span class="act-title">回合</span><div class="act-row">' +
      '<button class="btn sm" type="button" id="btnEndTurn"' + (isTurn && G.turnActions >= 1 ? "" : " disabled") + ">结束回合</button>" +
      '<button class="btn ghost sm" type="button" id="btnPass"' + (isTurn ? "" : " disabled") + ">跳过（退出本世代）</button>" +
      "</div></div>";

    box.querySelectorAll("[data-sp]").forEach(function (b) {
      b.addEventListener("click", function () { H.onStandard(b.dataset.sp); });
    });
    box.querySelectorAll("[data-ms]").forEach(function (b) {
      b.addEventListener("click", function () { H.onMilestone(+b.dataset.ms); });
    });
    box.querySelectorAll("[data-aw]").forEach(function (b) {
      b.addEventListener("click", function () { H.onAward(+b.dataset.aw); });
    });
    box.querySelectorAll("[data-cact]").forEach(function (b) {
      b.addEventListener("click", function () { H.onCardAction(b.dataset.cact); });
    });
    box.querySelectorAll("[data-conv]").forEach(function (b) {
      b.addEventListener("click", function () { H.onConvert(b.dataset.conv); });
    });
    var et = $("#btnEndTurn"); if (et) et.addEventListener("click", H.onEndTurn);
    var ps = $("#btnPass"); if (ps) ps.addEventListener("click", H.onPass);
  }

  /* ---------------- 回合横幅 / 地图底部 ---------------- */
  function renderTurnBanner(G, pIdx) {
    var b = $("#turnBanner");
    if (G.phase === "ended") {
      b.className = "turn-banner";
      b.innerHTML = "<b>游戏结束</b><span>三项参数全部达标，正在结算分数。</span>";
      return;
    }
    var p = G.players[pIdx];
    b.className = "turn-banner" + (p.isAI ? " ai" : "");
    if (p.isAI) {
      b.innerHTML = "<b>" + esc(p.name) + " 正在行动…</b><span>AI 对手思考中，稍等片刻。</span>";
    } else if (p.passed) {
      b.innerHTML = "<b>你已跳过本世代</b><span>等待其他玩家结束行动后进入生产阶段。</span>";
    } else {
      b.innerHTML = "<b>轮到你行动</b><span>本回合还可以做 " + (2 - G.turnActions) + " 个行动。点手牌出牌，或用右侧的行动按钮。</span>";
    }
  }

  function renderBoardFoot(G, pIdx) {
    var p = G.players[pIdx];
    var chips = [];
    chips.push('<span class="bf-chip">你的板块：城市 ' + E.countTiles(G, p, "city") + " · 绿化 " + E.countTiles(G, p, "greenery") + "</span>");
    chips.push('<span class="bf-chip">已宣称里程碑 ' + G.milestonesClaimed.length + "/3</span>");
    chips.push('<span class="bf-chip">已资助奖项 ' + G.awardsFunded.length + "/3</span>");
    chips.push('<span class="bf-chip">牌堆剩余 ' + G.deck.length + " 张</span>");
    if (p.res.plant >= 8) chips.push('<span class="bf-chip act">植物已够 8 个，可以换绿化</span>');
    if (p.res.heat >= 8) chips.push('<span class="bf-chip act">热量已够 8 点，可以升温</span>');
    $("#boardFoot").innerHTML = chips.join("");
  }

  function renderBoardHint(text, active) {
    var h = $("#boardHint");
    h.textContent = text;
    h.className = "board-hint" + (active ? " active" : "");
  }

  /* ---------------- 日志 ---------------- */
  function renderLog(G) {
    var box = $("#logBody");
    var html = G.log.slice(-90).reverse().map(function (l) {
      return '<div><span class="g">G' + l.gen + "</span> " + esc(l.text) + "</div>";
    }).join("");
    box.innerHTML = html || "<div>暂无记录。</div>";
  }

  /* ---------------- 终局计分表 ---------------- */
  function scoreTableHTML(G) {
    var rows = G.finalScores.map(function (s, i) {
      return '<tr class="' + (i === 0 ? "win" : "") + '">' +
        '<td><span class="rank ' + (i === 0 ? "r1" : "") + '">' + (i + 1) + "</span></td>" +
        "<td><b>" + who(s) + "</b></td>" +
        '<td class="num">' + s.tr + "</td>" +
        '<td class="num">' + s.msVP + "</td>" +
        '<td class="num">' + s.awVP + "</td>" +
        '<td class="num">' + s.boardVP + "</td>" +
        '<td class="num">' + s.cardVP + "</td>" +
        '<td class="num">' + s.mcVP + "</td>" +
        '<td class="num tot">' + s.total + "</td></tr>";
    }).join("");
    var detail = G.finalScores.map(function (s) {
      var bits = [];
      if (s.milestones.length) bits.push("里程碑：" + s.milestones.join("、"));
      if (s.awDetail.length) bits.push("奖项：" + s.awDetail.join("、"));
      if (s.cardDetail.length) bits.push("卡牌：" + s.cardDetail.slice(0, 8).join("、") + (s.cardDetail.length > 8 ? " 等" : ""));
      return "<div><b>" + esc(s.name) + "</b> — " + (bits.join("；") || "没有额外得分项") + "</div>";
    }).join("");
    return '<table class="score-table"><thead><tr>' +
      "<th></th><th>玩家</th><th>TR</th><th>里程碑</th><th>奖项</th><th>板块</th><th>卡牌</th><th>M€</th><th>总分</th>" +
      "</tr></thead><tbody>" + rows + "</tbody></table>" +
      '<div class="score-note">' + detail + "</div>";
  }

  /* ---------------- 导出 ---------------- */
  root.TMUI = {
    esc: esc, toast: toast, openModal: openModal, closeModal: closeModal,
    renderStartMars: renderStartMars, renderMapLegend: renderMapLegend,
    buildMap: buildMap, updateMap: updateMap, hexPoints: hexPoints,
    renderParams: renderParams, renderPlayers: renderPlayers,
    renderHand: renderHand, renderActions: renderActions,
    renderTurnBanner: renderTurnBanner, renderBoardFoot: renderBoardFoot,
    renderBoardHint: renderBoardHint, renderLog: renderLog,
    cardHTML: cardHTML, scoreTableHTML: scoreTableHTML,
    TYPE_COLOR: TYPE_COLOR, TYPE_NAME: TYPE_NAME,
    RES_COLOR: RES_COLOR, RES_ABBR: RES_ABBR
  };
})(typeof window !== "undefined" ? window : globalThis);
