/* ==========================================================
   AETHER — cinematic intro
   Six chapters, choreographed with the Web Animations API,
   a canvas starfield, a live Web Audio score, and imagery
   loaded from Pixabay's CDN.
   ========================================================== */

/* ---------- Assets (Pixabay CDN) ---------- */
const px = path => `https://cdn.pixabay.com/photo/${path}_1280.jpg`;
const ASSETS = {
  wormhole:  px('2020/06/19/22/33/wormhole-5319067'),
  eclipse:   px('2016/07/02/12/21/eclipse-1492818'),
  earth:     px('2016/10/20/18/35/earth-1756274'),
  sun:       px('2012/01/09/09/10/sun-11582'),
  moonDisc:  px('2011/12/13/14/29/moon-11010'),
  marsDisc:  px('2011/12/13/14/30/mars-11013'),
  saturn:    px('2011/12/13/14/27/saturn-11006'),
  earthrise: px('2011/12/13/14/30/earth-11014'),
};
// natural sizes, filled by the preloader (used to locate the sun in the earth shot)
const SIZES = {};

/* ---------- Helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const EASE = {
  expoOut:   'cubic-bezier(0.16, 1, 0.3, 1)',
  expoIn:    'cubic-bezier(0.7, 0, 0.84, 0)',
  expoInOut: 'cubic-bezier(0.87, 0, 0.13, 1)',
  quartOut:  'cubic-bezier(0.25, 1, 0.5, 1)',
  glide:     'cubic-bezier(0.35, 0, 0.65, 1)',
};
const ease = {
  inCubic:    t => t * t * t,
  outCubic:   t => 1 - (1 - t) ** 3,
  inOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
};

// Once the intro is skipped, every pending step resolves to a promise that
// never settles, so the sequence simply stops wherever it was.
let skipped = false;
let finished = false;
let finishedAt = 0;
const HALT = new Promise(() => {});
const guard = p => p.then(v => (skipped ? HALT : v));
const wait = ms => guard(new Promise(r => setTimeout(r, ms)));
const later = (ms, fn) => setTimeout(() => { if (!skipped) fn(); }, ms);
const play = (el, keyframes, opts = {}) =>
  el.animate(keyframes, { duration: 1000, easing: EASE.expoOut, fill: 'both', ...opts });
const done = anims => guard(Promise.all([].concat(anims).map(a => a.finished)));

function tween(duration, onUpdate, fn = ease.inOutCubic) {
  return guard(new Promise(resolve => {
    const t0 = performance.now();
    const step = now => {
      const p = Math.min(1, (now - t0) / duration);
      onUpdate(fn(p));
      p < 1 ? requestAnimationFrame(step) : resolve();
    };
    requestAnimationFrame(step);
  }));
}

function splitWords(el) {
  const html = el.innerHTML.split(/<br\s*\/?>/i);
  el.innerHTML = html
    .map(line => line.trim().split(/\s+/).map(w => `<span class="w">${w} </span>`).join(''))
    .join('<br>');
  return $$('.w', el);
}

const GLYPHS = '#%&*+=?@$<>/\\[]{}ΔΣΩ◊※01';
function scramble(el, text, { settle = 700, stagger = 60, onSettle } = {}) {
  el.textContent = '';
  const spans = [...text].map(() => {
    const s = document.createElement('span');
    s.className = 'ch';
    s.style.opacity = 0;
    el.appendChild(s);
    return s;
  });
  return new Promise(resolve => {
    const t0 = performance.now();
    const tick = now => {
      let settled = 0;
      spans.forEach((s, i) => {
        const t = now - t0 - i * stagger;
        if (t < 0) return;
        s.style.opacity = 1;
        if (t >= settle || text[i] === ' ') {
          if (!s.classList.contains('set')) {
            s.textContent = text[i];
            s.classList.add('set');
            if (onSettle && text[i] !== ' ') onSettle(i);
          }
          settled++;
        } else if (Math.random() < 0.45) {
          s.textContent = GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
      });
      settled === spans.length ? resolve() : requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/* ==========================================================
   SOUND — a small synthesized score (Web Audio, no files)
   Every instrument is a no-op until the viewer opts in, so the
   choreography can call them unconditionally.
   ========================================================== */
const NOTE = {
  D2: 73.42, G2: 98, A2: 110, D3: 146.83, Fs3: 185, A3: 220, B3: 246.94,
  Cs4: 277.18, D4: 293.66, E4: 329.63, Fs4: 369.99, A4: 440, B4: 493.88,
  D5: 587.33, E5: 659.26, Fs5: 739.99, A5: 880, B5: 987.77, D6: 1174.66, E6: 1318.51,
};

