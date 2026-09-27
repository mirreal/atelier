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
    };
  }

  /* ---------------- 章节切换 ---------------- */
  function sceneById(id) { return WB.scenes.findIndex(s => s.id === id); }

  function enter(idx, opts) {
    if (idx < 0 || idx >= WB.scenes.length) return;
    if (RT.scene && RT.scene.destroy) { try { RT.scene.destroy(); } catch (e) {} }
    RT.idx = idx; RT.def = WB.scenes[idx];
    RT.elapsed = 0; RT.frames = 0; RT.done = false;
    input.keys.clear(); input.clear();
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
    D.chKeys.innerHTML = '';
    (def.keys || []).forEach(([k, v]) => {
      const row = hudEl('div', 'row');
      String(k).split(' / ').forEach(part => row.appendChild(hudEl('kbd', null, part)));
      row.appendChild(hudEl('span', null, v));
      D.chKeys.appendChild(row);
    });

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

    const cv = D.cv;
    function pos(e) {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function fire(type, e) {
      if (!RT.running || !RT.scene || !RT.scene.pointer) return;
      const p = pos(e);
      try { RT.scene.pointer({ type, x: p.x, y: p.y, id: e.pointerId, raw: e }); } catch (err) {}
    }
    cv.addEventListener('pointerdown', e => { e.preventDefault(); SFX.wake(); try { cv.setPointerCapture(e.pointerId); } catch (err) {} fire('down', e); });
    cv.addEventListener('pointermove', e => { fire('move', e); });
    cv.addEventListener('pointerup', e => { fire('up', e); });
    cv.addEventListener('pointercancel', e => { fire('up', e); });
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
