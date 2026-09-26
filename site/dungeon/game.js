"use strict";
/* ════════════════════════════════════════════════════════════
   ROGUE — 复古 UNIX 终端地牢探险
   dungeon.sys v2.7.1
   ════════════════════════════════════════════════════════════ */

const MAP_W = 76;
const MAP_H = 22;
const FOV_RADIUS = 8;
const MAX_DEPTH = 21;
const INV_MAX = 20;

// ── 工具 ────────────────────────────────────────────────
const rand = n => Math.floor(Math.random() * n);
const randRange = (a, b) => a + rand(b - a + 1);
const chance = p => Math.random() < p;

// ── 数据定义 ─────────────────────────────────────────────
const WEAPONS = [
  { name: "匕首",       glyph: ")", cls: "m-it-weapon", dmg: [1, 4],  atk: 0, tier: 1 },
  { name: "短剑",       glyph: ")", cls: "m-it-weapon", dmg: [1, 6],  atk: 0, tier: 2 },
  { name: "钉头锤",     glyph: ")", cls: "m-it-weapon", dmg: [2, 7],  atk: 0, tier: 3 },
  { name: "长剑",       glyph: ")", cls: "m-it-weapon", dmg: [2, 9],  atk: 1, tier: 4 },
  { name: "战斧",       glyph: ")", cls: "m-it-weapon", dmg: [3, 12], atk: 1, tier: 5 },
  { name: "符文巨剑",   glyph: ")", cls: "m-it-weapon", dmg: [4, 16], atk: 2, tier: 7 },
];
const ARMORS = [
  { name: "皮甲",       glyph: "[", cls: "m-it-armor", def: 1, tier: 1 },
  { name: "硬皮甲",     glyph: "[", cls: "m-it-armor", def: 2, tier: 2 },
  { name: "锁子甲",     glyph: "[", cls: "m-it-armor", def: 3, tier: 4 },
  { name: "板甲",       glyph: "[", cls: "m-it-armor", def: 5, tier: 6 },
  { name: "龙鳞铠",     glyph: "[", cls: "m-it-armor", def: 7, tier: 8 },
];
const POTIONS = [
  { name: "治疗药水",   glyph: "!", cls: "m-it-pot", effect: "heal",     power: 12 },
  { name: "强效治疗药水", glyph: "!", cls: "m-it-pot", effect: "heal",   power: 26 },
  { name: "力量药水",   glyph: "!", cls: "m-it-pot", effect: "strength", power: 1 },
];
const SCROLLS = [
  { name: "传送卷轴",   glyph: "?", cls: "m-it-scroll", effect: "teleport" },
  { name: "地图卷轴",   glyph: "?", cls: "m-it-scroll", effect: "magicmap" },
  { name: "雷火卷轴",   glyph: "?", cls: "m-it-scroll", effect: "fireball", power: 18 },
];

// 怪物：glyph → 定义。minDepth 控制出现层级
const MONSTERS = [
  { g: "r", name: "巨鼠",     cls: "m-mon-r", hp: 5,  atk: 3,  def: 0, xp: 2,  minDepth: 1, wakeRadius: 5 },
  { g: "b", name: "洞穴蝠",   cls: "m-mon-r", hp: 4,  atk: 4,  def: 0, xp: 2,  minDepth: 1, wakeRadius: 6, erratic: true },
  { g: "s", name: "毒蛇",     cls: "m-mon-g", hp: 8,  atk: 5,  def: 1, xp: 4,  minDepth: 2, wakeRadius: 6 },
  { g: "g", name: "哥布林",   cls: "m-mon-g", hp: 10, atk: 6,  def: 1, xp: 6,  minDepth: 3, wakeRadius: 8 },
  { g: "o", name: "兽人",     cls: "m-mon-o", hp: 16, atk: 8,  def: 2, xp: 10, minDepth: 5, wakeRadius: 8 },
  { g: "O", name: "兽人武士", cls: "m-mon-o", hp: 24, atk: 11, def: 4, xp: 18, minDepth: 8, wakeRadius: 9 },
  { g: "T", name: "洞穴巨魔", cls: "m-mon-o", hp: 40, atk: 14, def: 5, xp: 32, minDepth: 11, wakeRadius: 9 },
  { g: "W", name: "幽灵",     cls: "m-mon-D", hp: 30, atk: 16, def: 6, xp: 40, minDepth: 14, wakeRadius: 10 },
  { g: "D", name: "远古巨龙", cls: "m-mon-D", hp: 80, atk: 22, def: 9, xp: 120, minDepth: 18, wakeRadius: 12 },
];

// 升级所需经验
const xpForLevel = lv => Math.floor(20 * Math.pow(lv, 1.65));

// ── 游戏状态 ─────────────────────────────────────────────
let G = null; // 全局游戏状态

