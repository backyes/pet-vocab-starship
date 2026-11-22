/* ═══════════════════════════════════════════════════════════
   词花令 · 对局
   ═══════════════════════════════════════════════════════════ */
import {
  THEMES, THEME_MAP, DIFFS, loadWords, buildDeck, makeQuestion,
  escapeHtml, boldExample, sleep, randInt, pick, clamp,
} from './data.js';
import { Sound, Fx } from './fx.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const STORE_KEY = 'cihualing.v1';

/* ══════════════ 存档 ══════════════ */
const DEFAULT_STORE = { games: 0, wins: 0, bestCombo: 0, bestScore: 0, wrong: {}, theme: 'all', diff: 'scholar', sound: true, includeKet: false };
let store = { ...DEFAULT_STORE };

function loadStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (raw && typeof raw === 'object') store = { ...DEFAULT_STORE, ...raw, wrong: raw.wrong || {} };
  } catch (e) { /* 忽略 */ }
}
function saveStore() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* 忽略 */ }
}
const wrongCount = () => Object.values(store.wrong).filter((r) => r && r.n > 0).length;

/* ══════════════ 全局 ══════════════ */
let vocab = null;
let loading = null;
let sound = null;
let fx = null;
let g = null;              // 对局状态
let fieldEls = [];         // 当前场地卡元素
let lastFieldWords = [];
let commentWord = null;

/* 计时器（花令） */
const Timer = {
  raf: 0, end: 0, total: 0, left: 0, active: false, onEnd: null,
  start(sec, onEnd) {
    this.stop();
    this.total = sec * 1000;
    this.end = performance.now() + this.total;
    this.active = true;
    this.onEnd = onEnd;
    $('#ch-timer').classList.add('on');
    $('#ch-clock')?.classList.remove('hidden', 'low');
    this.tick();
  },
  tick() {
    const left = this.end - performance.now();
    const k = clamp(left / this.total, 0, 1);
    const bar = $('#timer-bar');
    if (bar) bar.style.transform = `scaleX(${k.toFixed(4)})`;
    const clock = $('#ch-clock');
    if (clock) {
      const secs = Math.max(0, Math.ceil(left / 1000));
      clock.textContent = String(secs);
      clock.classList.toggle('low', secs <= 3);
    }
    if (left <= 0) {
      this.active = false;
      cancelAnimationFrame(this.raf);
      const fn = this.onEnd;
      this.onEnd = null;
      if (fn) fn();
      return;
    }
    this.raf = requestAnimationFrame(() => this.tick());
  },
  stop() {
    cancelAnimationFrame(this.raf);
    this.active = false;
    this.left = 0;
    this.onEnd = null;
    $('#ch-timer')?.classList.remove('on');
    $('#ch-clock')?.classList.add('hidden');
    const bar = $('#timer-bar');
    if (bar) bar.style.transform = 'scaleX(1)';
  },
  pause() {
    if (!this.active) return;
    this.left = Math.max(0, this.end - performance.now());
    this.active = false;
    cancelAnimationFrame(this.raf);
    $('#ch-timer')?.classList.remove('on');
    $('#ch-clock')?.classList.add('hidden');
  },
  resume() {
    if (this.active) return;
    if (!this.left) {
      const fn = this.onEnd;
      this.onEnd = null;
      if (fn) fn();
      return;
    }
    this.end = performance.now() + this.left;
    this.active = true;
    $('#ch-timer')?.classList.add('on');
    $('#ch-clock')?.classList.remove('hidden');
    this.tick();
  },
};

/* ══════════════ 启动 ══════════════ */
function boot() {
  loadStore();
  sound = new Sound();
  sound.enabled = store.sound !== false;
  fx = new Fx($('#fx'));
  bindStatic();
  store.includeKet = !!store.includeKet;
  renderThemes();
  renderDiffs();
  renderHomeStats();
  updateSoundBtn();
  loadVocab().catch(() => {});
  // 页面上首次交互时解锁音频
  const unlock = () => { sound.unlock(); sound.startAmbient(); window.removeEventListener('pointerdown', unlock); };
  window.addEventListener('pointerdown', unlock, { once: true });
}

async function loadVocab() {
  if (vocab) return vocab;
  if (loading) return loading;
  loading = loadWords().then((v) => {
    vocab = v;
    paintThemeCounts();
    paintSetupTip();
    return v;
  }).catch((err) => {
    loading = null;
    $('#setup-tip').textContent = '词库未加载：请用本地服务器打开（python3 -m http.server 8000）';
    throw err;
  });
  return loading;
}

