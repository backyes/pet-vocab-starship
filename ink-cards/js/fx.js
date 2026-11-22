/* ═══════════════════════════════════════════════════════════
   词花令 · 声色
   音：五声音阶拨弦、编钟、木鱼、掌风、纸声（纯 WebAudio 合成）
   色：落花、墨点、金屑、涟漪（Canvas 粒子）
   ═══════════════════════════════════════════════════════════ */

/* 宫商角徵羽 → C D E G A */
const PENTA = [261.63, 293.66, 329.63, 392.0, 440.0];
const PENTA_HI = PENTA.map((f) => f * 2);
const note = (i, octave = 0) => PENTA[((i % 5) + 5) % 5] * 2 ** (octave + Math.floor(i / 5));

export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
    this.reverb = null;
    this.noise = null;
    this.ambientTimer = 0;
    this.ambientOn = false;
    this.wordAudio = new Audio();
    this.wordAudio.preload = 'auto';
    this.voices = [];
    if (typeof speechSynthesis !== 'undefined') {
      const load = () => { this.voices = speechSynthesis.getVoices() || []; };
      load();
      speechSynthesis.addEventListener?.('voiceschanged', load);
    }
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 24;
    comp.ratio.value = 6;
    comp.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = 0.56;
    this.master.connect(comp);

    // 简易厅堂混响
    const len = Math.floor(ctx.sampleRate * 1.1);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c += 1) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i += 1) {
        d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
      }
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = buf;
    const wet = ctx.createGain();
    wet.gain.value = 0.26;
    this.reverb.connect(wet).connect(this.master);

    // 噪声源
    const nlen = Math.floor(ctx.sampleRate * 0.5);
    this.noise = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nlen; i += 1) nd[i] = Math.random() * 2 - 1;

    const tick = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = tick;
    src.connect(ctx.destination);
    src.start(0);
  }

  setEnabled(on) {
    this.enabled = !!on;
    if (this.master) this.master.gain.value = on ? 0.56 : 0;
    if (!on) {
      this.stopWord();
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
      this.ambientOn = false;
    } else if (this.ambientOn === false) {
      // 由外部决定是否恢复环境音
    }
  }

  /* ── 拨弦（古琴 / 筝） ── */
  pluck(freq, when = 0, gain = 0.1, dur = 1.1) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(6800, freq * 9), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(400, freq * 2.2), t + dur);

    const o1 = ctx.createOscillator();
    o1.type = 'triangle';
    o1.frequency.setValueAtTime(freq * 1.012, t);
    o1.frequency.exponentialRampToValueAtTime(freq, t + 0.09);
    const g1 = ctx.createGain(); g1.gain.value = 0.8;

    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freq * 2.004;
    const g2 = ctx.createGain(); g2.gain.value = 0.22;

    const o3 = ctx.createOscillator();
    o3.type = 'sine';
    o3.frequency.value = freq * 3.01;
    const g3 = ctx.createGain(); g3.gain.value = 0.07;

    o1.connect(g1).connect(lp);
    o2.connect(g2).connect(lp);
    o3.connect(g3).connect(lp);
    lp.connect(out).connect(this.master);
    if (this.reverb) out.connect(this.reverb);

    [o1, o2, o3].forEach((o) => { o.start(t); o.stop(t + dur + 0.05); });
  }

  /* ── 编钟 ── */
  bell(freq, when = 0, gain = 0.09, dur = 2.2) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    [1, 2.76, 5.4, 8.9].forEach((ratio, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq * ratio;
      const gg = gain * (i === 0 ? 1 : 0.32 / i);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gg, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur * (1 - i * 0.16));
      o.connect(g).connect(this.master);
      if (this.reverb) g.connect(this.reverb);
      o.start(t); o.stop(t + dur);
    });
  }

  noiseHit({ when = 0, dur = 0.2, freq = 1200, q = 1, type = 'bandpass', gain = 0.2 } = {}) {
    if (!this.enabled || !this.ctx || !this.noise) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 1;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
    return g;
  }

  thump(freq = 90, gain = 0.25, dur = 0.28, when = 0) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.55, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  /* ── 掌风 ── */
  slap(power = 0.6) {
    if (!this.enabled) return;
    this.unlock();
    const k = 0.5 + power * 0.9;
    this.noiseHit({ dur: 0.16, freq: 620 + power * 500, q: 0.7, gain: 0.16 * k });
    this.noiseHit({ when: 0.012, dur: 0.26, freq: 2600, q: 0.9, gain: 0.05 * k });
    this.thump(78 + power * 26, 0.22 * k, 0.24);
    if (power > 0.9) this.noiseHit({ when: 0.03, dur: 0.4, freq: 400, q: 0.6, gain: 0.07 });
  }

  /* ── 收笺 ── */
  collect(combo = 1, quality = 1) {
    if (!this.enabled) return;
    this.noiseHit({ dur: 0.22, freq: 3200, q: 0.8, gain: 0.055 });   // 纸声
    const idx = Math.min(9, Math.floor(combo));
    this.pluck(note(idx, 0), 0.02, 0.1, 1.1);
    this.pluck(note(idx + 2, 0), 0.1, 0.07, 1.2);
    if (quality >= 2) this.bell(note(idx + 3, 1), 0.06, 0.045, 1.6);
  }

  /* ── 拍错（木鱼 + 闷响） ── */
  wrong() {
    if (!this.enabled) return;
    this.noiseHit({ dur: 0.05, freq: 900, q: 2, gain: 0.12 });
    this.thump(140, 0.12, 0.1);
    this.thump(104, 0.16, 0.5, 0.06);
  }

  ui() {
    if (!this.enabled) return;
    this.unlock();
    this.noiseHit({ dur: 0.06, freq: 2400, q: 1.4, gain: 0.035 });
    this.pluck(note(4, 1), 0, 0.03, 0.3);
  }

  hint() {
    if (!this.enabled) return;
    this.pluck(note(2, 0), 0, 0.06, 0.7);
    this.pluck(note(4, 0), 0.08, 0.05, 0.9);
  }

  stamp() {
    this.thump(120, 0.2, 0.14);
    this.noiseHit({ dur: 0.1, freq: 1600, q: 0.8, gain: 0.06 });
  }

  flower() {
    if (!this.enabled) return;
    this.bell(note(0, 1), 0, 0.05, 2.4);
    this.bell(note(3, 1), 0.14, 0.04, 2.2);
    this.bell(note(4, 1), 0.28, 0.035, 2.0);
  }

  fanfare() {
    if (!this.enabled) return;
    [0, 2, 3, 4, 5, 7].forEach((i, k) => this.pluck(note(i, 0), k * 0.085, 0.085, 1.4));
    this.bell(note(5, 1), 0.5, 0.05, 2.6);
  }

  defeat() {
    if (!this.enabled) return;
    [4, 3, 2, 0].forEach((i, k) => this.pluck(note(i, 0), k * 0.14, 0.075, 1.5));
    this.thump(90, 0.14, 0.9, 0.1);
  }

  /* ── 单词录音 ── */
  playWord(word) {
    if (!this.enabled || !word) return;
    this.unlock();
    if (!word.src) { this.speak(word.w); return; }
    try {
      if (this.wordAudio.src !== word.src) {
        this.wordAudio.src = word.src;
        this.wordAudio.load();
      }
      this.wordAudio.currentTime = 0;
      this.wordAudio.playbackRate = 1;
      this.wordAudio.play().catch(() => this.speak(word.w));
    } catch (e) { this.speak(word.w); }
  }

  stopWord() {
    try { this.wordAudio.pause(); } catch (e) { /* noop */ }
  }

  speak(text, rate = 0.92) {
    if (!this.enabled || !text || typeof speechSynthesis === 'undefined') return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-GB';
      u.rate = rate;
      const v = this.voices.find((x) => /en-GB/i.test(x.lang) && /Daniel|Kate|Serena|Google UK/i.test(x.name))
        || this.voices.find((x) => /en-GB/i.test(x.lang))
        || this.voices.find((x) => /en/i.test(x.lang));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch (e) { /* noop */ }
  }

  /* ── 环境音：稀疏的古琴单音 ── */
  startAmbient() {
    if (this.ambientOn) return;
    this.ambientOn = true;
    const step = () => {
      if (!this.ambientOn) return;
      if (this.enabled && this.ctx) {
        this.pluck(note(Math.floor(Math.random() * 5), Math.random() > 0.7 ? 1 : 0), 0, 0.028, 2.6);
      }
      this.ambientTimer = setTimeout(step, 6500 + Math.random() * 7000);
    };
    this.ambientTimer = setTimeout(step, 3000);
  }

  stopAmbient() {
    this.ambientOn = false;
    clearTimeout(this.ambientTimer);
  }
}