function newGame() {
  G = {
    turn: 0,
    depth: 1,
    over: false,
    won: false,
    kills: 0,
    startTime: Date.now(),
    player: {
      x: 0, y: 0,
      name: "冒险者",
      level: 1, xp: 0,
      hp: 30, maxHp: 30,
      str: 10,          // 力量：影响伤害
      baseDef: 1,
      gold: 0,
      inv: [],          // {kind, def, id}
      weapon: null,     // inv 项
      armor: null,
      nextId: 1,
    },
    map: null, explored: null, visible: null,
    monsters: [], items: [], stairs: null,
    amuletPicked: false,
  };
  // 初始装备：短剑 + 皮甲，2 瓶治疗药水
  giveItem(mkItem("weapon", WEAPONS[1]), true);
  giveItem(mkItem("armor", ARMORS[0]), true);
  G.player.weapon = G.player.inv[0];
  G.player.armor = G.player.inv[1];
  giveItem(mkItem("potion", POTIONS[0]), true);
  giveItem(mkItem("potion", POTIONS[0]), true);
  generateLevel();
}

// ── 地图生成 ─────────────────────────────────────────────
const T_WALL = 0, T_FLOOR = 1, T_DOOR = 2;

function generateLevel() {
  const map = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill(T_WALL));
  const rooms = [];
  const attempts = 90;
  for (let i = 0; i < attempts; i++) {
    const w = randRange(5, 12), h = randRange(4, 8);
    const x = randRange(1, MAP_W - w - 2), y = randRange(1, MAP_H - h - 2);
    const room = { x, y, w, h, cx: (x + (w >> 1)), cy: (y + (h >> 1)) };
    if (rooms.some(r => x < r.x + r.w + 1 && x + w + 1 > r.x && y < r.y + r.h + 1 && y + h + 1 > r.y)) continue;
    rooms.push(room);
    for (let ry = y; ry < y + h; ry++)
      for (let rx = x; rx < x + w; rx++) map[ry][rx] = T_FLOOR;
    if (rooms.length > 1) {
      const prev = rooms[rooms.length - 2];
      carveCorridor(map, prev.cx, prev.cy, room.cx, room.cy);
    }
  }
  // 门：房间边缘与走廊交界处
  for (const r of rooms) placeDoors(map, r);

  G.map = map;
  G.explored = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill(false));
  G.visible = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill(false));
  G.monsters = [];
  G.items = [];

  const first = rooms[0], last = rooms[rooms.length - 1];
  G.player.x = first.cx; G.player.y = first.cy;
  G.stairs = { x: last.cx, y: last.cy };

  // Amulet 在最终层
  if (G.depth >= MAX_DEPTH) {
    G.items.push({ kind: "amulet", def: { name: "Yendor 护身符", glyph: '"', cls: "m-stairs" }, x: last.cx + 1, y: last.cy, id: G.player.nextId++ });
  }

  spawnMonsters(rooms);
  spawnItems(rooms);
  computeFOV();
}

function carveCorridor(map, x1, y1, x2, y2) {
  let x = x1, y = y1;
  const hFirst = chance(0.5);
  const hStep = () => { x += x < x2 ? 1 : -1; if (inB(x, y)) map[y][x] = T_FLOOR; };
  const vStep = () => { y += y < y2 ? 1 : -1; if (inB(x, y)) map[y][x] = T_FLOOR; };
  if (hFirst) {
    while (x !== x2) hStep();
    while (y !== y2) vStep();
  } else {
    while (y !== y2) vStep();
    while (x !== x2) hStep();
  }
}
const inB = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;

function placeDoors(map, r) {
  for (let x = r.x - 1; x <= r.x + r.w; x++) {
    for (const y of [r.y - 1, r.y + r.h]) {
      if (!inB(x, y)) continue;
      if (map[y][x] === T_FLOOR && x >= r.x && x < r.x + r.w) map[y][x] = T_DOOR;
    }
  }
  for (let y = r.y - 1; y <= r.y + r.h; y++) {
    for (const x of [r.x - 1, r.x + r.w]) {
      if (!inB(x, y)) continue;
      if (map[y][x] === T_FLOOR && y >= r.y && y < r.y + r.h) map[y][x] = T_DOOR;
    }
  }
}

function randomFloorPos(avoidPlayer = true) {
  for (let tries = 0; tries < 500; tries++) {
    const x = rand(MAP_W), y = rand(MAP_H);
    if (!isWalkable(x, y)) continue;
    if (avoidPlayer && dist(x, y, G.player.x, G.player.y) < 6) continue;
    if (G.monsters.some(m => m.x === x && m.y === y)) continue;
    if (G.items.some(it => it.x === x && it.y === y)) continue;
    return { x, y };
  }
  return null;
}

