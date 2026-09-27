/* =========================================================================
   cards.js —— 项目卡与公司卡数据库
   卡牌名称与文案为原创，规则机制参考《重塑火星》基础版。
   字段说明：
     type   : automated(绿) | active(蓝) | event(红)
     tags   : building space science power earth jovian microbe plant animal city
     cost   : 打出费用（M€）
     req    : 需求 { temp, oxygen, ocean, tr, tags:{tag:n} }
     prod   : 立即改变产量 { mc, steel, titan, plant, energy, heat }
     res    : 立即获得资源
     tr     : 立即改变 TR
     temp/oxygen/ocean : 推进全局参数
     tile   : 'greenery' | 'city' | 'ocean'  需要放置板块
     draw   : 立即抽牌
     vp     : 固定胜利点
     vpPer  : 条件胜利点 { tag, per }
     action : 蓝卡行动 { label, cost:{mc}, gain:{...} }  每世代一次
   ========================================================================= */
(function (root) {
  "use strict";

  /* 标签色会被当作 .ci-tag / .pc-tag 的底色，上面压白字，所以每一个都必须
     「白字压它 ≥4.5:1」。凡是和 CSS token 撞值的，一律引用 token 而不是再抄一遍
     —— 木星标签原本抄了 #b7791f（token 后来调深，这里没跟着变，白字只剩 3.64:1）。
     剩下几个（建筑/太空/微生物/动物/城市）在 CSS 里没有对应 token，保留字面量。 */
  var TAGS = {
    building: { n: "建筑", en: "Building", c: "#a1662f", pay: "steel" },
    space: { n: "太空", en: "Space", c: "#2b6cb0", pay: "titan" },
    science: { n: "科学", en: "Science", c: "var(--teal)" },
    power: { n: "能源", en: "Power", c: "var(--purple)" },
    earth: { n: "地球", en: "Earth", c: "var(--blue)" },
    jovian: { n: "木星", en: "Jovian", c: "var(--gold)" },
    microbe: { n: "微生物", en: "Microbe", c: "#4d7c0f" },
    plant: { n: "植物", en: "Plant", c: "var(--green)" },
    animal: { n: "动物", en: "Animal", c: "#b45309" },
    city: { n: "城市", en: "City", c: "#7c3aed" }
  };
  var TAG_KEYS = Object.keys(TAGS);

  /* ---------------- 项目卡 ---------------- */
  var CARDS = [
    /* ===== 产量 / 建筑 ===== */
    { id: "b01", name: "自动采矿厂", type: "automated", tags: ["building"], cost: 12, prod: { steel: 1 }, res: { steel: 3 }, vp: 0, text: "钢铁产量 +1，并获得 3 钢铁。" },
    { id: "b02", name: "深井钻探", type: "automated", tags: ["building", "power"], cost: 13, prod: { heat: 2 }, vp: 0, text: "热量产量 +2。" },
    { id: "b03", name: "地热发电站", type: "automated", tags: ["building", "power"], cost: 11, prod: { energy: 1, heat: 1 }, vp: 0, text: "能源产量 +1，热量产量 +1。" },
    { id: "b04", name: "太阳能阵列", type: "automated", tags: ["power"], cost: 9, prod: { energy: 1 }, vp: 0, text: "能源产量 +1。" },
    { id: "b05", name: "轨道太阳能板", type: "automated", tags: ["power", "space"], cost: 14, req: { tags: { science: 1 } }, prod: { energy: 2 }, vp: 0, text: "能源产量 +2。（需要 1 个科学标签）" },
    { id: "b06", name: "温室农场", type: "automated", tags: ["building", "plant"], cost: 12, req: { temp: -10 }, prod: { plant: 1 }, vp: 0, text: "植物产量 +1。（需要温度 ≥ −10°C）" },
    { id: "b07", name: "氮气工厂", type: "automated", tags: ["building"], cost: 16, oxygen: 1, prod: { plant: 1 }, vp: 0, text: "氧气 +1，植物产量 +1。" },
    { id: "b08", name: "熔炼车间", type: "automated", tags: ["building"], cost: 9, prod: { steel: 1 }, res: { steel: 2 }, vp: 0, text: "钢铁产量 +1，并获得 2 钢铁。" },
    { id: "b09", name: "钛矿开采场", type: "automated", tags: ["building"], cost: 10, prod: { titan: 1 }, vp: 0, text: "钛产量 +1。" },
    { id: "b10", name: "重工业联合体", type: "automated", tags: ["building"], cost: 17, req: { tags: { building: 2 } }, prod: { steel: 2 }, vp: 0, text: "钢铁产量 +2。（需要 2 个建筑标签）" },
    { id: "b11", name: "磁悬浮干线", type: "automated", tags: ["building", "city"], cost: 15, req: { tags: { building: 2 } }, prod: { mc: 2 }, vp: 0, text: "M€ 产量 +2。（需要 2 个建筑标签）" },
    { id: "b12", name: "大气循环泵", type: "automated", tags: ["building", "power"], cost: 17, oxygen: 1, prod: { energy: 1 }, vp: 0, text: "氧气 +1，能源产量 +1。" },
    { id: "b13", name: "热交换塔", type: "automated", tags: ["building", "power"], cost: 13, temp: 1, prod: { heat: 1 }, vp: 0, text: "温度 +1 级，热量产量 +1。" },
    { id: "b14", name: "海水淡化厂", type: "automated", tags: ["building"], cost: 13, ocean: 1, prod: { plant: 1 }, vp: 0, text: "放置 1 块海洋，植物产量 +1。" },
    { id: "b15", name: "自动化仓储", type: "automated", tags: ["building"], cost: 10, res: { steel: 4 }, prod: { mc: 1 }, vp: 0, text: "M€ 产量 +1，并获得 4 钢铁。" },
    { id: "b16", name: "核裂变电站", type: "automated", tags: ["building", "power"], cost: 19, req: { tags: { power: 2 } }, prod: { energy: 3 }, vp: 0, text: "能源产量 +3。（需要 2 个能源标签）" },
    { id: "b17", name: "生物燃料厂", type: "automated", tags: ["building", "power", "plant"], cost: 14, prod: { energy: 1, plant: 1 }, vp: 0, text: "能源产量 +1，植物产量 +1。" },
    { id: "b18", name: "城市基建局", type: "automated", tags: ["building", "city"], cost: 14, prod: { mc: 1 }, tile: "city", vp: 0, text: "放置 1 块城市板块，M€ 产量 +1。" },
    { id: "b19", name: "熔岩管道城", type: "automated", tags: ["building", "city"], cost: 16, req: { temp: -8 }, prod: { mc: 1 }, tile: "city", vp: 0, text: "放置 1 块城市板块，M€ 产量 +1。（需要温度 ≥ −8°C）" },

    /* ===== 太空 ===== */
    { id: "s01", name: "小行星带采矿", type: "automated", tags: ["space"], cost: 12, req: { tags: { space: 1 } }, prod: { titan: 1 }, res: { titan: 2 }, vp: 0, text: "钛产量 +1，并获得 2 钛。（需要 1 个太空标签）" },
    { id: "s02", name: "木星探测器", type: "automated", tags: ["space", "science", "jovian"], cost: 15, prod: { titan: 1 }, draw: 1, vp: 1, text: "钛产量 +1，抽 1 张卡，1 分。" },
    { id: "s03", name: "太空电梯", type: "automated", tags: ["space", "building"], cost: 21, req: { tags: { science: 2 } }, prod: { titan: 2, mc: 1 }, vp: 2, text: "钛产量 +2，M€ 产量 +1，2 分。（需要 2 个科学标签）" },
    { id: "s04", name: "轨道工厂", type: "automated", tags: ["space", "building"], cost: 17, req: { tags: { space: 2 } }, prod: { steel: 2 }, vp: 0, text: "钢铁产量 +2。（需要 2 个太空标签）" },
    { id: "s05", name: "星际航运线", type: "automated", tags: ["space", "earth"], cost: 14, req: { tags: { earth: 1 } }, prod: { mc: 2 }, vp: 0, text: "M€ 产量 +2。（需要 1 个地球标签）" },
    { id: "s06", name: "火星轨道站", type: "automated", tags: ["space", "science"], cost: 16, prod: { titan: 1 }, draw: 2, vp: 1, text: "钛产量 +1，抽 2 张卡，1 分。" },
    { id: "s07", name: "柯伊伯带开采", type: "automated", tags: ["space"], cost: 19, req: { tags: { space: 3 } }, prod: { titan: 2 }, vp: 1, text: "钛产量 +2，1 分。（需要 3 个太空标签）" },
    { id: "s08", name: "光子推进器", type: "automated", tags: ["space", "science", "power"], cost: 13, prod: { energy: 1, titan: 1 }, vp: 0, text: "能源产量 +1，钛产量 +1。" },
    { id: "s09", name: "火卫一基地", type: "automated", tags: ["space", "building", "city"], cost: 19, req: { tags: { space: 2 } }, prod: { mc: 1 }, tile: "city", vp: 1, text: "放置 1 块城市板块，M€ 产量 +1，1 分。（需要 2 个太空标签）" },

    /* ===== 科学 ===== */
    { id: "k01", name: "科研中心", type: "automated", tags: ["building", "science"], cost: 15, req: { tags: { science: 2 } }, prod: { mc: 1 }, draw: 2, vp: 1, text: "M€ 产量 +1，抽 2 张卡，1 分。（需要 2 个科学标签）" },
    { id: "k02", name: "基因实验室", type: "automated", tags: ["science", "building", "microbe"], cost: 13, prod: { plant: 1 }, vp: 1, text: "植物产量 +1，1 分。" },
    { id: "k03", name: "物理学研究所", type: "automated", tags: ["science", "building"], cost: 12, prod: { energy: 1 }, draw: 1, vp: 1, text: "能源产量 +1，抽 1 张卡，1 分。" },
    { id: "k04", name: "人工智能中枢", type: "active", tags: ["science", "building"], cost: 20, req: { tags: { science: 3 } }, prod: { mc: 2 }, vp: 2, text: "M€ 产量 +2，2 分。（需要 3 个科学标签）", action: { label: "花 3 M€ 抽 1 张卡", cost: { mc: 3 }, gain: { draw: 1 } } },
    { id: "k05", name: "量子计算集群", type: "automated", tags: ["science"], cost: 17, draw: 3, vp: 1, text: "抽 3 张卡，1 分。" },
    { id: "k06", name: "实验室网络", type: "automated", tags: ["science", "building"], cost: 14, req: { tags: { science: 1 } }, prod: { mc: 1 }, draw: 1, vp: 0, text: "M€ 产量 +1，抽 1 张卡。（需要 1 个科学标签）" },
    { id: "k07", name: "火星大学", type: "automated", tags: ["science", "building"], cost: 16, req: { tags: { science: 2 } }, prod: { mc: 1, plant: 1 }, vp: 1, text: "M€ 产量 +1，植物产量 +1，1 分。（需要 2 个科学标签）" },

    /* ===== 生物 ===== */
    { id: "p01", name: "地衣培育", type: "automated", tags: ["plant"], cost: 8, req: { temp: -24 }, prod: { plant: 1 }, vp: 0, text: "植物产量 +1。（需要温度 ≥ −24°C）" },
    { id: "p02", name: "苔原植被", type: "automated", tags: ["plant"], cost: 11, req: { temp: -18 }, prod: { plant: 2 }, vp: 0, text: "植物产量 +2。（需要温度 ≥ −18°C）" },
    { id: "p03", name: "森林种植计划", type: "automated", tags: ["plant"], cost: 15, req: { temp: -6 }, tile: "greenery", prod: { plant: 1 }, vp: 0, text: "放置 1 块绿化板块，植物产量 +1。（需要温度 ≥ −6°C）" },
    { id: "p04", name: "微生物培养槽", type: "automated", tags: ["microbe", "science"], cost: 9, req: { temp: -20 }, prod: { plant: 1 }, vp: 0, text: "植物产量 +1。（需要温度 ≥ −20°C）" },
    { id: "p05", name: "固氮菌群", type: "automated", tags: ["microbe", "plant"], cost: 12, req: { oxygen: 4 }, oxygen: 1, prod: { plant: 1 }, vp: 0, text: "氧气 +1，植物产量 +1。（需要氧气 ≥ 4%）" },
    { id: "p06", name: "生态农场", type: "automated", tags: ["plant", "building"], cost: 13, req: { oxygen: 6 }, prod: { plant: 1, mc: 1 }, vp: 0, text: "植物产量 +1，M€ 产量 +1。（需要氧气 ≥ 6%）" },
    { id: "p07", name: "野生动物保护区", type: "automated", tags: ["animal", "plant"], cost: 16, req: { oxygen: 8 }, prod: { plant: 1 }, vp: 1, text: "植物产量 +1，1 分。（需要氧气 ≥ 8%）" },
    { id: "p08", name: "高原牧场", type: "automated", tags: ["animal"], cost: 15, req: { oxygen: 10 }, prod: { mc: 1 }, vp: 2, text: "M€ 产量 +1，2 分。（需要氧气 ≥ 10%）" },
    { id: "p09", name: "鱼类养殖场", type: "automated", tags: ["animal", "microbe"], cost: 12, req: { oxygen: 8 }, prod: { plant: 1 }, vp: 1, text: "植物产量 +1，1 分。（需要氧气 ≥ 8%）" },
    { id: "p10", name: "苔藓覆盖工程", type: "automated", tags: ["plant"], cost: 11, req: { ocean: 2 }, oxygen: 1, prod: { plant: 1 }, vp: 0, text: "氧气 +1，植物产量 +1。（需要 2 块海洋）" },
    { id: "p11", name: "热带雨林带", type: "automated", tags: ["plant"], cost: 21, req: { temp: 0, oxygen: 8 }, tile: "greenery", oxygen: 1, prod: { plant: 2 }, vp: 1, text: "放置 1 块绿化板块，氧气 +1，植物产量 +2，1 分。（需要温度 ≥ 0°C 且氧气 ≥ 8%）" },

    /* ===== 城市 / 绿化 ===== */
    { id: "c01", name: "首都行政区", type: "automated", tags: ["building", "city"], cost: 23, tile: "city", prod: { mc: 2 }, vp: 2, text: "放置 1 块城市板块，M€ 产量 +2，2 分。" },
    { id: "c02", name: "穹顶居住区", type: "automated", tags: ["building", "city"], cost: 18, req: { temp: -6 }, tile: "city", prod: { mc: 1 }, vp: 1, text: "放置 1 块城市板块，M€ 产量 +1，1 分。（需要温度 ≥ −6°C）" },
    { id: "c03", name: "绿洲工程", type: "automated", tags: ["building", "plant"], cost: 16, req: { ocean: 1 }, tile: "greenery", prod: { plant: 1 }, vp: 0, text: "放置 1 块绿化板块，植物产量 +1。（需要 1 块海洋）" },
    { id: "c04", name: "矿区定居点", type: "automated", tags: ["building", "city"], cost: 15, tile: "city", res: { steel: 3 }, prod: { mc: 1 }, vp: 0, text: "放置 1 块城市板块，M€ 产量 +1，并获得 3 钢铁。" },

    /* ===== 事件 ===== */
    { id: "e01", name: "小行星撞击", type: "event", tags: ["space"], cost: 13, temp: 1, vp: 0, text: "温度 +1 级。" },
    { id: "e02", name: "彗星冰核", type: "event", tags: ["space"], cost: 17, ocean: 1, temp: 1, vp: 0, text: "放置 1 块海洋，温度 +1 级。" },
    { id: "e03", name: "大规模造林", type: "event", tags: ["plant"], cost: 15, req: { temp: -10 }, oxygen: 2, vp: 0, text: "氧气 +2。（需要温度 ≥ −10°C）" },
    { id: "e04", name: "冰川融解", type: "event", tags: ["space"], cost: 13, ocean: 1, temp: 1, vp: 0, text: "放置 1 块海洋，温度 +1 级。" },
    { id: "e05", name: "全球宣传攻势", type: "event", tags: ["earth"], cost: 9, tr: 2, vp: 0, text: "TR +2。" },
    { id: "e06", name: "深海钻探", type: "event", tags: ["building"], cost: 16, ocean: 2, vp: 0, text: "放置 2 块海洋。" },
    { id: "e07", name: "陨石雨", type: "event", tags: ["space"], cost: 11, temp: 1, res: { titan: 2 }, vp: 0, text: "温度 +1 级，获得 2 钛。" },
    { id: "e08", name: "臭氧层修复", type: "event", tags: ["science"], cost: 18, req: { oxygen: 6 }, oxygen: 2, vp: 0, text: "氧气 +2。（需要氧气 ≥ 6%）" },
    { id: "e09", name: "行星改造总纲", type: "event", tags: ["earth", "science"], cost: 25, req: { tr: 30 }, temp: 2, oxygen: 2, ocean: 1, tr: 2, vp: 0, text: "温度 +2 级，氧气 +2，放置 1 块海洋，TR +2。（需要 TR ≥ 30）" },

    /* ===== 木星 ===== */
    { id: "j01", name: "木星贸易站", type: "automated", tags: ["jovian", "space", "earth"], cost: 18, prod: { mc: 2, titan: 1 }, vp: 1, text: "M€ 产量 +2，钛产量 +1，1 分。" },
    { id: "j02", name: "伽利略基地", type: "automated", tags: ["jovian", "space", "building"], cost: 20, req: { tags: { jovian: 1 } }, prod: { titan: 2 }, vp: 2, text: "钛产量 +2，2 分。（需要 1 个木星标签）" },
    { id: "j03", name: "木星舰队", type: "automated", tags: ["jovian", "space"], cost: 23, req: { tags: { jovian: 2 } }, vpPer: { tag: "jovian", per: 2 }, text: "每个木星标签 2 分。（需要 2 个木星标签）" },

    /* ===== 蓝卡（持续行动） ===== */
    { id: "a01", name: "采矿车队", type: "active", tags: ["building"], cost: 12, prod: { steel: 1 }, vp: 0, text: "钢铁产量 +1。", action: { label: "花 3 M€ 得 2 钢铁", cost: { mc: 3 }, gain: { res: { steel: 2 } } } },
    { id: "a02", name: "温室气体工厂", type: "active", tags: ["building", "power"], cost: 15, prod: { energy: 1, heat: 1 }, vp: 0, text: "能源产量 +1，热量产量 +1。", action: { label: "花 4 M€ 升温 1 级", cost: { mc: 4 }, gain: { temp: 1 } } },
    { id: "a03", name: "有机肥厂", type: "active", tags: ["building", "plant", "microbe"], cost: 13, prod: { plant: 1 }, vp: 0, text: "植物产量 +1。", action: { label: "花 3 M€ 得 1 植物", cost: { mc: 3 }, gain: { res: { plant: 1 } } } },
    { id: "a04", name: "电解水厂", type: "active", tags: ["building", "power"], cost: 16, prod: { energy: 2 }, vp: 0, text: "能源产量 +2。", action: { label: "花 5 M€ 提升氧气 1 级", cost: { mc: 5 }, gain: { oxygen: 1 } } },
    { id: "a05", name: "专利事务局", type: "active", tags: ["science", "earth"], cost: 14, prod: { mc: 1 }, vp: 0, text: "M€ 产量 +1。", action: { label: "花 3 M€ 抽 1 张卡", cost: { mc: 3 }, gain: { draw: 1 } } },
    { id: "a06", name: "殖民地事务办公室", type: "active", tags: ["earth", "building"], cost: 16, prod: { mc: 1 }, vp: 0, text: "M€ 产量 +1。", action: { label: "花 9 M€ 换 1 TR", cost: { mc: 9 }, gain: { tr: 1 } } },
    { id: "a07", name: "生物实验舱", type: "active", tags: ["microbe", "science"], cost: 12, prod: { plant: 1 }, vp: 0, text: "植物产量 +1。", action: { label: "花 4 M€ 得 1 植物并抽 1 张卡", cost: { mc: 4 }, gain: { res: { plant: 1 }, draw: 1 } } },
    { id: "a08", name: "地热井群", type: "active", tags: ["building", "power"], cost: 15, prod: { heat: 2 }, vp: 0, text: "热量产量 +2。", action: { label: "花 6 M€ 得 3 热量", cost: { mc: 6 }, gain: { res: { heat: 3 } } } },
    { id: "a09", name: "钛矿精炼厂", type: "active", tags: ["building", "space"], cost: 14, prod: { titan: 1 }, vp: 0, text: "钛产量 +1。", action: { label: "花 5 M€ 得 2 钛", cost: { mc: 5 }, gain: { res: { titan: 2 } } } },
    { id: "a10", name: "科研拨款处", type: "active", tags: ["science", "earth"], cost: 15, prod: { mc: 1 }, vp: 1, text: "M€ 产量 +1，1 分。", action: { label: "花 8 M€ 得 2 TR", cost: { mc: 8 }, gain: { tr: 2 } } },

    /* ===== 扩充：建筑 / 工业 ===== */
    { id: "b20", name: "钢铁铸造厂", type: "automated", tags: ["building"], cost: 15, req: { tags: { building: 2 } }, prod: { steel: 2, energy: -1 }, vp: 0, text: "钢铁产量 +2，能源产量 −1。（需要 2 个建筑标签）" },
    { id: "b21", name: "轨道电梯基座", type: "automated", tags: ["building", "space"], cost: 22, req: { tags: { science: 2 } }, prod: { titan: 1, mc: 1 }, vp: 1, text: "钛产量 +1，M€ 产量 +1，1 分。（需要 2 个科学标签）" },
    { id: "b22", name: "熔岩隧道住宅", type: "automated", tags: ["building", "city"], cost: 17, req: { temp: -10 }, tile: "city", prod: { mc: 1 }, vp: 1, text: "放置 1 块城市板块，M€ 产量 +1，1 分。（需要温度 ≥ −10°C）" },
    { id: "b23", name: "工业废热回收", type: "automated", tags: ["building", "power"], cost: 12, prod: { heat: 1, energy: 1 }, vp: 0, text: "热量产量 +1，能源产量 +1。" },
    { id: "b24", name: "自动装配线", type: "automated", tags: ["building", "science"], cost: 18, req: { tags: { building: 3 } }, prod: { steel: 1, mc: 1 }, draw: 1, vp: 0, text: "钢铁产量 +1，M€ 产量 +1，抽 1 张卡。（需要 3 个建筑标签）" },
    { id: "b25", name: "地幔热井", type: "automated", tags: ["building", "power"], cost: 20, req: { tags: { power: 2 } }, prod: { heat: 3 }, vp: 0, text: "热量产量 +3。（需要 2 个能源标签）" },
    { id: "b26", name: "废弃物填埋场", type: "automated", tags: ["building", "microbe"], cost: 10, res: { mc: 5 }, prod: { plant: 1 }, vp: 0, text: "植物产量 +1，并获得 5 M€。" },
    { id: "b27", name: "太阳能塔群", type: "automated", tags: ["building", "power"], cost: 16, req: { temp: -14 }, prod: { energy: 2 }, vp: 1, text: "能源产量 +2，1 分。（需要温度 ≥ −14°C）" },
    { id: "b28", name: "防洪堤坝", type: "automated", tags: ["building"], cost: 14, req: { ocean: 3 }, ocean: 1, vp: 1, text: "放置 1 块海洋，1 分。（需要 3 块海洋）" },
    { id: "b29", name: "矿渣精炼厂", type: "automated", tags: ["building"], cost: 11, prod: { steel: 1 }, res: { titan: 1 }, vp: 0, text: "钢铁产量 +1，并获得 1 钛。" },
    { id: "b30", name: "市政工程局", type: "automated", tags: ["building", "city"], cost: 19, req: { tags: { building: 3 } }, tile: "city", prod: { mc: 2 }, vp: 1, text: "放置 1 块城市板块，M€ 产量 +2，1 分。（需要 3 个建筑标签）" },
    { id: "b31", name: "空气压缩站", type: "automated", tags: ["building", "power"], cost: 15, oxygen: 1, prod: { energy: 1 }, vp: 0, text: "氧气 +1，能源产量 +1。" },
    { id: "b32", name: "矿脉探测网", type: "automated", tags: ["building", "science"], cost: 13, res: { steel: 2, titan: 2 }, draw: 1, vp: 0, text: "获得 2 钢铁、2 钛，抽 1 张卡。" },

    /* ===== 扩充：太空 ===== */
    { id: "s10", name: "小行星牵引船", type: "automated", tags: ["space"], cost: 16, req: { tags: { space: 2 } }, temp: 1, res: { titan: 1 }, vp: 0, text: "温度 +1 级，获得 1 钛。（需要 2 个太空标签）" },
    { id: "s11", name: "深空补给站", type: "automated", tags: ["space", "earth"], cost: 17, prod: { mc: 1 }, draw: 2, vp: 1, text: "M€ 产量 +1，抽 2 张卡，1 分。" },
    { id: "s12", name: "轨道镜阵", type: "automated", tags: ["space", "power"], cost: 20, req: { tags: { space: 2 } }, temp: 1, prod: { energy: 2 }, vp: 1, text: "温度 +1 级，能源产量 +2，1 分。（需要 2 个太空标签）" },
    { id: "s13", name: "土卫六货运线", type: "automated", tags: ["space", "jovian"], cost: 21, req: { tags: { jovian: 1 } }, prod: { titan: 1, mc: 1 }, vp: 1, text: "钛产量 +1，M€ 产量 +1，1 分。（需要 1 个木星标签）" },
    { id: "s14", name: "彗星捕获网", type: "automated", tags: ["space"], cost: 24, ocean: 2, vp: 1, text: "放置 2 块海洋，1 分。" },
    { id: "s15", name: "星际探测阵列", type: "automated", tags: ["space", "science"], cost: 15, draw: 3, vp: 0, text: "抽 3 张卡。" },
    { id: "s16", name: "近地轨道工厂", type: "automated", tags: ["space", "building"], cost: 18, req: { tags: { space: 1, building: 1 } }, prod: { steel: 1, titan: 1 }, vp: 1, text: "钢铁产量 +1，钛产量 +1，1 分。（需要太空与建筑标签各 1 个）" },

    /* ===== 扩充：科学 ===== */
    { id: "k08", name: "大气物理实验室", type: "automated", tags: ["science", "building"], cost: 17, req: { tags: { science: 2 } }, oxygen: 1, draw: 1, vp: 1, text: "氧气 +1，抽 1 张卡，1 分。（需要 2 个科学标签）" },
    { id: "k09", name: "材料研究所", type: "automated", tags: ["science", "building"], cost: 14, prod: { steel: 1 }, vp: 1, text: "钢铁产量 +1，1 分。" },
    { id: "k10", name: "深空望远镜", type: "automated", tags: ["science", "space"], cost: 16, req: { tags: { science: 1 } }, draw: 2, vp: 1, text: "抽 2 张卡，1 分。（需要 1 个科学标签）" },
    { id: "k11", name: "行星工程学", type: "automated", tags: ["science", "building"], cost: 19, req: { tags: { science: 3 } }, temp: 1, oxygen: 1, vp: 1, text: "温度 +1 级，氧气 +1，1 分。（需要 3 个科学标签）" },
    { id: "k12", name: "数据中枢", type: "automated", tags: ["science"], cost: 13, prod: { mc: 1 }, draw: 1, vp: 0, text: "M€ 产量 +1，抽 1 张卡。" },

    /* ===== 扩充：生物 ===== */
    { id: "p12", name: "藻类养殖带", type: "automated", tags: ["plant", "microbe"], cost: 12, req: { ocean: 1 }, prod: { plant: 2 }, vp: 0, text: "植物产量 +2。（需要 1 块海洋）" },
    { id: "p13", name: "地衣覆盖工程", type: "automated", tags: ["plant", "microbe"], cost: 10, req: { temp: -22 }, prod: { plant: 1 }, vp: 0, text: "植物产量 +1。（需要温度 ≥ −22°C）" },
    { id: "p14", name: "湿地保护区", type: "automated", tags: ["plant", "animal"], cost: 18, req: { oxygen: 7 }, tile: "greenery", vp: 2, text: "放置 1 块绿化板块，2 分。（需要氧气 ≥ 7%）" },
    { id: "p15", name: "北极苔原带", type: "automated", tags: ["plant"], cost: 13, req: { temp: -16 }, prod: { plant: 1, heat: 1 }, vp: 0, text: "植物产量 +1，热量产量 +1。（需要温度 ≥ −16°C）" },
    { id: "p16", name: "基因库", type: "automated", tags: ["microbe", "science"], cost: 16, req: { oxygen: 5 }, vpPer: { tag: "microbe", per: 2 }, text: "每个微生物标签 2 分。（需要氧气 ≥ 5%）" },
    { id: "p17", name: "生态廊道", type: "automated", tags: ["plant", "animal"], cost: 17, req: { oxygen: 9 }, tile: "greenery", prod: { plant: 1 }, vp: 1, text: "放置 1 块绿化板块，植物产量 +1，1 分。（需要氧气 ≥ 9%）" },
    { id: "p18", name: "牲畜养殖场", type: "automated", tags: ["animal", "building"], cost: 14, req: { oxygen: 9 }, prod: { mc: 1 }, vpPer: { tag: "animal", per: 1 }, text: "M€ 产量 +1，每个动物标签 1 分。（需要氧气 ≥ 9%）" },
    { id: "p19", name: "原始森林", type: "automated", tags: ["plant"], cost: 20, req: { temp: 2, oxygen: 6 }, tile: "greenery", oxygen: 1, prod: { plant: 1 }, vp: 2, text: "放置 1 块绿化板块，氧气 +1，植物产量 +1，2 分。（需要温度 ≥ 2°C 且氧气 ≥ 6%）" },

    /* ===== 扩充：事件 ===== */
    { id: "e10", name: "冰彗星撞击", type: "event", tags: ["space"], cost: 22, ocean: 2, temp: 1, vp: 0, text: "放置 2 块海洋，温度 +1 级。" },
    { id: "e11", name: "火山喷发", type: "event", tags: ["power"], cost: 15, temp: 1, res: { heat: 3 }, vp: 0, text: "温度 +1 级，获得 3 热量。" },
    { id: "e12", name: "氮气释放计划", type: "event", tags: ["science"], cost: 20, req: { oxygen: 4 }, oxygen: 2, vp: 0, text: "氧气 +2。（需要氧气 ≥ 4%）" },
    { id: "e13", name: "媒体宣传战", type: "event", tags: ["earth"], cost: 12, tr: 1, prod: { mc: 1 }, vp: 0, text: "TR +1，M€ 产量 +1。" },
    { id: "e14", name: "地质勘探大发现", type: "event", tags: ["science", "building"], cost: 10, res: { steel: 3, titan: 3 }, vp: 0, text: "获得 3 钢铁、3 钛。" },
    { id: "e15", name: "生态修复工程", type: "event", tags: ["microbe"], cost: 13, req: { oxygen: 6 }, res: { plant: 4 }, prod: { plant: 1 }, vp: 0, text: "植物产量 +1，获得 4 植物。（需要氧气 ≥ 6%）" },
    { id: "e16", name: "太阳耀斑", type: "event", tags: ["space", "power"], cost: 14, prod: { energy: 2 }, temp: 1, vp: 0, text: "能源产量 +2，温度 +1 级。" },
    { id: "e17", name: "极地冰盖钻探", type: "event", tags: ["building"], cost: 19, ocean: 1, oxygen: 1, vp: 0, text: "放置 1 块海洋，氧气 +1。" },
    { id: "e18", name: "殖民宣传片", type: "event", tags: ["earth", "city"], cost: 11, res: { mc: 8 }, vp: 0, text: "获得 8 M€。" },

    /* ===== 扩充：木星 ===== */
    { id: "j04", name: "木卫二考察站", type: "automated", tags: ["jovian", "space", "science"], cost: 19, req: { tags: { jovian: 1 } }, draw: 2, vp: 2, text: "抽 2 张卡，2 分。（需要 1 个木星标签）" },
    { id: "j05", name: "木星轨道船坞", type: "automated", tags: ["jovian", "space", "building"], cost: 22, req: { tags: { jovian: 2 } }, prod: { titan: 1, steel: 1 }, vp: 2, text: "钛产量 +1，钢铁产量 +1，2 分。（需要 2 个木星标签）" },
    { id: "j06", name: "外太阳系贸易网", type: "automated", tags: ["jovian", "earth"], cost: 20, req: { tags: { jovian: 2 } }, prod: { mc: 2 }, vpPer: { tag: "jovian", per: 1 }, text: "M€ 产量 +2，每个木星标签 1 分。（需要 2 个木星标签）" },

    /* ===== 扩充：蓝卡行动 ===== */
    { id: "a11", name: "轨道货运枢纽", type: "active", tags: ["space", "earth"], cost: 18, prod: { mc: 1 }, vp: 1, text: "M€ 产量 +1，1 分。", action: { label: "花 4 M€ 得 2 钛", cost: { mc: 4 }, gain: { res: { titan: 2 } } } },
    { id: "a12", name: "地热钻井平台", type: "active", tags: ["building", "power"], cost: 17, prod: { heat: 2 }, vp: 0, text: "热量产量 +2。", action: { label: "花 5 M€ 得 4 热量", cost: { mc: 5 }, gain: { res: { heat: 4 } } } },
    { id: "a13", name: "大气处理厂", type: "active", tags: ["building", "science"], cost: 19, prod: { energy: 1 }, vp: 1, text: "能源产量 +1，1 分。", action: { label: "花 7 M€ 提升氧气 1 级", cost: { mc: 7 }, gain: { oxygen: 1 } } },
    { id: "a14", name: "植物培育舱", type: "active", tags: ["plant", "science"], cost: 13, prod: { plant: 1 }, vp: 0, text: "植物产量 +1。", action: { label: "花 4 M€ 得 2 植物", cost: { mc: 4 }, gain: { res: { plant: 2 } } } },
    { id: "a15", name: "深空通信站", type: "active", tags: ["space", "science"], cost: 16, prod: { mc: 1 }, vp: 1, text: "M€ 产量 +1，1 分。", action: { label: "花 6 M€ 抽 2 张卡", cost: { mc: 6 }, gain: { draw: 2 } } },
    { id: "a16", name: "城市规划署", type: "active", tags: ["building", "city", "earth"], cost: 20, prod: { mc: 1 }, vp: 1, text: "M€ 产量 +1，1 分。", action: { label: "花 10 M€ 得 1 TR 与 1 钢铁", cost: { mc: 10 }, gain: { tr: 1, res: { steel: 1 } } } }
  ];

  /* ---------------- 公司卡 ----------------
     color 只用来画公司卡片顶部的 4px 色条（--cc），上面不压文字，
     所以它本身没有对比度要求；但仍然引用 token 以免和标签色/资源色各走各的。 */
  var CORPORATIONS = [
    {
      id: "corp_beginner", name: "起步公司", color: "#6b7280",
      startMc: 42, startProd: {}, startRes: {}, startCards: 0, freeCity: false,
      effect: null,
      text: "没有特殊能力，起始 42 M€。适合第一次玩的人熟悉流程。"
    },
    {
      id: "corp_credit", name: "信用集团", color: "var(--gold)",
      startMc: 55, startProd: {}, startRes: {}, startCards: 0,
      effect: { type: "trBonusMc", amount: 3 },
      text: "每当你获得 1 点 TR，额外获得 3 M€。"
    },
    {
      id: "corp_ecoline", name: "生态线", color: "var(--green)",
      startMc: 36, startProd: { plant: 2 }, startRes: {}, startCards: 0,
      effect: { type: "trBonusPlant", amount: 1 },
      text: "起始植物产量 +2。每当你获得 1 点 TR，额外获得 1 植物。"
    },
    {
      id: "corp_helios", name: "太阳神能源", color: "var(--rust-2)",
      startMc: 38, startProd: { energy: 1 }, startRes: {}, startCards: 0,
      effect: { type: "energyAsMoney" },
      text: "起始能源产量 +1。你可以用能源代替 M€ 支付费用（1 能源 = 1 M€）。"
    },
    {
      id: "corp_cinema", name: "星际影业", color: "var(--red)",
      startMc: 42, startProd: {}, startRes: { steel: 4 }, startCards: 0,
      effect: { type: "eventBonusMc", amount: 3 },
      text: "起始获得 4 钢铁。每当你打出 1 张事件卡，获得 3 M€。"
    },
    {
      id: "corp_inventrix", name: "发明家公司", color: "var(--purple)",
      startMc: 45, startProd: {}, startRes: {}, startCards: 3,
      effect: { type: "reqFlex", amount: 2 },
      text: "起始多抽 3 张卡。所有卡牌需求放宽 2 级（温度、氧气、海洋、TR）。"
    },
    {
      id: "corp_mining", name: "矿业公会", color: "#6b7280",
      startMc: 30, startProd: { steel: 1 }, startRes: {}, startCards: 0,
      effect: { type: "tagSteel", tag: "building", amount: 2 },
      text: "起始钢铁产量 +1。每当你打出带建筑标签的卡，获得 2 钢铁。"
    },
    {
      id: "corp_phobolog", name: "光电科技", color: "#2b6cb0",
      startMc: 23, startProd: {}, startRes: { titan: 10 }, startCards: 0,
      effect: { type: "tagDiscount", tag: "space", amount: 2 },
      text: "起始获得 10 钛。带太空标签的卡费用减 2 M€。"
    },
    {
      id: "corp_saturn", name: "土星系统", color: "var(--gold)",
      startMc: 42, startProd: {}, startRes: {}, startCards: 0,
      effect: { type: "tagProdMc", tag: "jovian", amount: 1 },
      text: "每当你打出带木星标签的卡，M€ 产量 +1。"
    },
    {
      id: "corp_teractor", name: "大地集团", color: "var(--blue)",
      startMc: 60, startProd: {}, startRes: {}, startCards: 0,
      effect: { type: "tagDiscount", tag: "earth", amount: 3 },
      text: "起始 60 M€。带地球标签的卡费用减 3 M€。"
    },
    {
      id: "corp_tharsis", name: "塔尔西斯共和国", color: "#7c3aed",
      startMc: 40, startProd: {}, startRes: {}, startCards: 0, freeCity: true,
      effect: { type: "cityProd", amount: 1 },
      text: "开局免费放置 1 块城市板块。每当你放置城市板块，M€ 产量 +1。"
    },
    {
      id: "corp_thorgate", name: "雷神之门", color: "var(--purple)",
      startMc: 48, startProd: { energy: 1 }, startRes: {}, startCards: 0,
      effect: { type: "tagDiscount", tag: "power", amount: 3 },
      text: "起始能源产量 +1。带能源标签的卡费用减 3 M€。"
    },
    {
      id: "corp_unmi", name: "联合火星计划署", color: "var(--teal)",
      startMc: 40, startProd: {}, startRes: {}, startCards: 0,
      effect: { type: "trBonusMc", amount: 2 },
      text: "每当你获得 1 点 TR，额外获得 2 M€。"
    }
  ];

  var byId = {};
  CARDS.forEach(function (c) { byId[c.id] = c; });
  var corpById = {};
  CORPORATIONS.forEach(function (c) { corpById[c.id] = c; });

  root.TMCards = {
    TAGS: TAGS,
    TAG_KEYS: TAG_KEYS,
    CARDS: CARDS,
    CORPORATIONS: CORPORATIONS,
    byId: byId,
    corpById: corpById
  };
})(typeof window !== "undefined" ? window : globalThis);
