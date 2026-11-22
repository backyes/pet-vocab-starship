/* ═══════════════════════════════════════════════════════════
   词花令 · 数据层
   读取项目根目录的 data/vocab.json，清洗为可拍卡的「词笺」。
   ═══════════════════════════════════════════════════════════ */

const VOCAB_URL = new URL('../../data/vocab.json', import.meta.url);
export const AUDIO_BASE = new URL('../../audio/', import.meta.url).href;

/* 十二词域：沿用词库的 12 个主题，换成国风名目与单字印 */
export const THEMES = [
  { id: 'daily',    name: '起居', glyph: '居', en: 'HABIT',   tag: '家居 · 习惯 · 家务', tint: '#8a7350' },
  { id: 'food',     name: '烟火', glyph: '味', en: 'FLAVOR',  tag: '饮食 · 口味 · 购物', tint: '#b4552f' },
  { id: 'travel',   name: '行旅', glyph: '行', en: 'TRAVEL',  tag: '交通 · 住宿 · 行程', tint: '#3f6b74' },
  { id: 'school',   name: '书院', glyph: '学', en: 'STUDY',   tag: '学习 · 考试 · 职场', tint: '#4a5f8a' },
  { id: 'health',   name: '医庐', glyph: '医', en: 'HEALTH',  tag: '身体 · 疾病 · 治疗', tint: '#8d6a86' },
  { id: 'nature',   name: '山林', glyph: '山', en: 'NATURE',  tag: '环境 · 动物 · 气候', tint: '#4a6b52' },
  { id: 'feelings', name: '心绪', glyph: '心', en: 'FEELING', tag: '情绪 · 性格 · 态度', tint: '#a3506a' },
  { id: 'tech',     name: '格物', glyph: '器', en: 'TECH',    tag: '科技 · 网络 · 媒体', tint: '#5a6672' },
  { id: 'sport',    name: '竞技', glyph: '竞', en: 'SPORT',   tag: '比赛 · 球类 · 户外', tint: '#b0713a' },
  { id: 'city',     name: '市井', glyph: '市', en: 'CITY',    tag: '城市 · 公共 · 社区', tint: '#6b5f8a' },
  { id: 'culture',  name: '文墨', glyph: '文', en: 'ARTS',    tag: '艺术 · 音乐 · 文学', tint: '#a8823a' },
  { id: 'people',   name: '人情', glyph: '人', en: 'BOND',    tag: '家庭 · 关系 · 社交', tint: '#7c5a4a' },
];
export const THEME_MAP = Object.fromEntries(THEMES.map((t) => [t.id, t]));

/* 三档对手 */
export const DIFFS = {
  sprout: {
    id: 'sprout', name: '童子', en: 'SPROUT',
    desc: '4 笺 · 只出释义',
    field: 4, turns: 6, aiAcc: 0.46, aiScore: 120, chargeMs: 1900, gold: [0.42, 0.86],
    kinds: ['meaning', 'meaning', 'meaning', 'cloze'], time: 0,
  },
  scholar: {
    id: 'scholar', name: '书生', en: 'SCHOLAR',
    desc: '6 笺 · 释义与例句',
    field: 6, turns: 8, aiAcc: 0.66, aiScore: 165, chargeMs: 1550, gold: [0.52, 0.82],
    kinds: ['meaning', 'meaning', 'cloze', 'cloze'], time: 10,
  },
  master: {
    id: 'master', name: '状元', en: 'MASTER',
    desc: '8 笺 · 听音与例句',
    field: 8, turns: 9, aiAcc: 0.84, aiScore: 200, chargeMs: 1350, gold: [0.58, 0.8],
    kinds: ['meaning', 'cloze', 'cloze', 'audio'], time: 8,
  },
};

/* ─────────── 小工具 ─────────── */
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const randInt = (n) => Math.floor(Math.random() * n);
export const pick = (arr) => arr[randInt(arr.length)];
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ─────────── 释义清洗 ─────────── */
const POS_PREFIX = /^(abbr|un|n|v|vt|vi|adj|adv|prep|conj|pron|num|int|det|aux)\.\s*/i;
const HAN_ONLY = /^[\u4e00-\u9fa5·（）()\-—～~ ]+$/;

function cleanZh(raw) {
  if (!raw) return '';
  const parts = String(raw).split(/[；;、]/).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (let p of parts) {
    p = p.replace(POS_PREFIX, '').trim();
    if (!p) continue;
    // 去掉夹在释义里的英文说明（如 "abbr. 流行音乐播音员"）
    if (!HAN_ONLY.test(p)) continue;
    if (p.length > 11) continue;
    if (out.some((q) => q === p || q.includes(p) || p.includes(q))) continue;
    out.push(p);
    if (out.length >= 2) break;
  }
  return out.join('；');
}