function spawnMonsters(rooms) {
  const budget = 4 + Math.floor(G.depth * 1.8) + rand(3);
  let count = 0;
  const pool = MONSTERS.filter(m => m.minDepth <= G.depth);
  for (let i = 0; i < budget * 3 && count < budget; i++) {
    const pos = randomFloorPos();
    if (!pos) break;
    // 深层偏向强怪
    const weighted = pool.filter(m => m.minDepth > G.depth - 6);
    const def = (weighted.length ? weighted : pool)[rand((weighted.length ? weighted : pool).length)];
    const hpBonus = Math.max(0, G.depth - def.minDepth) * 2;
    G.monsters.push({
      def, g: def.g, cls: def.cls, name: def.name,
      x: pos.x, y: pos.y,
      hp: def.hp + hpBonus, maxHp: def.hp + hpBonus,
      atk: def.atk + Math.floor(hpBonus / 4), def_: def.def,
      awake: false,
    });
    count++;
  }
}

function spawnItems(rooms) {
  const n = randRange(2, 4);
  for (let i = 0; i < n; i++) {
    const pos = randomFloorPos();
    if (!pos) break;
    G.items.push(Object.assign(mkRandomItem(), { x: pos.x, y: pos.y, id: G.player.nextId++ }));
  }
  // 每层保证一些金币
  const goldPiles = randRange(1, 3);
  for (let i = 0; i < goldPiles; i++) {
    const pos = randomFloorPos();
    if (!pos) break;
    G.items.push({
      kind: "gold",
      def: { name: "金币", glyph: "$", cls: "m-it-gold" },
      amount: randRange(5, 15) + G.depth * randRange(2, 6),
      x: pos.x, y: pos.y, id: G.player.nextId++,
    });
  }
}

function mkRandomItem() {
  const d = G.depth;
  const roll = Math.random();
  const maxTier = 1 + Math.floor(d / 2.5);
  const byTier = list => list.filter(x => x.tier <= maxTier + 1);
  if (roll < 0.26) {
    const pool = byTier(WEAPONS);
    return mkItem("weapon", pool[rand(pool.length)]);
  } else if (roll < 0.5) {
    const pool = byTier(ARMORS);
    return mkItem("armor", pool[rand(pool.length)]);
  } else if (roll < 0.82) {
    const pot = POTIONS[d >= 6 && chance(0.5) ? 1 : (chance(0.15) ? 2 : 0)];
    return mkItem("potion", pot);
  } else {
    return mkItem("scroll", SCROLLS[rand(SCROLLS.length)]);
  }
}
function mkItem(kind, def) { return { kind, def }; }

// ── 视野 FOV ─────────────────────────────────────────────
function computeFOV() {
  for (let y = 0; y < MAP_H; y++) G.visible[y].fill(false);
  const px = G.player.x, py = G.player.y;
  for (let y = Math.max(0, py - FOV_RADIUS); y <= Math.min(MAP_H - 1, py + FOV_RADIUS); y++) {
    for (let x = Math.max(0, px - FOV_RADIUS); x <= Math.min(MAP_W - 1, px + FOV_RADIUS); x++) {
      if (dist(x, y, px, py) > FOV_RADIUS) continue;
      if (hasLOS(px, py, x, y)) {
        G.visible[y][x] = true;
        G.explored[y][x] = true;
      }
    }
  }
}

function hasLOS(x0, y0, x1, y1) { // Bresenham；墙体阻挡但不阻挡自身格
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  while (true) {
    if ((x !== x0 || y !== y0) && (x !== x1 || y !== y1) && G.map[y][x] === T_WALL) return false;
    if (x === x1 && y === y1) return true;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}
const dist = (x1, y1, x2, y2) => Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));

// ── 物品操作 ─────────────────────────────────────────────
function giveItem(item, silent) {
  if (G.player.inv.length >= INV_MAX) { logMsg("warn", "背包已满，无法拾取。"); return false; }
  G.player.inv.push(item);
  return true;
}

function itemLabel(item) {
  const d = item.def;
  if (item.kind === "weapon") return `${d.name} (${d.dmg[0]}-${d.dmg[1]}${d.atk ? " +" + d.atk + "命中" : ""})`;
  if (item.kind === "armor") return `${d.name} (防御 +${d.def})`;
  if (item.kind === "gold") return `${d.name} x${item.amount}`;
  if (item.kind === "amulet") return d.name;
  return d.name;
}