const Sound = {
  ctx: null,
  on: false,
  droneWanted: false,
  droneNodes: null,

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.005;
    comp.release.value = 0.25;
    comp.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(comp);

    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(4.5, 2.6);
    this.verb.connect(this.master);

    const len = ctx.sampleRate * 3;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  },

  impulse(seconds, decay) {
    const { ctx } = this;
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
    }
    return buf;
  },

  enable(on) {
    if (on) this.init();
    if (!this.ctx) return;
    this.on = on;
    if (on) this.ctx.resume();
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(on ? 0.9 : 0, t, 0.12);
    if (on && this.droneWanted && !this.droneNodes) this.startDrone();
    $('.sound-toggle').setAttribute('aria-pressed', on);
    $('.sound-toggle .sound-label').textContent = on ? 'Sound on' : 'Sound off';
    $('.sound-toggle .eq').classList.toggle('live', on);
  },

  /* ---- plumbing ---- */
  get t() { return this.ctx.currentTime; },
  out(node, { wet = 0.25, pan = 0 } = {}) {
    const { ctx } = this;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    node.connect(p);
    p.connect(this.master);
    if (wet) {
      const send = ctx.createGain();
      send.gain.value = wet;
      p.connect(send);
      send.connect(this.verb);
    }
    return p;
  },
  // every param is anchored at "now" so later ramps start from the right moment
  gain(v = 0.0001) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(v, this.t);
    return g;
  },
  osc(type, freq, t, end) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.start(t);
    o.stop(end + 0.05);
    return o;
  },
  noiseSrc(t, end) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.start(t, Math.random() * 2);
    s.stop(end + 0.05);
    return s;
  },
  filter(type, freq, Q = 0.7) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, this.t);
    f.Q.value = Q;
    return f;
  },
  env(param, t, a, peak, r, hold = 0) {
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(peak, t + a);
    param.setValueAtTime(peak, t + a + hold);
    param.exponentialRampToValueAtTime(0.0001, t + a + hold + r);
    return t + a + hold + r;
  },

  /* ---- instruments ---- */
  blip(freq = 1320, vol = 0.09, delay = 0, pan = 0) {
    if (!this.on) return;
    const t = this.t + delay, g = this.gain();
    this.osc('sine', freq, t, this.env(g.gain, t, 0.003, vol, 0.14)).connect(g);
    this.out(g, { wet: 0.25, pan });
  },
  tick(vol = 0.05, pan = 0) {
    if (!this.on) return;
    const t = this.t, g = this.gain(), hp = this.filter('highpass', 3800);
    this.noiseSrc(t, this.env(g.gain, t, 0.001, vol, 0.035)).connect(hp).connect(g);
    this.out(g, { wet: 0.12, pan });
  },
  ping(freq = NOTE.A5, vol = 0.09) {
    if (!this.on) return;
    const t = this.t, g = this.gain(), end = this.env(g.gain, t, 0.004, vol, 3.2);
    this.osc('sine', freq, t, end).connect(g);
    const g2 = this.gain(0.3);
    this.osc('sine', freq * 2.756, t, end).connect(g2).connect(g);
    this.out(g, { wet: 0.85 });
  },
  breath(dur = 3, vol = 0.05) {
    if (!this.on) return;
    const t = this.t, g = this.gain(), bp = this.filter('bandpass', 500, 0.8);
    bp.frequency.exponentialRampToValueAtTime(1600, t + dur);
    this.noiseSrc(t, this.env(g.gain, t, dur * 0.5, vol, dur * 0.5)).connect(bp).connect(g);
    this.out(g, { wet: 0.7 });
  },
  // A slow, deep build: sub swell + a low engine chord that climbs only a fifth,
  // pulsing faster as it goes. Everything stays under ~2 kHz, and it drops out
  // `gap` seconds early so the hit lands in a breath of silence rather than a
  // high-pitched clash.
  riser(dur, { gap = 0.16, vol = 1 } = {}) {
    if (!this.on) return;
    const t = this.t, peak = t + dur - gap;
    const bus = this.gain(1);
    bus.gain.setValueAtTime(1, peak - 0.03);
    bus.gain.linearRampToValueAtTime(0.0001, peak + 0.03);
    this.out(bus, { wet: 0.3 });

    const sub = this.osc('sine', NOTE.D2 / 2, t, peak);
    sub.frequency.exponentialRampToValueAtTime(NOTE.A2 / 2, peak);
    const gs = this.gain();
    gs.gain.exponentialRampToValueAtTime(0.55 * vol, peak);
    sub.connect(gs).connect(bus);

    const lp = this.filter('lowpass', 90, 6);
    lp.frequency.exponentialRampToValueAtTime(1100, peak);
    const pulse = this.gain(0.6);
    const lfo = this.osc('sine', 2.5, t, peak), depth = this.gain(0.4);
    lfo.frequency.exponentialRampToValueAtTime(15, peak);
    lfo.connect(depth).connect(pulse.gain);
    const ge = this.gain();
    ge.gain.exponentialRampToValueAtTime(0.17 * vol, peak);
    [NOTE.D2 / 2, NOTE.A2 / 2, NOTE.D2].forEach((f, i) => {
      const o = this.osc('sawtooth', f, t, peak);
      o.detune.value = (i - 1) * 6;
      o.frequency.exponentialRampToValueAtTime(f * 1.5, peak);
      o.connect(lp);
    });
    lp.connect(pulse).connect(ge).connect(bus);

    const air = this.filter('lowpass', 150, 0.7);
    air.frequency.exponentialRampToValueAtTime(2000, peak);
    const ga = this.gain();
    ga.gain.exponentialRampToValueAtTime(0.13 * vol, peak);
    this.noiseSrc(t, peak).connect(air).connect(ga).connect(bus);
  },
  shaper(amount = 3) {
    const ws = this.ctx.createWaveShaper(), n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) curve[i] = Math.tanh(amount * (i / (n - 1) * 2 - 1));
    ws.curve = curve;
    return ws;
  },
  // The hit is all low end — no noise burst. A long sub drop, a second sub an
  // octave beneath it, a saturated boom so it still reads on laptop speakers,
  // and a low chord whose filter closes slowly as the hall rings out.
  impact(vol = 1) {
    if (!this.on) return;
    const t = this.t;

    const gs = this.gain();
    const sub = this.osc('sine', 90, t, this.env(gs.gain, t, 0.004, 1 * vol, 4.5));
    sub.frequency.exponentialRampToValueAtTime(30, t + 1.4);
    sub.connect(gs);
    this.out(gs, { wet: 0.2 });

    const gd = this.gain();
    const deep = this.osc('sine', 46, t, this.env(gd.gain, t, 0.01, 0.75 * vol, 5.5));
    deep.frequency.exponentialRampToValueAtTime(24, t + 2.2);
    deep.connect(gd);
    this.out(gd, { wet: 0.1 });

    const gb = this.gain(), lpb = this.filter('lowpass', 600);
    const boom = this.osc('triangle', 58, t, this.env(gb.gain, t, 0.004, 0.45 * vol, 3));
    boom.frequency.exponentialRampToValueAtTime(28, t + 1.2);
    boom.connect(this.shaper(4)).connect(lpb).connect(gb);
    this.out(gb, { wet: 0.35 });

    const gc = this.gain(), lpc = this.filter('lowpass', 700, 1.2);
    lpc.frequency.exponentialRampToValueAtTime(90, t + 3.5);
    const end = this.env(gc.gain, t, 0.01, 0.15 * vol, 4.5);
    [NOTE.D2 / 2, NOTE.A2 / 2, NOTE.D2].forEach((f, i) => {
      const o = this.osc('sawtooth', f, t, end);
      o.detune.value = (i - 1) * 8;
      o.connect(lpc);
    });
    lpc.connect(gc);
    this.out(gc, { wet: 0.55 });
  },
  sweepDown(dur, vol = 0.24) {
    if (!this.on) return;
    const t = this.t, end = t + dur;
    const g = this.gain(), bp = this.filter('bandpass', 2400, 1.2);
    bp.frequency.exponentialRampToValueAtTime(80, end);
    g.gain.linearRampToValueAtTime(vol * 0.8, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    this.noiseSrc(t, end).connect(bp).connect(g);
    this.out(g, { wet: 0.6 });

    const g2 = this.gain();
    const s = this.osc('sine', 260, t, end);
    s.frequency.exponentialRampToValueAtTime(28, end);
    g2.gain.linearRampToValueAtTime(vol * 1.1, t + dur * 0.75);
    g2.gain.exponentialRampToValueAtTime(0.0001, end);
    s.connect(g2);
    this.out(g2, { wet: 0.3 });
  },
  // doppler fly-by: filter peaks as the object passes, pan follows it
  whoosh(dur, panFrom = -1, panTo = 1, vol = 0.32) {
    if (!this.on) return;
    const t = this.t, end = t + dur, mid = t + dur * 0.55;
    const g = this.gain(), bp = this.filter('bandpass', 180, 1.4);
    bp.frequency.exponentialRampToValueAtTime(1500, mid);
    bp.frequency.exponentialRampToValueAtTime(220, end);
    g.gain.exponentialRampToValueAtTime(vol, mid);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    this.noiseSrc(t, end).connect(bp).connect(g);
    const p = this.out(g, { wet: 0.35, pan: panFrom });
    p.pan.setValueAtTime(panFrom, t);
    p.pan.linearRampToValueAtTime(panTo, end);

    // low rumble underneath
    const g2 = this.gain(), lp = this.filter('lowpass', 120);
    const o = this.osc('sawtooth', 41, t, end);
    o.frequency.exponentialRampToValueAtTime(55, mid);
    o.frequency.exponentialRampToValueAtTime(36, end);
    g2.gain.exponentialRampToValueAtTime(vol * 0.75, mid);
    g2.gain.exponentialRampToValueAtTime(0.0001, end);
    o.connect(lp).connect(g2);
    this.out(g2, { wet: 0.1, pan: (panFrom + panTo) / 2 });
  },
  pluck(freq, vol = 0.12, pan = 0, delay = 0) {
    if (!this.on) return;
    const t = this.t + delay, g = this.gain(), lp = this.filter('lowpass', 2800);
    const end = this.env(g.gain, t, 0.004, vol, 1.8);
    this.osc('triangle', freq, t, end).connect(lp);
    const g2 = this.gain(0.25);
    this.osc('sine', freq * 2, t, end).connect(g2).connect(lp);
    lp.connect(g);
    this.out(g, { wet: 0.55, pan });
  },
  thud(freq = 70, vol = 0.4, pan = 0) {
    if (!this.on) return;
    const t = this.t, g = this.gain();
    const o = this.osc('sine', freq * 2.5, t, this.env(g.gain, t, 0.002, vol, 0.5));
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.08);
    o.connect(g);
    this.out(g, { wet: 0.3, pan });
  },
  pad(freqs, { dur = 5, attack = 1.6, vol = 0.05, type = 'sawtooth', cutoff = [300, 2200], wet = 0.6 } = {}) {
    if (!this.on) return;
    const t = this.t, end = t + dur;
    const g = this.gain(), lp = this.filter('lowpass', cutoff[0], 0.8);
    lp.frequency.exponentialRampToValueAtTime(cutoff[1], t + attack);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, end - dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    freqs.forEach(f => [-7, 7].forEach(cents => {
      const o = this.osc(type, f, t, end);
      o.detune.value = cents;
      o.connect(lp);
    }));
    lp.connect(g);
    this.out(g, { wet });
  },
  shimmer(dur = 5, vol = 0.022) {
    if (!this.on) return;
    [NOTE.E5, NOTE.A5, NOTE.Fs5, NOTE.D6, NOTE.B5].forEach((f, i) => {
      const t = this.t + i * 0.18, g = this.gain();
      this.osc('sine', f, t, this.env(g.gain, t, 1.2, vol, dur)).connect(g);
      this.out(g, { wet: 0.95, pan: (i % 2 ? 1 : -1) * 0.5 });
    });
  },

  /* ---- the bed underneath everything ---- */
  drone() {
    this.droneWanted = true;
    if (this.on && !this.droneNodes) this.startDrone();
  },
  startDrone() {
    const t = this.t;
    const g = this.gain(), lp = this.filter('lowpass', 140, 3);
    const oscs = [
      this.osc('sawtooth', NOTE.D2 / 2, t, t + 3600),
      this.osc('sawtooth', NOTE.D2 / 2, t, t + 3600),
      this.osc('triangle', NOTE.A2 / 2, t, t + 3600),
      this.osc('sine', NOTE.D2 / 4, t, t + 3600),
    ];
    oscs[1].detune.value = 11;
    oscs.forEach(o => o.connect(lp));
    const lfo = this.osc('sine', 0.07, t, t + 3600), depth = this.gain(80);
    lfo.connect(depth).connect(lp.frequency);
    oscs.push(lfo);
    lp.connect(g);
    g.gain.linearRampToValueAtTime(0.2, t + 4);
    this.out(g, { wet: 0.35 });
    this.droneNodes = { g, lp, oscs };
  },
  droneTo(cutoff, vol, time = 2) {
    const n = this.droneNodes;
    if (!n) return;
    const t = this.t;
    [[n.lp.frequency, cutoff], [n.g.gain, vol]].forEach(([param, v]) => {
      param.cancelScheduledValues(t);
      param.setValueAtTime(param.value, t);
      param.setTargetAtTime(v, t, time / 3);
    });
  },
  outro(time = 6) {
    this.droneWanted = false;
    const n = this.droneNodes;
    if (!n) return;
    this.droneNodes = null;
    const t = this.t;
    n.g.gain.cancelScheduledValues(t);
    n.g.gain.setValueAtTime(n.g.gain.value, t);
    n.g.gain.setTargetAtTime(0.0001, t, time / 4);
    n.oscs.forEach(o => o.stop(t + time + 1));
  },
};