/* ══════════════ 开卷界面 ══════════════ */
function renderThemes() {
  const box = $('#theme-list');
  const all = `<button class="theme-chip all${store.theme === 'all' ? ' on' : ''}" data-theme="all" role="radio" aria-checked="${store.theme === 'all'}" title="十二词域全部词笺">
      <b>十二域</b><span>通拍全部词笺</span><i>令</i></button>`;
  const list = THEMES.map((t) => `
    <button class="theme-chip${store.theme === t.id ? ' on' : ''}" data-theme="${t.id}" role="radio" aria-checked="${store.theme === t.id}" title="${t.tag} · 每题只出该词域">
      <b>${t.name}</b><span data-count="theme-${t.id}">—</span><i>${t.glyph}</i>
    </button>`).join('');
  box.innerHTML = all + list;
  box.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme]');
    if (!btn) return;
    store.theme = btn.dataset.theme;
    saveStore();
    $$('.theme-chip', box).forEach((b) => {
      const on = b === btn;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
    sound.ui();
  });
}

const poolOf = () => (vocab ? (store.includeKet ? vocab.byThemeAll : vocab.byTheme) : {});

function paintThemeCounts() {
  if (!vocab) return;
  const pools = poolOf();
  THEMES.forEach((t) => {
    const el = $(`[data-count="theme-${t.id}"]`);
    if (el) el.textContent = `${(pools[t.id] || []).length} 笺`;
  });
}

function paintSetupTip() {
  if (!vocab) return;
  const pools = poolOf();
  const n = Object.values(pools).reduce((a, b) => a + b.length, 0);
  $('#setup-tip').textContent = `${store.includeKet ? '含 KET 基础词' : 'PET 新增词'} · ${n.toLocaleString('en-US')} 张词笺 · 掌风三式`;
}

function renderDiffs() {
  const box = $('#diff-list');
  box.innerHTML = Object.values(DIFFS).map((d) => `
    <button class="diff-chip${store.diff === d.id ? ' on' : ''}" data-diff="${d.id}" role="radio" aria-checked="${store.diff === d.id}">
      <b>${d.name}</b><span>${d.desc}</span>
    </button>`).join('');
  box.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-diff]');
    if (!btn) return;
    store.diff = btn.dataset.diff;
    saveStore();
    $$('.diff-chip', box).forEach((b) => {
      const on = b === btn;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
    sound.ui();
  });
}

function renderHomeStats() {
  $('#st-games').textContent = store.games || 0;
  $('#st-wins').textContent = store.wins || 0;
  $('#st-combo').textContent = store.bestCombo || 0;
  $('#st-wrong').textContent = wrongCount();
}

function updateSoundBtn() {
  const btn = $('#btn-sound');
  const on = store.sound !== false;
  btn.classList.toggle('off', !on);
  btn.querySelector('span').textContent = on ? '鸣' : '静';
}

/* ══════════════ 开新局 ══════════════ */
async function startGame() {
  const btn = $('#btn-start');
  btn.disabled = true;
  try {
    await loadVocab();
  } catch (e) {
    btn.disabled = false;
    toast('词库读取失败，请确认已用本地服务器打开');
    return;
  }
  btn.disabled = false;

  const diff = DIFFS[store.diff] || DIFFS.scholar;
  const size = diff.turns * 2 + 10;
  const deck = buildDeck({
    byTheme: poolOf(),
    themeId: store.theme,
    wrongMap: store.wrong,
    size,
    fieldSize: diff.field,
  });
  if (deck.length < diff.field + 2) {
    toast('这个词域的可用词笺不足，换一个词域试试');
    return;
  }

  // 起手牌面
  const field = [];
  const usedZh = new Set();
  let guard = 0;
  while (field.length < diff.field && deck.length && guard < 400) {
    guard += 1;
    const w = deck.shift();
    if (usedZh.has(w.zh)) { deck.push(w); continue; }
    usedZh.add(w.zh);
    field.push(w);
  }

  g = {
    diffId: diff.id,
    diff,
    themeId: store.theme,
    deck,
    field,
    answer: null,
    q: null,
    turn: 0,
    totalTurns: diff.turns * 2,
    who: 'p',
    flower: false,
    score: { p: 0, a: 0 },
    combo: { p: 0, a: 0 },
    bag: { p: [], a: [] },
    bestCombo: 0,
    hints: 3,
    answered: 0,
    correct: 0,
    miao: 0,
    asked: [],
    missed: new Set(),
    phase: 'idle',
    charge: null,
    raf: 0,
    timerOn: false,
    ended: false,
  };
  lastFieldWords = [];

  Timer.stop();
  $('#screen-home').classList.add('hidden');
  $('#screen-play').classList.remove('hidden');
  $('#overlay-result').classList.add('hidden');
  $('#commentary').classList.add('idle');
  setCommentary(null, '批', '看题签，运掌拍下对应的词笺');
  sound.unlock();
  sound.startAmbient();
  updateHud();
  beginTurn();
}