function pickup() {
  const idx = G.items.findIndex(it => it.x === G.player.x && it.y === G.player.y);
  if (idx < 0) { logMsg("info", "这里什么也没有。"); return false; }
  const it = G.items[idx];
  if (it.kind === "gold") {
    G.player.gold += it.amount;
    G.items.splice(idx, 1);
    logMsg("ok", `拾取了 ${it.amount} 枚金币。`);
    return true;
  }
  if (it.kind === "amulet") {
    G.items.splice(idx, 1);
    G.amuletPicked = true;
    logMsg("crit", `你拿到了 ${it.def.name}！！！地牢开始震颤——快逃出去！`);
    return true;
  }
  if (!giveItem(it)) return false;
  G.items.splice(idx, 1);
  logMsg("ok", `拾取：${itemLabel(it)}。按 [e] 装备 / [q] 使用。`);
  return true;
}

function dropItem(item) {
  const i = G.player.inv.indexOf(item);
  if (i < 0) return;
  unequipIf(item);
  G.player.inv.splice(i, 1);
  G.items.push(Object.assign(item, { x: G.player.x, y: G.player.y }));
  logMsg("notice", `丢弃了 ${itemLabel(item)}。`);
}

function unequipIf(item) {
  if (G.player.weapon === item) { G.player.weapon = null; logMsg("info", `卸下了武器 ${item.def.name}。`); }
  if (G.player.armor === item) { G.player.armor = null; logMsg("info", `脱下了防具 ${item.def.name}。`); }
}

function equipItem(item) {
  if (item.kind === "weapon") {
    if (G.player.weapon === item) { unequipIf(item); return; }
    if (G.player.weapon) logMsg("info", `收起 ${G.player.weapon.def.name}。`);
    G.player.weapon = item;
    logMsg("ok", `手持 ${item.def.name} (${item.def.dmg[0]}-${item.def.dmg[1]})。`);
  } else if (item.kind === "armor") {
    if (G.player.armor === item) { unequipIf(item); return; }
    if (G.player.armor) logMsg("info", `脱下 ${G.player.armor.def.name}。`);
    G.player.armor = item;
    logMsg("ok", `身穿 ${item.def.name} (防御 +${item.def.def})。`);
  } else {
    logMsg("warn", `${item.def.name} 无法装备。用 [q] 使用它。`);
  }
}

function useItem(item) {
  if (item.kind === "potion") {
    const p = item.def;
    if (p.effect === "heal") {
      const healed = Math.min(p.power, G.player.maxHp - G.player.hp);
      G.player.hp += healed;
      logMsg("ok", `喝下${p.name}，恢复 ${healed} 点生命。`);
    } else if (p.effect === "strength") {
      G.player.str += p.power;
      logMsg("ok", `喝下${p.name}——肌肉中涌起力量！(力量 ${G.player.str})`);
    }
    consumeItem(item);
  } else if (item.kind === "scroll") {
    const s = item.def;
    if (s.effect === "teleport") {
      const pos = randomFloorPos(false);
      if (pos) { G.player.x = pos.x; G.player.y = pos.y; computeFOV(); logMsg("warn", "空间扭曲——你被传送到别处！"); }
    } else if (s.effect === "magicmap") {
      for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) G.explored[y][x] = true;
      logMsg("ok", "整层地牢的布局浮现于脑海。");
    } else if (s.effect === "fireball") {
      let hits = 0;
      for (const m of [...G.monsters]) {
        if (G.visible[m.y][m.x] && dist(m.x, m.y, G.player.x, G.player.y) <= 4) {
          damageMonster(m, s.power + rand(6), "雷火");
          hits++;
        }
      }
      logMsg(hits ? "crit" : "info", hits ? `雷火席卷四周，吞噬了 ${hits} 个敌人！` : "雷火炸开，但附近没有敌人。");
    }
    consumeItem(item);
  } else if (item.kind === "weapon" || item.kind === "armor") {
    equipItem(item);
  } else {
    logMsg("info", `${item.def.name} 无法使用。`);
  }
}
function consumeItem(item) {
  const i = G.player.inv.indexOf(item);
  if (i >= 0) G.player.inv.splice(i, 1);
}

// ── 战斗与成长 ───────────────────────────────────────────
function playerAtk() {
  const w = G.player.weapon ? G.player.weapon.def : { dmg: [1, 2], atk: 0 };
  return randRange(w.dmg[0], w.dmg[1]) + Math.floor((G.player.str - 10) / 2) + (G.player.weapon ? G.player.weapon.def.atk : 0);
}
function playerDef() {
  return G.player.baseDef + (G.player.armor ? G.player.armor.def.def : 0) + Math.floor(G.player.level / 3);
}

function attackMonster(m) {
  const dmg = Math.max(1, playerAtk() - m.def_);
  damageMonster(m, dmg, null);
}