const WORD_RE = /^[a-z][a-z'’\- ]{0,24}$/i;

function usable(w) {
  if (!w || !w.w) return null;
  const word = String(w.w).trim();
  if (!WORD_RE.test(word)) return null;
  if (/^[A-Z]/.test(word)) return null;            // 专有名词（国家 / 语言 / 节日）不入卡
  if (word.split(/\s+/).length > 3) return null;
  if (!w.quiz) return null;
  const zh = cleanZh(w.zh);
  if (!zh) return null;
  const ex = (w.ex || '').trim();
  return {
    w: word,
    zh,
    pos: (w.pos || '').replace('n./adj.', 'adj.').trim(),
    def: (w.def || '').trim(),
    ex: ex.length > 3 && ex.length <= 150 ? ex : '',
    theme: w.theme,
    ket: !!w.ket,
    slug: w.slug || word.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    src: w.audio ? AUDIO_BASE + w.audio.replace(/^audio\//, '') : '',
  };
}

/* ─────────── 载入 ─────────── */
export async function loadWords() {
  const res = await fetch(VOCAB_URL);
  if (!res.ok) throw new Error(`词库读取失败 (${res.status})`);
  const data = await res.json();
  const byTheme = {};
  const byThemeAll = {};
  const seenWord = new Set();
  const seenAll = new Set();
  const seenZh = {};
  THEMES.forEach((t) => { byTheme[t.id] = []; byThemeAll[t.id] = []; });

  (data.words || []).forEach((raw) => {
    const w = usable(raw);
    if (!w || !byTheme[w.theme]) return;
    if (w.zh.length > 9) return;
    const key = w.w.toLowerCase();
    if (seenWord.has(key) && seenAll.has(key)) return;
    if (!seenAll.has(key)) {
      seenAll.add(key);
      byThemeAll[w.theme].push({ ...w, tint: THEME_MAP[w.theme].tint });
    }
    if (w.ket || seenWord.has(key)) return;
    const zhKey = `${w.theme}|${w.zh}`;
    if (seenZh[zhKey]) return;         // 同一词域内避免「同义不同词」同时出现
    seenWord.add(key);
    seenZh[zhKey] = 1;
    byTheme[w.theme].push({ ...w, tint: THEME_MAP[w.theme].tint });
  });

  const petTotal = Object.values(byTheme).reduce((n, a) => n + a.length, 0);
  const allTotal = Object.values(byThemeAll).reduce((n, a) => n + a.length, 0);
  return { byTheme, byThemeAll, total: petTotal, allTotal };
}

/* ─────────── 词组牌堆 ─────────── */
export function buildDeck({ byTheme, themeId, wrongMap, size, fieldSize }) {
  let pool = themeId === 'all'
    ? Object.values(byTheme).flat()
    : (byTheme[themeId] || []);

  // 去重（不同词域可能共享同形词 / 同义项）
  const byW = new Map();
  const byZh = new Set();
  pool.forEach((w) => {
    if (byW.has(w.w)) return;
    const zhKey = `${w.zh}`;
    if (byZh.has(zhKey)) return;
    byZh.add(zhKey);
    byW.set(w.w, w);
  });
  pool = [...byW.values()];

  const wrong = [];
  const normal = [];
  pool.forEach((w) => {
    const rec = wrongMap && wrongMap[w.w];
    if (rec && rec.n > 0) wrong.push(w); else normal.push(w);
  });

  const need = size + fieldSize + 4;
  let deck = shuffle(normal);
  const wq = shuffle(wrong);

  // 错词优先：均匀插进前 60% 的牌堆
  wq.slice(0, 10).forEach((w, i) => {
    const at = Math.min(deck.length, Math.floor(need * 0.6 * ((i + 1) / 11)) + randInt(3));
    deck.splice(at, 0, w);
  });

  if (deck.length < need) deck = deck.concat(shuffle(deck));
  return deck.slice(0, need);
}

/* ─────────── 例句挖空 ─────────── */
const WORD_PARTS = /[^a-z0-9]/gi;
export function blankExample(ex, word) {
  if (!ex) return null;
  const base = word.replace(WORD_PARTS, '');
  const re = new RegExp(`\\b${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:s|es|ed|d|ing|ies|ly)?\\b`, 'i');
  const m = ex.match(re);
  if (!m) return null;
  return { head: ex.slice(0, m.index), tail: ex.slice(m.index + m[0].length) };
}

export function boldExample(ex, word) {
  const parts = blankExample(ex, word);
  if (!parts) return escapeHtml(ex);
  return `${escapeHtml(parts.head)}<b>${escapeHtml(ex.slice(parts.head.length, ex.length - parts.tail.length))}</b>${escapeHtml(parts.tail)}`;
}

/* ─────────── 生成题签 ─────────── */
export function makeQuestion(word, diff) {
  let kind = pick(diff.kinds);
  const blank = blankExample(word.ex, word.w);
  if (kind === 'cloze' && !blank) kind = 'meaning';
  if (kind === 'audio' && !word.src) kind = 'meaning';

  if (kind === 'cloze') {
    return {
      kind,
      label: '例 句',
      mainHtml: `<span class="cloze-sentence">${escapeHtml(blank.head)}<i class="blank">＿ ＿</i>${escapeHtml(blank.tail)}</span>`,
      extraHtml: `释义：${escapeHtml(word.zh)}`,
      mainClass: 'en',
      answer: word,
    };
  }
  if (kind === 'audio') {
    const letters = word.w.replace(/[^a-z]/gi, '').length;
    return {
      kind,
      label: '听 音',
      mainHtml: `<span class="hear-icon" aria-hidden="true">♪</span><span>听 音 辨 词</span>`,
      extraHtml: `${escapeHtml(word.pos || '词')} · ${letters} 个字母 · 点「听音」重听`,
      mainClass: 'audio-mode',
      answer: word,
    };
  }
  const letters = word.w.replace(/[^a-z]/gi, '').length;
  const words = word.w.split(/\s+/).length;
  return {
    kind: 'meaning',
    label: '释 义',
    mainHtml: escapeHtml(word.zh),
    extraHtml: `${escapeHtml(word.pos || '词')} · ${words > 1 ? `${words} 个词` : `${letters} 个字母`}`,
    mainClass: '',
    answer: word,
  };
}