/* ---------- Bind images ---------- */
$$('[data-img]').forEach(el => {
  const url = ASSETS[el.dataset.img];
  if (el.tagName === 'IMG') el.src = url;
  else el.style.backgroundImage = `url("${url}")`;
});

/* ---------- Pointer + custom cursor ---------- */
const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
const cursor = $('.cursor');
const cursorDot = $('.cursor-dot');
const cursorRing = $('.cursor-ring');

// cursor is positioned straight from the event — no easing, no frame of delay
addEventListener('pointermove', e => {
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = (e.clientY / innerHeight) * 2 - 1;
  const t = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
  cursorDot.style.transform = t;
  cursorRing.style.transform = t;
  cursor.classList.add('live');
});
document.addEventListener('pointerover', e => {
  cursor.classList.toggle('hover', !!e.target.closest('a, button, .chapter-card'));
});

/* ---------- Starfield ---------- */
const Stars = {
  canvas: $('#stars'),
  ctx: null,
  list: [],
  w: 0, h: 0,
  warp: 0,       // 0 = drift, 1 = hyperspace
  ox: 0, oy: 0,  // vanishing-point offset (parallax)

  init() {
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    this.list = Array.from({ length: 1000 }, () => this.spawn({}, false));
    addEventListener('resize', () => this.resize());
  },
  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = innerWidth;
    this.h = innerHeight;
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  },
  spawn(s, far) {
    s.x = (Math.random() * 2 - 1) * this.w;
    s.y = (Math.random() * 2 - 1) * this.h;
    s.z = far ? this.w : Math.random() * this.w + 1;
    s.pz = s.z;
    s.hue = 190 + Math.random() * 70;
    s.size = 0.4 + Math.random() * 1.1;
    return s;
  },
  render() {
    const { ctx, w, h, warp } = this;
    // translucent clear leaves motion trails that stretch as warp rises
    ctx.fillStyle = `rgba(5, 6, 10, ${1 - warp * 0.78})`;
    ctx.fillRect(0, 0, w, h);

    const speed = 0.6 + warp * 48;
    const cx = w / 2 + this.ox;
    const cy = h / 2 + this.oy;
    const f = w * 0.5;
    ctx.lineCap = 'round';

    for (const s of this.list) {
      s.pz = s.z;
      s.z -= speed;
      if (s.z < 1) { this.spawn(s, true); continue; }
      const x = (s.x / s.z) * f + cx;
      const y = (s.y / s.z) * f + cy;
      if (x < -60 || x > w + 60 || y < -60 || y > h + 60) { this.spawn(s, true); continue; }
      const px0 = (s.x / s.pz) * f + cx;
      const py0 = (s.y / s.pz) * f + cy;
      const depth = 1 - s.z / w;
      ctx.strokeStyle = `hsla(${s.hue | 0}, 90%, ${80 + warp * 15}%, ${Math.min(1, depth * 1.4)})`;
      ctx.lineWidth = s.size * (0.4 + depth * 2);
      ctx.beginPath();
      ctx.moveTo(px0, py0);
      ctx.lineTo(x + 0.01, y);
      ctx.stroke();
    }
  },
};