/* ══════════════ 回合 ══════════════ */
function beginTurn() {
  if (!g || g.ended) return;
  if (g.turn >= g.totalTurns || g.field.length < 1) { endGame(); return; }

  g.who = g.turn % 2 === 0 ? 'p' : 'a';
  const round = Math.floor(g.turn / 2) + 1;
  // 花令只落在玩家回合：双倍分数，附带限时
  g.flower = g.who === 'p' && round % 2 === 0 && g.totalTurns >= 4;

  drawAnswer();
  g.q = makeQuestion(g.answer, g.diff);
  g.asked.push(g.answer);

  renderField();
  renderChallenge();
  updateHud();

  if (g.who === 'p') {
    g.phase = 'idle';
    $('#board-hint').classList.remove('dim');
    if (g.flower && g.diff.time) {
      Timer.start(g.diff.time, onTimeout);
    }
  } else {
    g.phase = 'ai';
    $('#board-hint').classList.add('dim');
    const delay = 620 + Math.random() * 420;
    setTimeout(() => { if (g && !g.ended && g.phase === 'ai') aiTurn(); }, delay);
  }
}

function drawAnswer() {
  let w = g.deck.pop();
  if (!w) w = pick(g.field);
  const at = g.field.findIndex((x) => x.w === w.w);
  if (at < 0) {
    // 把答案笺换上场：随机顶掉一张，被顶掉的词回到牌堆
    const slot = randInt(g.field.length);
    const old = g.field[slot];
    g.field[slot] = w;
    if (g.deck.length) g.deck.splice(randInt(g.deck.length), 0, old);
  }
  g.answer = w;
}

function renderField() {
  const box = $('#field');
  box.innerHTML = '';
  fieldEls = [];
  const prev = lastFieldWords;
  g.field.forEach((w, i) => {
    const el = cardEl(w, i);
    if (prev[i] !== w.w) el.classList.add('enter');
    box.appendChild(el);
    fieldEls.push(el);
  });
  lastFieldWords = g.field.map((w) => w.w);
  layoutBoard();
}

function cardEl(w, i) {
  const theme = THEME_MAP[w.theme] || THEMES[0];
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'card';
  el.dataset.i = String(i);
  el.setAttribute('aria-label', `词笺 ${w.w}`);
  const letters = w.w.replace(/[^a-z]/gi, '').length + (w.w.includes(' ') ? 2 * (w.w.split(' ').length - 1) : 0);
  el.style.setProperty('--fs', clamp(1.55 / Math.max(4, letters), 0.098, 0.225).toFixed(3));
  el.innerHTML = `
    <div class="card-inner">
      <div class="card-face">
        <span class="card-mark" aria-hidden="true">${escapeHtml(theme.glyph)}</span>
        <span class="card-theme" aria-hidden="true" style="background:linear-gradient(150deg, ${theme.tint}, ${theme.tint}cc)">${escapeHtml(theme.glyph)}</span>
        <span class="card-side" aria-hidden="true">${escapeHtml(theme.name)}</span>
        <span class="card-word">${escapeHtml(w.w)}</span>
        <i class="card-rule" aria-hidden="true"></i>
        <span class="card-pos">${escapeHtml(w.pos || '')}</span>
      </div>
      <div class="card-back">
        <span class="card-back-zh">${escapeHtml(w.zh)}</span>
        ${w.ex ? `<p class="card-back-ex">${boldExample(w.ex, w.w)}</p>` : (w.def ? `<p class="card-back-def">${escapeHtml(w.def)}</p>` : '')}
        <span class="card-stamp">收</span>
      </div>
    </div>`;
  return el;
}

function layoutBoard() {
  const board = $('#board');
  if (!board || !g) return;
  const n = g.field.length || 1;
  const narrow = window.innerWidth < 560;
  const short = window.innerHeight < 520;
  let cols;
  if (short) cols = n <= 6 ? n : 4;
  else if (n <= 4) cols = 2;
  else if (n <= 6) cols = narrow ? 2 : 3;
  else cols = narrow ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const cs = getComputedStyle(board);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const availW = Math.max(120, board.clientWidth - padX - 2);
  const availH = Math.max(120, board.clientHeight - padY - (narrow ? 14 : 30));
  const gap = Math.round(clamp(availW / (cols * 11), 5, 15));
  const cwW = (availW - gap * (cols - 1)) / cols;
  const cwH = ((availH - gap * (rows - 1)) / rows) / 1.2;
  const cw = Math.round(clamp(Math.min(cwW, cwH), 52, 172));
  board.style.setProperty('--cw', `${cw}px`);
  board.style.setProperty('--cols', String(cols));
  board.style.setProperty('--gap', `${gap}px`);
}