function damageMonster(m, dmg, src) {
  m.hp -= dmg;
  m.awake = true;
  if (src) {
    logMsg("notice", `${src}对${m.name}造成 ${dmg} 点伤害。`);
  } else {
    const verb = chance(0.25) ? "重击" : "击中";
    logMsg("notice", `你${verb}了${m.name}，造成 ${dmg} 点伤害${m.hp > 0 ? `（剩余 ${m.hp}）` : ""}。`);
  }
  if (m.hp <= 0) {
    const i = G.monsters.indexOf(m);
    if (i >= 0) G.monsters.splice(i, 1);
    G.kills++;
    logMsg("ok", `${m.name}被消灭了！获得 ${m.def.xp} 经验。`);
    gainXp(m.def.xp);
  }
}

function gainXp(amount) {
  G.player.xp += amount;
  let need = xpForLevel(G.player.level);
  while (G.player.xp >= need) {
    G.player.xp -= need;
    G.player.level++;
    const hpGain = randRange(5, 9);
    G.player.maxHp += hpGain;
    G.player.hp = Math.min(G.player.maxHp, G.player.hp + hpGain + 4);
    if (G.player.level % 3 === 0) G.player.str++;
    logMsg("crit", `★ 升级！你现在是 ${G.player.level} 级 —— 生命上限 +${hpGain}${G.player.level % 3 === 0 ? "，力量 +1" : ""}。`);
    need = xpForLevel(G.player.level);
  }
}

function monsterAttackPlayer(m) {
  const raw = m.atk + rand(4) - playerDef();
  const dmg = Math.max(1, raw);
  G.player.hp -= dmg;
  if (dmg <= 2) logMsg("warn", `${m.name}的攻击擦过你（-${dmg}）。`);
  else logMsg("err", `${m.name}击中了你，造成 ${dmg} 点伤害！`);
  if (G.player.hp <= 0) playerDeath(m);
}

function playerDeath(killer) {
  G.player.hp = 0;
  G.over = true;
  logMsg("crit", `kern.crit: 进程 adventurer(1) 收到 SIGKILL —— 你被${killer ? killer.name : "未知力量"}消灭了。`);
  showDeathScreen();
}

// ── 怪物 AI ──────────────────────────────────────────────
function monstersTurn() {
  for (const m of [...G.monsters]) {
    if (G.over) return;
    const d = dist(m.x, m.y, G.player.x, G.player.y);
    if (!m.awake) {
      if (d <= m.def.wakeRadius && G.visible[m.y][m.x]) {
        m.awake = true;
        logMsg("warn", `${m.name}发现了你！`);
      } else continue;
    }
    if (d === 1) { monsterAttackPlayer(m); continue; }
    if (d > 14) { m.awake = false; continue; }
    // 移动： erratic 生物随机抖动
    let dx = 0, dy = 0;
    if (m.def.erratic && chance(0.4)) {
      dx = rand(3) - 1; dy = rand(3) - 1;
    } else {
      dx = Math.sign(G.player.x - m.x);
      dy = Math.sign(G.player.y - m.y);
      // 优先走主轴
      if (chance(0.5)) {
        if (!tryMonsterStep(m, dx, 0)) tryMonsterStep(m, 0, dy);
        continue;
      } else {
        if (!tryMonsterStep(m, 0, dy)) tryMonsterStep(m, dx, 0);
        continue;
      }
    }
    if (dx || dy) tryMonsterStep(m, dx, dy);
  }
}

function tryMonsterStep(m, dx, dy) {
  if (!dx && !dy) return false;
  const nx = m.x + dx, ny = m.y + dy;
  if (nx === G.player.x && ny === G.player.y) return false;
  if (!inB(nx, ny) || !isWalkable(nx, ny)) return false;
  if (G.monsters.some(o => o !== m && o.x === nx && o.y === ny)) return false;
  m.x = nx; m.y = ny;
  return true;
}

const isWalkable = (x, y) => inB(x, y) && G.map[y][x] !== T_WALL;

// ── 回合流程 ─────────────────────────────────────────────
function playerMove(dx, dy) {
  if (G.over) return;
  const nx = G.player.x + dx, ny = G.player.y + dy;
  if (!inB(nx, ny) || !isWalkable(nx, ny)) { bumpWallSound(); return; }
  const m = G.monsters.find(mm => mm.x === nx && mm.y === ny);
  if (m) {
    attackMonster(m);
  } else {
    G.player.x = nx; G.player.y = ny;
    const it = G.items.find(i => i.x === nx && i.y === ny);
    if (it) logMsg("info", `你看到：${itemLabel(it)}。按 [g] 拾取。`);
    if (G.stairs.x === nx && G.stairs.y === ny && !G.amuletPicked) {
      logMsg("info", "这里有通往下一层的楼梯 [>]。");
    }
  }
  endTurn();
}

function waitTurn() {
  if (G.over) return;
  // 等待时缓慢回血
  if (G.player.hp < G.player.maxHp && chance(0.6)) {
    G.player.hp = Math.min(G.player.maxHp, G.player.hp + 1);
  }
  logMsg("info", "你原地警戒……");
  endTurn();
}