/* ---------- HUD ---------- */
const CHAPTERS = [
  ['00', 'Systems check', 'RA 00h 00m 00s   DEC +00° 00′ 00″'],
  ['01', 'Departure',     'RA 18h 36m 56s   DEC +38° 47′ 01″'],
  ['02', 'Eclipse',       'RA 06h 45m 08s   DEC −16° 42′ 58″'],
  ['03', 'Orbit',         'ALT 408 KM   INC 51.64°   LOW ORBIT'],
  ['04', 'The Route',     'LUNA → MARS → SATURN   ΔV 14.2 KM/S'],
];
let introStart = performance.now();

function setChapter(i) {
  const [num, name, coords] = CHAPTERS[i];
  const label = $('.hud-chapter');
  label.animate([{ opacity: 0.7 }, { opacity: 0, transform: 'translateY(-8px)' }], { duration: 220, easing: 'ease-in' })
    .finished.then(() => {
      $('.hud-num').textContent = num;
      $('.hud-name').textContent = name;
      label.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 0.7, transform: 'none' }], { duration: 600, easing: EASE.expoOut });
    });
  scramble($('.hud-bl'), coords, { settle: 450, stagger: 14 });
  $$('.hud-progress i').forEach((bar, k) => bar.classList.toggle('done', k < i));
  if (i > 0) Sound.blip(NOTE.A5, 0.04, 0, -0.6);
}

