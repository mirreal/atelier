/* ============================================================
   《平面国：向上，而非向北》 —— 引擎
   场景契约 / 输入 / 音效 / 存档 / 封面与进度
   ============================================================ */
(function () {
  'use strict';

  const WB = (window.WB = { scenes: [], version: '1.0' });
  const TAU = Math.PI * 2;

  /* ---------------- 工具 ---------------- */
  const U = {
    TAU,
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    dist: (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by),
    angNorm(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; },
    ease: t => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    smoothstep(e0, e1, x) { const t = U.clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); },
    // 用种子生成稳定伪随机（章节布局需要可复现）
    rng(seed) {
      let s = (seed >>> 0) || 1;
      return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    },
    fmt: (n, d) => Number(n).toFixed(d === undefined ? 1 : d),
  };
  WB.util = U;

  WB.font = (size, weight, serif) =>
    `${weight || 400} ${size}px ${serif ? '"Songti SC","STSong",Georgia,serif' : '"PingFang SC","Hiragino Sans GB",system-ui,sans-serif'}`;

  WB.scene = s => WB.scenes.push(s);

  /* ---------------- 音效（极简合成器，无外部资源） ---------------- */
  const SFX = (function () {
    let ac = null, enabled = true, master = null;

    function ctx() {
      if (ac) return ac;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ac = new AC();
        master = ac.createGain();
        master.gain.value = 0.5;
        master.connect(ac.destination);
      } catch (e) { ac = null; }
      return ac;
    }
    // 注意：不 await resume()——无音频设备的环境里这个 Promise 会永久挂起
    function wake() {
      const c = ctx();
      if (c && c.state === 'suspended') c.resume().catch(() => {});
    }
    function tone(f, dur, type, gain, slideTo, delay) {
      if (!enabled) return;
      const c = ctx(); if (!c) return;
      const t0 = c.currentTime + (delay || 0);
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain || .07), t0 + Math.min(.02, dur * .3));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + dur + .02);
    }
    const bank = {
      tick:  () => tone(1180, .05, 'square', .035),
      blip:  () => tone(520, .06, 'sine', .05),
      ok:    () => { tone(523.25, .11, 'sine', .08); tone(783.99, .2, 'sine', .075, null, .1); },
      win:   () => { tone(523.25, .13, 'sine', .08); tone(659.25, .13, 'sine', .08, null, .12); tone(987.77, .34, 'sine', .08, null, .25); },
      bad:   () => { tone(196, .16, 'sawtooth', .05); tone(146, .2, 'sawtooth', .04, null, .09); },
      pick:  () => tone(880, .07, 'triangle', .05),
      drop:  () => tone(330, .1, 'triangle', .06),
      lift:  () => { tone(220, .5, 'sine', .06, 1320); tone(330, .5, 'triangle', .022, 1980); },
      point: () => tone(1244, .6, 'sine', .03),
      boom:  () => { tone(90, .7, 'sine', .1, 44); },
      page:  () => tone(1400, .035, 'square', .022),
    };
    return {
      play(n, opt) {
        if (!enabled) return;
        wake();
        const f = bank[n];
        if (f) { try { f(opt); } catch (e) {} }
      },
      setEnabled(v) { enabled = !!v; if (enabled) wake(); },
      get enabled() { return enabled; },
      wake,
    };
  })();
  WB.sfx = SFX;

  /* ---------------- 存档 ---------------- */
  const KEY = 'flatland-wb-save-v1';
  const Save = {
    data: { done: {}, seen: 0, sound: true, stats: {} },
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const o = JSON.parse(raw);
          if (o && typeof o === 'object') {
            this.data.done = o.done && typeof o.done === 'object' ? o.done : {};
            this.data.seen = Number(o.seen) || 0;
            this.data.sound = o.sound !== false;
            this.data.stats = o.stats && typeof o.stats === 'object' ? o.stats : {};
          }
        }
      } catch (e) { /* 隐私模式等，静默降级 */ }
      return this.data;
    },
    flush() {
      try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) {}
    },
    patch(fn) { fn(this.data); this.flush(); },
    clear() { this.data = { done: {}, seen: 0, sound: this.data.sound, stats: {} }; this.flush(); },
  };
  WB.save = Save;

  /* ---------------- DOM ---------------- */
  const $ = id => document.getElementById(id);
  const D = {};
  ['shell', 'dots', 'cv', 'hud', 'side', 'chNum', 'chTitle', 'chSrc', 'chEpi',
   'chBrief', 'chGoal', 'chKeys', 'ticker', 'cover', 'veil', 'veilCard', 'toast',
   'live', 'btnSound', 'btnMenu', 'btnStart', 'btnContinue', 'btnReset', 'pick', 'pickGrid']
    .forEach(k => { D[k] = null; });
  function grab() { Object.keys(D).forEach(k => { D[k] = $(k); }); }

  /* ---------------- 输入 ---------------- */
  const input = {
    keys: new Set(),
    pressed: new Set(),
    down(code) { return this.keys.has(code); },
    hit(code) { return this.pressed.has(code); },
    clear() { this.pressed.clear(); },
  };
  WB.input = input;

  /* ---------------- 运行时 ---------------- */
  const RT = {
    w: 800, h: 500, s: 1, dpr: 1, idx: -1, def: null, scene: null, api: null,
    elapsed: 0, frames: 0, last: 0, running: false, done: false, paused: false,
  };
  WB.rt = RT;

  /* ---------------- 触控层 ----------------
     桌面端是键盘加鼠标，手机上两样都没有。这一层把「按键」原样搬到屏幕上。

     关键设计：一个虚拟键按下时**同时**做两件事 ——
       ① 写 input.keys / input.pressed
       ② 直接派发 scene.key(code, true)
     因为各章读键盘的方式有两种：
       · 连续型（第一章、序幕）在 update 里读 input.down('ArrowLeft')，靠 keys 常驻；
       · 离散型（第五、六、七、八章）在 key 回调里读，靠一次性事件。
     两条路都写，两种场景就都不用改。副作用是重复派发，但各章对另一种读法都是
     无操作（第一章的 key 回调是空函数，第六章不读 input.down），所以是安全的。

     方向键会自动重复，对应键盘的长按；动作键不重复 —— 否则 KeyV 这种开关
     会在按住时疯狂闪。 */
  const Touch = (function () {
    const REPEAT_DELAY = 280, REPEAT_EVERY = 75;
    const GLYPH = { ArrowUp: '▲', ArrowDown: '▼', ArrowLeft: '◀', ArrowRight: '▶' };
    const DEFAULT_LABEL = { ArrowUp: '上', ArrowDown: '下', ArrowLeft: '左', ArrowRight: '右' };

    let forced = null;          // null=自动判定；true/false=验证时手动指定
    let root = null, wrap = null;
    const held = new Map();     // pointerId -> { code }：哪根手指按着哪个键
    const counts = new Map();   // code -> 同时按住它的手指数（两根手指按同一个键时别提前松开）
    const repeats = new Map();  // code -> { delay, timer }：自动重复的计时器，按「键」挂而不是按手指

    function coarse() {
      if (forced !== null) return forced;
      try {
        if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
      } catch (e) { /* 老环境没有 matchMedia */ }
      try { return ((navigator && navigator.maxTouchPoints) || 0) > 0; } catch (e) { return false; }
    }

    function dispatchKey(code, down, repeat) {
      const s = RT.scene;
      if (s && typeof s.key === 'function') { try { s.key(code, down, !!repeat, null); } catch (e) {} }
    }

    /* 按下。repeat=true 表示这个键该像键盘那样自动重复（方向键用）。
       计时器按 code 挂：两根手指按同一个键也只跑一个计时器。 */
    function press(code, repeat) {
      const n = (counts.get(code) || 0) + 1;
      counts.set(code, n);
      if (n > 1) return false;                 // 已经按着了，只加计数
      if (!input.keys.has(code)) input.pressed.add(code);
      input.keys.add(code);
      dispatchKey(code, true, false);
      if (repeat) startRepeat(code);
      return true;
    }

    function release(code) {
      const n = (counts.get(code) || 0) - 1;
      if (n > 0) { counts.set(code, n); return false; }
      counts.delete(code);
      stopRepeat(code);
      input.keys.delete(code);
      dispatchKey(code, false, false);
      return true;
    }

    function stopRepeat(code) {
      const rec = repeats.get(code);
      if (!rec) return;
      if (rec.delay) clearTimeout(rec.delay);
      if (rec.timer) clearInterval(rec.timer);
      repeats.delete(code);
    }
    /* 长按的第一次重复要等 REPEAT_DELAY，之后按 REPEAT_EVERY 走 —— 和键盘一致，
       否则手指刚碰到键就狂跑，方向感全没了。 */
    function startRepeat(code) {
      stopRepeat(code);
      const rec = { delay: 0, timer: 0 };
      rec.delay = setTimeout(() => {
        rec.timer = setInterval(() => dispatchKey(code, true, true), REPEAT_EVERY);
      }, REPEAT_DELAY);
      repeats.set(code, rec);
    }

    /* 把一个按钮绑上按下/抬起。用 pointer 事件而不是 touch/click：
       pointer 自带 pointerId，多指同时按不同键时不会互相干扰；
       click 则要等手指抬起才触发，「按住往前走」这种操作根本没法做。 */
    function bindBtn(btn, code, repeat) {
      const down = ev => {
        ev.preventDefault();
        if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
        const id = ev.pointerId === undefined ? 1 : ev.pointerId;
        if (held.has(id)) return;
        held.set(id, { code });
        SFX.wake();
        try { if (btn.setPointerCapture) btn.setPointerCapture(id); } catch (e) {}
        btn.classList.add('down');
        press(code, repeat);
      };
      const up = ev => {
        const id = ev.pointerId === undefined ? 1 : ev.pointerId;
        const rec = held.get(id);
        if (!rec) return;
        held.delete(id);
        /* 只有真正松开这个键了才去掉按下态。两根手指按同一个按钮时，
           先抬起的那根不应该把视觉上的按下态也带走。 */
        if (release(rec.code)) btn.classList.remove('down');
      };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('lostpointercapture', up);
      btn.addEventListener('contextmenu', ev => ev.preventDefault());
    }

    function mount() {
      if (root) return root;
      wrap = document.querySelector ? document.querySelector('.canvasWrap') : null;
      if (!wrap) return null;
      root = document.createElement('div');
      root.id = 'touch';
      root.className = 'touch';
      root.hidden = true;
      wrap.appendChild(root);
      return root;
    }

    /* 按当前场景重建按键。桌面端只是把整层藏起来，不做任何其它事。 */
    function build(def) {
      if (!mount()) return;
      root.hidden = !coarse();
      root.innerHTML = '';
      if (root.hidden) return;
      const t = def && def.touch;
      if (!t) return;

      const pad = t.pad;
      if (pad) {
        const L = t.padLabels || {};
        const box = document.createElement('div');
        box.className = 'touchPad pad-' + pad;
        let keys;
        if (pad === 'lr') keys = ['ArrowLeft', 'ArrowRight'];
        else if (pad === 'ud') keys = ['ArrowUp', 'ArrowDown'];
        else keys = ['ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown'];
        keys.forEach(code => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'tbtn dir d-' + code.replace('Arrow', '').toLowerCase();
          b.textContent = GLYPH[code];
          b.dataset.code = code;
          b.setAttribute('aria-label', L[code.replace('Arrow', '').toLowerCase()] || DEFAULT_LABEL[code]);
          bindBtn(b, code, true);
          box.appendChild(b);
        });
        root.appendChild(box);
      }

      const acts = t.actions || [];
      if (acts.length) {
        const box = document.createElement('div');
        box.className = 'touchActs';
        acts.forEach(a => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'tbtn act' + (a.hold ? ' hold' : '');
          b.textContent = a.label;
          b.dataset.code = a.code;
          if (a.desc) b.setAttribute('aria-label', a.label + '：' + a.desc);
          bindBtn(b, a.code, !!a.repeat);
          box.appendChild(b);
        });
        root.appendChild(box);
      }
    }

    function clear() {
      [...repeats.keys()].forEach(stopRepeat);
      held.clear();
      counts.clear();
      input.keys.clear();
      if (root) root.innerHTML = '';
    }

    /* 侧栏「操作」卡片在触屏设备上要显示的内容。按键契约（pad/actions）是给机器看的，
       这里是给人看的，两者分开写 —— 靠机械推导会把「▲▼」在不同章节的含义搞混
       （第一章是前进后退，第六章是升高降低视角）。 */
    function keyRows(def) {
      const t = def && def.touch;
      if (!t) return null;
      const L = t.padLabels || {};
      const rows = [];
      const pad = t.pad;
      if (pad) {
        const pick = (codes, cls) => {
          const glyphs = codes.map(c => GLYPH[c]).join(' ');
          const words = codes.map(c => L[c.replace('Arrow', '').toLowerCase()] || DEFAULT_LABEL[c]);
          rows.push([glyphs, words.join(' / '), cls]);
        };
        if (pad === 'lr') pick(['ArrowLeft', 'ArrowRight'], 'pad');
        else if (pad === 'ud') pick(['ArrowUp', 'ArrowDown'], 'pad');
        else { pick(['ArrowUp', 'ArrowDown'], 'pad'); pick(['ArrowLeft', 'ArrowRight'], 'pad'); }
      }
      (t.actions || []).forEach(a => rows.push([a.label, a.desc || '按下触发', 'act']));
      if (t.note) rows.push([null, t.note, 'note']);
      return rows;
    }

    return {
      get on() { return coarse(); },
      get forced() { return forced; },
      force(v) { forced = (v === null || v === undefined) ? null : !!v; return forced; },
      build, clear, keyRows, press, release,
      /* 供自动化验收：屏幕上有哪些键、各自多大 */
      layout() {
        if (!root || root.hidden) return [];
        const bs = root.querySelectorAll ? root.querySelectorAll('button') : [];
        return [...bs].map(b => {
          const r = b.getBoundingClientRect ? b.getBoundingClientRect() : { width: 0, height: 0 };
          return {
            code: b.dataset.code, label: b.textContent,
            w: Math.round(r.width), h: Math.round(r.height),
            hold: !!(b.classList && b.classList.contains('hold')),
          };
        });
      },
    };
  })();
  WB.touch = Touch;

  function resize() {
    const cv = D.cv; if (!cv) return;
    const r = cv.getBoundingClientRect();
    const w = Math.max(120, Math.round(r.width));
    const h = Math.max(120, Math.round(r.height));
    const dpr = U.clamp(window.devicePixelRatio || 1, 1, 2);
    RT.dpr = dpr; RT.w = w; RT.h = h; RT.s = U.clamp(Math.min(w / 1000, h / 640), .42, 1.7);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  }
  window.addEventListener('resize', () => { resize(); }, { passive: true });

  function say(text, kind) {
    if (!D.ticker) return;
    const empty = D.ticker.querySelector('.empty');
    if (empty) empty.remove();
    const ln = document.createElement('div');
    ln.className = 'ln' + (kind ? ' ' + kind : '');
    ln.textContent = text;
    D.ticker.appendChild(ln);
    while (D.ticker.children.length > 40) D.ticker.removeChild(D.ticker.firstChild);
    D.ticker.scrollTop = D.ticker.scrollHeight;
    D.live.textContent = text;
  }

  let toastTimer = 0;
  function toast(msg) {
    if (!D.toast) return;
    D.toast.textContent = msg;
    D.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => D.toast.classList.remove('show'), 2100);
  }

  /* ---------------- HUD 助手 ---------------- */
  function hudEl(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined && txt !== null) e.textContent = txt;
    return e;
  }
  /* 造一个 HUD 按钮。注意：会**自动挂到 HUD 上**，调用方不要再 appendChild，
     否则会出现两个一模一样的按钮。 */
  function hudBtn(label, fn, cls) {
    const b = hudEl('button', 'btn sm ' + (cls || ''), label);
    b.type = 'button';
    b.addEventListener('click', ev => { ev.preventDefault(); SFX.play('blip'); fn(b); });
    if (D.hud) D.hud.appendChild(b);
    return b;
  }

  function makeApi(def) {
    return {
      get w() { return RT.w; }, get h() { return RT.h; }, get s() { return RT.s; },
      get t() { return RT.elapsed; }, get frame() { return RT.frames; },
      get dpr() { return RT.dpr; },
      hud: D.hud,
      el: hudEl, button: hudBtn,
      complete: msg => completeChapter(msg),
      say, toast, sfx: (n, o) => SFX.play(n, o),
      save: Save,
      input,
      get touch() { return Touch.on; },
    };
  }

  /* ---------------- 章节切换 ---------------- */
  function sceneById(id) { return WB.scenes.findIndex(s => s.id === id); }

  /* 「操作」卡片。触屏设备上换成触控说明 —— 把键盘提示「W / ↑ 前进」摆给手机
     用户看没有意义，他没有那个键。两种设备模式切换时都要重画，所以抽成函数。 */
  function renderKeys(def) {
    if (!D.chKeys) return;
    D.chKeys.innerHTML = '';
    const tRows = Touch.on ? Touch.keyRows(def) : null;
    const rows = tRows || (def.keys || []).map(([k, v]) => [k, v, 'key']);
    rows.forEach(([k, v, kind]) => {
      const row = hudEl('div', 'row' + (kind && kind !== 'key' ? ' ' + kind : ''));
      if (k !== null && k !== undefined) {
        if (kind === 'act') row.appendChild(hudEl('span', 'chip', k));
        else String(k).split(' / ').forEach(part => row.appendChild(hudEl('kbd', null, part)));
      }
      row.appendChild(hudEl('span', null, v));
      D.chKeys.appendChild(row);
    });
  }

  function enter(idx, opts) {
    if (idx < 0 || idx >= WB.scenes.length) return;
    if (RT.scene && RT.scene.destroy) { try { RT.scene.destroy(); } catch (e) {} }
    RT.idx = idx; RT.def = WB.scenes[idx];
    RT.elapsed = 0; RT.frames = 0; RT.done = false;
    input.keys.clear(); input.clear();
    Touch.clear();
    D.hud.innerHTML = ''; D.ticker.innerHTML = '';
    D.ticker.appendChild(hudEl('div', 'empty', '……'));
    const def = RT.def;

    D.chNum.textContent = def.num || '';
    D.chTitle.textContent = def.title || '';
    D.chSrc.textContent = def.source || '';
    D.chEpi.textContent = def.epigraph || '';
    D.chBrief.innerHTML = '';
    (def.brief || []).forEach(p => { const e = document.createElement('p'); e.textContent = p; D.chBrief.appendChild(e); });
    D.chGoal.querySelector('span:last-child').textContent = def.goal || '';
    renderKeys(def);

    RT.api = makeApi(def);
    try {
      RT.scene = def.create(RT.api) || {};
    } catch (e) {
      RT.scene = {};
      console.error('[scene create]', def.id, e);
      say('本章初始化出错：' + e.message, 'hi');
    }
    RT.running = true;
    updateDots();
    Touch.build(def);
    if (opts && opts.skipIntro !== true) SFX.play('page');
    Save.patch(d => { d.seen = Math.max(d.seen, idx); });
    resize();
  }

  function updateDots() {
    if (!D.dots) return;
    D.dots.innerHTML = '';
    WB.scenes.forEach((s, i) => {
      const i2 = document.createElement('i');
      const unlocked = i <= Save.data.seen || Save.data.done[s.id];
      i2.className = (Save.data.done[s.id] ? 'done ' : '') + (i === RT.idx ? 'cur ' : '') + (unlocked ? '' : 'lock');
      i2.title = unlocked ? (s.num + ' ' + s.title) : '未解锁';
      if (unlocked) i2.addEventListener('click', () => { hideVeil(); enter(i); });
      D.dots.appendChild(i2);
    });
  }

  /* ---------------- 完成浮层 ---------------- */
  function completeChapter(msg) {
    if (RT.done) return;
    RT.done = true;
    const def = RT.def;
    let stats = [];
    try { stats = (def.stats && def.stats(RT.scene)) || []; } catch (e) { stats = []; }
    Save.patch(d => {
      d.done[def.id] = true;
      d.seen = Math.max(d.seen, RT.idx + 1);
      d.stats[def.id] = stats;
    });
    SFX.play('win');
    if (def.report) { try { def.report(RT.scene, Save.data); } catch (e) {} }
    const last = RT.idx >= WB.scenes.length - 1;
    const note = def.note || {};
    const card = D.veilCard;
    card.innerHTML = '';

    const kick = hudEl('div', 'kicker', note.kicker || '原著对照');
    const h2 = hudEl('h2', null, note.title || (def.title + ' · 完成'));
    const lead = hudEl('p', 'lead', msg || note.lead || '');
    card.appendChild(kick); card.appendChild(h2); card.appendChild(lead);

    if (stats.length) {
      const box = hudEl('div', 'stats');
      stats.forEach(s => {
        const d = hudEl('div', 'stat');
        d.appendChild(hudEl('i', null, s.label));
        d.appendChild(hudEl('b', null, String(s.value)));
        box.appendChild(d);
      });
      card.appendChild(box);
    }
    if (note.body && note.body.length) {
      const src = hudEl('div', 'src');
      src.appendChild(hudEl('h4', null, note.head || '原著出处'));
      note.body.forEach(p => {
        const e = document.createElement('p');
        e.innerHTML = p;
        src.appendChild(e);
      });
      card.appendChild(src);
    }
    const btns = hudEl('div', 'veilBtns');
    if (!last) {
      const nx = hudEl('button', 'btn primary', '继续 · ' + WB.scenes[RT.idx + 1].num + ' ' + WB.scenes[RT.idx + 1].title);
      nx.type = 'button';
      nx.addEventListener('click', () => { hideVeil(); enter(RT.idx + 1); });
      btns.appendChild(nx);
    } else {
      const nx = hudEl('button', 'btn primary', '回到封面');
      nx.type = 'button';
      nx.addEventListener('click', () => { hideVeil(); showCover(); });
      btns.appendChild(nx);
    }
    btns.appendChild(hudEl('div', 'grow'));
    const again = hudEl('button', 'btn', '重玩本章');
    again.type = 'button';
    again.addEventListener('click', () => { hideVeil(); enter(RT.idx); });
    btns.appendChild(again);
    const menu = hudEl('button', 'btn ghost', '章节选择');
    menu.type = 'button';
    menu.addEventListener('click', () => { hideVeil(); showCover(); });
    btns.appendChild(menu);
    card.appendChild(btns);

    D.veil.hidden = false;
    D.live.textContent = '本章完成：' + (note.title || def.title);
  }
  function hideVeil() { D.veil.hidden = true; }
  WB.hideVeil = hideVeil;

  /* ---------------- 封面 ---------------- */
  function showCover() {
    RT.running = false;
    D.cover.hidden = false;
    D.shell.hidden = true;
    const anyDone = Object.keys(Save.data.done).length > 0;
    D.btnContinue.hidden = !anyDone;
    if (anyDone) {
      const nxt = WB.scenes.findIndex(s => !Save.data.done[s.id]);
      const i = nxt < 0 ? WB.scenes.length - 1 : nxt;
      D.btnContinue.textContent = '继续 · ' + WB.scenes[i].num + ' ' + WB.scenes[i].title;
      D.btnContinue.dataset.idx = String(i);
    }
    buildPick();
  }
  function buildPick() {
    D.pickGrid.innerHTML = '';
    WB.scenes.forEach((s, i) => {
      const unlocked = i <= Save.data.seen || Save.data.done[s.id];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pickItem';
      b.disabled = !unlocked;
      b.innerHTML = '';
      b.appendChild(hudEl('em', null, s.num || ''));
      b.appendChild(hudEl('b', null, s.title || ''));
      b.appendChild(hudEl('span', null, unlocked ? (Save.data.done[s.id] ? '已通读 ✓' : (s.short || '未读')) : '未解锁'));
      if (unlocked) b.addEventListener('click', () => startGame(i));
      D.pickGrid.appendChild(b);
    });
  }
  function startGame(i) {
    SFX.wake(); SFX.play('page');
    D.cover.hidden = true;
    D.shell.hidden = false;
    hideVeil();
    requestAnimationFrame(() => { resize(); enter(i); });
  }

  /* ---------------- 主循环 ---------------- */
  function frame(now) {
    requestAnimationFrame(frame);
    const t = now / 1000;
    let dt = RT.last ? t - RT.last : 0;
    RT.last = t;
    if (!RT.running || !RT.scene) { input.clear(); return; }
    if (dt > 0.05) dt = 0.05;          // 切标签页回来不要一次跳一大步
    if (dt < 0) dt = 0;
    if (document.hidden) { input.clear(); return; }
    RT.elapsed += dt; RT.frames++;
    const ctx = D.cv.getContext('2d');
    try {
      if (RT.scene.update) RT.scene.update(dt, RT.elapsed);
      ctx.save();
      ctx.clearRect(0, 0, RT.w, RT.h);
      if (RT.scene.draw) RT.scene.draw(ctx, RT.w, RT.h);
      ctx.restore();
    } catch (e) {
      RT.running = false;
      console.error('[scene frame]', RT.def && RT.def.id, e);
      say('运行出错：' + e.message, 'hi');
    }
    input.clear();
  }

  /* ---------------- 事件绑定 ---------------- */
  const BLOCK = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
  function bindInput() {
    window.addEventListener('keydown', e => {
      if (!RT.running) return;
      if (BLOCK.indexOf(e.code) >= 0) e.preventDefault();
      if (!input.keys.has(e.code)) input.pressed.add(e.code);
      input.keys.add(e.code);
      if (RT.scene && RT.scene.key) { try { RT.scene.key(e.code, true, e.repeat, e); } catch (err) {} }
    });
    window.addEventListener('keyup', e => {
      input.keys.delete(e.code);
      if (RT.scene && RT.scene.key) { try { RT.scene.key(e.code, false, false, e); } catch (err) {} }
    });
    window.addEventListener('blur', () => { input.keys.clear(); });

    /* 切到后台时把按住的键全放开。手机在切应用时手指抬起，pointerup 很可能
       根本送不到 —— 事件丢了，回来就会一直往前走，而且松手也没用。
       主循环里 `document.hidden` 只清了 pressed，keys 是常驻的，必须在这里清。 */
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { input.keys.clear(); Touch.clear(); }
    });

    const cv = D.cv;
    const pts = new Map();               // pointerId -> {x,y}，只记按下的手指
    let pinchDist = 0, pinchAcc = 0, gestureLocked = false;

    function pos(e) {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function fire(type, e) {
      if (!RT.running || !RT.scene || !RT.scene.pointer) return;
      const p = pos(e);
      try { RT.scene.pointer({ type, x: p.x, y: p.y, id: e.pointerId, raw: e }); } catch (err) {}
    }
    /* 双指捏合 → scene.wheel()。手机上滚轮不存在，第六章的「远近」只能这样给。
       要点：一旦出现第二根手指，本次手势就锁定为缩放，不再往场景送 move ——
       否则捏合的同时画面还会跟着转（场景自己的 drag 会吃掉那些 move）。 */
    function pinch() {
      const a = [...pts.values()];
      if (a.length < 2) return;
      const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
      if (!pinchDist) { pinchDist = d; return; }
      pinchAcc += d - pinchDist;
      pinchDist = d;
      if (Math.abs(pinchAcc) < 12) return;
      /* 张开（距离变大）＝ 拉近。ch06 的 wheel 只认符号不认大小，给 ±1 就够。 */
      const step = pinchAcc > 0 ? -1 : 1;
      pinchAcc = 0;
      const mid = { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 };
      if (RT.scene && RT.scene.wheel) { try { RT.scene.wheel(step, mid.x, mid.y); } catch (err) {} }
    }
    cv.addEventListener('pointerdown', e => {
      e.preventDefault(); SFX.wake();
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
      const r = cv.getBoundingClientRect();
      pts.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
      if (pts.size === 1) { gestureLocked = false; fire('down', e); return; }
      /* 第二根手指落下：先让场景「抬起」，把它的拖动状态清干净 */
      gestureLocked = true;
      fire('up', e);
      pinchDist = 0; pinchAcc = 0;
    });
    cv.addEventListener('pointermove', e => {
      if (pts.has(e.pointerId)) {
        const r = cv.getBoundingClientRect();
        pts.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
      }
      if (gestureLocked || pts.size >= 2) { pinch(); return; }
      fire('move', e);
    });
    function lift(e) {
      pts.delete(e.pointerId);
      if (pts.size >= 2) return;             // 还有两根手指，手势没结束
      if (gestureLocked) {
        /* 从两指回到一指：不恢复拖动 —— 那会用上一根手指留下的拖动原点，
           画面会跳一下。等所有手指都离开再解锁。 */
        if (pts.size === 0) { gestureLocked = false; pinchDist = 0; pinchAcc = 0; }
        return;
      }
      fire('up', e);
    }
    cv.addEventListener('pointerup', lift);
    cv.addEventListener('pointercancel', lift);
    cv.addEventListener('wheel', e => {
      if (!RT.running || !RT.scene || !RT.scene.wheel) return;
      e.preventDefault();
      const p = pos(e);
      try { RT.scene.wheel(e.deltaY, p.x, p.y); } catch (err) {}
    }, { passive: false });
  }

  /* ---------------- 调试出口（供自动化验收） ---------------- */
  function bindDiag() {
    window.__diag = {
      get scene() { return RT.def ? RT.def.id : null; },
      get index() { return RT.idx; },
      get elapsed() { return RT.elapsed; },
      get running() { return RT.running; },
      get done() { return Object.keys(Save.data.done); },
      get seen() { return Save.data.seen; },
      get veil() { return D.veil && !D.veil.hidden; },
      get w() { return RT.w; }, get h() { return RT.h; }, get s() { return RT.s; },
      get state() { try { return RT.scene && RT.scene.state ? RT.scene.state() : null; } catch (e) { return { error: String(e) }; } },
      get stats() { try { return RT.def && RT.def.stats ? RT.def.stats(RT.scene) : null; } catch (e) { return null; } },
      goto(id) {
        const i = typeof id === 'number' ? id : sceneById(id);
        if (i < 0) return false;
        D.cover.hidden = true; D.shell.hidden = false; hideVeil();
        resize(); enter(i);
        return true;
      },
      key(code, down) {
        if (down) { if (!input.keys.has(code)) input.pressed.add(code); input.keys.add(code); }
        else input.keys.delete(code);
        if (RT.scene && RT.scene.key) RT.scene.key(code, !!down, false, null);
      },
      pointer(type, x, y) {
        if (RT.scene && RT.scene.pointer) RT.scene.pointer({ type, x, y, id: 1, raw: null });
      },
      complete() { completeChapter(); },
      /* 给自动化验收用的通用逃生口：调用当前场景实例上的任意方法 */
      call(name) {
        try {
          if (!RT.scene || typeof RT.scene[name] !== 'function') return null;
          return RT.scene[name].apply(RT.scene, Array.prototype.slice.call(arguments, 1));
        } catch (e) { return { error: String(e) }; }
      },
      hud: () => [...D.hud.querySelectorAll('button')].map(b => b.textContent.trim()),
      clickHud(label) {
        const b = [...D.hud.querySelectorAll('button')].find(x => x.textContent.trim().indexOf(label) >= 0);
        if (!b) return false; b.click(); return true;
      },
      resetSave() { Save.clear(); },
      scenes: () => WB.scenes.map(s => s.id),
      /* —— 触控层（供移动端验收） —— */
      get touchOn() { return Touch.on; },
      touch(code, down, repeat) {
        if (down) Touch.press(code, !!repeat); else Touch.release(code);
        return true;
      },
      touchLayout: () => Touch.layout(),
      forceTouch(v) {
        Touch.force(v);
        if (RT.def) { Touch.build(RT.def); renderKeys(RT.def); }
        return Touch.on;
      },
      touchKeys: () => (RT.def ? Touch.keyRows(RT.def) : null),
    };
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    grab();
    Save.load();
    SFX.setEnabled(Save.data.sound !== false);
    bindInput();
    bindDiag();

    D.btnStart.addEventListener('click', () => startGame(0));
    D.btnContinue.addEventListener('click', () => startGame(Number(D.btnContinue.dataset.idx) || 0));
    D.btnReset.addEventListener('click', () => {
      Save.clear(); updateDots(); buildPick();
      D.btnContinue.hidden = true;
      toast('进度已清空');
    });
    D.btnSound.addEventListener('click', () => {
      const on = !SFX.enabled;
      SFX.setEnabled(on);
      Save.patch(d => { d.sound = on; });
      D.btnSound.textContent = on ? '♪ 音效' : '♪ 静音';
      D.btnSound.classList.toggle('on', on);
      if (on) SFX.play('blip');
    });
    D.btnSound.textContent = SFX.enabled ? '♪ 音效' : '♪ 静音';
    D.btnSound.classList.toggle('on', SFX.enabled);
    D.btnMenu.addEventListener('click', showCover);
    D.veil.addEventListener('click', e => { if (e.target === D.veil) hideVeil(); });
    window.addEventListener('keydown', e => {
      if (e.code === 'Escape' && !D.veil.hidden) hideVeil();
    });

    showCover();
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