/* ══════════════ 题签 ══════════════ */
function renderChallenge() {
  const q = g.q;
  const main = $('#ch-main');
  $('#ch-kind').textContent = q.label;
  $('#ch-pos').textContent = q.answer.pos || '';
  main.className = `challenge-main ${q.mainClass || ''}`;
  main.innerHTML = q.mainHtml;
  $('#ch-extra').innerHTML = q.extraHtml;
  $('#flower-chip').classList.toggle('hidden', !g.flower);
  $('#btn-hear').disabled = q.kind !== 'audio';

  if (g.flower) {
    $('#challenge').classList.add('flower');
    if (g.who === 'p') { sound.flower(); fx.blossom(window.innerWidth * 0.5, 120, 10); }
  } else {
    $('#challenge').classList.remove('flower');
  }

  if (q.kind === 'audio') {
    setTimeout(() => { if (g && g.q === q && !g.ended) sound.playWord(q.answer); }, 260);
  }
}

/* ══════════════ 掌风 ══════════════ */
function beginCharge(card) {
  if (!g || g.phase !== 'idle' || g.who !== 'p' || g.ended) return;
  if (!card || card.classList.contains('dead')) return;
  g.phase = 'charging';
  const [g1, g2] = g.diff.gold;
  const palm = document.createElement('div');
  palm.className = 'palm';
  palm.style.setProperty('--g1', String(g1));
  palm.style.setProperty('--g2', String(g2));
  palm.innerHTML = `
    <div class="palm-rings"><div class="palm-ring band"></div><div class="palm-ring fill"></div></div>
    <svg class="palm-ink" viewBox="0 0 100 100" aria-hidden="true"><use href="#i-palm" /></svg>
    <span class="palm-label">轻掌 ×1</span>`;
  card.appendChild(palm);
  requestAnimationFrame(() => palm.classList.add('show'));
  sound.ui();

  const rec = { card, palm, start: performance.now(), p: 0, label: palm.querySelector('.palm-label') };
  g.charge = rec;
  cancelAnimationFrame(g.raf);
  g.raf = requestAnimationFrame(chargeTick);
}

function chargeTick(ts) {
  if (!g || !g.charge) return;
  const { card, palm, start, label } = g.charge;
  const [g1, g2] = g.diff.gold;
  const p = clamp((ts - start) / g.diff.chargeMs, 0, 1);
  g.charge.p = p;
  palm.style.setProperty('--p', p.toFixed(3));
  if (p < g1) {
    label.textContent = '轻掌 ×1';
    label.className = 'palm-label';
  } else if (p <= g2) {
    label.textContent = '妙手 ×2';
    label.className = 'palm-label miao';
  } else {
    label.textContent = '过力 ×0.5';
    label.className = 'palm-label guo';
  }
  card.style.transform = `scale(${(1 + p * 0.05).toFixed(3)})`;
  if (p < 1) g.raf = requestAnimationFrame(chargeTick);
}

function clearCharge() {
  cancelAnimationFrame(g?.raf);
  if (g?.charge) {
    g.charge.palm?.remove();
    g.charge.card.style.transform = '';
    g.charge = null;
  }
}

function endCharge() {
  if (!g || g.phase !== 'charging' || !g.charge) return;
  const { card, p } = g.charge;
  clearCharge();
  g.phase = 'resolving';
  const idx = Number(card.dataset.i);
  resolve(idx, 'p', p);
}

function cancelCharge() {
  if (!g || g.phase !== 'charging') return;
  clearCharge();
  g.phase = 'idle';
}

/* ══════════════ 出手结算 ══════════════ */
const ZONE_MULT = { light: 1, miao: 2, guo: 0.5 };
const ZONE_TEXT = { light: '轻掌', miao: '妙手', guo: '过力' };

