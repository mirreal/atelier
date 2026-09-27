/* =========================================================================
   ai.js —— 启发式 AI 对手
   行为原则：前期建产量、中期抢参数、后期收割分数。
   ========================================================================= */
(function (root) {
  "use strict";

  var E = root.TMEngine, D = root.TMCards;
  var byId = D.byId, corpById = D.corpById;

  /* 一单位产量的长期价值（M€） */
  var PROD_VALUE = { mc: 7, steel: 4, titan: 5, plant: 6, energy: 4, heat: 4 };
  var RES_VALUE = { mc: 1, steel: 0.5, titan: 0.75, plant: 0.9, energy: 0.6, heat: 0.6 };

  function cardValue(G, p, card) {
    if (!card) return -99;
    var v = 0;
    var k;
    if (card.prod) for (k in card.prod) v += card.prod[k] * (PROD_VALUE[k] || 4);
    if (card.res) for (k in card.res) v += card.res[k] * (RES_VALUE[k] || 0.6);
    if (card.tr) v += card.tr * 10;
    if (card.temp) v += card.temp * 9;
    if (card.oxygen) v += card.oxygen * 9;
    if (card.ocean) v += card.ocean * 9;
    if (card.tile === "greenery") v += 14;
    if (card.tile === "city") v += 9;
    if (card.draw) v += card.draw * 3;
    if (card.vp) v += card.vp * 5;
    if (card.vpPer) v += card.vpPer.per * 5 * 1.6;
    if (card.action) v += 9;

    // 后期参数快满了，推参数的价值下降
    if (card.temp && G.board.temp >= E.TEMP_STEPS - 2) v -= 9;
    if (card.oxygen && G.board.oxygen >= E.OXY_STEPS - 2) v -= 9;
    if (card.ocean && G.board.ocean >= E.OCEAN_MAX - 2) v -= 9;

    // 引擎偏好：产量卡越早越值钱
    var hasProd = card.prod && Object.keys(card.prod).length;
    if (hasProd && G.gen <= 6) v += 4;
    if (hasProd && G.gen >= 11) v -= 6;

    // 事件卡的一次性收益，后期更值钱
    if (card.type === "event" && G.gen >= 9) v += 2;

    v -= E.effectiveCost(G, p, card) * 0.95;
    return v;
  }

  /* ---------------- 公司选择 ---------------- */
  function chooseCorporation(G, pIdx) {
    var p = G.players[pIdx];
    var best = null, bestV = -1e9;
    p.corpChoices.forEach(function (id) {
      var c = corpById[id];
      var v = c.startMc * 0.5;
      for (var k in (c.startProd || {})) v += c.startProd[k] * (PROD_VALUE[k] || 4) * 1.4;
      for (var k2 in (c.startRes || {})) v += c.startRes[k2] * (RES_VALUE[k2] || 0.6);
      if (c.effect) {
        var t = c.effect.type;
        if (t === "trBonusMc") v += c.effect.amount * 7;
        if (t === "trBonusPlant") v += c.effect.amount * 5;
        if (t === "tagDiscount") v += c.effect.amount * 3.5;
        if (t === "tagProdMc") v += 6;
        if (t === "eventBonusMc") v += 4;
        if (t === "tagSteel") v += 5;
        if (t === "reqFlex") v += 7;
        if (t === "cityProd") v += 6;
        if (t === "energyAsMoney") v += 5;
      }
      if (c.startCards) v += c.startCards * 3;
      if (c.freeCity) v += 8;
      if (v > bestV) { bestV = v; best = id; }
    });
    return best;
  }

  /* ---------------- 买牌决策 ---------------- */
  function pickBuys(G, p, handIds, reserve) {
    reserve = reserve || 5;
    var scored = handIds.map(function (id) {
      return { id: id, v: cardValue(G, p, byId[id]) };
    }).sort(function (a, b) { return b.v - a.v; });
    var buys = [];
    var budget = p.res.mc - reserve;
    for (var i = 0; i < scored.length; i++) {
      if (scored[i].v < 3.6) break;
      if (budget < 3) break;
      buys.push(scored[i].id);
      budget -= 3;
    }
    return buys;
  }

  function chooseStartingCards(G, pIdx) {
    var p = G.players[pIdx];
    return pickBuys(G, p, p.setupHand, 6);
  }

  function chooseResearch(G, pIdx) {
    var p = G.players[pIdx];
    return pickBuys(G, p, p.researchHand, 4);
  }

  /* ---------------- 行动决策 ---------------- */
  /* 返回一个动作描述对象，由外层执行 */
  function decideAction(G, pIdx) {
    var p = G.players[pIdx];
    var mc = p.res.mc;

    /* 0. 三项参数已满：当前世代结束后游戏就终局，此时不该再拖着行动。
       必须放在最前面 —— 下面「建城市」那条分支没有参数守卫，只要有钱有地就会一直触发，
       AI 会无限建城市、永不 pass，于是世代永远结束不了、游戏卡死在 action 阶段
       （症状：三项参数都推满了，但 phase 一直是 action、scores 为 null）。 */
    if (E.allMaxed(G)) return { type: "pass" };

    /* 1. 里程碑：8 M€ 换 5 分，非常划算，但别把钱花光 */
    if (G.milestonesClaimed.length < E.MAX_MILESTONES && mc >= 18) {
      for (var i = 0; i < E.MILESTONES.length; i++) {
        if (G.milestonesClaimed.indexOf(i) >= 0) continue;
        if (E.MILESTONES[i].check(G, p)) return { type: "milestone", idx: i };
      }
    }

    /* 2. 8 植物换绿化：全游戏性价比最高的动作 */
    if (p.res.plant >= 8 && E.validCells(G, "greenery", p).length) {
      return { type: "plants", cell: E.autoPickCell(G, p, "greenery") };
    }

    /* 3. 8 热量升温 */
    if (p.res.heat >= 8 && G.board.temp < E.TEMP_STEPS) return { type: "heat" };

    /* 4. 出牌：挑价值最高的可出卡 */
    var playable = p.hand.map(function (id) { return { id: id, c: byId[id] }; })
      .filter(function (x) { return E.canPlay(G, p, x.c).ok; })
      .map(function (x) { return { id: x.id, c: x.c, v: cardValue(G, p, x.c) }; })
      .sort(function (a, b) { return b.v - a.v; });

    if (playable.length && playable[0].v > 1.5) {
      var pick = playable[0];
      var need = E.effectiveCost(G, p, pick.c);
      // 别把现金花到 3 以下（还要买卡）
      if (mc >= need || (mc + p.res.steel * 2 + p.res.titan * 3) >= need + 3) {
        var cell = pick.c.tile ? E.autoPickCell(G, p, pick.c.tile) : null;
        if (!pick.c.tile || cell) return { type: "card", cardId: pick.id, cell: cell };
      }
    }

    /* 5. 蓝卡行动（每世代一次，白拿资源） */
    for (var j = 0; j < p.played.length; j++) {
      var cid = p.played[j];
      var card = byId[cid];
      if (!card || !card.action || p.usedActions[cid]) continue;
      var cost = (card.action.cost && card.action.cost.mc) || 0;
      if (mc >= cost + 10) return { type: "cardAction", cardId: cid };
    }

    /* 6. 资助奖项：钱多得没处花时 */
    if (G.awardsFunded.length < E.MAX_AWARDS && mc >= 45) {
      var cost2 = E.AWARD_COSTS[G.awardsFunded.length];
      if (mc >= cost2 + 20) {
        for (var a = 0; a < E.AWARDS.length; a++) {
          if (G.awardsFunded.indexOf(a) >= 0) continue;
          return { type: "award", idx: a };
        }
      }
    }

    /* 7. 标准项目：现金充裕时推参数 */
    if (G.board.temp < E.TEMP_STEPS && mc >= 45) {
      return { type: "standard", kind: "asteroid" };
    }
    if (G.board.ocean < E.OCEAN_MAX && mc >= 50) {
      return { type: "standard", kind: "aquifer", cell: E.autoPickCell(G, p, "ocean") };
    }
    if (mc >= 55 && E.validCells(G, "greenery", p).length && G.board.oxygen < E.OXY_STEPS) {
      return { type: "standard", kind: "greenery", cell: E.autoPickCell(G, p, "greenery") };
    }
    if (mc >= 60 && E.validCells(G, "city", p).length) {
      return { type: "standard", kind: "city", cell: E.autoPickCell(G, p, "city") };
    }

    return { type: "pass" };
  }

  function execute(G, pIdx, act) {
    switch (act.type) {
      case "milestone": return E.claimMilestone(G, pIdx, act.idx);
      case "award": return E.fundAward(G, pIdx, act.idx);
      case "plants": return E.convertPlants(G, pIdx, act.cell);
      case "heat": return E.convertHeat(G, pIdx);
      case "card": return E.playCard(G, pIdx, act.cardId, act.cell);
      case "cardAction": return E.useCardAction(G, pIdx, act.cardId);
      case "standard": return E.standardProject(G, pIdx, act.kind, act.cell);
      case "pass": return E.pass(G, pIdx);
      default: return { ok: false, msg: "未知动作" };
    }
  }

  root.TMAI = {
    cardValue: cardValue,
    chooseCorporation: chooseCorporation,
    chooseStartingCards: chooseStartingCards,
    chooseResearch: chooseResearch,
    decideAction: decideAction,
    execute: execute
  };
})(typeof window !== "undefined" ? window : globalThis);