/* ══════════════ 粒子 ══════════════ */
export class Fx {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.parts = [];
    this.dpr = 1;
    this.last = 0;
    this.petalClock = 0;
    this.resize = this.resize.bind(this);
    this.loop = this.loop.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
    requestAnimationFrame(this.loop);
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.floor(this.w * dpr);
    this.canvas.height = Math.floor(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  spawn(p) { if (this.parts.length < 260) this.parts.push(p); }

  /* 落花 */
  petal(x = Math.random() * this.w, y = -12) {
    this.spawn({
      kind: 'petal', x, y,
      vx: (Math.random() - 0.5) * 22,
      vy: 14 + Math.random() * 26,
      size: 3 + Math.random() * 3.4,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 2.2,
      life: 1,
      fade: 0.06 + Math.random() * 0.05,
      sway: Math.random() * Math.PI * 2,
      swayAmp: 10 + Math.random() * 16,
      hue: Math.random() > 0.45 ? '#e6b3ae' : '#f2d9d2',
    });
  }

  /* 墨点四溅 */
  inkBurst(x, y, power = 0.6) {
    const n = 16 + Math.round(power * 26);
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 240 * (0.5 + power);
      this.spawn({
        kind: 'dot', x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.7 - 40,
        size: 1 + Math.random() * 3.6 * (0.6 + power),
        life: 1,
        fade: 0.9 + Math.random() * 0.9,
        color: Math.random() > 0.72 ? 'rgba(178,58,44,0.85)' : 'rgba(38,34,26,0.8)',
        grav: 420,
      });
    }
    // 涟漪
    for (let i = 0; i < 2; i += 1) {
      this.spawn({
        kind: 'ring', x, y, r: 6, vr: 210 + i * 120, life: 1, fade: 1.5,
        color: 'rgba(120,88,50,0.5)', width: 2 - i * 0.6,
      });
    }
  }