async function resolve(idx, who, power) {
  if (!g || g.ended) return;
  g.phase = 'resolving';
  Timer.stop();
  $('#board-hint').classList.add('dim');

  const d = g.diff;
  const [g1, g2] = d.gold;
  const zone = power < g1 ? 'light' : power <= g2 ? 'miao' : 'guo';
  const word = g.field[idx];
  const answer = g.answer;
  const correct = !!word && word.w === answer.w;
  const el = fieldEls[idx];

  // 一掌落下
  if (el) {
    el.classList.add('slap');
    const r = el.getBoundingClientRect();
    fx.inkBurst(r.left + r.width / 2, r.top + r.height * 0.55, power);
    shakeBoard(power);
  }
  sound.slap(power);
  if (who === 'a') {
    const r = el?.getBoundingClientRect();
    if (r) fx.inkBurst(r.left + r.width / 2, r.top + r.height / 2, 0.35);
  }
  await sleep(190);

  // 计分
  const isFlower = g.flower;
  let delta = 0;
  if (correct) {
    g.combo[who] += 1;
    if (who === 'p') {
      g.correct += 1;
      g.bestCombo = Math.max(g.bestCombo, g.combo.p);
      if (zone === 'miao') g.miao += 1;
    }
    const comboMult = 1 + Math.min(10, g.combo[who]) * 0.08;
    const base = who === 'a' ? (g.diff.aiScore || 150) : 100;
    delta = Math.round(base * ZONE_MULT[zone] * comboMult * (isFlower ? 2 : 1) / 10) * 10;
    g.score[who] += delta;
  } else {
    g.combo[who] = 0;
    delta = -30;
    g.score[who] = Math.max(0, g.score[who] + delta);
  }
  if (who === 'p') g.answered += 1;

  // 错词簿
  if (who === 'p') {
    const key = answer.w;
    const rec = store.wrong[key] || { n: 0, t: 0 };
    if (correct) {
      rec.n = Math.max(0, rec.n - 1);
      if (rec.n === 0) delete store.wrong[key];
      else store.wrong[key] = rec;
    } else {
      rec.n += 1;
      rec.t = Date.now();
      store.wrong[key] = rec;
      g.missed.add(key);
    }
    saveStore();
  }

  // 卡牌翻面
  if (el) {
    el.classList.add('dead');
    el.querySelector('.card-stamp').textContent = correct ? '收' : '错';
    el.classList.add(correct ? 'correct' : 'wrong', 'flip');
  }
  if (!correct) {
    const ai = g.field.findIndex((w) => w.w === answer.w);
    if (ai >= 0 && fieldEls[ai]) {
      fieldEls[ai].classList.add('hinted', 'flip');
    }
    sound.wrong();
  } else {
    sound.collect(g.combo[who], zone === 'miao' ? 2 : 1);
    const r = el?.getBoundingClientRect();
    if (r) fx.gold(r.left + r.width / 2, r.top + r.height / 2, 18);
  }

  // 飘字
  if (el) {
    const r = el.getBoundingClientRect();
    floatText(r.left + r.width / 2, r.top + r.height * 0.3, `${delta > 0 ? '+' : ''}${delta}`, correct ? 'gold' : 'bad');
    if (correct && zone === 'miao') floatText(r.left + r.width / 2, r.top + r.height * 0.62, '妙手 · 双倍', 'zh');
    if (correct && isFlower) floatText(r.left + r.width / 2, r.top + r.height * 0.78, '花令 · 双倍', 'zh');
  }

  // 收卡 / 归对方：拍中的那张笺归拍者；拍错则归对方
  if (correct) g.bag[who].push(word);
  else g.bag[who === 'p' ? 'a' : 'p'].push(word);

  // 批注
  const seal = correct ? (zone === 'miao' ? '妙' : '正') : '误';
  const note = correct
    ? `${who === 'p' ? '你' : '墨掌柜'}收下此笺（${ZONE_TEXT[zone]}${isFlower ? ' · 花令' : ''}）`
    : `拍错了，此笺归${who === 'p' ? '墨掌柜' : '你'}；正解见批注`;
  setCommentary(answer, seal, note);

  updateHud();
  if (who === 'p') sound.playWord(answer);

  // 飞向词袋：拍中进自己的袋，拍错进对方的袋
  const owner = correct ? who : (who === 'p' ? 'a' : 'p');
  const target = owner === 'p' ? $('#duel-me .seal-avatar') : $('#duel-ai .seal-avatar');
  if (el) flyTo(el, target);

  await sleep(1280);
  if (!g || g.ended) return;

  // 清场：被拍的那张离场，补一张新笺
  const removeAt = g.field.findIndex((w) => w.w === word.w);
  if (removeAt >= 0) g.field.splice(removeAt, 1);
  refill();

  g.turn += 1;
  if (g.turn >= g.totalTurns) { endGame(); return; }
  beginTurn();
}

function refill() {
  const need = g.field.length < g.diff.field ? g.diff.field - g.field.length : 0;
  for (let k = 0; k < need; k += 1) {
    let w = null;
    let guard = 0;
    while (g.deck.length && guard < 60) {
      guard += 1;
      const cand = g.deck.pop();
      if (!cand) break;
      if (g.field.some((x) => x.w === cand.w)) continue;
      if (g.bag.p.some((x) => x.w === cand.w) || g.bag.a.some((x) => x.w === cand.w)) continue;
      w = cand;
      break;
    }
    if (!w) break;
    g.field.push(w);
  }
}