function descend() {
  if (G.over) return;
  if (G.stairs.x !== G.player.x || G.stairs.y !== G.player.y) {
    logMsg("warn", "这里没有楼梯。");
    return;
  }
  if (G.amuletPicked) { victoryScreen(); return; }
  if (G.depth >= MAX_DEPTH) {
    logMsg("warn", "楼梯被古老的封印挡住了——只有 Yendor 护身符能解开它。");
    return;
  }
  G.depth++;
  logMsg("crit", `─── 进入地牢第 ${G.depth} 层 ───${G.depth > 14 ? " 空气愈发冰冷……" : ""}`);
  generateLevel();
  endTurn();
}

function endTurn() {
  G.turn++;
  // 自然恢复
  if (G.turn % 12 === 0 && G.player.hp < G.player.maxHp) G.player.hp++;
  monstersTurn();
  if (!G.over) { computeFOV(); render(); }
  else render();
}

function bumpWallSound() {
  logMsg("info", "咚。前方是坚硬的石墙。");
}

// ── syslog 风格日志 ──────────────────────────────────────
const logEl = document.getElementById("log");
const LOG_FACILITY = {
  info: "game.info", notice: "game.notice", ok: "game.ok",
  warn: "game.warn", err: "game.err", crit: "kern.crit",
};
const LOG_CLASS = { info: "t-info", notice: "", ok: "t-ok", warn: "t-warn", err: "t-err", crit: "t-err" };
let logLines = 0;

