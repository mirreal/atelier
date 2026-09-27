/* =========================================================================
   main.js —— 游戏流程控制（把引擎、AI、界面串起来）
   ========================================================================= */
(function () {
  "use strict";

  var E = globalThis.TMEngine, AI = globalThis.TMAI, D = globalThis.TMCards, U = globalThis.TMUI;
  var byId = D.byId, corpById = D.corpById;
  var $ = function (s) { return document.querySelector(s); };

  var HUMAN = 0;
  var G = null;
  var placeMode = null;
  var speed = 600;
  var opponents = 2;
  var aiTimer = null;

  /* ==================== 开始界面 ==================== */
  U.renderStartMars($("#startMars"));
  U.renderMapLegend();      // 图例是静态内容，开局前就填好
  /* 规格条的数字直接读数据源，避免和 cards.js 脱节 */
  (function fillSpecs() {
    var set = function (id, v) { var el = $(id); if (el) el.textContent = v; };
    set("#spHex", E.mapCellCount());
    set("#spCards", D.CARDS.length);
    set("#spCorps", D.CORPORATIONS.length);
  })();

  function bindSeg(sel, attr, cb) {
    var box = $(sel);
    box.querySelectorAll("button").forEach(function (b) {
      b.addEventListener("click", function () {
        /* class="on" 只管视觉。读屏用户靠 aria-pressed 才知道当前选的是哪个，
           所以两者必须同步更新——只改 class 的话读屏永远读不出选中态。 */
        box.querySelectorAll("button").forEach(function (x) {
          x.classList.remove("on");
          x.setAttribute("aria-pressed", "false");
        });
        b.classList.add("on");
        b.setAttribute("aria-pressed", "true");
        cb(b.dataset[attr]);
      });
    });
  }
  bindSeg("#segPlayers", "n", function (v) { opponents = +v; });
  bindSeg("#segSpeed", "s", function (v) { speed = +v; });

  $("#btnStart").addEventListener("click", function () {
    $("#startScreen").hidden = true;
    $("#gameScreen").hidden = false;
    newGame();
  });

  /* ==================== 新游戏 ==================== */
  function newGame() {
    clearTimeout(aiTimer);
    placeMode = null;
    /* 清掉上一局的残留：日志面板连同它的内容、还挂着的提示条。
       不清理的话，重开一局时日志面板会开着并显示上一局的记录。 */
    $("#logBar").classList.remove("show");
    $("#logBody").innerHTML = "";
    $("#toast").hidden = true;
    G = E.createGame({
      playerCount: opponents + 1,
      humanIndex: HUMAN,
      seed: Math.floor(Math.random() * 900000) + 1000
    });
    G.players.forEach(function (p, i) {
      if (p.isAI) E.chooseCorporation(G, i, AI.chooseCorporation(G, i));
    });
    U.buildMap(G, $("#mapSvg"), onCellClick);
    render();
    showCorpModal();
  }

  /* ---------------- 选公司 ---------------- */
  function showCorpModal() {
    var me = G.players[HUMAN];
    var list = me.corpChoices.map(function (id) { return corpById[id]; });
    U.openModal(
      "<h2>选择你的公司</h2>" +
      '<p class="sub">每家公司有不同的起始资源和特殊能力，决定你这一局的路线。想熟悉流程就选起步公司。</p>' +
      '<div class="corp-grid">' + list.map(function (c) {
        var starts = [];
        starts.push("起始 " + c.startMc + " M€");
        for (var k in (c.startProd || {})) starts.push(E.RES_NAME[k] + "产量 +" + c.startProd[k]);
        for (var k2 in (c.startRes || {})) starts.push(E.RES_NAME[k2] + " +" + c.startRes[k2]);
        if (c.startCards) starts.push("多抽 " + c.startCards + " 张卡");
        if (c.freeCity) starts.push("开局免费放 1 块城市");
        return '<button class="corp" type="button" data-corp="' + c.id + '" style="--cc:' + c.color + '">' +
          "<h3>" + c.name + "</h3>" +
          '<div class="corp-start">' + starts.join(" · ") + "</div>" +
          "<p>" + c.text + "</p></button>";
      }).join("") + "</div>" +
      '<div class="modal-actions"><button class="btn ghost" id="corpRandom" type="button">随机帮我选</button></div>'
    );
    $("#modalBox").querySelectorAll("[data-corp]").forEach(function (b) {
      b.addEventListener("click", function () { pickCorp(b.dataset.corp); });
    });
    $("#corpRandom").addEventListener("click", function () {
      pickCorp(list[Math.floor(Math.random() * list.length)].id);
    });
  }

  function pickCorp(id) {
    E.chooseCorporation(G, HUMAN, id);
    U.closeModal();
    render();
    setTimeout(showStartingCardsModal, 120);
  }

  /* ---------------- 开局买牌 ---------------- */
  function showStartingCardsModal() {
    E.dealSetupHands(G);
    G.players.forEach(function (p, i) {
      if (p.isAI) E.buyStartingCards(G, i, AI.chooseStartingCards(G, i));
    });
    var me = G.players[HUMAN];
    var hand = me.setupHand.slice();
    U.toast("开局手牌：每张 3 M€，挑你想留的", "ok");
    pickCards(
      "挑选开局手牌",
      "这 10 张卡里，每留 1 张花 3 M€。手牌没有上限，但钱要留一点给第一世代用。",
      hand,
      function (ids) {
        var r = E.buyStartingCards(G, HUMAN, ids);
        if (!r.ok) { U.toast(r.msg, "err"); return false; }
        U.closeModal();
        beginPlay();
        return true;
      }
    );
  }

  /* 通用选牌弹窗 */
  function pickCards(title, sub, ids, onConfirm) {
    var me = G.players[HUMAN];
    var sel = {};
    function draw() {
      var n = Object.keys(sel).length;
      var cost = n * 3;
      U.openModal(
        "<h2>" + U.esc(title) + "</h2>" +
        '<p class="sub">' + U.esc(sub) + "</p>" +
        '<div class="pick-grid">' + ids.map(function (id) {
          var c = byId[id];
          return '<div class="pick' + (sel[id] ? " on" : "") + '" data-id="' + id + '">' +
            '<div class="card-item" style="--cc:' + U.TYPE_COLOR[c.type] + '">' + U.cardHTML(G, me, c) + "</div>" +
            '<span class="tick-mark">✓</span></div>';
        }).join("") + "</div>" +
        '<div class="modal-actions">' +
        '<span style="margin-right:auto;font-weight:800;font-size:13.5px">已选 ' + n + " 张 · 花费 " + cost + " M€ · 你有 " + me.res.mc + " M€</span>" +
        '<button class="btn ghost" id="pkSkip" type="button">一张都不买</button>' +
        '<button class="btn" id="pkOk" type="button"' + (cost > me.res.mc ? " disabled" : "") + ">确认</button>" +
        "</div>"
      );
      $("#modalBox").querySelectorAll(".pick").forEach(function (el) {
        el.addEventListener("click", function () {
          var id = el.dataset.id;
          if (sel[id]) delete sel[id]; else sel[id] = true;
          draw();
        });
      });
      $("#pkSkip").addEventListener("click", function () { if (onConfirm([])) return; });
      $("#pkOk").addEventListener("click", function () {
        if (onConfirm(Object.keys(sel))) return;
      });
    }
    draw();
  }

  /* ---------------- 正式开局 ---------------- */
  function beginPlay() {
    E.startGame(G);
    render();
    setTimeout(step, 400);
  }

  /* ==================== 主循环 ==================== */
  function step() {
    if (!G) return;
    if (G.phase === "ended") { render(); showGameOver(); return; }
    if (G.phase === "research") return stepResearch();
    if (G.phase === "action") return stepAction();
    render();
  }

  function stepResearch() {
    G.players.forEach(function (p, i) {
      if (p.isAI && !p.researchDone) E.resolveResearch(G, i, AI.chooseResearch(G, i));
    });
    var me = G.players[HUMAN];
    render();
    if (!me.researchDone) { showResearchModal(); return; }
    setTimeout(step, 220);
  }

  function showResearchModal() {
    var me = G.players[HUMAN];
    var hand = me.researchHand.slice();
    pickCards(
      "第 " + G.gen + " 世代 · 研究阶段",
      "抽到 4 张卡，每买 1 张花 3 M€，不买的会进弃牌堆，以后拿不到了。",
      hand,
      function (ids) {
        var r = E.resolveResearch(G, HUMAN, ids);
        if (!r.ok) { U.toast(r.msg, "err"); return false; }
        U.closeModal();
        render();
        setTimeout(step, 260);
        return true;
      }
    );
  }

  function stepAction() {
    if (promptPendingOceans(function () { render(); setTimeout(step, 200); })) return;
    var p = G.players[G.activePlayer];
    render();
    if (p.isAI) {
      clearTimeout(aiTimer);
      aiTimer = setTimeout(aiAct, speed);
    }
  }

  function aiAct() {
    if (!G || G.phase !== "action") return step();
    var idx = G.activePlayer;
    var p = G.players[idx];
    if (!p.isAI) return step();
    var act = AI.decideAction(G, idx);
    var r = AI.execute(G, idx, act);
    if (!r || !r.ok) {
      E.pass(G, idx);
    } else if (act.type !== "pass") {
      E.takeActionDone(G, idx);
    }
    render();
    clearTimeout(aiTimer);
    aiTimer = setTimeout(step, speed);
  }

  /* ==================== 人类行动 ==================== */
  function afterHumanAction() {
    if (promptPendingOceans(function () { finishAction(); })) return;
    finishAction();
  }

  function finishAction() {
    E.takeActionDone(G, HUMAN);
    render();
    setTimeout(step, 260);
  }

  function promptPendingOceans(done) {
    /* 先作废无处可放的待放置记录：保留区可能已经被别的玩家填满了。
       不处理的话会进入一个没有任何合法格子的放置模式，玩家卡在里面出不来。 */
    E.discardStaleOceans(G, HUMAN);
    var n = E.pendingOceansFor(G, HUMAN);
    if (!n) return false;
    enterPlace("ocean", "卡牌效果：请选择海洋板块的位置（还剩 " + n + " 个）",
      function (k) { return E.resolvePendingOcean(G, HUMAN, k); },
      function () { promptPendingOceans(done); }
    );
    return true;
  }

  function enterPlace(tile, label, onPick, after) {
    placeMode = { tile: tile, label: label, onPick: onPick, after: after };
    render();
    /* 把焦点送到第一个合法格子：键盘用户按下板块卡之后，
       焦点还停在手牌上，得自己 Tab 一路找过去。直接送过去少 60 次 Tab。 */
    var first = $("#mapSvg .hex.valid[tabindex='0']");
    if (first) first.focus();
  }

  function onCellClick(key) {
    if (!placeMode) return;
    var r = placeMode.onPick(key);
    if (!r || !r.ok) { U.toast((r && r.msg) || "这里不能放", "err"); return; }
    var after = placeMode.after;
    placeMode = null;
    render();
    if (after) after();
  }

  function humanAct(fn, thenAfter) {
    var r = fn();
    if (!r || !r.ok) { U.toast((r && r.msg) || "操作失败", "err"); return false; }
    if (thenAfter) thenAfter(); else afterHumanAction();
    return true;
  }

  var handlers = {
    onStandard: function (kind) {
      if (kind === "sell") return U.toast("把不想留的牌直接弃掉即可（暂时用不到就先留着）", "err");
      var needCell = kind === "aquifer" || kind === "greenery" || kind === "city";
      var tile = kind === "aquifer" ? "ocean" : kind;
      if (needCell) {
        if (!E.validCells(G, tile, G.players[HUMAN]).length) return U.toast("没有符合规则的空格", "err");
        enterPlace(tile, "标准项目「" + E.STANDARD_PROJECTS[kind].n + "」：选择放置位置",
          function (k) { return E.standardProject(G, HUMAN, kind, k); },
          afterHumanAction);
        return;
      }
      humanAct(function () { return E.standardProject(G, HUMAN, kind, null); });
    },
    onMilestone: function (i) {
      humanAct(function () { return E.claimMilestone(G, HUMAN, i); });
    },
    onAward: function (i) {
      humanAct(function () { return E.fundAward(G, HUMAN, i); });
    },
    onCardAction: function (id) {
      humanAct(function () { return E.useCardAction(G, HUMAN, id); });
    },
    onConvert: function (kind) {
      if (kind === "heat") return humanAct(function () { return E.convertHeat(G, HUMAN); });
      enterPlace("greenery", "把 8 植物换成绿化板块：选择放置位置",
        function (k) { return E.convertPlants(G, HUMAN, k); },
        afterHumanAction);
    },
    /* 结束回合 / 跳过 都要先清掉放置模式。否则玩家在放置中途改主意点了「跳过」，
       placeMode 会一路残留到下个世代：轮到自己时地图仍高亮着上一次的合法格，
       而点下去会因为 turnGuard 失败而报错，玩家卡在半截状态里。 */
    onEndTurn: function () {
      placeMode = null;
      E.endTurn(G);
      render();
      setTimeout(step, 240);
    },
    onPass: function () {
      placeMode = null;
      E.pass(G, HUMAN);
      render();
      setTimeout(step, 240);
    }
  };

  function onCardClick(id) {
    var card = byId[id];
    if (card.tile) {
      if (!E.validCells(G, card.tile, G.players[HUMAN]).length) return U.toast("没有符合规则的空格", "err");
      enterPlace(card.tile, "打出《" + card.name + "》：选择放置位置",
        function (k) { return E.playCard(G, HUMAN, id, k); },
        afterHumanAction);
      return;
    }
    humanAct(function () { return E.playCard(G, HUMAN, id, null); });
  }

  /* ==================== 渲染 ==================== */
  function render() {
    if (!G) return;
    U.renderParams(G);
    U.renderPlayers(G);
    U.renderHand(G, HUMAN, onCardClick);
    U.renderActions(G, HUMAN, handlers);
    U.renderTurnBanner(G, G.activePlayer);
    U.renderBoardFoot(G, HUMAN);
    U.renderLog(G);
    /* 终局后把重开入口也放进日志面板：结算弹窗的「看看日志」会先关掉弹窗，
       只留弹窗一个入口的话，玩家关闭日志后就再也找不到出口，只能刷新页面。 */
    $("#btnRestart").classList.toggle("show", G.phase === "ended");
    if (placeMode) {
      U.updateMap(G, { validCells: E.validCells(G, placeMode.tile, G.players[HUMAN]), placeMode: true });
      U.renderBoardHint(placeMode.label, true);
    } else {
      U.updateMap(G, {});
      U.renderBoardHint("点击地图上的格子放置板块（绿色＝绿化，紫色＝城市，蓝色＝海洋）", false);
    }
    /* 取消按钮只在放置模式下出现。Esc 键仍然保留，但不能是唯一出口 —— 手机没有 Esc。 */
    $("#btnCancelPlace").hidden = !placeMode;
  }

  /* ==================== 终局 ==================== */
  /* 回到开始界面。弹窗和日志面板都要收起来——否则重开一局时它们会留在屏幕上。 */
  function backToStart() {
    U.closeModal();
    $("#logBar").classList.remove("show");
    $("#gameScreen").hidden = true;
    $("#startScreen").hidden = false;
  }

  function showGameOver() {
    var me = G.finalScores.filter(function (s) { return s.idx === HUMAN; })[0];
    var won = G.winner === HUMAN;
    U.openModal(
      "<h2>" + (won ? "你赢了！" : "游戏结束") + "</h2>" +
      '<p class="sub">三项全球参数全部达标，火星完成改造。你以 ' + me.total + " 分位列第 " +
      (G.finalScores.indexOf(me) + 1) + " 名。</p>" +
      U.scoreTableHTML(G) +
      '<div class="modal-actions">' +
      '<button class="btn ghost" id="goLog" type="button">看看日志</button>' +
      '<button class="btn" id="goAgain" type="button">再来一局</button></div>'
    );
    $("#goAgain").addEventListener("click", backToStart);
    $("#goLog").addEventListener("click", function () {
      /* 只关弹窗、打开日志。日志面板里有「再来一局」，所以这条分支不会把玩家堵死。 */
      U.closeModal();
      $("#logBar").classList.add("show");
    });
  }

  /* ==================== 杂项 ==================== */
  $("#btnLogToggle").addEventListener("click", function () {
    $("#logBar").classList.toggle("show");
  });
  $("#btnLogClose").addEventListener("click", function () {
    $("#logBar").classList.remove("show");
  });
  /* 日志面板里的重开入口。只在终局后出现，显隐由 render() 按 G.phase 控制。 */
  $("#btnRestart").addEventListener("click", backToStart);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && placeMode) { placeMode = null; render(); }
  });
  /* 「取消放置」按钮：Esc 的等价出口，给触屏用户用 */
  $("#btnCancelPlace").addEventListener("click", function () {
    if (!placeMode) return;
    placeMode = null;
    render();
  });

  /* 调试出口：方便排查问题与自动化验收 */
  window.__tm = {
    get game() { return G; },
    get phase() { return G && G.phase; },
    get gen() { return G && G.gen; },
    get board() { return G && JSON.parse(JSON.stringify(G.board)); },
    get human() {
      if (!G) return null;
      var p = G.players[HUMAN];
      return { tr: p.tr, prod: p.prod, res: p.res, hand: p.hand.length, played: p.played.length, passed: p.passed };
    },
    get activePlayer() { return G && G.activePlayer; },
    get activeIsAI() { return G && G.players[G.activePlayer].isAI; },
    get placeMode() { return placeMode ? { tile: placeMode.tile } : null; },
    get modalOpen() { return !$("#modal").hidden; },
    get scores() { return G && G.finalScores ? G.finalScores.map(function (s) { return { name: s.name, total: s.total }; }) : null; },
    start: function (n, sp) {
      opponents = n == null ? 2 : n;
      speed = sp || 60;
      $("#startScreen").hidden = true;
      $("#gameScreen").hidden = false;
      newGame();
    },
    /* 自动走完开局设置 */
    autoCorp: function () { var b = $("#corpRandom"); if (b) b.click(); },
    pickNone: function () { var b = $("#pkSkip"); if (b) b.click(); },
    pickSome: function (n) {
      var els = $("#modalBox").querySelectorAll(".pick");
      for (var i = 0; i < Math.min(n, els.length); i++) els[i].click();
      var ok = $("#pkOk"); if (ok) ok.click();
    },
    /* 交互探测 */
    clickFirstPlayableCard: function () {
      var b = document.querySelector("#handArea .card-item.playable");
      if (!b) return false;
      b.click(); return true;
    },
    clickCell: function (key) {
      var poly = document.querySelector('#mapSvg .hex.valid[data-key="' + key + '"]')
        || document.querySelector('#mapSvg .hex[data-key="' + key + '"]');
      if (!poly) return false;
      poly.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return true;
    },
    firstValidCell: function () {
      var poly = document.querySelector("#mapSvg .hex.valid");
      return poly ? poly.dataset.key : null;
    },
    clickChip: function (sel) { var b = document.querySelector(sel); if (b && !b.disabled) { b.click(); return true; } return false; },
    endTurn: function () { var b = $("#btnEndTurn"); if (b && !b.disabled) { b.click(); return true; } return false; },
    pass: function () { var b = $("#btnPass"); if (b && !b.disabled) { b.click(); return true; } return false; },
    forceEnd: function () {
      /* 加速终局：把所有参数直接推满，便于验收结算界面 */
      if (!G) return false;
      G.board.temp = E.TEMP_STEPS; G.board.oxygen = E.OXY_STEPS; G.board.ocean = E.OCEAN_MAX;
      E.runProduction(G);
      render();
      step();
      return true;
    },
    step: step,
    /* 只重画、不改状态。自动化验收里用来把「塞进手牌 / 改资源」这类夹具渲染出来，
       免得测试只能靠随机手牌碰运气（碰不到就直接跳过，等于没测）。 */
    render: render
  };
})();