async function onTimeout() {
  if (!g || g.ended || g.phase !== 'idle') return;
  g.phase = 'resolving';
  Timer.stop();
  const answer = g.answer;
  g.score.p = Math.max(0, g.score.p - 30);
  g.combo.p = 0;
  g.answered += 1;
  const rec = store.wrong[answer.w] || { n: 0, t: 0 };
  rec.n += 1; rec.t = Date.now();
  store.wrong[answer.w] = rec;
  g.missed.add(answer.w);
  saveStore();
  g.bag.a.push(answer);
  const ai = g.field.findIndex((w) => w.w === answer.w);
  if (ai >= 0) fieldEls[ai]?.classList.add('hinted', 'flip');
  sound.wrong();
  floatText(window.innerWidth / 2, window.innerHeight * 0.42, '-30 超时', 'bad');
  setCommentary(answer, '时', '花令时限已过，正解在此');
  updateHud();
  await sleep(1500);
  if (!g || g.ended) return;
  const at = g.field.findIndex((w) => w.w === answer.w);
  if (at >= 0) g.field.splice(at, 1);
  refill();
  g.turn += 1;
  if (g.turn >= g.totalTurns) { endGame(); return; }
  beginTurn();
}

/* ══════════════ 墨掌柜 ══════════════ */
async function aiTurn() {
  if (!g || g.ended || g.phase !== 'ai') return;
  const d = g.diff;
  const correct = Math.random() < d.aiAcc;
  // 掌柜的掌法：多为轻掌 / 过力，偶有妙手
  const power = Math.random() < 0.2 ? 0.6 + Math.random() * 0.16
    : (Math.random() < 0.5 ? 0.12 + Math.random() * 0.34 : 0.85 + Math.random() * 0.13);
  let idx = correct ? g.field.findIndex((w) => w.w === g.answer.w) : -1;
  if (idx < 0) {
    const wrongs = g.field.map((w, i) => ({ w, i })).filter((x) => x.w.w !== g.answer.w);
    idx = wrongs.length ? pick(wrongs).i : randInt(g.field.length);
  }
  const el = fieldEls[idx];
  if (el) {
    const ghost = document.createElement('div');
    ghost.className = 'palm ghost';
    ghost.innerHTML = `<svg class="palm-ink" viewBox="0 0 100 100" aria-hidden="true"><use href="#i-palm" /></svg>`;
    el.appendChild(ghost);
    requestAnimationFrame(() => ghost.classList.add('show'));
    sound.ui();
  }
  await sleep(420);
  el?.querySelector('.palm.ghost')?.remove();
  if (!g || g.ended) return;
  resolve(idx, 'a', power);
}

/* ══════════════ HUD ══════════════ */
function updateHud() {
  if (!g) return;
  setScore('#p-score', g.score.p, g.score.p > 0);
  setScore('#ai-score', g.score.a, g.score.a > 0);
  $('#p-combo').classList.toggle('on', g.combo.p > 1);
  $('#ai-combo').classList.toggle('on', g.combo.a > 1);
  $('#p-combo b').textContent = g.combo.p;
  $('#ai-combo b').textContent = g.combo.a;
  $('#hint-count').textContent = g.hints;
  $('#btn-hint').disabled = g.hints <= 0;

  const round = Math.floor(g.turn / 2) + 1;
  const half = Math.ceil(g.totalTurns / 2);
  const label = $('#round-label');
  if (g.who === 'p') {
    label.textContent = `第 ${Math.min(round, half)} / ${half} 手 · 该你了`;
    label.classList.add('turn-me');
  } else {
    label.textContent = `第 ${Math.min(round, half)} / ${half} 手 · 掌柜运掌`;
    label.classList.remove('turn-me');
  }
  $('#duel-fill').style.width = `${((g.turn + (g.who === 'a' ? 1 : 0)) / g.totalTurns) * 100}%`;

  const turns = $('#duel-turns');
  if (turns.children.length !== g.totalTurns) {
    turns.innerHTML = Array.from({ length: g.totalTurns }, () => '<span></span>').join('');
  }
  Array.from(turns.children).forEach((s, i) => {
    s.className = '';
    if (i < g.turn) s.classList.add(i % 2 === 0 ? 'p' : 'a');
    if (i === g.turn) s.classList.add('now', g.who === 'p' ? 'p' : 'a');
  });
}

function setScore(sel, value) {
  const el = $(sel);
  if (!el) return;
  const prev = Number(el.dataset.v || 0);
  el.textContent = value;
  if (value !== prev) {
    el.dataset.v = value;
    el.classList.remove('up', 'down');
    void el.offsetWidth;
    el.classList.add(value > prev ? 'up' : 'down');
  }
}