function logMsg(level, text) {
  const ts = gameTimestamp();
  const div = document.createElement("div");
  const cls = LOG_CLASS[level] || "";
  div.innerHTML = `<span class="ts">[${ts}]</span> <span class="${cls}">${LOG_FACILITY[level] || "game.info"}: ${escapeHtml(text)}</span>`;
  logEl.appendChild(div);
  logLines++;
  if (logLines > 120) { logEl.removeChild(logEl.firstChild); logLines--; }
  logEl.scrollTop = logEl.scrollHeight;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function gameTimestamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ── 渲染 ─────────────────────────────────────────────────
const mapEl = document.getElementById("map");

function render() {
  renderMap();
  renderStatus();
  renderClock();
}

function renderMap() {
  let out = "";
  for (let y = 0; y < MAP_H; y++) {
    let line = "";
    for (let x = 0; x < MAP_W; x++) {
      const vis = G.visible[y][x];
      if (!vis && !G.explored[y][x]) { line += " "; continue; }
      if (vis) {
        // 可见层：玩家 > 怪物 > 物品 > 楼梯 > 地形
        if (G.player.x === x && G.player.y === y) { line += `<span class="m-player">@</span>`; continue; }
        const m = G.monsters.find(mm => mm.x === x && mm.y === y);
        if (m) { line += `<span class="${m.cls}">${m.g}</span>`; continue; }
        const it = G.items.find(i => i.x === x && i.y === y);
        if (it) { line += `<span class="${it.def.cls}">${it.def.glyph}</span>`; continue; }
        if (G.stairs.x === x && G.stairs.y === y) { line += `<span class="m-stairs">&gt;</span>`; continue; }
      }
      const t = G.map[y][x];
      if (vis) {
        if (t === T_WALL) line += `<span class="m-wall">#</span>`;
        else if (t === T_DOOR) line += `<span class="m-door">+</span>`;
        else line += `<span class="m-floor">·</span>`;
      } else {
        // 记忆层：只显示地形与楼梯
        if (G.stairs.x === x && G.stairs.y === y) line += `<span class="m-mem">&gt;</span>`;
        else if (t === T_WALL) line += `<span class="m-mem">#</span>`;
        else if (t === T_DOOR) line += `<span class="m-mem">+</span>`;
        else line += `<span class="m-mem">·</span>`;
      }
    }
    out += line + "\n";
  }
  mapEl.innerHTML = out;
}

function bar(value, max, width, cls) {
  const filled = Math.max(0, Math.round((value / max) * width));
  return `<span class="bar"><span class="${cls}">${"█".repeat(filled)}</span>${"░".repeat(Math.max(0, width - filled))}</span>`;
}

function renderStatus() {
  const p = G.player;
  const need = xpForLevel(p.level);
  const wName = p.weapon ? `${p.weapon.def.name} (${p.weapon.def.dmg[0]}-${p.weapon.def.dmg[1]})` : "赤手空拳 (1-2)";
  const aName = p.armor ? `${p.armor.def.name} (+${p.armor.def.def})` : "无";
  document.getElementById("char-lines").innerHTML =
    `${escapeHtml(p.name)} · 等级 <span class="t-bright">${p.level}</span>\n` +
    `HP ${bar(p.hp, p.maxHp, 12, "fill-hp")} ${p.hp}/${p.maxHp}\n` +
    `XP ${bar(p.xp, need, 12, "fill-xp")} ${p.xp}/${need}\n` +
    `力量 ${p.str} · 防御 <span class="t-bright">${playerDef()}</span> · 击杀 ${p.kills}\n` +
    `金币 <span class="t-warn">$${p.gold}</span> · 深度 <span class="t-bright">B${G.depth}</span> · 回合 ${G.turn}`;
  document.getElementById("equip-lines").innerHTML =
    `) 武器: <span class="t-bright">${escapeHtml(wName)}</span>\n[ 防具: <span class="t-bright">${escapeHtml(aName)}</span>` +
    (G.amuletPicked ? `\n" <span class="t-ok">Yendor 护身符（持有！）</span>` : "");
  if (p.inv.length === 0) {
    document.getElementById("inv-lines").innerHTML = `<span class="inv-empty">（空）按 g 拾取物品</span>`;
  } else {
    document.getElementById("inv-lines").innerHTML = p.inv.map((it, i) => {
      const letter = String.fromCharCode(97 + i);
      const mark = (it === p.weapon) ? " <span class='t-ok'>(手持)</span>" : (it === p.armor) ? " <span class='t-ok'>(身穿)</span>" : "";
      return `${letter}) ${escapeHtml(itemLabel(it))}${mark}`;
    }).join("\n");
  }
}

function renderClock() {
  document.getElementById("clock").textContent = gameTimestamp();
}

// ── 模态选择系统 ─────────────────────────────────────────
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modal-title");
const modalBody = document.getElementById("modal-body");
const modalHint = document.getElementById("modal-hint");
let modalHandler = null;

function openModal(title, bodyHtml, hint, handler) {
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  modalHint.textContent = hint;
  modalHandler = handler;
  modal.classList.remove("hidden");
}
function closeModal() {
  modal.classList.add("hidden");
  modalHandler = null;
}

// 选择物品的模态；filter 过滤可用物品
function selectItem(title, filter, hint, onPick) {
  const list = G.player.inv.map((it, i) => ({ it, letter: String.fromCharCode(97 + i) })).filter(e => filter(e.it));
  if (list.length === 0) { logMsg("info", "没有符合条件的物品。"); return; }
  const html = list.map(e =>
    `<div><span class="sel-key">${e.letter})</span> <span class="${e.it.def.cls}">${e.it.def.glyph}</span> ${escapeHtml(itemLabel(e.it))}</div>`
  ).join("");
  openModal(title, html, hint, key => {
    const entry = list.find(e => e.letter === key);
    if (entry) { closeModal(); onPick(entry.it); endTurn(); }
    else if (key === "Escape" || key === "i") closeModal();
  });
}

// ── 死亡界面 ─────────────────────────────────────────────
const deathScreenEl = document.getElementById("death-screen");
const deathArtEl = document.querySelector(".death-art");
const deathPromptEl = document.querySelector("#death-screen .blink-prompt");
const deathArtOriginal = deathArtEl.innerHTML;
const deathPromptOriginal = deathPromptEl.innerHTML;

function showDeathScreen() {
  deathArtEl.innerHTML = deathArtOriginal;
  deathPromptEl.innerHTML = deathPromptOriginal;
  const p = G.player;
  const mins = Math.max(1, Math.round((Date.now() - G.startTime) / 60000));
  document.getElementById("death-depth").textContent = G.depth;
  document.getElementById("death-stats").innerHTML =
    `<div>等级 <span class="t-bright">${p.level}</span> · 击杀 <span class="t-bright">${p.kills}</span> · 金币 <span class="t-warn">$${p.gold}</span> · 最深层 <span class="t-bright">B${G.depth}</span></div>` +
    `<div class="t-dim">冒险时长约 ${mins} 分钟 · 共 ${G.turn} 回合</div>` +
    `<div class="t-dim">score: ${p.level * 100 + p.kills * 25 + p.gold + G.depth * 50}</div>`;
  document.getElementById("death-screen").classList.remove("hidden");
  render();
}

function victoryScreen() {
  G.won = true;
  G.over = true;
  logMsg("crit", "你带着 Yendor 护身符逃出了地牢！！冒险传说就此写下。");
  const p = G.player;
  document.getElementById("death-depth").textContent = G.depth;
  document.querySelector(".death-art").innerHTML =
`   ████████╗
   ╚══██╔══╝   V I C T O R Y
      ██║
      ██║       你带着 Yendor 护身符
      ██║       逃出了地牢！
      ╚═╝`;
  document.getElementById("death-stats").innerHTML =
    `<div class="t-ok">★ 通关 ★</div>` +
    `<div>等级 <span class="t-bright">${p.level}</span> · 击杀 <span class="t-bright">${p.kills}</span> · 金币 <span class="t-warn">$${p.gold}</span></div>` +
    `<div class="t-dim">score: ${p.level * 100 + p.kills * 25 + p.gold + 1000}</div>`;
  document.getElementById("death-screen").classList.remove("hidden");
  document.querySelector("#death-screen .blink-prompt").innerHTML = 'PRESS [R] TO PLAY AGAIN<span class="cursor">▊</span>';
  render();
}

// ── 输入处理 ─────────────────────────────────────────────
const KEYMAP = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
  h: [-1, 0], l: [1, 0], k: [0, -1], j: [0, 1],
  a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1],
};
// 斜向
const DIAG = { y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1] };

