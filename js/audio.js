/* 轻量音频系统：单词音频来自打包的英式录音；音效由 WebAudio 合成。 */
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.sfxOn = true;
    this.voiceOn = true;
    this.wordAudio = new Audio();
    this.wordAudio.preload = "auto";
    this.wordAudio.crossOrigin = "anonymous";
    this.current = "";
    this.rate = 1;
    this.speaking = false;
    this.voices = [];
    this.loadVoices();
    if (typeof speechSynthesis !== "undefined") {
      speechSynthesis.addEventListener?.("voiceschanged", () => this.loadVoices());
    }
  }

  loadVoices() {
    if (typeof speechSynthesis === "undefined") return;
    this.voices = speechSynthesis.getVoices() || [];
  }

  unlock() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!this.ctx) this.ctx = new Ctx();
      if (this.ctx.state === "suspended") this.ctx.resume();
      const buffer = this.ctx.createBuffer(1, 1, 22050);
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.ctx.destination);
      source.start(0);
    } catch (error) {
      /* audio is optional */
    }
  }

  setSfx(on) { this.sfxOn = !!on; }
  setVoice(on) {
    this.voiceOn = !!on;
    if (!on && typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    if (!on) this.wordAudio.pause();
  }

  playWord(word, { rate = 1 } = {}) {
    if (!this.voiceOn || !word) return;
    const src = word.audio || (word.slug ? `audio/${word.slug}.mp3` : "");
    if (!src) {
      this.speak(word.w);
      return;
    }
    this.rate = rate;
    if (this.current !== src) {
      this.current = src;
      this.wordAudio.src = src;
      this.wordAudio.load();
    }
    this.wordAudio.currentTime = 0;
    this.wordAudio.playbackRate = rate;
    this.wordAudio.play().catch(() => {
      // Autoplay was blocked (common on iOS before the first gesture). Try speechSynthesis.
      this.speak(word.w);
    });
  }

  replay() {
    if (!this.current) return;
    this.wordAudio.currentTime = 0;
    this.wordAudio.playbackRate = this.rate;
    this.wordAudio.play().catch(() => {});
  }

  stopWord() {
    try { this.wordAudio.pause(); } catch (error) { /* noop */ }
  }

  speak(text, { rate = 0.9, lang = "en-GB" } = {}) {
    if (!this.voiceOn || !text || typeof speechSynthesis === "undefined") return;
    try {
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = rate;
      utterance.pitch = 1;
      const preferred = this.voices.find((voice) => /en-GB/i.test(voice.lang) && /Daniel|Kate|Serena|Google UK/i.test(voice.name))
        || this.voices.find((voice) => /en-GB/i.test(voice.lang))
        || this.voices.find((voice) => /en/i.test(voice.lang));
      if (preferred) utterance.voice = preferred;
      speechSynthesis.speak(utterance);
      this.speaking = true;
      utterance.onend = () => { this.speaking = false; };
    } catch (error) {
      this.speaking = false;
    }
  }

  beep(freq, duration = 0.12, type = "sine", gain = 0.08, slideTo = null, delay = 0) {
    if (!this.sfxOn) return;
    try {
      if (!this.ctx) this.unlock();
      const ctx = this.ctx;
      if (!ctx) return;
      const start = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), start + duration);
      amp.gain.setValueAtTime(0.0001, start);
      amp.gain.exponentialRampToValueAtTime(gain, start + 0.012);
      amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(amp).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    } catch (error) {
      /* noop */
    }
  }

  shoot() {
    this.beep(760, 0.16, "sawtooth", 0.06, 120);
    this.beep(160, 0.08, "square", 0.03, 60);
  }

  hit(combo = 0) {
    const base = 620 + Math.min(combo, 12) * 24;
    this.beep(base, 0.1, "sine", 0.07, base * 1.5);
    this.beep(base * 1.5, 0.14, "triangle", 0.05, base * 2, 0.06);
  }

  wrong() {
    this.beep(150, 0.24, "square", 0.055, 70);
    this.beep(90, 0.3, "sawtooth", 0.03, 50, 0.04);
  }

  ui() { this.beep(560, 0.045, "sine", 0.025, 700); }

  level() {
    [523, 659, 784, 1046].forEach((freq, index) => this.beep(freq, 0.22, "triangle", 0.06, null, index * 0.09));
  }

  achievement() {
    [880, 1174, 1568].forEach((freq, index) => this.beep(freq, 0.25, "sine", 0.05, null, index * 0.1));
  }

  sentence() {
    [392, 523, 659].forEach((freq, index) => this.beep(freq, 0.26, "sine", 0.05, null, index * 0.08));
  }

  boss() {
    this.beep(70, 0.6, "sawtooth", 0.04, 45);
    this.beep(140, 0.4, "square", 0.02, 90, 0.1);
  }

  warn() { this.beep(320, 0.12, "square", 0.03, 240); }
}
