/* =========================================================================
   engine.js —— 纯逻辑规则引擎（不碰 DOM，可在 Node 里直接跑）
   参考《重塑火星》基础版（Tharsis 地图）规则。
   ========================================================================= */
(function (root) {
  "use strict";

  var D = root.TMCards;
  var CARDS = D.CARDS, CORPORATIONS = D.CORPORATIONS, byId = D.byId, corpById = D.corpById;

  /* ---------------- 常量 ---------------- */
  var RES_KEYS = ["mc", "steel", "titan", "plant", "energy", "heat"];
  var RES_NAME = { mc: "M€", steel: "钢铁", titan: "钛", plant: "植物", energy: "能源", heat: "热量" };
  var TEMP_STEPS = 19;      // −30°C → +8°C，每级 2°C
  var OXY_STEPS = 14;       // 0% → 14%
  var OCEAN_MAX = 9;
  var TOTAL_STEPS = TEMP_STEPS + OXY_STEPS + OCEAN_MAX;   // 42
  var MAX_TR = 20 + TOTAL_STEPS;                            // 62

  var STANDARD_PROJECTS = {
    sell: { n: "卖专利", cost: 0, text: "弃掉任意张手牌，每张换 1 M€。" },
    power: { n: "发电厂", cost: 11, text: "能源产量 +1。" },
    asteroid: { n: "小行星", cost: 14, text: "温度 +1 级（TR +1）。" },
    aquifer: { n: "含水层", cost: 18, text: "放置 1 块海洋（TR +1）。" },
    greenery: { n: "绿化", cost: 23, text: "放置 1 块绿化板块，氧气 +1（TR +1）。" },
    city: { n: "城市", cost: 25, text: "放置 1 块城市板块，M€ 产量 +1。" }
  };

  var MILESTONES = [
    { n: "改造者", text: "TR 达到 35", check: function (G, p) { return p.tr >= 35; } },
    { n: "市长", text: "拥有 3 块城市板块", check: function (G, p) { return countTiles(G, p, "city") >= 3; } },
    { n: "园丁", text: "拥有 3 块绿化板块", check: function (G, p) { return countTiles(G, p, "greenery") >= 3; } },
    { n: "建造者", text: "场上 8 个建筑标签", check: function (G, p) { return tagCount(G, p, "building") >= 8; } },
    { n: "规划者", text: "手牌达到 16 张", check: function (G, p) { return p.hand.length >= 16; } }
  ];
  var MILESTONE_COST = 8, MILESTONE_VP = 5, MAX_MILESTONES = 3;

  var AWARDS = [
    { n: "地主", text: "场上板块最多", score: function (G, p) { return countTiles(G, p, "any"); } },
    { n: "银行家", text: "M€ 产量最高", score: function (G, p) { return p.prod.mc; } },
    { n: "科学家", text: "科学标签最多", score: function (G, p) { return tagCount(G, p, "science"); } },
    { n: "热力学家", text: "热量资源最多", score: function (G, p) { return p.res.heat; } },
    { n: "矿工", text: "钢铁 + 钛资源最多", score: function (G, p) { return p.res.steel + p.res.titan; } }
  ];
  var AWARD_COSTS = [8, 14, 20], MAX_AWARDS = 3;

  /* ---------------- 小工具 ---------------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function shuffle(arr, rnd) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function tempToStep(c) { return Math.round((c + 30) / 2); }
  function stepToTemp(s) { return -30 + s * 2; }
  function hexKey(q, r) { return q + "," + r; }

  /* ---------------- 六角地图 ---------------- */
  var HEX_DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  var MAP_R = 4;
  var HEX_SIZE = 34;

  var BONUS_POOL = [
    { steel: 1 }, { steel: 2 }, { titan: 1 }, { plant: 1 }, { plant: 2 },
    { energy: 1 }, { heat: 1 }, { heat: 2 }, { mc: 3 }, { card: 1 },
    { steel: 1 }, { plant: 1 }, { heat: 1 }, { titan: 1 }
  ];
  /* 海洋保留区也有印刷的放置奖励（规则书：「该格印刷的放置奖励（如果有）」） */
  var OCEAN_BONUS_POOL = [
    { plant: 1 }, { plant: 2 }, { steel: 1 }, { titan: 1 },
    { mc: 2 }, { heat: 1 }, { card: 1 }, { plant: 1 }, { mc: 2 }, { titan: 1 }
  ];

  /* 印刷奖励的估值（统一按 M€ 口径近似，不是精确换算）。
     用途：地图上把「特别划算的格子」挑出来描金边。注意每个格子都有印刷奖励，
     所以判据必须是「价值够高」而不是「有奖励」——后者会把整张地图都点亮，等于没高亮。 */
  var BONUS_VALUE = { mc: 1, steel: 2, titan: 3, plant: 2, energy: 1, heat: 2, card: 4 };
  var HOT_BONUS_VALUE = 4;          // 达到这个价值的格子值得优先抢
  function bonusValue(bonus) {
    if (!bonus) return 0;
    var v = 0;
    for (var k in bonus) v += (BONUS_VALUE[k] || 0) * bonus[k];
    return v;
  }

  /* 奖励步（Bonus Steps）：
     官方规则书说明「温度奖励步给热量产量」「氧气到 8% 时温度上升」，
     具体数值印在版图上。下表是按常见版本还原的，集中放在这里方便调整。
     温度步号 s 对应温度 = −30 + 2s。 */
  var TEMP_BONUS = {
    3:  { label: "−24°C", gain: { prod: { heat: 1 } } },
    5:  { label: "−20°C", gain: { res: { heat: 3 } } },
    7:  { label: "−16°C", gain: { prod: { heat: 1 } } },
    9:  { label: "−12°C", gain: { res: { heat: 3 } } },
    11: { label: "−8°C",  gain: { prod: { heat: 1 } } },
    13: { label: "−4°C",  gain: { res: { heat: 3 } } },
    15: { label: "0°C",   gain: { prod: { heat: 1 } } },
    17: { label: "+4°C",  gain: { res: { heat: 3 } } }
  };
  var OXYGEN_BONUS_STEP = 8;   // 氧气到 8% → 温度再 +1 级

  function buildMap(seed) {
    var rnd = mulberry32(seed || 12345);
    var cells = {}, order = [];
    var q, r;
    for (q = -MAP_R; q <= MAP_R; q++) {
      var rMin = Math.max(-MAP_R, -q - MAP_R);
      var rMax = Math.min(MAP_R, -q + MAP_R);
      for (r = rMin; r <= rMax; r++) {
        var key = hexKey(q, r);
        cells[key] = {
          key: key, q: q, r: r,
          x: HEX_SIZE * 1.5 * q,
          y: HEX_SIZE * Math.sqrt(3) * (r + q / 2),
          oceanReserved: false,
          bonus: null, tile: null, owner: null
        };
        order.push(key);
      }
    }
    // 9 个海洋预留格：左边缘 5 格 + 下边缘 4 格，形成一条海岸线
    var oceanKeys = [];
    for (r = 0; r <= 4; r++) oceanKeys.push(hexKey(-4, r));
    for (q = -3; q <= 0; q++) oceanKeys.push(hexKey(q, 4));
    oceanKeys.forEach(function (k) { if (cells[k]) cells[k].oceanReserved = true; });

    // 每一格都分配放置奖励（海洋保留区用另一套池子）
    order.forEach(function (k) {
      var c = cells[k];
      var pool = c.oceanReserved ? OCEAN_BONUS_POOL : BONUS_POOL;
      c.bonus = pool[Math.floor(rnd() * pool.length)];
    });
    return { cells: cells, order: order, oceanKeys: oceanKeys };
  }

  function neighbors(map, key) {
    var c = map.cells[key];
    if (!c) return [];
    var out = [];
    for (var i = 0; i < 6; i++) {
      var nk = hexKey(c.q + HEX_DIRS[i][0], c.r + HEX_DIRS[i][1]);
      if (map.cells[nk]) out.push(nk);
    }
    return out;
  }

  function countTiles(G, p, type) {
    var n = 0;
    for (var k in G.map.cells) {
      var c = G.map.cells[k];
      if (c.owner !== p.idx) continue;
      if (type === "any") n++;
      else if (type === "greenery" && c.tile === "greenery") n++;
      else if (type === "city" && c.tile === "city") n++;
    }
    return n;
  }

  /* ---------------- 标签统计（事件卡不计） ---------------- */
  function tagCount(G, p, tag) {
    var n = 0;
    p.played.forEach(function (id) {
      var c = byId[id];
      if (!c || c.type === "event") return;
      if (c.tags.indexOf(tag) >= 0) n++;
    });
    return n;
  }
  function allTags(G, p) {
    var out = {};
    D.TAG_KEYS.forEach(function (t) { out[t] = 0; });
    p.played.forEach(function (id) {
      var c = byId[id];
      if (!c || c.type === "event") return;
      c.tags.forEach(function (t) { out[t] = (out[t] || 0) + 1; });
    });
    return out;
  }

  /* ---------------- 公司能力 ---------------- */
  function corpEffect(p, type) {
    var corp = corpById[p.corpId];
    if (!corp || !corp.effect) return null;
    return corp.effect.type === type ? corp.effect : null;
  }

  function gainTR(G, p, n, reason) {
    if (n <= 0) return;
    p.tr += n;
    var e = corpEffect(p, "trBonusMc");
    if (e) p.res.mc += e.amount * n;
    var e2 = corpEffect(p, "trBonusPlant");
    if (e2) p.res.plant += e2.amount * n;
    if (reason) log(G, p.name + " TR +" + n + "（" + reason + "）");
  }

  function log(G, text) {
    G.log.push({ gen: G.gen, text: text });
    if (G.log.length > 400) G.log.shift();
  }

  /* ---------------- 创建游戏 ---------------- */
  function createGame(opts) {
    opts = opts || {};
    var count = opts.playerCount || 3;
    var humanIdx = opts.humanIndex == null ? 0 : opts.humanIndex;
    var seed = opts.seed || 20260920;
    var rnd = mulberry32(seed);
    var names = opts.names || ["你", "远星集团", "红壤资本", "蓝色地平线"];
    /* 玩家配色只用来画玩家卡左侧色条与圆点（--pc），不带文字。
       走 token 而不是字面量，避免和资源色/标签色各留一份、以后改一处漏一处。 */
    var colors = ["var(--rust)", "var(--blue)", "var(--green)", "var(--purple)"];

    var G = {
      seed: seed,
      gen: 1,
      phase: "setup_corp",
      map: buildMap(seed),
      players: [],
      deck: [],
      discard: [],
      board: { temp: 0, oxygen: 0, ocean: 0 },
      activePlayer: 0,
      turnActions: 0,
      milestonesClaimed: [],
      awardsFunded: [],
      pendingOceans: [],
      log: [],
      winner: null,
      finalScores: null
    };

    var deckIds = CARDS.map(function (c) { return c.id; });
    shuffle(deckIds, rnd);
    G.deck = deckIds;

    for (var i = 0; i < count; i++) {
      var p = {
        idx: i,
        id: "P" + i,
        name: names[i] || ("玩家" + (i + 1)),
        isAI: i !== humanIdx,
        color: colors[i % colors.length],
        corpId: null,
        corpChoices: [],
        tr: 20,
        prod: { mc: 1, steel: 1, titan: 1, plant: 1, energy: 1, heat: 1 },
        res: { mc: 0, steel: 0, titan: 0, plant: 0, energy: 0, heat: 0 },
        hand: [], played: [], events: [],
        usedActions: {}, passed: false,
        setupHand: [], setupBought: false,
        milestones: [], awardsFunded: []
      };
      // 两张公司卡备选
      var pool = CORPORATIONS.filter(function (c) { return c.id !== "corp_beginner"; });
      shuffle(pool, rnd);
      p.corpChoices = [pool[0].id, pool[1].id];
      G.players.push(p);
    }
    return G;
  }

  /* ---------------- 公司选择 ---------------- */
  function chooseCorporation(G, pIdx, corpId) {
    var p = G.players[pIdx];
    var corp = corpById[corpId];
    if (!corp) return { ok: false, msg: "没有这家公司" };
    p.corpId = corpId;
    p.res.mc += corp.startMc;
    if (corp.startCards) { /* 起始额外抽牌在发牌后处理 */ }
    for (var k in (corp.startProd || {})) p.prod[k] += corp.startProd[k];
    for (var k2 in (corp.startRes || {})) p.res[k2] += corp.startRes[k2];
    if (corp.freeCity) p.freeCity = true;
    return { ok: true };
  }

  /* ---------------- 开局发牌 ---------------- */
  function dealSetupHands(G) {
    G.players.forEach(function (p) {
      var n = 10;
      var corp = corpById[p.corpId];
      if (corp && corp.startCards) n += corp.startCards;
      p.setupHand = G.deck.splice(0, n);
    });
    G.phase = "setup_cards";
  }

  function buyStartingCards(G, pIdx, ids) {
    var p = G.players[pIdx];
    if (p.setupBought) return { ok: false, msg: "已经选过了" };
    var cost = ids.length * 3;
    if (cost > p.res.mc) return { ok: false, msg: "M€ 不足" };
    p.res.mc -= cost;
    ids.forEach(function (id) {
      var i = p.setupHand.indexOf(id);
      if (i >= 0) { p.setupHand.splice(i, 1); p.hand.push(id); }
    });
    // 没买的进弃牌堆
    G.discard = G.discard.concat(p.setupHand);
    p.setupHand = [];
    p.setupBought = true;
    return { ok: true, cost: cost };
  }

  function startGame(G) {
    G.players.forEach(function (p) {
      if (!p.corpId) p.corpId = "corp_beginner";
      if (!p.setupBought) {
        G.discard = G.discard.concat(p.setupHand);
        p.setupHand = [];
        p.setupBought = true;
      }
    });
    // 免费城市（塔尔西斯共和国）
    G.players.forEach(function (p) {
      if (p.freeCity) {
        var cell = autoPickCell(G, p, "city");
        if (cell) placeTile(G, p, "city", cell, true);
        p.freeCity = false;
      }
    });
    G.gen = 1;
    G.phase = "action";
    G.activePlayer = 0;
    G.turnActions = 0;
    log(G, "第 1 世代开始。开局世代跳过回合顺序与研究阶段，直接进入行动阶段。");
    return G;
  }

  /* ---------------- 需求 / 费用 ---------------- */
  function checkReq(G, p, card) {
    var req = card.req;
    if (!req) return { ok: true };
    var flex = 0;
    var e = corpEffect(p, "reqFlex");
    if (e) flex = e.amount;
    if (req.temp != null) {
      var need = Math.max(0, tempToStep(req.temp) - flex);
      if (G.board.temp < need) return { ok: false, msg: "需要温度 ≥ " + req.temp + "°C（当前 " + stepToTemp(G.board.temp) + "°C）" };
    }
    if (req.oxygen != null) {
      var needO = Math.max(0, req.oxygen - flex);
      if (G.board.oxygen < needO) return { ok: false, msg: "需要氧气 ≥ " + req.oxygen + "%（当前 " + G.board.oxygen + "%）" };
    }
    if (req.ocean != null) {
      if (G.board.ocean < req.ocean) return { ok: false, msg: "需要 " + req.ocean + " 块海洋（当前 " + G.board.ocean + "）" };
    }
    if (req.tr != null) {
      if (p.tr < req.tr) return { ok: false, msg: "需要 TR ≥ " + req.tr + "（当前 " + p.tr + "）" };
    }
    if (req.tags) {
      for (var t in req.tags) {
        if (tagCount(G, p, t) < req.tags[t]) {
          return { ok: false, msg: "需要 " + req.tags[t] + " 个" + D.TAGS[t].n + "标签（当前 " + tagCount(G, p, t) + "）" };
        }
      }
    }
    return { ok: true };
  }

  function effectiveCost(G, p, card) {
    var cost = card.cost;
    card.tags.forEach(function (t) {
      var e = corpEffect(p, "tagDiscount");
      if (e && e.tag === t) cost -= e.amount;
    });
    return Math.max(0, cost);
  }

  /* 计算用钢铁 / 钛 / 能源最多能抵扣多少（不能超额支付）
     钢铁只能付建筑卡（1 个 = 2 M€），钛只能付太空卡（1 个 = 3 M€） */
  function bestResourceCover(p, amount, card) {
    var canSteel = !!card && card.tags.indexOf("building") >= 0;
    var canTitan = !!card && card.tags.indexOf("space") >= 0;
    var energyMoney = !!corpEffect(p, "energyAsMoney");
    var maxT = canTitan ? Math.min(p.res.titan, Math.floor(amount / 3)) : 0;
    var best = -1, bt = 0, bs = 0, be = 0;
    for (var t = 0; t <= maxT; t++) {
      var rem1 = amount - t * 3;
      var maxS = canSteel ? Math.min(p.res.steel, Math.floor(rem1 / 2)) : 0;
      for (var s = 0; s <= maxS; s++) {
        var rem2 = rem1 - s * 2;
        var e = energyMoney ? Math.min(p.res.energy, rem2) : 0;
        var val = t * 3 + s * 2 + e;
        if (val > best) { best = val; bt = t; bs = s; be = e; }
      }
    }
    if (best < 0) best = 0;
    return { val: best, t: bt, s: bs, e: be };
  }

  function canAfford(G, p, amount, card) {
    var r = bestResourceCover(p, amount, card);
    return p.res.mc >= amount - r.val;
  }

  /* 支付：先尽量用钢铁/钛/能源抵扣，余额用 M€ */
  function payCost(G, p, amount, card) {
    var r = bestResourceCover(p, amount, card);
    var rest = amount - r.val;
    if (p.res.mc < rest) return null;
    p.res.titan -= r.t;
    p.res.steel -= r.s;
    p.res.energy -= r.e;
    p.res.mc -= rest;
    return { mc: rest, steel: r.s, titan: r.t, energy: r.e };
  }

  /* ---------------- 板块放置 ---------------- */
  /* 可放置格。遵守官方放置限制：
       · 海洋只能放在海洋保留区
       · 城市不能与另一座城市相邻
       · 绿化「尽可能」必须挨着自己的板块；只有实在没有这种格子时才放宽 */
  function adjToOwn(G, p, key) {
    var nbs = neighbors(G.map, key);
    for (var i = 0; i < nbs.length; i++) {
      if (G.map.cells[nbs[i]].owner === p.idx) return true;
    }
    return false;
  }

  function validCells(G, tileType, p) {
    var out = [];
    var strictGreen = false;
    if (tileType === "greenery" && p) {
      // 是否存在「挨着自己板块」的空地？有就必须遵守
      G.map.order.forEach(function (k) {
        if (strictGreen) return;
        var c = G.map.cells[k];
        if (c.tile || c.oceanReserved) return;
        if (adjToOwn(G, p, k)) strictGreen = true;
      });
    }
    G.map.order.forEach(function (k) {
      var c = G.map.cells[k];
      if (c.tile) return;
      if (tileType === "ocean") { if (c.oceanReserved) out.push(k); return; }
      if (c.oceanReserved) return;
      if (tileType === "city") {
        var nbs = neighbors(G.map, k);
        for (var i = 0; i < nbs.length; i++) {
          if (G.map.cells[nbs[i]].tile === "city") return;   // 城市不能相邻
        }
        out.push(k);
        return;
      }
      if (tileType === "greenery" && strictGreen && !adjToOwn(G, p, k)) return;
      out.push(k);
    });
    return out;
  }

  function gainBonus(G, p, bonus, srcLabel) {
    if (!bonus) return;
    var gained = [];
    for (var k in bonus) {
      if (k === "card") { var cid = drawOne(G); if (cid) p.hand.push(cid); gained.push("1 张卡"); }
      else if (p.res[k] != null) { p.res[k] += bonus[k]; gained.push(bonus[k] + " " + RES_NAME[k]); }
    }
    if (gained.length) log(G, p.name + " 从 " + srcLabel + " 获得 " + gained.join("、"));
  }

  function drawOne(G) {
    if (!G.deck.length) {
      if (!G.discard.length) return null;
      G.deck = shuffle(G.discard.slice(), mulberry32(G.gen * 7919 + G.deck.length));
      G.discard = [];
    }
    return G.deck.shift();
  }

  /* 放置板块。按官方规则：
       · 获得「该格印刷的放置奖励」
       · 每相邻一块已存在的海洋板块，额外获得 2 M€
       · 海洋板块不属于任何玩家；城市/绿化属于放置者 */
  function placeTile(G, p, tileType, cellKey, silent) {
    var c = G.map.cells[cellKey];
    if (!c || c.tile) return { ok: false, msg: "该格无法放置" };
    c.tile = tileType;
    c.owner = (tileType === "ocean") ? null : p.idx;
    var cellName = "(" + c.q + "," + c.r + ")";
    var extra = [];

    // ① 该格印刷的放置奖励
    if (c.bonus) gainBonus(G, p, c.bonus, "该格");

    // ② 相邻海洋：每块 +2 M€
    var adjOcean = 0;
    neighbors(G.map, cellKey).forEach(function (nk) {
      if (G.map.cells[nk].tile === "ocean") adjOcean++;
    });
    if (adjOcean > 0) {
      p.res.mc += adjOcean * 2;
      extra.push("相邻 " + adjOcean + " 块海洋 +" + (adjOcean * 2) + " M€");
    }

    if (tileType === "ocean") {
      G.board.ocean = Math.min(OCEAN_MAX, G.board.ocean + 1);
      gainTR(G, p, 1, "海洋");
      if (!silent) log(G, p.name + " 放置海洋板块 " + cellName + (extra.length ? "（" + extra.join("，") + "）" : ""));
    } else if (tileType === "greenery") {
      // 规则：氧气推不上去时，也不获得那 1 点 TR
      if (G.board.oxygen < OXY_STEPS) {
        G.board.oxygen++;
        gainTR(G, p, 1, "绿化");
        if (G.board.oxygen === OXYGEN_BONUS_STEP) {
          log(G, p.name + " 触发氧气奖励步（8%）：温度 +1 级");
          raiseTemp(G, p, 1);
        }
      } else {
        extra.push("氧气已满，本次不获得 TR");
      }
      if (!silent) log(G, p.name + " 放置绿化板块 " + cellName + (extra.length ? "（" + extra.join("，") + "）" : ""));
    } else if (tileType === "city") {
      var e = corpEffect(p, "cityProd");
      if (e) { p.prod.mc += e.amount; log(G, p.name + " 公司能力：M€ 产量 +" + e.amount); }
      if (!silent) log(G, p.name + " 放置城市板块 " + cellName + (extra.length ? "（" + extra.join("，") + "）" : ""));
    }
    return { ok: true };
  }

  function autoPickCell(G, p, tileType) {
    var cands = validCells(G, tileType, p);
    if (!cands.length) return null;
    var best = null, bestScore = -1e9;
    cands.forEach(function (k) {
      var c = G.map.cells[k];
      var s = 0;
      var nbs = neighbors(G.map, k);
      nbs.forEach(function (nk) {
        var nb = G.map.cells[nk];
        if (nb.tile === "ocean") s += 5;                                    // 2 M€
        if (nb.tile === "greenery" && tileType === "city") s += 5;          // 终局 1 分
        if (nb.tile === "city" && tileType === "greenery") s += 4;
        if (nb.tile && nb.owner === p.idx) s += 1.5;
      });
      if (c.bonus) { for (var b in c.bonus) s += c.bonus[b] * (b === "card" ? 3 : 1.2); }
      if (tileType === "ocean") s += 3;
      if (s > bestScore) { bestScore = s; best = k; }
    });
    return best;
  }

  /* ---------------- 参数推进 ---------------- */
  /* 奖励步的结算（只处理产量与资源，避免与 raiseTemp 相互递归） */
  function applyBonus(G, p, gain, label) {
    var parts = [];
    if (gain.prod) for (var k in gain.prod) {
      p.prod[k] = Math.max(0, p.prod[k] + gain.prod[k]);
      parts.push(RES_NAME[k] + "产量 +" + gain.prod[k]);
    }
    if (gain.res) for (var k2 in gain.res) {
      p.res[k2] += gain.res[k2];
      parts.push(RES_NAME[k2] + " +" + gain.res[k2]);
    }
    if (parts.length) log(G, p.name + " 触发温度奖励步 " + label + "：" + parts.join("、"));
  }

  function raiseTemp(G, p, steps) {
    for (var i = 0; i < steps; i++) {
      if (G.board.temp >= TEMP_STEPS) break;
      G.board.temp++;
      gainTR(G, p, 1, "温度");
      var b = TEMP_BONUS[G.board.temp];
      if (b && p) applyBonus(G, p, b.gain, b.label);
    }
  }
  function raiseOxygen(G, p, steps) {
    for (var i = 0; i < steps; i++) {
      if (G.board.oxygen >= OXY_STEPS) break;
      G.board.oxygen++;
      gainTR(G, p, 1, "氧气");
      // 氧气奖励步：8% 时温度再涨 1 级（温室效应）
      if (G.board.oxygen === OXYGEN_BONUS_STEP && p) {
        log(G, p.name + " 触发氧气奖励步（8%）：温度 +1 级");
        raiseTemp(G, p, 1);
      }
    }
  }

  /* ---------------- 出牌 ---------------- */
  /* 是不是轮到这个人行动 */
  function isTurn(G, p) {
    return G.phase === "action" && G.activePlayer === p.idx && !p.passed;
  }
  function turnGuard(G, p) {
    if (G.phase !== "action") return { ok: false, msg: "现在不是行动阶段" };
    if (G.activePlayer !== p.idx) return { ok: false, msg: "现在不是你的回合" };
    if (p.passed) return { ok: false, msg: "你已经跳过本世代了" };
    return null;
  }

  function canPlay(G, p, card) {
    var tg = turnGuard(G, p);
    if (tg) return tg;
    if (!checkReq(G, p, card).ok) return checkReq(G, p, card);
    var cost = effectiveCost(G, p, card);
    if (!canAfford(G, p, cost, card)) return { ok: false, msg: "资源不足（需要 " + cost + " M€）" };
    if (card.tile && !validCells(G, card.tile, p).length) return { ok: false, msg: "没有符合放置规则的空格" };
    /* 需要放海洋的卡：保留区空位不够时不能打。否则会挂出无处可放的待放置记录，
       玩家会卡在「必须放置但地图上没有合法格子」的死局里，游戏也推进不到世代结算。 */
    if (card.ocean && !card.tile && oceanRoom(G, p.idx) < card.ocean) {
      return { ok: false, msg: "海洋保留区空位不足（还需要 " + card.ocean + " 格）" };
    }
    return { ok: true };
  }

  function applyEffects(G, p, fx, sourceName) {
    var gained = [];
    if (fx.prod) for (var k in fx.prod) { p.prod[k] = Math.max(0, p.prod[k] + fx.prod[k]); gained.push(RES_NAME[k] + "产量 " + (fx.prod[k] > 0 ? "+" : "") + fx.prod[k]); }
    if (fx.res) for (var k2 in fx.res) { p.res[k2] += fx.res[k2]; gained.push(RES_NAME[k2] + " +" + fx.res[k2]); }
    if (fx.tr) gainTR(G, p, fx.tr, sourceName);
    if (fx.temp) raiseTemp(G, p, fx.temp);
    if (fx.oxygen) raiseOxygen(G, p, fx.oxygen);
    if (fx.ocean) {
      var placed = 0;
      /* 受空位限制：oceanRoom 已经减掉了本玩家已挂起但尚未落盘的记录。
         不减的话「海洋 +3」在只剩 2 格时会挂出 3 条待放置，最后一条永远放不下。 */
      var room = oceanRoom(G, p.idx);
      for (var o = 0; o < fx.ocean && room > 0; o++) {
        if (p.isAI) {
          var ocell = autoPickCell(G, p, "ocean");
          if (!ocell) break;
          placeTile(G, p, "ocean", ocell); placed++; room--;
        } else {
          G.pendingOceans.push({ player: p.idx });
          placed++; room--;
        }
      }
      if (placed) gained.push("放置 " + placed + " 块海洋" + (p.isAI ? "" : "（待你选择位置）"));
    }
    if (fx.draw) for (var i = 0; i < fx.draw; i++) { var id = drawOne(G); if (id) p.hand.push(id); }
    if (fx.draw) gained.push("抽 " + fx.draw + " 张卡");
    if (gained.length) log(G, p.name + " 结算 " + sourceName + "：" + gained.join("、"));
  }

  function playCard(G, pIdx, cardId, cellKey) {
    var p = G.players[pIdx];
    var card = byId[cardId];
    if (!card) return { ok: false, msg: "没有这张卡" };
    if (p.hand.indexOf(cardId) < 0) return { ok: false, msg: "手牌里没有这张卡" };
    var chk = canPlay(G, p, card);
    if (!chk.ok) return chk;
    // 先把位置验好，避免付了钱却放不下
    if (card.tile) {
      if (!cellKey) return { ok: false, msg: "请先选择放置位置" };
      if (validCells(G, card.tile, p).indexOf(cellKey) < 0) return { ok: false, msg: "这个位置不符合放置规则" };
    }

    var cost = effectiveCost(G, p, card);
    var paid = payCost(G, p, cost, card);
    if (!paid) return { ok: false, msg: "资源不足" };

    p.hand.splice(p.hand.indexOf(cardId), 1);
    p.played.push(cardId);
    if (card.type === "event") p.events.push(cardId);

    var payTxt = [];
    if (paid.mc) payTxt.push(paid.mc + " M€");
    if (paid.steel) payTxt.push(paid.steel + " 钢铁");
    if (paid.titan) payTxt.push(paid.titan + " 钛");
    if (paid.energy) payTxt.push(paid.energy + " 能源");
    log(G, p.name + " 打出《" + card.name + "》，支付 " + (payTxt.join(" + ") || "0"));

    applyEffects(G, p, card, card.name);

    if (card.tile) {
      var res = placeTile(G, p, card.tile, cellKey);
      if (!res.ok) return res;
    }
    // 公司标签联动
    var se = corpEffect(p, "tagSteel");
    if (se && card.tags.indexOf(se.tag) >= 0) { p.res.steel += se.amount; log(G, p.name + " 公司能力：获得 " + se.amount + " 钢铁"); }
    var te = corpEffect(p, "tagProdMc");
    if (te && card.tags.indexOf(te.tag) >= 0) { p.prod.mc += te.amount; log(G, p.name + " 公司能力：M€ 产量 +" + te.amount); }
    if (card.type === "event") {
      var ee = corpEffect(p, "eventBonusMc");
      if (ee) { p.res.mc += ee.amount; log(G, p.name + " 公司能力：获得 " + ee.amount + " M€"); }
    }
    return { ok: true };
  }

  function useCardAction(G, pIdx, cardId) {
    var p = G.players[pIdx];
    var tg = turnGuard(G, p); if (tg) return tg;
    var card = byId[cardId];
    if (!card || !card.action) return { ok: false, msg: "这张卡没有行动" };
    if (p.played.indexOf(cardId) < 0) return { ok: false, msg: "这张卡还没打出" };
    if (p.usedActions[cardId]) return { ok: false, msg: "本世代已经用过这个行动了" };
    var cost = card.action.cost || {};
    if (cost.mc && p.res.mc < cost.mc) return { ok: false, msg: "M€ 不足" };
    if (cost.mc) p.res.mc -= cost.mc;
    p.usedActions[cardId] = true;
    log(G, p.name + " 使用《" + card.name + "》的行动：" + card.action.label);
    applyEffects(G, p, card.action.gain, card.name + " 行动");
    return { ok: true };
  }

  /* ---------------- 标准项目 ---------------- */
  function standardProject(G, pIdx, kind, cellKey) {
    var p = G.players[pIdx];
    var tg = turnGuard(G, p); if (tg) return tg;
    var sp = STANDARD_PROJECTS[kind];
    if (!sp) return { ok: false, msg: "没有这个标准项目" };
    if (kind === "sell") return { ok: false, msg: "卖专利请用弃牌功能" };
    if (p.res.mc < sp.cost) return { ok: false, msg: "M€ 不足（需要 " + sp.cost + "）" };
    if ((kind === "aquifer" || kind === "greenery" || kind === "city")) {
      var tt = kind === "aquifer" ? "ocean" : kind;
      if (!validCells(G, tt, p).length) return { ok: false, msg: "没有符合放置规则的空格" };
      if (!cellKey) return { ok: false, msg: "请先选择放置位置" };
      if (validCells(G, tt, p).indexOf(cellKey) < 0) return { ok: false, msg: "这个位置不符合放置规则" };
    }
    p.res.mc -= sp.cost;
    log(G, p.name + " 执行标准项目「" + sp.n + "」，支付 " + sp.cost + " M€");
    if (kind === "power") p.prod.energy += 1;
    if (kind === "asteroid") raiseTemp(G, p, 1);
    if (kind === "aquifer") placeTile(G, p, "ocean", cellKey);
    if (kind === "greenery") placeTile(G, p, "greenery", cellKey);
    if (kind === "city") { placeTile(G, p, "city", cellKey); p.prod.mc += 1; log(G, p.name + " 城市带来 M€ 产量 +1"); }
    return { ok: true };
  }

  /* ---------------- 里程碑 / 奖项 ---------------- */
  function claimMilestone(G, pIdx, idx) {
    var p = G.players[pIdx];
    var tg = turnGuard(G, p); if (tg) return tg;
    var m = MILESTONES[idx];
    if (!m) return { ok: false, msg: "没有这个里程碑" };
    if (G.milestonesClaimed.length >= MAX_MILESTONES) return { ok: false, msg: "本局里程碑已被抢完（最多 3 个）" };
    if (G.milestonesClaimed.indexOf(idx) >= 0) return { ok: false, msg: "这个里程碑已经被宣称了" };
    if (!m.check(G, p)) return { ok: false, msg: "还不满足条件：" + m.text };
    if (p.res.mc < MILESTONE_COST) return { ok: false, msg: "M€ 不足（需要 " + MILESTONE_COST + "）" };
    p.res.mc -= MILESTONE_COST;
    G.milestonesClaimed.push(idx);
    p.milestones.push(idx);
    log(G, p.name + " 宣称里程碑「" + m.n + "」（" + m.text + "），支付 " + MILESTONE_COST + " M€");
    return { ok: true };
  }

  function fundAward(G, pIdx, idx) {
    var p = G.players[pIdx];
    var tg = turnGuard(G, p); if (tg) return tg;
    var a = AWARDS[idx];
    if (!a) return { ok: false, msg: "没有这个奖项" };
    if (G.awardsFunded.length >= MAX_AWARDS) return { ok: false, msg: "本局奖项已被资助完（最多 3 个）" };
    if (G.awardsFunded.indexOf(idx) >= 0) return { ok: false, msg: "这个奖项已经被资助了" };
    var cost = AWARD_COSTS[G.awardsFunded.length];
    if (p.res.mc < cost) return { ok: false, msg: "M€ 不足（需要 " + cost + "）" };
    p.res.mc -= cost;
    G.awardsFunded.push(idx);
    p.awardsFunded.push(idx);
    log(G, p.name + " 资助奖项「" + a.n + "」（" + a.text + "），支付 " + cost + " M€");
    return { ok: true };
  }

  /* ---------------- 资源转换 ---------------- */
  function convertPlants(G, pIdx, cellKey) {
    var p = G.players[pIdx];
    var tg = turnGuard(G, p); if (tg) return tg;
    if (p.res.plant < 8) return { ok: false, msg: "需要 8 个植物" };
    if (!validCells(G, "greenery", p).length) return { ok: false, msg: "没有符合放置规则的空格" };
    if (!cellKey) return { ok: false, msg: "请先选择放置位置" };
    if (validCells(G, "greenery", p).indexOf(cellKey) < 0) return { ok: false, msg: "绿化板块必须挨着你自己已有的板块（如果可能）" };
    p.res.plant -= 8;
    placeTile(G, p, "greenery", cellKey);
    return { ok: true };
  }
  function convertHeat(G, pIdx) {
    var p = G.players[pIdx];
    var tg = turnGuard(G, p); if (tg) return tg;
    if (p.res.heat < 8) return { ok: false, msg: "需要 8 点热量" };
    if (G.board.temp >= TEMP_STEPS) return { ok: false, msg: "温度已经到顶了" };
    p.res.heat -= 8;
    log(G, p.name + " 用 8 热量提升温度 1 级");
    raiseTemp(G, p, 1);
    return { ok: true };
  }

  /* ---------------- 待放置的海洋（卡牌效果触发） ---------------- */
  function pendingOceansFor(G, pIdx) {
    return G.pendingOceans.filter(function (x) { return x.player === pIdx; }).length;
  }
  /* 海洋还能放几块 = 可用格子数 − 已挂起但尚未落盘的待放置记录数。
     两者必须相减：pendingOceans 只是「排队」，不会让 validCells 少一格。
     漏掉这个减法，「海洋 +3」在只剩 2 格时会挂出 3 条待放置，最后一条永远放不下。 */
  function oceanRoom(G, pIdx) {
    /* 注意参数顺序：validCells(G, tileType, p)，不是 (G, p, tileType)。
       传反了不会报错，只会静默返回全部空格（52 个），断言看起来像"规则没生效"。 */
    return validCells(G, "ocean", G.players[pIdx]).length - pendingOceansFor(G, pIdx);
  }
  /* 作废无位可放的待放置海洋，返回作废条数。
     兜底用：保留区可能被别的玩家先一步填满，此时本玩家已经挂着记录却无处可放，
     直接进放置模式会让玩家卡死（地图上没有任何可点的格子）。 */
  function discardStaleOceans(G, pIdx) {
    var room = validCells(G, "ocean", G.players[pIdx]).length;
    var kept = [], dropped = 0;
    G.pendingOceans.forEach(function (x) {
      if (x.player !== pIdx) { kept.push(x); return; }
      if (room > 0) { room--; kept.push(x); } else { dropped++; }
    });
    G.pendingOceans = kept;
    if (dropped) log(G, G.players[pIdx].name + " 有 " + dropped + " 块待放置海洋因保留区已满而作废");
    return dropped;
  }
  function resolvePendingOcean(G, pIdx, cellKey) {
    var i = G.pendingOceans.findIndex(function (x) { return x.player === pIdx; });
    if (i < 0) return { ok: false, msg: "没有待放置的海洋" };
    var cc = G.map.cells[cellKey];
    if (!cc || cc.tile || !cc.oceanReserved) return { ok: false, msg: "海洋只能放在海洋保留区" };
    G.pendingOceans.splice(i, 1);
    var p = G.players[pIdx];
    return placeTile(G, p, "ocean", cellKey);
  }

  /* ---------------- 回合流转 ---------------- */
  function takeActionDone(G, pIdx) {
    G.turnActions++;
    if (G.turnActions >= 2) endTurn(G);
  }

  function endTurn(G) {
    G.turnActions = 0;
    var n = G.players.length;
    var i = G.activePlayer;
    for (var step = 1; step <= n; step++) {
      var cand = (i + step) % n;
      if (!G.players[cand].passed) { G.activePlayer = cand; return; }
    }
    // 其他人都已跳过；若当前玩家还在场上，则继续由他行动
    if (!G.players[i].passed) return;
    runProduction(G);
  }

  function pass(G, pIdx) {
    var p = G.players[pIdx];
    p.passed = true;
    log(G, p.name + " 跳过，退出本世代");
    G.turnActions = 0;
    var n = G.players.length;
    var remaining = G.players.filter(function (x) { return !x.passed; });
    if (!remaining.length) { runProduction(G); return { ok: true, production: true }; }
    var i = pIdx;
    for (var step = 1; step <= n; step++) {
      var cand = (i + step) % n;
      if (!G.players[cand].passed) { G.activePlayer = cand; break; }
    }
    return { ok: true, production: false };
  }

  function runProduction(G) {
    G.phase = "production";
    G.players.forEach(function (p) {
      var conv = p.res.energy;
      p.res.heat += conv;
      p.res.energy = 0;
      var income = p.tr + p.prod.mc;
      p.res.mc += income;
      p.res.steel += p.prod.steel;
      p.res.titan += p.prod.titan;
      p.res.plant += p.prod.plant;
      p.res.energy += p.prod.energy;
      p.res.heat += p.prod.heat;
      p.usedActions = {};
      p.passed = false;
      log(G, p.name + " 生产：能源 " + conv + " → 热量，M€ +" + income + "（TR " + p.tr + " + 产量 " + p.prod.mc + "）");
    });
    // 检查终局
    if (G.board.temp >= TEMP_STEPS && G.board.oxygen >= OXY_STEPS && G.board.ocean >= OCEAN_MAX) {
      endGame(G);
      return;
    }
    G.gen++;
    G.phase = "research";
    G.activePlayer = 0;
    G.turnActions = 0;
    beginResearch(G);
  }

  function beginResearch(G) {
    G.players.forEach(function (p) {
      p.researchHand = [];
      for (var i = 0; i < 4; i++) { var id = drawOne(G); if (id) p.researchHand.push(id); }
      p.researchDone = false;
    });
    G.phase = "research";
    G.activePlayer = 0;
  }

  function resolveResearch(G, pIdx, buyIds) {
    var p = G.players[pIdx];
    if (p.researchDone) return { ok: false, msg: "已经处理过了" };
    var cost = buyIds.length * 3;
    if (cost > p.res.mc) return { ok: false, msg: "M€ 不足（需要 " + cost + "）" };
    p.res.mc -= cost;
    buyIds.forEach(function (id) {
      var i = p.researchHand.indexOf(id);
      if (i >= 0) { p.researchHand.splice(i, 1); p.hand.push(id); }
    });
    G.discard = G.discard.concat(p.researchHand);
    p.researchHand = [];
    p.researchDone = true;
    if (buyIds.length) log(G, p.name + " 研究阶段买入 " + buyIds.length + " 张卡，支付 " + cost + " M€");
    else log(G, p.name + " 研究阶段没有买卡");
    // 全部处理完 → 行动阶段
    if (G.players.every(function (x) { return x.researchDone; })) {
      G.phase = "action";
      G.activePlayer = 0;
      G.turnActions = 0;
      log(G, "第 " + G.gen + " 世代 · 行动阶段开始");
    }
    return { ok: true };
  }

  /* ---------------- 终局 ---------------- */
  function endGame(G) {
    // 终局前：所有人把 8 植物换成绿化
    G.players.forEach(function (p) {
      while (p.res.plant >= 8) {
        var cell = autoPickCell(G, p, "greenery");
        if (!cell) break;
        p.res.plant -= 8;
        placeTile(G, p, "greenery", cell, true);
      }
    });
    G.phase = "ended";
    G.finalScores = finalScore(G);
    var best = -1, winner = null;
    G.finalScores.forEach(function (s) {
      if (s.total > best || (s.total === best && winner && s.mc > winner.mc)) { best = s.total; winner = s; }
    });
    G.winner = winner ? winner.idx : null;
    log(G, "三项全球参数全部达标，游戏结束。");
  }

  function finalScore(G) {
    // 奖项排名
    var awardRanks = G.awardsFunded.map(function (idx) {
      var a = AWARDS[idx];
      var arr = G.players.map(function (p) { return { p: p, v: a.score(G, p) }; });
      var max = Math.max.apply(null, arr.map(function (x) { return x.v; }));
      var first = arr.filter(function (x) { return x.v === max && max > 0; }).map(function (x) { return x.p.idx; });
      var second = [];
      if (first.length === 1) {
        var rest = arr.filter(function (x) { return first.indexOf(x.p.idx) < 0; });
        var max2 = Math.max.apply(null, rest.map(function (x) { return x.v; }));
        if (max2 > 0) second = rest.filter(function (x) { return x.v === max2; }).map(function (x) { return x.p.idx; });
      }
      return { idx: idx, name: a.n, first: first, second: second, values: arr.map(function (x) { return { id: x.p.idx, name: x.p.name, v: x.v }; }) };
    });

    return G.players.map(function (p) {
      var cardVP = 0, cardDetail = [];
      p.played.forEach(function (id) {
        var c = byId[id];
        if (!c) return;
        var v = c.vp || 0;
        if (c.vpPer) v += c.vpPer.per * tagCount(G, p, c.vpPer.tag);
        if (v) { cardVP += v; cardDetail.push(c.name + " +" + v); }
      });
      var greenery = countTiles(G, p, "greenery");
      var cities = countTiles(G, p, "city");
      var adjGreen = 0;
      G.map.order.forEach(function (k) {
        var c = G.map.cells[k];
        if (c.owner !== p.idx || c.tile !== "city") return;
        neighbors(G.map, k).forEach(function (nk) {
          if (G.map.cells[nk].tile === "greenery") adjGreen++;
        });
      });
      var msVP = p.milestones.length * MILESTONE_VP;
      var awVP = 0, awDetail = [];
      awardRanks.forEach(function (r) {
        if (r.first.indexOf(p.idx) >= 0) { awVP += 5; awDetail.push(r.name + " 第一 +5"); }
        else if (r.second.indexOf(p.idx) >= 0) { awVP += 2; awDetail.push(r.name + " 第二 +2"); }
      });
      var mcVP = Math.floor(p.res.mc / 5);
      var boardVP = greenery + cities + adjGreen;
      var total = p.tr + msVP + awVP + boardVP + cardVP + mcVP;
      return {
        idx: p.idx, name: p.name, isAI: p.isAI, color: p.color,
        tr: p.tr, msVP: msVP, milestones: p.milestones.map(function (i) { return MILESTONES[i].n; }),
        awVP: awVP, awDetail: awDetail,
        greenery: greenery, cities: cities, adjGreen: adjGreen, boardVP: boardVP,
        cardVP: cardVP, cardDetail: cardDetail,
        mcVP: mcVP, mc: p.res.mc,
        total: total
      };
    }).sort(function (a, b) { return b.total - a.total; });
  }

  /* ---------------- 辅助查询 ---------------- */
  function playerVP(G, p) {
    var v = 0;
    p.played.forEach(function (id) {
      var c = byId[id];
      if (!c) return;
      v += c.vp || 0;
      if (c.vpPer) v += c.vpPer.per * tagCount(G, p, c.vpPer.tag);
    });
    return v;
  }

  function allMaxed(G) {
    return G.board.temp >= TEMP_STEPS && G.board.oxygen >= OXY_STEPS && G.board.ocean >= OCEAN_MAX;
  }
  function progress(G) {
    return (G.board.temp + G.board.oxygen + G.board.ocean) / TOTAL_STEPS;
  }

  root.TMEngine = {
    RES_KEYS: RES_KEYS, RES_NAME: RES_NAME,
    TEMP_STEPS: TEMP_STEPS, OXY_STEPS: OXY_STEPS, OCEAN_MAX: OCEAN_MAX,
    TOTAL_STEPS: TOTAL_STEPS, MAX_TR: MAX_TR,
    STANDARD_PROJECTS: STANDARD_PROJECTS,
    TEMP_BONUS: TEMP_BONUS, OXYGEN_BONUS_STEP: OXYGEN_BONUS_STEP, applyBonus: applyBonus,
    BONUS_VALUE: BONUS_VALUE, HOT_BONUS_VALUE: HOT_BONUS_VALUE, bonusValue: bonusValue,
    MILESTONES: MILESTONES, MILESTONE_COST: MILESTONE_COST, MILESTONE_VP: MILESTONE_VP, MAX_MILESTONES: MAX_MILESTONES,
    AWARDS: AWARDS, AWARD_COSTS: AWARD_COSTS, MAX_AWARDS: MAX_AWARDS,
    HEX_SIZE: HEX_SIZE, HEX_DIRS: HEX_DIRS, MAP_R: MAP_R,
    mapCellCount: function () { return 1 + 3 * MAP_R * (MAP_R + 1); },
    tempToStep: tempToStep, stepToTemp: stepToTemp, hexKey: hexKey,
    neighbors: neighbors,
    createGame: createGame,
    chooseCorporation: chooseCorporation,
    dealSetupHands: dealSetupHands,
    buyStartingCards: buyStartingCards,
    startGame: startGame,
    checkReq: checkReq, effectiveCost: effectiveCost, canPlay: canPlay, canAfford: canAfford,
    validCells: validCells, autoPickCell: autoPickCell, placeTile: placeTile,
    playCard: playCard, useCardAction: useCardAction, standardProject: standardProject,
    claimMilestone: claimMilestone, fundAward: fundAward,
    convertPlants: convertPlants, convertHeat: convertHeat,
    raiseTemp: raiseTemp, raiseOxygen: raiseOxygen, gainTR: gainTR,
    pendingOceansFor: pendingOceansFor, resolvePendingOcean: resolvePendingOcean,
    oceanRoom: oceanRoom, discardStaleOceans: discardStaleOceans,
    endTurn: endTurn, pass: pass, takeActionDone: takeActionDone,
    resolveResearch: resolveResearch, runProduction: runProduction,
    tagCount: tagCount, allTags: allTags, countTiles: countTiles,
    playerVP: playerVP, finalScore: finalScore, allMaxed: allMaxed, progress: progress,
    drawOne: drawOne, log: log, clone: clone, shuffle: shuffle, mulberry32: mulberry32
  };
})(typeof window !== "undefined" ? window : globalThis);