let started = false;

function handleAction(key) {
  switch (key) {
    case "g": case "G": case ",": pickup(); endTurn(); break;
    case "i": case "I": showInventory(); break;
    case "e": case "E": selectItem("装备物品", it => it.kind === "weapon" || it.kind === "armor", "按字母装备 · ESC 取消", equipItem); break;
    case "q": case "Q": selectItem("使用物品", it => it.kind === "potion" || it.kind === "scroll", "按字母使用 · ESC 取消", useItem); break;
    case "D": selectItem("丢弃物品", () => true, "按字母丢弃 · ESC 取消", dropItem); break;
    case ">": descend(); break;
    case ".": case " ": waitTurn(); break;
    default:
      if (DIAG[key]) { const [dx, dy] = DIAG[key]; playerMove(dx, dy); }
      break;
  }
}

function showInventory() {
  if (G.player.inv.length === 0) { logMsg("info", "背包是空的。"); return; }
  const html = G.player.inv.map((it, i) => {
    const letter = String.fromCharCode(97 + i);
    const mark = it === G.player.weapon ? " <span class='t-ok'>[手持]</span>" : it === G.player.armor ? " <span class='t-ok'>[身穿]</span>" : "";
    return `<div><span class="sel-key">${letter})</span> <span class="${it.def.cls}">${it.def.glyph}</span> ${escapeHtml(itemLabel(it))}${mark}</div>`;
  }).join("");
  openModal("── INVENTORY ──", html, "e 装备 · q 使用 · d 丢弃 · ESC 关闭", key => {
    if (key === "Escape" || key === "i") closeModal();
  });
}

document.addEventListener("keydown", e => {
  if (!started) {
    startGame();
    e.preventDefault();
    return;
  }
  if (!G || G.over) {
    if (e.key === "r" || e.key === "R") restartGame();
    return;
  }
  if (modalHandler) {
    modalHandler(e.key);
    e.preventDefault();
    return;
  }
  if (KEYMAP[e.key]) {
    const [dx, dy] = KEYMAP[e.key];
    playerMove(dx, dy);
    e.preventDefault();
    return;
  }
  if (e.key.length === 1) {
    handleAction(e.key);
    if (["g", "G", "e", "E", "q", "Q", "D", ">", ".", " "].includes(e.key) || DIAG[e.key]) e.preventDefault();
  }
});

// ── 触控支持 ─────────────────────────────────────────────
if ("ontouchstart" in window || navigator.maxTouchPoints > 0) {
  document.body.classList.add("touch");
}
document.getElementById("touch-controls").addEventListener("click", e => {
  const btn = e.target.closest("button");
  if (!btn || !G || G.over) return;
  const dir = btn.dataset.dir;
  if (dir) {
    const map = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    if (map[dir]) playerMove(...map[dir]);
    else waitTurn();
    return;
  }
  const key = btn.dataset.key;
  if (key) handleAction(key);
});

// ── 游戏生命周期 ─────────────────────────────────────────
function startGame() {
  if (started) return;
  started = true;
  document.getElementById("title-screen").classList.add("hidden");
  document.getElementById("game-screen").classList.remove("hidden");
  newGame();
  logMsg("crit", "═══ dungeon.sys v2.7.1 ─── 冒险开始 ═══");
  logMsg("notice", "你站在地牢入口。找到 Yendor 护身符（第 21 层）并活着回来。");
  logMsg("info", "移动: hjkl/方向键/WASD · 拾取: g · 背包: i · 装备: e · 使用: q · 丢弃: D · 下楼: > · 等待: .");
  render();
  mapEl.focus();
}

function restartGame() {
  document.getElementById("death-screen").classList.add("hidden");
  logEl.innerHTML = ""; logLines = 0;
  newGame();
  logMsg("crit", "═══ system reboot ─── 新的冒险者进入地牢 ═══");
  render();
  mapEl.focus();
}

// 时钟每秒刷新
setInterval(() => { if (started && G && !G.over) renderClock(); }, 1000);