function setCommentary(word, seal, note) {
  const box = $('#commentary');
  $('#cm-seal').textContent = seal || '批';
  if (!word) {
    $('#cm-word').textContent = '—';
    $('#cm-zh').textContent = note || '';
    $('#cm-ex').textContent = '';
    box.classList.add('idle');
    return;
  }
  box.classList.remove('idle');
  commentWord = word;
  $('#cm-word').textContent = word.w;
  $('#cm-zh').textContent = `${word.pos ? `${word.pos} ` : ''}${word.zh}${note ? ` · ${note}` : ''}`;
  $('#cm-ex').innerHTML = word.ex ? boldExample(word.ex, word.w) : escapeHtml(word.def || '');
  box.dataset.word = word.w;
}

function floatText(x, y, text, kind) {
  const el = document.createElement('div');
  el.className = `float-text${kind === 'zh' ? ' zh' : ''}${kind === 'bad' ? ' bad' : ''}`;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

function shakeBoard(power) {
  const board = $('#board');
  board.classList.remove('shake');
  void board.offsetWidth;
  board.style.setProperty('--shake', String(2 + power * 5));
  board.classList.add('shake');
  setTimeout(() => board.classList.remove('shake'), 420);
}

function flyTo(el, target) {
  if (!el || !target) return;
  const a = el.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const dx = (b.left + b.width / 2) - (a.left + a.width / 2);
  const dy = (b.top + b.height / 2) - (a.top + a.height / 2);
  el.style.zIndex = '12';
  const anim = el.animate([
    { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1, offset: 0 },
    { transform: `translate(${dx * 0.34}px, ${dy * 0.3}px) scale(0.74) rotate(-7deg)`, opacity: 1, offset: 0.5 },
    { transform: `translate(${dx}px, ${dy}px) scale(0.2) rotate(16deg)`, opacity: 0.1, offset: 1 },
  ], { duration: 640, easing: 'cubic-bezier(.32,.72,.2,1)', fill: 'forwards' });
  anim.onfinish = () => { el.style.visibility = 'hidden'; };
}

/* ══════════════ 按钮与小动作 ══════════════ */
function useHint() {
  if (!g || g.phase !== 'idle' || g.who !== 'p' || g.hints <= 0) return;
  const ai = g.field.findIndex((w) => w.w === g.answer.w);
  if (ai < 0) return;
  g.hints -= 1;
  g.combo.p = 0;
  fieldEls[ai]?.classList.add('hinted');
  setTimeout(() => fieldEls[ai]?.classList.remove('hinted'), 2800);
  sound.hint();
  toast('朱批已落 · 连击归零');
  updateHud();
}

function hearAnswer() {
  if (!g || g.ended || g.phase !== 'idle' || g.who !== 'p') return;
  if (g.q.kind !== 'audio') return;
  sound.playWord(g.q.answer);
}

function toggleSound() {
  store.sound = !(store.sound !== false);
  saveStore();
  sound.setEnabled(store.sound);
  if (store.sound) { sound.unlock(); sound.startAmbient(); }
  updateSoundBtn();
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('on'), 1900);
}

/* ══════════════ 收局 ══════════════ */
function endGame() {
  if (!g || g.ended) return;
  g.ended = true;
  g.phase = 'over';
  Timer.stop();
  clearCharge();
  const p = g.score.p;
  const a = g.score.a;
  const win = p > a;
  const draw = p === a;

  store.games += 1;
  if (win) store.wins += 1;
  store.bestScore = Math.max(store.bestScore || 0, p);
  store.bestCombo = Math.max(store.bestCombo || 0, g.bestCombo);
  saveStore();

  const acc = g.answered ? Math.round((g.correct / g.answered) * 100) : 0;
  $('#res-eyebrow').textContent = win ? '花令终局 · 胜' : draw ? '花令终局 · 和' : '花令终局 · 负';
  $('#res-title').textContent = draw ? '平分秋色' : win ? (acc >= 85 ? '状元及第' : '略胜一筹') : (p >= a * 0.7 ? '惜败一着' : '再温一炉');
  $('#res-sub').textContent = `你 ${p} : ${a} 墨掌柜 · 共 ${Math.ceil(g.totalTurns / 2)} 手 · 妙手 ${g.miao} 次`;

  $('#res-grid').innerHTML = `
    <div><b class="${win ? 'win' : ''}">${p}</b><span>得分</span></div>
    <div><b>${acc}%</b><span>正确率</span></div>
    <div><b>${g.bag.p.length}</b><span>收笺</span></div>
    <div><b>${g.bestCombo}</b><span>最高连击</span></div>`;

  const seenMap = new Map();
  g.asked.forEach((w) => { if (!seenMap.has(w.w)) seenMap.set(w.w, w); });
  const words = [...seenMap.values()];
  $('#res-word-count').textContent = `共 ${words.length} 词 · 错 ${g.missed.size}`;
  $('#res-words').innerHTML = words.map((w) => `
    <button class="word-chip${g.missed.has(w.w) ? ' bad' : ''}" data-word="${escapeHtml(w.w)}">
      <b>${escapeHtml(w.w)}</b><span>${escapeHtml(w.zh)}</span>
    </button>`).join('') || '<span style="font-size:12px;color:var(--ink-4)">本局未及出笺</span>';

  $('#overlay-result').classList.remove('hidden');
  if (draw) sound.bell(392, 0, 0.05, 2);
  else if (win) sound.fanfare();
  else sound.defeat();
  fx.blossom(window.innerWidth / 2, window.innerHeight * 0.3, win ? 22 : 8);
}