function updateClock(now) {
  const t = Math.max(0, now - introStart) / 1000;
  const mm = String(Math.floor(t / 60)).padStart(2, '0');
  const ss = String(Math.floor(t % 60)).padStart(2, '0');
  const ff = String(Math.floor((t % 1) * 24)).padStart(2, '0');
  $('.hud-time').textContent = `${mm}:${ss}:${ff}`;
}

/* ==========================================================
   CHAPTER 00 — Systems check (real preloader + sound gate)
   ========================================================== */
async function sceneLoader() {
  const scene = $('#loader');
  scene.classList.add('on');
  setChapter(0);

  const digits = $$('.digit span', scene);
  const bar = $('.loader-line .bar', scene);
  const label = $('.loader-label', scene);
  play(label, [{ opacity: 0, letterSpacing: '.5em' }, { opacity: 1, letterSpacing: '.18em' }], { duration: 1400 });

  const keys = Object.keys(ASSETS);
  let loaded = 0;
  keys.forEach(key => {
    const img = new Image();
    let counted = false;
    const count = () => { if (!counted) { counted = true; loaded++; } };
    img.onload = () => { SIZES[key] = { w: img.naturalWidth, h: img.naturalHeight }; count(); };
    img.onerror = count;
    setTimeout(count, 9000); // never let one slow asset hold the show hostage
    img.src = ASSETS[key];
  });

  const MIN = 2200;
  const t0 = performance.now();
  let shown = 0;
  await guard(new Promise(resolve => {
    const tick = now => {
      const target = Math.min(loaded / keys.length, (now - t0) / MIN);
      shown += (target - shown) * 0.09;
      if (target >= 1 && shown > 0.996) shown = 1;
      const v = String(Math.round(shown * 100)).padStart(3, '0');
      digits.forEach((d, i) => (d.textContent = v[i]));
      bar.style.transform = `scaleX(${shown})`;
      shown >= 1 ? resolve() : requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));

  // Browsers only allow audio after a gesture, so the show waits for one.
  const gate = $('.gate', scene);
  play(label, [{ opacity: 1 }, { opacity: 0, transform: 'translateY(-8px)' }], { duration: 400, easing: 'ease-in' });
  gate.classList.add('on');
  play(gate, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 1000, delay: 200 });
  $('.gate-btn.primary', scene).focus({ preventScroll: true });

  const withSound = await guard(new Promise(resolve => {
    $$('.gate-btn', scene).forEach(b => b.addEventListener('click', () => resolve(b.dataset.sound === 'on'), { once: true }));
  }));
  Sound.enable(withSound);
  introStart = performance.now();
  Sound.blip(NOTE.A5, 0.1);
  Sound.blip(NOTE.E6, 0.1, 0.09);

  play(gate, [{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(8px)' }], { duration: 500, easing: 'ease-in' });
  gate.querySelectorAll('button').forEach(b => (b.disabled = true));
  digits.forEach((d, i) => {
    play(d, [{ transform: 'translateY(0)' }, { transform: 'translateY(-110%)' }], { duration: 900, delay: 150 + i * 80, easing: EASE.expoIn });
    later(700 + i * 80, () => Sound.tick(0.05, (i - 1) * 0.5));
  });

  await wait(900);
  // the line collapses into a single point of light...
  bar.style.transformOrigin = 'center';
  [bar, $('.loader-line .track', scene)].forEach(el =>
    play(el, [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: 800, easing: EASE.expoInOut }));
  const dot = play($('.loader-dot', scene), [
    { opacity: 0, transform: 'scale(0)' },
    { opacity: 1, transform: 'scale(1.8)', offset: 0.3 },
    { opacity: 0, transform: 'scale(0)' },
  ], { duration: 1600, delay: 450, easing: EASE.quartOut });
  later(900, () => Sound.ping(NOTE.D6, 0.08));
  dot.finished.then(() => scene.classList.remove('on'));

  await wait(900);
}

/* ==========================================================
   CHAPTER 01 — Departure (starfield → hyperspace → wormhole)
   ========================================================== */
async function sceneWarp() {
  const scene = $('#warp');
  scene.classList.add('on');
  setChapter(1);
  Sound.drone();

  // ...and that point becomes a universe
  play($('#stars'), [{ opacity: 0 }, { opacity: 1 }], { duration: 2000, easing: 'ease-out' });
  tween(2000, v => (Stars.warp = v * 0.03), ease.outCubic);

  const words = $$('.whisper .w', scene);
  later(400, () => Sound.breath(3.4, 0.05));
  words.forEach((w, i) => play(w, [
    { opacity: 0, transform: 'translateY(16px)', filter: 'blur(10px)' },
    { opacity: 1, transform: 'none', filter: 'blur(0)' },
  ], { duration: 1400, delay: 500 + i * 120 }));

  await wait(2700);
  words.forEach((w, i) => play(w, [
    { opacity: 1, transform: 'none', filter: 'blur(0)' },
    { opacity: 0, transform: 'translateZ(0) scale(1.4)', filter: 'blur(14px)' },
  ], { duration: 700, delay: i * 35, easing: EASE.expoIn }));

  // engage
  const hole = $('.wormhole', scene);
  play(hole, [
    { opacity: 0, transform: 'scale(.04)' },
    { opacity: 1, transform: 'scale(.75)' },
  ], { duration: 3400, delay: 300, easing: EASE.quartOut });
  // 3400 acceleration + 300 delay + 420 flash = hit at 4.12s
  Sound.riser(4.12);
  Sound.droneTo(520, 0.24, 3.4);
  await tween(3400, v => (Stars.warp = 0.03 + v * 0.97), ease.inCubic);

  play(hole, [{ opacity: 1, transform: 'scale(.75)' }, { opacity: 1, transform: 'scale(6)' }], { duration: 700, easing: EASE.expoIn });
  await done(play($('.flash'), [{ opacity: 0 }, { opacity: 1 }], { duration: 420, delay: 300, easing: 'ease-in' }));
  Sound.impact(1);
  Sound.droneTo(160, 0.18, 1.5);

  scene.classList.remove('on');
  Stars.warp = 0.01;
}

/* ==========================================================
   CHAPTER 02 — Eclipse (iris reveal + decoding title)
   ========================================================== */
async function sceneEclipse() {
  const scene = $('#eclipse');
  scene.classList.add('on');
  setChapter(2);

  const media = $('.eclipse-media', scene);
  const img = $('img', media);
  const title = $('.title', scene);
  const subWords = $$('.subtitle .w', scene);

  play($('.flash'), [{ opacity: 1 }, { opacity: 0 }], { duration: 1600, easing: 'ease-out' });
  play(media, [{ clipPath: 'circle(0% at 50.5% 50%)' }, { clipPath: 'circle(80% at 50.5% 50%)' }], { duration: 2400, easing: EASE.expoOut });
  play(img, [{ transform: 'scale(1.7) rotate(-10deg)' }, { transform: 'scale(1.05) rotate(0deg)' }], { duration: 3600, easing: EASE.expoOut });

  await wait(500);
  Sound.pad([NOTE.D2, NOTE.A2, NOTE.D3, NOTE.A3, NOTE.E4], { dur: 5.5, attack: 2.2, vol: 0.045, cutoff: [200, 1800] });
  play(title, [{ letterSpacing: '1em', paddingLeft: '1em' }, { letterSpacing: '.32em', paddingLeft: '.32em' }], { duration: 2600 });
  scramble(title, 'AETHER', {
    settle: 950, stagger: 120,
    onSettle: i => Sound.pluck([NOTE.D4, NOTE.A4, NOTE.D5, NOTE.E5, NOTE.Fs5, NOTE.A5][i], 0.07, (i / 5 - 0.5) * 1.2),
  });
  subWords.forEach((w, i) => play(w, [
    { opacity: 0, transform: 'translateY(10px)' },
    { opacity: 1, transform: 'none' },
  ], { duration: 1200, delay: 1500 + i * 90 }));

  await wait(2900);

  // exit: letters dissolve upward, then we fall into the eclipse
  $$('.ch', title).forEach((c, i) => play(c, [
    { opacity: 1, transform: 'none', filter: 'blur(0)' },
    { opacity: 0, transform: 'translateY(-50px) scale(1.25)', filter: 'blur(16px)' },
  ], { duration: 900, delay: i * 55, easing: EASE.expoIn }));
  subWords.forEach((w, i) => play(w, [{ opacity: 1 }, { opacity: 0, filter: 'blur(8px)' }], { duration: 500, delay: i * 30, easing: 'ease-in' }));
  Sound.sweepDown(1.9);

  await done(play(img, [
    { transform: 'scale(1.05)', filter: 'brightness(1)' },
    { transform: 'scale(7)', filter: 'brightness(0)' },
  ], { duration: 1600, delay: 250, easing: EASE.expoIn }));
  scene.classList.remove('on');
}

/* ==========================================================
   CHAPTER 03 — Orbit (sliced sunrise over Earth)
   ========================================================== */
const SLICES = 9;
let earthSlices = [];

function buildSlices() {
  const host = $('#earth .slices');
  for (let i = 0; i < SLICES; i++) {
    const s = document.createElement('div');
    s.className = 'slice';
    s.style.left = `${(i * 100) / SLICES}%`;
    s.style.width = `${100 / SLICES + 0.1}%`;
    const inner = document.createElement('i');
    inner.style.left = `-${(i * 100) / SLICES}vw`;
    inner.style.backgroundImage = `url("${ASSETS.earth}")`;
    s.appendChild(inner);
    host.appendChild(s);
  }
  earthSlices = $$('.slice', host);
}

// Where the sun sits in the cover-fitted earth photo, in viewport px
function sunPosition() {
  const { w, h } = SIZES.earth || { w: 1280, h: 640 };
  const vw = innerWidth, vh = innerHeight;
  const s = Math.max(vw / w, vh / h);
  return {
    x: (vw - w * s) / 2 + 0.376 * w * s,
    y: (vh - h * s) / 2 + 0.456 * h * s,
  };
}

async function sceneEarth() {
  const scene = $('#earth');
  scene.classList.add('on');
  setChapter(3);

  const mid = (SLICES - 1) / 2;
  const SLICE_NOTES = [NOTE.D3, NOTE.Fs3, NOTE.A3, NOTE.D4, NOTE.Fs4];
  earthSlices.forEach((s, i) => {
    const dir = i % 2 ? -1 : 1;
    const ring = Math.abs(i - mid);
    const delay = ring * 85;
    play(s, [{ transform: `translateY(${dir * 100}%)` }, { transform: 'translateY(0)' }], { duration: 1700, delay, easing: EASE.expoOut });
    play(s.firstChild, [{ transform: 'scale(1.4)' }, { transform: 'scale(1)' }], { duration: 3200, delay, easing: EASE.expoOut });
    const pan = (i - mid) / mid;
    later(delay + 120, () => {
      Sound.thud(60 + ring * 6, 0.22, pan);
      Sound.pluck(SLICE_NOTES[ring], 0.05, pan);
    });
  });

  const flare = $('.flare', scene);
  const sun = sunPosition();
  flare.style.left = `${sun.x}px`;
  flare.style.top = `${sun.y}px`;
  play(flare, [
    { opacity: 0, transform: 'scale(.2)' },
    { opacity: 1, transform: 'scale(1.15)', offset: 0.6 },
    { opacity: 0.85, transform: 'scale(1)' },
  ], { duration: 2600, delay: 900, easing: 'ease-out' });
  later(900, () => {
    Sound.pad([NOTE.D3, NOTE.A3, NOTE.Fs4, NOTE.A4, NOTE.E5], { dur: 5, attack: 1.8, vol: 0.04, type: 'triangle', cutoff: [400, 3500] });
    Sound.shimmer(4, 0.018);
    Sound.droneTo(320, 0.16, 2);
  });

  const lines = $$('.caption .mask > span', scene);
  lines.forEach((l, i) => play(l, [
    { transform: 'translateY(110%) rotate(4deg)' },
    { transform: 'translateY(0) rotate(0)' },
  ], { duration: 1500, delay: 1100 + i * 140 }));

  await wait(3100);
  lines.forEach((l, i) => play(l, [{ transform: 'translateY(0)' }, { transform: 'translateY(-110%)' }], { duration: 700, delay: i * 80, easing: EASE.expoIn }));
  play(flare, [{ opacity: 0.85 }, { opacity: 0, transform: 'scale(2.4)' }], { duration: 900, easing: 'ease-in' });
  await wait(450);
}

async function earthExit() {
  const mid = (SLICES - 1) / 2;
  Sound.whoosh(1.3, 0, 0, 0.22);
  const anims = earthSlices.map((s, i) => {
    const dir = i % 2 ? 1 : -1;
    return play(s, [{ transform: 'translateY(0)' }, { transform: `translateY(${dir * 105}%)` }], {
      duration: 1100, delay: (mid - Math.abs(i - mid)) * 70, easing: EASE.expoIn,
    });
  });
  await done(anims);
  $('#earth').classList.remove('on');
}

/* ==========================================================
   CHAPTER 04 — The Route (three worlds fly by)
   ========================================================== */
// x/y in vw/vh from screen center, s = disc scale
const PASSES = [
  { sel: '.moon',   delay: 500,  dur: 2700, from: [-62, 20, 0.45], to: [64, -16, 1.15], ease: EASE.glide,
    fade: [0.18, 0.8], pan: [-0.9, 0.9] },
  { sel: '.mars',   delay: 1800, dur: 2900, from: [12, -6, 0.08],  to: [-78, 12, 2.3],  ease: 'cubic-bezier(.5, 0, .85, .5)',
    fade: [0.12, 0.85], pan: [0.2, -1] },
  { sel: '.saturn', delay: 3300, dur: 2800, from: [72, 24, 0.5],   to: [-3, 2, 1],      ease: 'cubic-bezier(.2, .6, .3, 1)',
    fade: [0.2, 1], pan: [1, 0], rot: [-16, -6] },
];

function lockOn(body, at) {
  const tag = $('.tag', body);
  const [reticle, leader, text] = tag.children;
  const name = $('b', text);
  later(at, () => {
    play(reticle, [{ opacity: 0, transform: 'scale(2.6) rotate(45deg)' }, { opacity: 1, transform: 'scale(1) rotate(0)' }], { duration: 600 });
    play(leader, [{ opacity: 1, transform: 'scaleX(0)' }, { opacity: 1, transform: 'scaleX(1)' }], { duration: 600, delay: 250 });
    play(text, [{ opacity: 0, transform: 'translateX(-12px)' }, { opacity: 1, transform: 'none' }], { duration: 800, delay: 400 });
    scramble(name, name.dataset.name, { settle: 380, stagger: 50 });
    Sound.blip(NOTE.A5, 0.07, 0.38);
    Sound.blip(NOTE.E6, 0.06, 0.47);
  });
}

async function sceneRoute() {
  const scene = $('#route');
  scene.classList.add('on');
  setChapter(4);
  tween(1200, v => (Stars.warp = 0.01 + v * 0.06));

  // the sun swells into view...
  const sunEl = $('.sun', scene);
  play(sunEl, [{ opacity: 0, transform: 'scale(0)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 1400, delay: 200 });
  later(250, () => {
    Sound.ping(NOTE.A5, 0.06);
    Sound.pad([NOTE.G2, NOTE.D3, NOTE.B3, NOTE.Fs4], { dur: 7, attack: 2.5, vol: 0.035, cutoff: [250, 1600] });
  });

  // ...then we leave it behind
  play(sunEl, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(2.6)' }], { duration: 1500, delay: 1300, easing: 'ease-in' });

  const anims = PASSES.map(p => {
    const body = $(p.sel, scene);
    const disc = $('.disc', body);
    const [r0, r1] = p.rot || [0, 0];
    const T = ([x, y], r) => `translate(${x}vw, ${y}vh) rotate(${r}deg)`;
    const bodyAnim = play(body, [
      { transform: T(p.from, r0), opacity: 0 },
      { opacity: 1, offset: p.fade[0] },
      { opacity: 1, offset: p.fade[1] },
      { transform: T(p.to, r1), opacity: p.fade[1] === 1 ? 1 : 0 },
    ], { duration: p.dur, delay: p.delay, easing: p.ease });
    play(disc, [{ transform: `scale(${p.from[2]})` }, { transform: `scale(${p.to[2]})` }], { duration: p.dur, delay: p.delay, easing: p.ease });
    later(p.delay, () => Sound.whoosh(p.dur / 1000, p.pan[0], p.pan[1]));
    lockOn(body, p.delay + p.dur * 0.22);
    return bodyAnim;
  });

  await done(anims);
  Sound.pad([NOTE.D2, NOTE.A2, NOTE.E4, NOTE.Fs4], { dur: 4, attack: 1, vol: 0.04, cutoff: [300, 2400] });
  await wait(500);

  // dive into the rings
  const saturn = $('.saturn', scene);
  play($('.tag', saturn), [{ opacity: 1 }, { opacity: 0 }], { duration: 400 });
  Sound.sweepDown(1.4, 0.2);
  await done(play($('.disc', saturn), [
    { transform: 'scale(1)', filter: 'brightness(1)' },
    { transform: 'scale(7)', filter: 'brightness(0)' },
  ], { duration: 1300, easing: EASE.expoIn }));
  scene.classList.remove('on');
}

/* ==========================================================
   Hand-off to the site
   ========================================================== */
function heroIn() {
  play($('.hero-bg'), [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }], { duration: 40000, easing: 'linear' });
  play($('.hero-shade'), [{ opacity: 0 }, { opacity: 1 }], { duration: 3000, easing: 'ease' });

  $$('[data-nav]').forEach((el, i) => play(el, [
    { opacity: 0, transform: 'translateY(-20px)' },
    { opacity: 1, transform: 'none' },
  ], { duration: 2000, delay: 1000 + i * 120, easing: EASE.quartOut }));

  $$('.hero h1 .mask > span').forEach((el, i) => play(el, [
    { transform: 'translateY(115%) rotate(5deg)' },
    { transform: 'translateY(0) rotate(0)' },
  ], { duration: 2800, delay: 700 + i * 260, easing: EASE.quartOut }));

  $$('.hero [data-fade]').forEach((el, i) => play(el, [
    { opacity: 0, transform: 'translateY(24px)' },
    { opacity: 1, transform: 'none' },
  ], { duration: 2400, delay: 1800 + i * 160, easing: EASE.quartOut }));
}

async function finish() {
  if (finished) return;
  finished = true;
  finishedAt = performance.now();
  skipped = true;
  Sound.outro(6);

  const intro = $('#intro');
  scrollTo(0, 0);
  document.body.classList.remove('locked');
  heroIn();
  await intro.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1800, easing: EASE.glide, fill: 'forwards' }).finished;
  intro.remove();
}

async function sequence() {
  await sceneLoader();
  await sceneWarp();
  await sceneEclipse();
  await sceneEarth();
  await Promise.all([earthExit(), sceneRoute()]);
  finish();
}

/* ---------- Main loop ---------- */
const heroMedia = $('.hero-media');
const routeLayers = $$('#route [data-depth]');

function loop(now) {
  mouse.sx += (mouse.x - mouse.sx) * 0.05;
  mouse.sy += (mouse.y - mouse.sy) * 0.05;

  if (!finished) {
    Stars.ox = -mouse.sx * 40;
    Stars.oy = -mouse.sy * 30;
    Stars.render();
    updateClock(now);
    // `translate` stacks with the animated `transform`, so parallax never fights the flight paths
    routeLayers.forEach(el => {
      const d = +el.dataset.depth;
      el.style.translate = `${-mouse.sx * d}px ${-mouse.sy * d * 0.7}px`;
    });
  } else {
    // parallax fades in as the Ken Burns zoom grows, so no edge ever shows
    // and the hand-off from the reveal layer stays pixel-aligned
    const amp = Math.min(1, (now - finishedAt) / 8000);
    heroMedia.style.transform = `translate3d(${mouse.sx * -14 * amp}px, ${mouse.sy * -10 * amp}px, 0)`;
  }
  requestAnimationFrame(loop);
}

/* ---------- Boot ---------- */
splitWords($('.whisper'));
splitWords($('.subtitle'));
buildSlices();
Stars.init();
requestAnimationFrame(loop);

$('.skip').addEventListener('click', finish);
$('.sound-toggle').addEventListener('click', () => Sound.enable(!Sound.on));
addEventListener('keydown', e => { if (!finished && e.key === 'Escape') finish(); });
$$('.replay').forEach(b => b.addEventListener('click', () => location.reload()));
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';


if (matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
else sequence();