  /* 金屑（收笺） */
  gold(x, y, n = 16) {
    for (let i = 0; i < n; i += 1) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const sp = 60 + Math.random() * 200;
      this.spawn({
        kind: 'dot', x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        size: 1 + Math.random() * 2.2,
        life: 1,
        fade: 0.7 + Math.random() * 0.6,
        color: Math.random() > 0.4 ? 'rgba(215,173,91,0.95)' : 'rgba(176,131,52,0.9)',
        grav: 260,
      });
    }
  }

  /* 落梅（花令 / 胜利） */
  blossom(x, y, n = 14) {
    for (let i = 0; i < n; i += 1) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.8;
      const sp = 80 + Math.random() * 260;
      this.spawn({
        kind: 'petal', x, y,
        vx: Math.cos(a) * sp * 0.5,
        vy: Math.sin(a) * sp * 0.4 - 30,
        size: 4 + Math.random() * 4,
        rot: Math.random() * 6.28,
        vr: (Math.random() - 0.5) * 5,
        life: 1,
        fade: 0.55 + Math.random() * 0.4,
        sway: 0, swayAmp: 0,
        hue: Math.random() > 0.5 ? '#e9a6a2' : '#f6d7cf',
        grav: 130,
      });
    }
  }

  loop(ts) {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (ts - this.last) / 1000) || 0.016;
    this.last = ts;
    const ctx = this.ctx;

    // 随手撒几片落花
    this.petalClock += dt;
    if (this.petalClock > 0.9) {
      this.petalClock = 0;
      if (document.getElementById('screen-home')?.classList.contains('hidden') === false) this.petal();
      else if (Math.random() > 0.55) this.petal();
    }

    ctx.clearRect(0, 0, this.w, this.h);
    if (!this.parts.length) return;

    for (let i = this.parts.length - 1; i >= 0; i -= 1) {
      const p = this.parts[i];
      p.life -= p.fade * dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }

      if (p.kind === 'ring') {
        p.r += p.vr * dt;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life) * 0.7;
        ctx.lineWidth = p.width;
        ctx.stroke();
        ctx.globalAlpha = 1;
        continue;
      }

      p.vy += (p.grav || 60) * dt;
      p.vx *= 1 - 1.4 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.kind === 'petal') {
        p.sway += dt * 2.4;
        p.rot += p.vr * dt;
        const sx = Math.sin(p.sway) * p.swayAmp * dt * 2;
        ctx.save();
        ctx.translate(p.x + sx, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.min(1, Math.max(0, p.life)) * 0.85;
        ctx.fillStyle = p.hue;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.62, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = Math.min(1, Math.max(0, p.life)) * 0.9;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.4, p.size * p.life), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }
}