function backHome() {
  $('#overlay-result').classList.add('hidden');
  $('#screen-play').classList.add('hidden');
  $('#screen-home').classList.remove('hidden');
  renderHomeStats();
  Timer.stop();
  clearCharge();
  g = null;
  fieldEls = [];
  lastFieldWords = [];
  commentWord = null;
  if (sound) sound.stopWord();
}

/* ══════════════ 事件绑定 ══════════════ */
function bindStatic() {
  $('#btn-start').addEventListener('click', startGame);
  const ket = $('#opt-ket');
  if (ket) {
    ket.checked = !!store.includeKet;
    ket.addEventListener('change', () => {
      store.includeKet = ket.checked;
      saveStore();
      paintThemeCounts();
      paintSetupTip();
      sound.ui();
    });
  }
  $('#btn-again').addEventListener('click', () => { backHome(); startGame(); });
  $('#btn-home').addEventListener('click', backHome);
  $('#btn-rules').addEventListener('click', () => openRules(true));
  $$('[data-act="rules"]').forEach((b) => b.addEventListener('click', () => openRules(true)));
  $('#btn-rules-close').addEventListener('click', () => openRules(false));
  $('#btn-sound').addEventListener('click', toggleSound);
  $('#btn-hint').addEventListener('click', useHint);
  $('#btn-hear').addEventListener('click', hearAnswer);
  $('#btn-speak').addEventListener('click', () => {
    if (commentWord) sound.playWord(commentWord);
  });

  // 掌风：按住卡面
  const field = $('#field');
  field.addEventListener('pointerdown', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    e.preventDefault();
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    beginCharge(card);
  });
  window.addEventListener('pointerup', () => endCharge());
  window.addEventListener('pointercancel', () => cancelCharge());
  window.addEventListener('blur', () => cancelCharge());

  // 键盘 1–8
  const keyIndex = (e) => {
    const n = Number(e.key);
    if (!Number.isInteger(n) || n < 1 || n > 8) return -1;
    return n - 1;
  };
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.key === 'Escape') {
      cancelCharge();
      if (!$('#overlay-rules').classList.contains('hidden')) openRules(false);
      return;
    }
    const i = keyIndex(e);
    if (i >= 0 && g && g.phase === 'idle' && fieldEls[i]) {
      e.preventDefault();
      beginCharge(fieldEls[i]);
    }
    if (e.key === 'h' || e.key === 'H') useHint();
  });
  window.addEventListener('keyup', (e) => {
    if (keyIndex(e) >= 0) endCharge();
  });

  // 收局：两下确认
  let giveupArmed = 0;
  $('#btn-giveup').addEventListener('click', () => {
    if (!g || g.ended) return;
    if (Date.now() - giveupArmed < 2600) {
      toast('此局收录');
      endGame();
      return;
    }
    giveupArmed = Date.now();
    toast('再点一次「收局」即结束本局');
  });

  // 结算词笺发音
  $('#res-words').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-word]');
    if (!btn) return;
    const w = g?.asked.find((x) => x.w === btn.dataset.word);
    if (w) sound.playWord(w);
  });

  $('#overlay-result').addEventListener('click', (e) => {
    if (e.target.id === 'overlay-result') return;
  });

  window.addEventListener('resize', () => setTimeout(layoutBoard, 80));
  window.addEventListener('orientationchange', () => setTimeout(layoutBoard, 220));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) Timer.pause();
    else Timer.resume();
  });
}

function openRules(open) {
  const ov = $('#overlay-rules');
  const wasOpen = !ov.classList.contains('hidden');
  if (open === wasOpen) return;
  ov.classList.toggle('hidden', !open);
  if (open) { Timer.pause(); sound.ui(); } else { Timer.resume(); }
}

/* 导出给调试 */
window.__cihualing = { get state() { return g; }, startGame, endGame };

boot();
