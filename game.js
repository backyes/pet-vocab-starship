import * as THREE from "./vendor/three.module.min.js";
import { THEMES, THEME_MAP } from "./data/themes.js";
import { World } from "./js/world.js";
import { AudioManager } from "./js/audio.js";

/* ============================================================
   PET 词汇星舰 · 主程序
   ============================================================ */
const $ = (id) => document.getElementById(id);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const SAVE_KEY = "pet-starship-v5";
const SECTOR_COUNT = 12;
const SPRINT_TIME = 90;

const RANKS = [
  { min: 1, name: "见习学员" },
  { min: 3, name: "星舰学员" },
  { min: 5, name: "词汇猎手" },
  { min: 8, name: "语法工程师" },
  { min: 12, name: "星际译官" },
  { min: 16, name: "词库舰长" },
  { min: 20, name: "语言学官" },
  { min: 25, name: "星海传奇" },
];

const UPGRADES = [
  { id: "power", name: "火力校准", icon: "✦", desc: "每次答对得分 +8%", max: 3 },
  { id: "shield", name: "护盾扩容", icon: "⬡", desc: "任务初始护盾 +1", max: 3 },
  { id: "time", name: "时序稳定器", icon: "◷", desc: "每题答题时间 +0.5 秒", max: 3 },
  { id: "decode", name: "解码辅助", icon: "⌘", desc: "每局免费提示 +1 次", max: 3 },
  { id: "combo", name: "连击核心", icon: "∞", desc: "连击倍率成长更快，上限更高", max: 3 },
  { id: "xp", name: "经验矩阵", icon: "△", desc: "获得经验 +10%", max: 3 },
];

const MODE_CONFIG = {
  campaign: { label: "闯关战役", shields: 5, progress: true },
  sprint: { label: "限时突围", shields: 0, progress: false },
  dictation: { label: "听写舱", shields: 4, progress: true },
  sentence: { label: "组句舱", shields: 0, progress: true },
  cloze: { label: "语境舱", shields: 4, progress: true },
  review: { label: "错词回收", shields: 4, progress: true },
  foundation: { label: "基础复习", shields: 4, progress: true },
};

/* ---------------------------------------------------------------- utils */
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const formatNum = (value) => new Intl.NumberFormat("en-US").format(Math.round(value || 0));
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function sample(list, count) {
  return shuffle(list).slice(0, count);
}

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function posGroup(pos = "") {
  const value = pos.toLowerCase();
  if (value.startsWith("n")) return "n";
  if (value.startsWith("v")) return "v";
  if (value.startsWith("adj") || value.startsWith("adject")) return "adj";
  if (value.startsWith("adv")) return "adv";
  return "other";
}

function chineseSegments(zh = "") {
  return zh.split(/[；;，,、/（）()]/).map((part) => part.trim()).filter(Boolean);
}

function zhOverlap(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const segA = chineseSegments(a);
  const segB = chineseSegments(b);
  return segA.some((left) => segB.some((right) => {
    if (left === right) return left.length >= 1;
    if (left.length >= 2 && right.includes(left)) return true;
    if (right.length >= 2 && left.includes(right)) return true;
    return false;
  }));
}

function sentenceTokens(sentence = "") {
  return sentence.trim().split(/\s+/).filter(Boolean);
}

function normalizeToken(token = "") {
  return token.toLowerCase().replace(/^[^a-z]+|[^a-z']+$/g, "");
}

function findTargetToken(word) {
  if (!word?.ex) return -1;
  const tokens = sentenceTokens(word.ex);
  if (!tokens.length) return -1;
  const target = word.w.toLowerCase().trim();
  const normalized = tokens.map(normalizeToken);
  let index = normalized.indexOf(target);
  if (index >= 0) return index;
  if (target.includes(" ")) {
    const head = target.split(" ")[0];
    index = normalized.indexOf(head);
    if (index >= 0) return index;
  }
  const stems = [target];
  if (target.endsWith("ies")) stems.push(`${target.slice(0, -3)}y`);
  if (target.endsWith("es")) stems.push(target.slice(0, -2));
  if (target.endsWith("s")) stems.push(target.slice(0, -1));
  if (target.endsWith("ed")) stems.push(target.slice(0, -2), target.slice(0, -1));
  if (target.endsWith("ing")) stems.push(target.slice(0, -3), `${target.slice(0, -3)}e`);
  if (target.endsWith("ly")) stems.push(target.slice(0, -2));
  for (const stem of stems) {
    if (stem.length < 3) continue;
    index = normalized.findIndex((token) => token === stem || token.startsWith(stem));
    if (index >= 0) return index;
  }
  return -1;
}

function blankSentence(word) {
  const tokens = sentenceTokens(word.ex);
  const index = findTargetToken(word);
  if (index < 0) return null;
  return { tokens, index };
}

function comboMultiplier(combo) {
  const level = save.pilot.upgrades.combo || 0;
  const step = level >= 2 ? 2 : 3;
  const max = 4 + level * 0.75;
  return 1 + Math.min(max, Math.floor(combo / step) * 0.5);
}

function xpNeed(level) {
  return 140 + (level - 1) * 70;
}

function rankFor(level) {
  let rank = RANKS[0];
  for (const item of RANKS) if (level >= item.min) rank = item;
  return rank;
}

function sectorDifficulty(index) {
  return Math.min(3.2, index * 0.28);
}

function sectorUnlocked(index) {
  if (index <= 0) return true;
  const previous = THEMES[index - 1];
  return !!save.sectors[previous.id]?.cleared;
}

function nextSectorIndex() {
  for (let i = 0; i < THEMES.length; i += 1) {
    if (!save.sectors[THEMES[i].id]?.cleared && sectorUnlocked(i)) return i;
  }
  return THEMES.length - 1;
}

function masteredCount() {
  return Object.values(save.progress).filter((item) => (item.mastery || 0) >= 80).length;
}

function seenCount() {
  return Object.values(save.progress).filter((item) => (item.seen || 0) > 0).length;
}

function totalAccuracy() {
  const { correct = 0, wrong = 0 } = save.stats;
  return correct + wrong > 0 ? Math.round((correct / (correct + wrong)) * 100) : 0;
}

/* ---------------------------------------------------------------- save */
function defaultSave() {
  return {
    version: 5,
    createdAt: Date.now(),
    pilot: {
      name: "",
      xp: 0,
      level: 1,
      points: 0,
      upgrades: { power: 0, shield: 0, time: 0, decode: 0, combo: 0, xp: 0 },
    },
    progress: {},
    sectors: {},
    achievements: {},
    stats: {
      answers: 0, correct: 0, wrong: 0, shots: 0, dictations: 0,
      sentences: 0, clozes: 0, bosses: 0, perfects: 0, studied: 0,
      bestCombo: 0, totalXp: 0, sectorsCleared: 0,
    },
    best: {},
    daily: { date: "", answers: 0, newWords: 0, missions: 0 },
    settings: { sfx: true, voice: true, motion: true },
    lastTheme: "daily",
  };
}

function loadSave() {
  const base = defaultSave();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    return {
      ...base,
      ...parsed,
      pilot: {
        ...base.pilot,
        ...(parsed.pilot || {}),
        upgrades: { ...base.pilot.upgrades, ...(parsed.pilot?.upgrades || {}) },
      },
      stats: { ...base.stats, ...(parsed.stats || {}) },
      daily: { ...base.daily, ...(parsed.daily || {}) },
      settings: { ...base.settings, ...(parsed.settings || {}) },
      progress: parsed.progress || {},
      sectors: parsed.sectors || {},
      achievements: parsed.achievements || {},
      best: parsed.best || {},
    };
  } catch (error) {
    return base;
  }
}

const save = loadSave();
if (!save.pilot.name) {
  const callsigns = ["NOVA", "ORBIT", "VEGA", "LYRA", "ATLAS", "PULSAR", "COMET", "AURORA", "RIGEL", "SIRIUS"];
  save.pilot.name = `${callsigns[Math.floor(Math.random() * callsigns.length)]}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function ensureDaily() {
  if (save.daily.date !== todayKey()) {
    save.daily = { date: todayKey(), answers: 0, newWords: 0, missions: 0 };
    persist();
  }
}

function persist() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (error) {
    /* storage may be full or blocked */
  }
}

/* ---------------------------------------------------------------- audio / world */
const audio = new AudioManager();
let world = null;
try {
  world = new World($("canvas"));
  world.setTheme(THEMES[0], { animate: false });
} catch (error) {
  $("boot-loading").textContent = "当前浏览器无法启动 WebGL，请更换 Chrome / Safari 或开启硬件加速。";
  console.error(error);
}
audio.setSfx(save.settings.sfx);
audio.setVoice(save.settings.voice);

/* ---------------------------------------------------------------- data */
let DATA = null;
let WORDS = [];
let PET_WORDS = [];
let BY_THEME = {};
let PET_BY_THEME = {};
let dataReady = false;

async function loadData() {
  const response = await fetch("data/vocab.json", { cache: "no-cache" });
  if (!response.ok) throw new Error(`词库加载失败 (${response.status})`);
  DATA = await response.json();
  WORDS = DATA.words || [];
  PET_WORDS = WORDS.filter((word) => !word.ket && word.quiz);
  BY_THEME = Object.fromEntries(THEMES.map((theme) => [theme.id, WORDS.filter((word) => word.theme === theme.id)]));
  PET_BY_THEME = Object.fromEntries(THEMES.map((theme) => [theme.id, BY_THEME[theme.id].filter((word) => !word.ket && word.quiz)]));
  dataReady = true;
  $("boot-total").textContent = formatNum(DATA.meta?.total || WORDS.length);
  $("boot-loading").textContent = `${formatNum(DATA.meta?.petOnly || PET_WORDS.length)} 个 PET 新增词 · ${formatNum(WORDS.length)} 个词条 · 已就绪`;
  $("btn-boot").disabled = false;
}

/* ---------------------------------------------------------------- achievements */
const ACHIEVEMENTS = [
  { id: "first_correct", name: "首次命中", desc: "答对第一道题", icon: "✦", check: () => save.stats.correct >= 1 },
  { id: "combo_10", name: "连击核心", desc: "单局达到 10 连击", icon: "∞", check: () => save.stats.bestCombo >= 10 },
  { id: "mastered_100", name: "百词斩", desc: "掌握 100 个词", icon: "◈", check: () => masteredCount() >= 100 },
  { id: "dictation_20", name: "听写员", desc: "听写正确 20 次", icon: "⌁", check: () => save.stats.dictations >= 20 },
  { id: "sentence_10", name: "句法工程师", desc: "组句正确 10 次", icon: "⌘", check: () => save.stats.sentences >= 10 },
  { id: "perfect_10", name: "完美主义", desc: "累计 10 次 PERFECT", icon: "◇", check: () => save.stats.perfects >= 10 },
  { id: "boss_1", name: "词王终结者", desc: "击败第一个词王", icon: "☠", check: () => save.stats.bosses >= 1 },
  { id: "three_star", name: "三星舰长", desc: "在一个星域拿到 3 星", icon: "★", check: () => Object.values(save.sectors).some((sector) => sector.stars >= 3) },
  { id: "study_10", name: "记忆编码", desc: "在记忆实验室学习 10 个词", icon: "◉", check: () => save.stats.studied >= 10 },
  { id: "study_50", name: "长期记忆", desc: "在记忆实验室学习 50 个词", icon: "◍", check: () => save.stats.studied >= 50 },
  { id: "level_10", name: "十级航员", desc: "舰员等级达到 10 级", icon: "▲", check: () => save.pilot.level >= 10 },
  { id: "all_sectors", name: "星海传奇", desc: "净化全部 12 个星域", icon: "✹", check: () => THEMES.every((theme) => save.sectors[theme.id]?.cleared) },
];

function checkAchievements() {
  const unlocked = [];
  for (const achievement of ACHIEVEMENTS) {
    if (save.achievements[achievement.id]) continue;
    if (achievement.check()) {
      save.achievements[achievement.id] = Date.now();
      unlocked.push(achievement);
      if (!session) toast("成就解锁 // " + achievement.name, achievement.desc, "achievement");
      audio.achievement();
    }
  }
  if (unlocked.length) persist();
  return unlocked;
}

/* ---------------------------------------------------------------- xp / level */
function addXp(amount) {
  if (!amount) return [];
  const gained = [];
  save.pilot.xp += amount;
  save.stats.totalXp += amount;
  while (save.pilot.level < 30 && save.pilot.xp >= xpNeed(save.pilot.level)) {
    save.pilot.xp -= xpNeed(save.pilot.level);
    save.pilot.level += 1;
    save.pilot.points += 1;
    gained.push(save.pilot.level);
  }
  if (save.pilot.level >= 30) {
    save.pilot.level = 30;
    save.pilot.xp = Math.min(save.pilot.xp, xpNeed(30));
  }
  if (gained.length) showLevelUp(gained);
  return gained;
}

function showLevelUp(levels) {
  const node = $("levelup-toast");
  if (!node) return;
  node.innerHTML = `<b>LEVEL UP</b><span>舰员等级 LV.${levels[levels.length - 1]} · 模块点 +${levels.length}</span>`;
  node.classList.remove("hidden", "show");
  void node.offsetWidth;
  node.classList.add("show");
  audio.level();
  setTimeout(() => node.classList.add("hidden"), 1900);
}

function toast(title, body = "", kind = "") {
  const stack = $("toast-stack");
  if (!stack) return;
  const item = document.createElement("div");
  item.className = `toast ${kind}`.trim();
  item.innerHTML = `<b>${escapeHtml(title)}</b>${body ? escapeHtml(body) : ""}`;
  stack.appendChild(item);
  while (stack.children.length > 4) stack.firstElementChild.remove();
  setTimeout(() => item.remove(), 3600);
}

/* ---------------------------------------------------------------- themes */
function themeById(id) {
  return THEME_MAP[id] || THEMES[0];
}

function currentTheme() {
  return themeById(currentThemeId);
}

let currentThemeId = save.lastTheme && THEME_MAP[save.lastTheme] ? save.lastTheme : "daily";
let selectedSector = nextSectorIndex();
let overlayOpen = null;
let overlayReturn = null;
let started = false;
let booted = false;

/* ---------------------------------------------------------------- manifest / boot */
function updateSoundButton() {
  const button = $("btn-sound");
  if (!button) return;
  button.classList.toggle("muted", !save.settings.sfx);
  button.textContent = save.settings.sfx ? "♪" : "×";
  button.title = save.settings.sfx ? "音效开启" : "音效关闭";
}

function refreshBootUI() {
  $("btn-boot").disabled = !dataReady;
}

$("btn-boot").addEventListener("click", () => {
  if (!dataReady || booted) return;
  booted = true;
  started = true;
  audio.unlock();
  audio.ui();
  $("boot").classList.add("hidden");
  $("home").classList.remove("hidden");
  if (world) {
    const theme = currentTheme();
    world.setTheme(theme, { animate: true });
    world.setInteractive(false);
  }
  updateHome();
  updateSoundButton();
});

refreshBootUI();
loadData().catch((error) => {
  console.error(error);
  $("boot-loading").textContent = "词库加载失败：请通过本地 HTTP 服务打开（不要直接双击 HTML）。";
});

/* ---------------------------------------------------------------- home */
function updatePilotUI() {
  const level = save.pilot.level;
  const rank = rankFor(level);
  const need = xpNeed(level);
  const pct = clamp((save.pilot.xp / need) * 100, 0, 100);
  if ($("pilot-name")) $("pilot-name").textContent = save.pilot.name;
  if ($("pilot-rank")) $("pilot-rank").textContent = rank.name;
  if ($("pilot-level")) $("pilot-level").textContent = `LV.${level}`;
  if ($("pilot-xptext")) $("pilot-xptext").textContent = `${formatNum(save.pilot.xp)} / ${formatNum(need)} XP`;
  if ($("pilot-xp")) $("pilot-xp").style.width = `${pct}%`;
  if ($("pilot-mastered")) $("pilot-mastered").textContent = `${formatNum(masteredCount())} 词已掌握`;
  const avatar = document.querySelector("#home-pilot .pilot-avatar");
  if (avatar) avatar.style.setProperty("--pct", `${pct}%`);
}

function updateHome() {
  ensureDaily();
  updatePilotUI();
  updateSoundButton();
  const nextIndex = nextSectorIndex();
  const nextTheme = THEMES[nextIndex];
  if ($("continue-label")) $("continue-label").textContent = `${String(nextIndex + 1).padStart(2, "0")} · ${nextTheme.name}`;
  if ($("home-sectors")) $("home-sectors").textContent = `${Object.values(save.sectors).filter((sector) => sector.cleared).length} / ${SECTOR_COUNT} 星域`;
  if ($("daily-goal")) $("daily-goal").textContent = "完成 1 次任务 · 掌握 10 个新词";
  if ($("daily-count")) $("daily-count").textContent = `${Math.min(10, save.daily.newWords || 0)}/10`;
  selectedSector = nextIndex;
  if (world && started) world.setTheme(currentTheme(), { animate: false });
}

$("btn-continue").addEventListener("click", () => {
  audio.ui();
  startCampaign(THEMES[nextSectorIndex()].id);
});

$("btn-map").addEventListener("click", () => {
  audio.ui();
  openOverlay("map");
});

$("btn-learn").addEventListener("click", () => {
  audio.ui();
  startLearning({ themeId: THEMES[nextSectorIndex()].id, count: 6, returnTo: "campaign" });
});

$$(".nav [data-open]").forEach((button) => {
  button.addEventListener("click", () => {
    audio.ui();
    openOverlay(button.dataset.open);
  });
});

$("btn-sound").addEventListener("click", () => {
  save.settings.sfx = !save.settings.sfx;
  audio.setSfx(save.settings.sfx);
  if (save.settings.sfx) audio.ui();
  updateSoundButton();
  persist();
});

$$("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    audio.ui();
    startSession(button.dataset.mode, currentThemeId);
  });
});

/* ---------------------------------------------------------------- placeholder for later sections */

/* ============================================================
   Overlays / map / library / profile
   ============================================================ */
const overlayIds = ["map", "library", "profile", "achievements", "pause", "result"];

function hideAllOverlays() {
  overlayIds.forEach((name) => $(`overlay-${name}`)?.classList.add("hidden"));
  overlayOpen = null;
}

function openOverlay(name, { returnTo = null } = {}) {
  if (!dataReady && name !== "pause") return;
  overlayReturn = returnTo;
  overlayIds.forEach((item) => $(`overlay-${item}`)?.classList.add("hidden"));
  const node = $(`overlay-${name}`);
  if (!node) return;
  node.classList.remove("hidden");
  overlayOpen = name;
  if (name === "map") renderMap();
  if (name === "library") renderLibrary();
  if (name === "profile") renderProfile();
  if (name === "achievements") renderAchievements();
}

function closeOverlay(force = false) {
  if (!overlayOpen) return;
  const previous = overlayOpen;
  $(`overlay-${previous}`)?.classList.add("hidden");
  overlayOpen = null;
  const back = overlayReturn;
  overlayReturn = null;
  if (back === "pause" && session && !session.finished) {
    openOverlay("pause");
  }
}

$$("[data-close]").forEach((button) => {
  button.addEventListener("click", () => {
    audio.ui();
    closeOverlay();
  });
});

/* ---------------------------------------------------------------- map */
function starsMarkup(stars, total = 3) {
  return `<span class="stars">${Array.from({ length: total }, (_, index) => (
    index < stars ? "★" : '<span class="off">★</span>'
  )).join("")}</span>`;
}

function renderMap() {
  const grid = $("sector-grid");
  if (!grid) return;
  grid.innerHTML = THEMES.map((theme, index) => {
    const record = save.sectors[theme.id] || {};
    const locked = !sectorUnlocked(index);
    const words = PET_BY_THEME[theme.id]?.length || 0;
    return `
      <button class="sector-card ${index === selectedSector ? "active" : ""} ${locked ? "locked" : ""}" data-sector="${index}" style="--sc:${theme.color}">
        <div class="sector-thumb"></div>
        <div class="sector-num">SECTOR ${String(index + 1).padStart(2, "0")}</div>
        <div class="sector-name">${escapeHtml(theme.name)}</div>
        <div class="sector-en">${escapeHtml(theme.en)}</div>
        <div class="sector-foot"><span>${words} 词</span>${starsMarkup(record.stars || 0)}</div>
        ${locked ? '<span class="lock-mark">⌑</span>' : ""}
      </button>
    `;
  }).join("");

  grid.querySelectorAll("[data-sector]").forEach((card) => {
    card.addEventListener("click", () => {
      const index = Number(card.dataset.sector);
      selectedSector = index;
      renderMap();
      if (!sectorUnlocked(index)) {
        audio.warn();
        toast("星域尚未解锁", "先净化上一个星域，或进入训练舱自由练习。", "bad");
        return;
      }
      audio.ui();
      const theme = THEMES[index];
      currentThemeId = theme.id;
      save.lastTheme = theme.id;
      persist();
      if (world) world.setTheme(theme, { animate: true });
    });
  });
  updateSectorDetail();
}

function updateSectorDetail() {
  const theme = THEMES[selectedSector];
  if (!theme) return;
  const record = save.sectors[theme.id] || {};
  const locked = !sectorUnlocked(selectedSector);
  const total = PET_BY_THEME[theme.id]?.length || 0;
  const sentenceCount = (PET_BY_THEME[theme.id] || []).filter((word) => word.sentence).length;
  const detail = $("sector-detail");
  if (!detail) return;
  detail.style.setProperty("--sc", theme.color);
  detail.innerHTML = `
    <div class="detail-index">${String(selectedSector + 1).padStart(2, "0")}</div>
    <h3>${escapeHtml(theme.name)}</h3>
    <div class="detail-en">${escapeHtml(theme.en)}</div>
    <p>${escapeHtml(theme.tagline)}</p>
    <div class="detail-stats">
      <div><b>${total}</b><span>PET 新增词</span></div>
      <div><b>${sentenceCount}</b><span>可组句例句</span></div>
      <div><b>${record.best ? formatNum(record.best) : "—"}</b><span>最佳得分</span></div>
      <div><b>${record.stars || 0}/3</b><span>星域评级</span></div>
    </div>
    ${locked ? '<p class="detail-lock-note">⌑ 完成上一星域后解锁。训练舱不受限制，可随时练习全部 PET 词。</p>' : ""}
    <div class="detail-actions">
      <button id="btn-launch-sector" class="btn btn-primary btn-xl" ${locked ? "disabled" : ""}>${record.cleared ? "再次净化 →" : "启航 →"}</button>
      <button id="btn-training-from-map" class="btn btn-ghost">在当前星域训练</button>
    </div>
  `;
  $("btn-launch-sector")?.addEventListener("click", () => {
    if (locked) return;
    audio.ui();
    closeOverlay();
    startCampaign(theme.id);
  });
  $("btn-training-from-map")?.addEventListener("click", () => {
    audio.ui();
    closeOverlay();
    startSession("cloze", theme.id);
  });
  if ($("launch-name")) $("launch-name").textContent = theme.name;
  if ($("launch-meta")) $("launch-meta").textContent = `${total} 词 · ${record.stars || 0} 星${locked ? " · 未解锁" : ""}`;
  const mobileLaunch = $("btn-launch-mobile");
  if (mobileLaunch) {
    mobileLaunch.disabled = locked;
    mobileLaunch.textContent = locked ? "未解锁" : record.cleared ? "再次净化 →" : "启航 →";
  }
}

$("btn-launch-mobile")?.addEventListener("click", () => {
  const theme = THEMES[selectedSector];
  if (!theme) return;
  if (!sectorUnlocked(selectedSector)) {
    audio.warn();
    toast("星域尚未解锁", "先净化上一个星域。", "bad");
    return;
  }
  audio.ui();
  closeOverlay();
  startCampaign(theme.id);
});

/* ---------------------------------------------------------------- library */
const libraryState = { page: 0, pageSize: 60, query: "", theme: "all", filter: "pet" };
let libraryControlsBound = false;

function initLibraryControls() {
  if (libraryControlsBound) return;
  libraryControlsBound = true;
  const themeSelect = $("library-theme");
  if (themeSelect && !themeSelect.options.length) {
    themeSelect.innerHTML = `<option value="all">全部星域</option>` + THEMES.map((theme) => (
      `<option value="${theme.id}">${escapeHtml(theme.name)}</option>`
    )).join("");
  }
  $("library-search")?.addEventListener("input", (event) => {
    libraryState.query = event.target.value.trim().toLowerCase();
    libraryState.page = 0;
    renderLibrary();
  });
  $("library-theme")?.addEventListener("change", (event) => {
    libraryState.theme = event.target.value;
    libraryState.page = 0;
    renderLibrary();
  });
  $("library-filter")?.addEventListener("change", (event) => {
    libraryState.filter = event.target.value;
    libraryState.page = 0;
    renderLibrary();
  });
  $("lib-prev")?.addEventListener("click", () => {
    libraryState.page = Math.max(0, libraryState.page - 1);
    renderLibrary();
  });
  $("lib-next")?.addEventListener("click", () => {
    libraryState.page += 1;
    renderLibrary();
  });
  $("library-grid")?.addEventListener("click", (event) => {
    const audioButton = event.target.closest("[data-library-audio]");
    if (audioButton) {
      event.stopPropagation();
      const word = WORDS.find((item) => item.w === audioButton.dataset.libraryAudio);
      if (word) audio.playWord(word);
      return;
    }
    const card = event.target.closest("[data-library-word]");
    if (card) {
      const word = WORDS.find((item) => item.w === card.dataset.libraryWord);
      if (word) audio.playWord(word);
    }
  });
}

function libraryWords() {
  let words = WORDS;
  if (libraryState.filter === "pet") words = words.filter((word) => !word.ket);
  if (libraryState.filter === "ket") words = words.filter((word) => word.ket);
  if (libraryState.filter === "wrong") words = words.filter((word) => (save.progress[word.w]?.wrong || 0) > 0);
  if (libraryState.filter === "new") words = words.filter((word) => (save.progress[word.w]?.seen || 0) === 0);
  if (libraryState.filter === "mastered") words = words.filter((word) => (save.progress[word.w]?.mastery || 0) >= 80);
  if (libraryState.theme !== "all") words = words.filter((word) => word.theme === libraryState.theme);
  if (libraryState.query) {
    const query = libraryState.query;
    words = words.filter((word) => word.w.toLowerCase().includes(query) || word.zh.toLowerCase().includes(query));
  }
  return [...words].sort((a, b) => a.w.localeCompare(b.w, "en"));
}

function renderLibrary() {
  initLibraryControls();
  const words = libraryWords();
  const totalPages = Math.max(1, Math.ceil(words.length / libraryState.pageSize));
  libraryState.page = clamp(libraryState.page, 0, totalPages - 1);
  const pageWords = words.slice(libraryState.page * libraryState.pageSize, (libraryState.page + 1) * libraryState.pageSize);
  const grid = $("library-grid");
  if (!grid) return;
  if (!pageWords.length) {
    grid.innerHTML = '<div class="empty-state">没有匹配的词条。<br />换个筛选条件，或先去打一局。</div>';
  } else {
    grid.innerHTML = pageWords.map((word) => {
      const progress = save.progress[word.w] || {};
      const mastery = progress.mastery || 0;
      const tag = word.ket ? "KET 基础" : "PET 新增";
      return `
        <div class="word-card ${word.ket ? "ket" : ""}" data-library-word="${escapeHtml(word.w)}" title="${escapeHtml(word.zh)}${word.syn?.length ? ` · ≈ ${escapeHtml(word.syn.join(" / "))}` : ""}">
          <div class="wc-top">
            <div>
              <div class="wc-word">${escapeHtml(word.w)}</div>
              <div class="wc-pos">${escapeHtml(word.pos || "")}</div>
            </div>
            <button class="wc-audio" data-library-audio="${escapeHtml(word.w)}" aria-label="播放 ${escapeHtml(word.w)} 发音">▶</button>
          </div>
          <div class="wc-zh">${escapeHtml(word.zh)}</div>
          <div class="wc-ex">${escapeHtml(word.ex || "暂无例句")}</div>
          <div class="wc-foot">
            <div class="mastery"><i style="width:${mastery}%"></i></div>
            <span class="wc-tag">${tag}</span>
          </div>
        </div>
      `;
    }).join("");
  }
  if ($("library-count")) $("library-count").textContent = `${formatNum(words.length)} 词`;
  if ($("library-page-info")) {
    const scope = libraryState.filter === "pet" ? " · 已剔除 KET 基础词" : "";
    $("library-page-info").textContent = `第 ${libraryState.page + 1} / ${totalPages} 页 · 共 ${formatNum(words.length)} 个词条${scope} · 点击卡片可听发音`;
  }
  if ($("lib-prev")) $("lib-prev").disabled = libraryState.page <= 0;
  if ($("lib-next")) $("lib-next").disabled = libraryState.page >= totalPages - 1;
}

/* ---------------------------------------------------------------- profile */
function renderProfile() {
  const card = $("profile-card");
  if (!card) return;
  const level = save.pilot.level;
  const rank = rankFor(level);
  const need = xpNeed(level);
  const pct = clamp((save.pilot.xp / need) * 100, 0, 100);
  const accuracy = totalAccuracy();
  card.innerHTML = `
    <div class="profile-id-row">
      <div class="profile-big-avatar" style="--pct:${pct}%"><span>${level}</span></div>
      <div>
        <p class="eyebrow" style="margin-bottom:4px">PILOT ID // ${escapeHtml(save.pilot.name)}</p>
        <h3>${escapeHtml(save.pilot.name)}</h3>
        <span class="rank-chip">${escapeHtml(rank.name)} · LV.${level}</span>
        <input id="pilot-name-input" class="input id-input" maxlength="14" value="${escapeHtml(save.pilot.name)}" aria-label="舰员代号" />
      </div>
    </div>
    <div class="xp-big">
      <div class="xp-label"><span>下一等级</span><span>${formatNum(save.pilot.xp)} / ${formatNum(need)} XP</span></div>
      <div class="xp-track"><i style="width:${pct}%"></i></div>
    </div>
    <div class="profile-stats">
      <div class="profile-stat"><b>${formatNum(masteredCount())}</b><span>已掌握词汇</span></div>
      <div class="profile-stat"><b>${formatNum(seenCount())}</b><span>已遇见词汇</span></div>
      <div class="profile-stat"><b>${accuracy}%</b><span>历史正确率</span></div>
      <div class="profile-stat"><b>${formatNum(save.stats.bestCombo)}</b><span>最高连击</span></div>
      <div class="profile-stat"><b>${formatNum(save.stats.bosses)}</b><span>击败词王</span></div>
      <div class="profile-stat"><b>${formatNum(save.stats.totalXp)}</b><span>累计经验</span></div>
    </div>
    <div class="pilot-meta"><span>${Object.values(save.sectors).filter((sector) => sector.cleared).length} / ${SECTOR_COUNT} 星域已净化</span><span>ID ${escapeHtml(save.pilot.name)}</span></div>
  `;
  $("pilot-name-input")?.addEventListener("change", (event) => {
    const value = event.target.value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 14);
    if (value.length >= 3) {
      save.pilot.name = value;
      persist();
      updatePilotUI();
      renderProfile();
      toast("代号已更新", `舰员 ID：${value}`);
    } else {
      event.target.value = save.pilot.name;
    }
  });

  const points = save.pilot.points || 0;
  if ($("points-badge")) $("points-badge").textContent = `${points} 模块点`;
  const list = $("upgrade-list");
  if (list) {
    list.innerHTML = UPGRADES.map((upgrade) => {
      const levelNow = save.pilot.upgrades[upgrade.id] || 0;
      const can = points > 0 && levelNow < upgrade.max;
      const maxed = levelNow >= upgrade.max;
      return `
        <div class="upgrade-item">
          <div class="upgrade-icon">${upgrade.icon}</div>
          <div class="upgrade-copy"><b>${upgrade.name}</b><span>${upgrade.desc}</span>
            <div class="upgrade-pips">${Array.from({ length: upgrade.max }, (_, index) => `<i class="${index < levelNow ? "on" : ""}"></i>`).join("")}</div>
          </div>
          <button class="upgrade-buy ${maxed ? "max" : can ? "can" : ""}" data-upgrade="${upgrade.id}" ${(!can || maxed) ? "disabled" : ""}>${maxed ? "MAX" : "升级 1点"}</button>
        </div>
      `;
    }).join("");
    list.querySelectorAll("[data-upgrade]").forEach((button) => {
      button.addEventListener("click", () => {
        buyUpgrade(button.dataset.upgrade);
      });
    });
  }

  renderAchievementList($("achievement-list"), false);
  if ($("achievement-count")) $("achievement-count").textContent = `${Object.keys(save.achievements).length} / ${ACHIEVEMENTS.length}`;

  const sfxToggle = $("toggle-sfx");
  if (sfxToggle) {
    sfxToggle.textContent = save.settings.sfx ? "ON" : "OFF";
    sfxToggle.classList.toggle("on", save.settings.sfx);
  }
  const voiceToggle = $("toggle-voice");
  if (voiceToggle) {
    voiceToggle.textContent = save.settings.voice ? "ON" : "OFF";
    voiceToggle.classList.toggle("on", save.settings.voice);
  }
  const motionToggle = $("toggle-motion");
  if (motionToggle) {
    motionToggle.textContent = save.settings.motion ? "ON" : "OFF";
    motionToggle.classList.toggle("on", save.settings.motion);
  }
}

function buyUpgrade(id) {
  const upgrade = UPGRADES.find((item) => item.id === id);
  if (!upgrade) return;
  const levelNow = save.pilot.upgrades[id] || 0;
  if (save.pilot.points <= 0) {
    toast("模块点不足", "升级舰员等级或完成三星星域可获得模块点。", "bad");
    return;
  }
  if (levelNow >= upgrade.max) return;
  save.pilot.upgrades[id] = levelNow + 1;
  save.pilot.points -= 1;
  persist();
  audio.level();
  toast("模块升级", `${upgrade.name} → Lv.${levelNow + 1}`, "good");
  renderProfile();
  updatePilotUI();
}

function renderAchievementList(container, full = false) {
  if (!container) return;
  container.innerHTML = ACHIEVEMENTS.map((achievement) => {
    const unlocked = !!save.achievements[achievement.id];
    return `
      <div class="achievement-item ${unlocked ? "on" : ""}">
        <div class="ach-icon">${unlocked ? achievement.icon : "?"}</div>
        <div><b>${escapeHtml(achievement.name)}</b><span>${escapeHtml(achievement.desc)}</span></div>
      </div>
    `;
  }).join("");
}

function renderAchievements() {
  renderAchievementList($("achievement-grid"), true);
}

$("toggle-sfx")?.addEventListener("click", () => {
  save.settings.sfx = !save.settings.sfx;
  audio.setSfx(save.settings.sfx);
  updateSoundButton();
  persist();
  renderProfile();
  if (save.settings.sfx) audio.ui();
});
$("toggle-voice")?.addEventListener("click", () => {
  save.settings.voice = !save.settings.voice;
  audio.setVoice(save.settings.voice);
  persist();
  renderProfile();
});
$("toggle-motion")?.addEventListener("click", () => {
  save.settings.motion = !save.settings.motion;
  persist();
  renderProfile();
});
$("btn-reset")?.addEventListener("click", () => {
  if (!window.confirm("确定重置全部进度？词库、等级、星域与成就都会被清空。")) return;
  localStorage.removeItem(SAVE_KEY);
  window.location.reload();
});

/* ============================================================
   Memory Lab / 学习环节
   ============================================================ */
function learningWords(themeId, count = 6) {
  let pool = (PET_BY_THEME[themeId] || []).filter((word) => word.quiz && word.ex && findTargetToken(word) >= 0);
  if (pool.length < count) pool = PET_WORDS.filter((word) => word.quiz && word.ex && findTargetToken(word) >= 0);
  const scored = pool.map((word) => {
    const progress = save.progress[word.w] || {};
    const mastery = progress.mastery || 0;
    let score = (progress.seen ? 0 : 4) + (progress.wrong || 0) * 1.8 + (100 - mastery) / 24;
    if (progress.studied) score -= 2.2;
    score += Math.random() * 1.4;
    return { word, score };
  }).sort((a, b) => b.score - a.score);
  const picked = [];
  for (const item of scored) {
    if (picked.length >= count) break;
    if (picked.some((word) => zhOverlap(word.zh, item.word.zh))) continue;
    picked.push(item.word);
  }
  for (const item of scored) {
    if (picked.length >= count) break;
    if (!picked.includes(item.word)) picked.push(item.word);
  }
  return picked;
}

function makeLearnOptions(word) {
  const themePool = (PET_BY_THEME[word.theme] || []).filter((item) => item.quiz && item.w !== word.w);
  const allPool = PET_WORDS.filter((item) => item.quiz && item.w !== word.w);
  const usable = (item) => item.zh && !zhOverlap(item.zh, word.zh) && item.w !== word.w;
  const group = posGroup(word.pos);
  let candidates = themePool.filter((item) => usable(item) && posGroup(item.pos) === group);
  if (candidates.length < 2) candidates = candidates.concat(themePool.filter(usable));
  if (candidates.length < 2) candidates = candidates.concat(allPool.filter((item) => usable(item) && posGroup(item.pos) === group));
  if (candidates.length < 2) candidates = candidates.concat(allPool.filter(usable));
  const seen = new Set([word.zh]);
  const distractors = [];
  for (const item of sample(candidates, 8)) {
    if (seen.has(item.zh)) continue;
    seen.add(item.zh);
    distractors.push(item.zh);
    if (distractors.length >= 2) break;
  }
  return shuffle([
    { text: word.zh, correct: true },
    ...distractors.map((text) => ({ text, correct: false })),
  ]);
}

function highlightedExample(word) {
  if (!word.ex) return escapeHtml(word.def || "暂无例句");
  const tokens = sentenceTokens(word.ex);
  const index = findTargetToken(word);
  if (index < 0) return escapeHtml(word.ex);
  return tokens.map((token, tokenIndex) => (
    tokenIndex === index ? `<mark>${escapeHtml(token)}</mark>` : escapeHtml(token)
  )).join(" ");
}

function startLearning({ themeId, count = 6, returnTo = "campaign" } = {}) {
  if (!dataReady || session) return;
  clearTimers();
  hideAllOverlays();
  const theme = themeById(themeId || currentThemeId);
  currentThemeId = theme.id;
  save.lastTheme = theme.id;
  ensureDaily();
  const words = learningWords(theme.id, count);
  if (!words.length) {
    toast("没有可学习的词", "请刷新词库后重试。", "bad");
    return;
  }
  learn = {
    theme,
    words,
    index: 0,
    options: [],
    answered: false,
    encoded: 0,
    correctCount: 0,
    xp: 0,
    rate: 1,
    results: [],
    returnTo,
    phase: "card",
    matchPairs: [],
    matchMeanings: [],
    matched: new Set(),
    selectedWord: null,
    matchProgress: 0,
    startedAt: Date.now(),
  };
  $("home").classList.add("hidden");
  $("hud").classList.add("hidden");
  $("learn").classList.remove("hidden");
  $("learn-match").classList.add("hidden");
  $("learn-done").classList.add("hidden");
  if (world) {
    world.setTheme(theme, { animate: true });
    world.setInteractive(false);
    world.showCockpit(false);
    world.enterLab(theme);
  }
  warp();
  renderLearnCard();
  audio.boss();
}

function renderLearningChrome() {
  if (!learn) return;
  const total = learn.words.length;
  const progress = (learn.index + (learn.answered ? 1 : 0)) / total;
  if ($("learn-progress-text")) $("learn-progress-text").textContent = `WORD ${String(Math.min(learn.index + 1, total)).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
  if ($("learn-progress-fill")) $("learn-progress-fill").style.width = `${progress * 100}%`;
  if ($("learn-xp")) $("learn-xp").textContent = formatNum(learn.xp);
  if ($("learn-total")) $("learn-total").textContent = total;
  if ($("learn-encoded")) $("learn-encoded").textContent = learn.encoded;
  if ($("learn-correct")) $("learn-correct").textContent = learn.correctCount;
  if ($("learn-studied-count")) $("learn-studied-count").textContent = learn.encoded;
  const pct = total ? Math.round((learn.encoded / total) * 100) : 0;
  const ring = $("memory-ring");
  if (ring) ring.style.setProperty("--pct", `${pct}%`);
  if ($("memory-percent")) $("memory-percent").textContent = `${pct}%`;
  const rail = $("learn-rail");
  if (rail) {
    rail.innerHTML = learn.words.map((word, index) => {
      const result = learn.results[index];
      const classes = [
        "learn-rail-chip",
        index === learn.index ? "active" : "",
        result?.correct ? "done" : "",
        result && !result.correct ? "missed" : "",
      ].filter(Boolean).join(" ");
      return `<button class="${classes}" ${index !== learn.index ? "disabled" : ""}>
        <b>${escapeHtml(word.w)}</b>
        <span>${result ? (result.correct ? "已编码" : "需复习") : index === learn.index ? "当前" : "待学习"}</span>
      </button>`;
    }).join("");
  }
}

function renderLearnCard() {
  if (!learn) return;
  if (learn.index >= learn.words.length) {
    startLearningMatch();
    return;
  }
  const word = learn.words[learn.index];
  const card = $("learn-card");
  if (card) {
    card.style.animation = "none";
    void card.offsetWidth;
    card.style.animation = "";
  }
  learn.answered = false;
  learn.options = makeLearnOptions(word);
  if ($("learn-index")) $("learn-index").textContent = `WORD ${String(learn.index + 1).padStart(2, "0")} / ${String(learn.words.length).padStart(2, "0")}`;
  if ($("learn-pos")) $("learn-pos").textContent = word.pos || (word.w.includes(" ") ? "phrase" : "word");
  if ($("learn-word")) $("learn-word").textContent = word.w;
  if ($("learn-example")) $("learn-example").innerHTML = highlightedExample(word);
  if ($("learn-question")) $("learn-question").textContent = "从语境中判断它的意思";
  const options = $("learn-options");
  if (options) {
    options.innerHTML = learn.options.map((option, index) => (
      `<button class="learn-option" data-learn-option="${index}">${escapeHtml(option.text)}</button>`
    )).join("");
    options.querySelectorAll("[data-learn-option]").forEach((button) => {
      button.addEventListener("click", () => answerLearn(Number(button.dataset.learnOption)));
    });
  }
  $("learn-reveal")?.classList.add("hidden");
  if ($("learn-tip")) {
    const tips = [
      "先听发音，再根据例句猜词义。答错也会显示完整释义，不扣分。",
      "把单词和它出现的语境一起记，比单独背中文更牢。",
      "注意词性：同一个词在不同词性下意思可能不同。",
      "记忆链路会把单词和释义重新配对，检验刚才的学习。",
    ];
    $("learn-tip").textContent = tips[learn.index % tips.length];
  }
  if (world) world.setLabWord(word, learn.index, learn.words.length);
  renderLearningChrome();
  later(() => {
    if (learn && learn.phase === "card" && learn.index === learn.words.indexOf(word) && !learn.answered) audio.playWord(word);
  }, 380);
  later(() => {
    if (learn && learn.phase === "card") $("learn-card")?.scrollTo({ top: 0, behavior: "smooth" });
  }, 60);
}

function answerLearn(optionIndex) {
  if (!learn || learn.answered) return;
  const word = learn.words[learn.index];
  const option = learn.options[optionIndex];
  if (!option) return;
  learn.answered = true;
  const correct = !!option.correct;
  const buttons = [...($("learn-options")?.querySelectorAll("[data-learn-option]") || [])];
  buttons.forEach((button, index) => {
    button.disabled = true;
    if (learn.options[index].correct) button.classList.add("correct");
    if (index === optionIndex && !correct) button.classList.add("wrong");
    if (index !== optionIndex && !learn.options[index].correct) button.classList.add("dim");
  });
  learn.results[learn.index] = { correct };
  learn.encoded += 1;
  if (correct) learn.correctCount += 1;
  const xp = correct ? 12 : 4;
  learn.xp += xp;
  const levels = addXp(xp);
  save.stats.studied = (save.stats.studied || 0) + 1;
  const progress = save.progress[word.w] || { seen: 0, correct: 0, wrong: 0, streak: 0, mastery: 0, last: 0 };
  progress.studied = true;
  progress.studiedAt = Date.now();
  save.progress[word.w] = progress;
  persist();
  if (correct) {
    audio.hit(learn.correctCount);
    audio.playWord(word);
    if (world) {
      world.burst(new THREE.Vector3(0, 2.8, 0.4), learn.theme.color, 34, 3);
      world.shake(0.04);
    }
  } else {
    audio.warn();
    later(() => audio.playWord(word), 180);
  }
  if ($("learn-question")) $("learn-question").textContent = correct ? "编码成功：这个词已进入记忆链" : "正确答案已标出：把它和语境一起记住";
  if ($("learn-zh")) $("learn-zh").textContent = word.zh;
  if ($("learn-def")) $("learn-def").textContent = word.def ? `EN · ${word.def}` : "";
  if ($("learn-syn")) $("learn-syn").textContent = word.syn?.length ? `同义替换 · ${word.syn.join(" / ")}` : "";
  const next = $("btn-learn-next");
  if (next) next.textContent = learn.index + 1 >= learn.words.length ? "进入记忆链路 →" : "记住了，下一个 →";
  $("learn-reveal")?.classList.remove("hidden");
  later(() => {
    const card = $("learn-card");
    if (card) card.scrollTo({ top: card.scrollHeight, behavior: "smooth" });
  }, 120);
  renderLearningChrome();
  checkAchievements();
  if (levels.length) {
    // addXp already displays the toast; keep the lab clean.
  }
}

function nextLearnCard() {
  if (!learn || !learn.answered) return;
  audio.ui();
  learn.index += 1;
  if (learn.index >= learn.words.length) {
    startLearningMatch();
  } else {
    renderLearnCard();
  }
}

function startLearningMatch() {
  if (!learn) return;
  const unique = [];
  for (const word of learn.words) {
    if (!unique.some((item) => zhOverlap(item.zh, word.zh))) unique.push(word);
    if (unique.length >= 4) break;
  }
  learn.matchPairs = unique.length >= 2 ? unique : learn.words.slice(0, 4);
  learn.matchMeanings = shuffle(learn.matchPairs);
  learn.matched = new Set();
  learn.selectedWord = null;
  learn.phase = "match";
  $("learn-match")?.classList.remove("hidden");
  $("learn-done")?.classList.add("hidden");
  renderLearningMatch();
  audio.ui();
}

function renderLearningMatch() {
  if (!learn) return;
  const wordNode = $("match-words");
  const meaningNode = $("match-meanings");
  if (!wordNode || !meaningNode) return;
  wordNode.innerHTML = learn.matchPairs.map((word, index) => `
    <button class="match-btn ${learn.matched.has(word.w) ? "matched" : ""}" data-match-word="${escapeHtml(word.w)}">
      <b>${escapeHtml(word.w)}</b><span>${escapeHtml(word.pos || "")}</span>
    </button>
  `).join("");
  meaningNode.innerHTML = learn.matchMeanings.map((word) => `
    <button class="match-btn ${learn.matched.has(word.w) ? "matched" : ""}" data-match-meaning="${escapeHtml(word.w)}">
      ${escapeHtml(word.zh)}
    </button>
  `).join("");
  wordNode.querySelectorAll("[data-match-word]").forEach((button) => {
    button.addEventListener("click", () => {
      if (learn.matched.has(button.dataset.matchWord)) return;
      learn.selectedWord = button.dataset.matchWord;
      wordNode.querySelectorAll("[data-match-word]").forEach((item) => item.classList.remove("selected"));
      button.classList.add("selected");
      audio.ui();
    });
  });
  meaningNode.querySelectorAll("[data-match-meaning]").forEach((button) => {
    button.addEventListener("click", () => {
      if (learn.matched.has(button.dataset.matchMeaning)) return;
      if (!learn.selectedWord) {
        toast("先选一个单词", "点击左边单词，再点右边释义。", "bad");
        return;
      }
      const wordNodeSelected = wordNode.querySelector(`[data-match-word="${CSS.escape(learn.selectedWord)}"]`);
      const meaningNodeSelected = button;
      if (learn.selectedWord === button.dataset.matchMeaning) {
        learn.matched.add(learn.selectedWord);
        wordNodeSelected?.classList.add("matched");
        meaningNodeSelected.classList.add("matched");
        audio.hit(learn.matched.size);
        if (world) world.burst(new THREE.Vector3(0, 3.2, 0.4), learn.theme.color, 30, 3);
        learn.selectedWord = null;
      } else {
        wordNodeSelected?.classList.add("wrong");
        meaningNodeSelected.classList.add("wrong");
        audio.wrong();
        later(() => {
          wordNodeSelected?.classList.remove("wrong");
          meaningNodeSelected.classList.remove("wrong");
        }, 420);
        learn.selectedWord = null;
      }
      if ($("learn-match-progress")) $("learn-match-progress").textContent = `${learn.matched.size} / ${learn.matchPairs.length}`;
      if (learn.matched.size === learn.matchPairs.length) {
        if ($("btn-match-done")) $("btn-match-done").disabled = false;
        audio.level();
      }
    });
  });
  if ($("learn-match-progress")) $("learn-match-progress").textContent = `${learn.matched.size} / ${learn.matchPairs.length}`;
  if ($("btn-match-done")) $("btn-match-done").disabled = learn.matched.size !== learn.matchPairs.length;
}

function finishLearning() {
  if (!learn) return;
  learn.phase = "done";
  const bonus = learn.matched.size === learn.matchPairs.length ? 30 : 0;
  learn.xp += bonus;
  if (bonus) {
    addXp(bonus);
    audio.level();
  }
  save.stats.studied = (save.stats.studied || 0) + 0;
  persist();
  checkAchievements();
  $("learn-match")?.classList.add("hidden");
  $("learn-done")?.classList.remove("hidden");
  const stats = $("learn-done-stats");
  if (stats) {
    stats.innerHTML = `
      <div><b>${learn.encoded}</b><span>已编码</span></div>
      <div><b>${learn.correctCount}</b><span>首次选对</span></div>
      <div><b>${formatNum(learn.xp)}</b><span>获得 XP</span></div>
    `;
  }
  if ($("btn-learn-battle")) $("btn-learn-battle").textContent = learn.returnTo === "campaign" ? "进入战场 →" : "返回基地";
}

function exitLearning() {
  clearTimers();
  $("learn")?.classList.add("hidden");
  $("learn-match")?.classList.add("hidden");
  $("learn-done")?.classList.add("hidden");
  learn = null;
  if (world) {
    world.exitLab();
    world.showCockpit(false);
  }
  $("home").classList.remove("hidden");
  updateHome();
}

function startBattleAfterLearning() {
  const snapshot = learn;
  if (!snapshot) return;
  const words = snapshot.words.map((word) => word.w);
  const themeId = snapshot.theme.id;
  $("learn")?.classList.add("hidden");
  $("learn-match")?.classList.add("hidden");
  $("learn-done")?.classList.add("hidden");
  learn = null;
  startSession("campaign", themeId, { priorityWords: words });
}

function skipLearning() {
  if (!learn) return;
  const themeId = learn.theme.id;
  const returnTo = learn.returnTo;
  $("learn")?.classList.add("hidden");
  $("learn-match")?.classList.add("hidden");
  $("learn-done")?.classList.add("hidden");
  learn = null;
  if (world) world.exitLab();
  if (returnTo === "campaign") startSession("campaign", themeId, {});
  else exitLearning();
}

$("btn-learn-back")?.addEventListener("click", () => exitLearning());
$("btn-learn-skip")?.addEventListener("click", () => skipLearning());
$("btn-learn-audio")?.addEventListener("click", () => {
  if (learn) audio.playWord(learn.words[learn.index]);
});
$("btn-learn-replay")?.addEventListener("click", () => {
  if (learn) audio.playWord(learn.words[learn.index], { rate: learn.rate });
});
$("btn-learn-slow")?.addEventListener("click", () => {
  if (!learn) return;
  learn.rate = learn.rate === 1 ? 0.75 : 1;
  if ($("btn-learn-slow")) $("btn-learn-slow").textContent = learn.rate === 1 ? "0.8× 慢速" : "1.0× 正常";
  audio.playWord(learn.words[learn.index], { rate: learn.rate });
});
$("btn-learn-next")?.addEventListener("click", () => nextLearnCard());
$("btn-match-done")?.addEventListener("click", () => finishLearning());
$("btn-learn-battle")?.addEventListener("click", () => {
  if (learn?.returnTo === "campaign") startBattleAfterLearning();
  else exitLearning();
});
$("btn-learn-home")?.addEventListener("click", () => exitLearning());

/* ============================================================
   Session / gameplay
   ============================================================ */
let session = null;
let learn = null;
let pendingTimers = new Set();
let lastFrame = performance.now();

function later(callback, delay) {
  const id = setTimeout(() => {
    pendingTimers.delete(id);
    callback();
  }, delay);
  pendingTimers.add(id);
  return id;
}

function clearTimers() {
  pendingTimers.forEach((id) => clearTimeout(id));
  pendingTimers.clear();
}

function warp() {
  const node = $("warp");
  if (!node) return;
  node.classList.remove("on");
  void node.offsetWidth;
  node.classList.add("on");
  setTimeout(() => node.classList.remove("on"), 900);
}

function canUse(word, type) {
  if (!word) return false;
  if (type === "meaning" || type === "boss") return !!word.quiz;
  if (type === "cloze") return !!word.cloze && !word.w.includes(" ") && !!blankSentence(word);
  if (type === "dictation") return !!word.dictation;
  if (type === "sentence") return !!word.sentence && sentenceTokens(word.ex).length >= 4 && findTargetToken(word) >= 0;
  return true;
}

function pickWeighted(pool, type, used) {
  let candidates = pool.filter((word) => !used.has(word.w) && canUse(word, type));
  if (!candidates.length) candidates = pool.filter((word) => !used.has(word.w) && word.quiz);
  if (!candidates.length) return null;
  const weights = candidates.map((word) => {
    const progress = save.progress[word.w] || {};
    const mastery = progress.mastery || 0;
    const recent = progress.last ? Math.max(0, 1 - (Date.now() - progress.last) / (1000 * 60 * 60 * 24)) : 0;
    return 1 + (100 - mastery) / 24 + (progress.seen ? 0 : 2.4) + (progress.wrong || 0) * 0.6 + recent * 0.8;
  });
  const total = weights.reduce((sum, value) => sum + value, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < candidates.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

function campaignPlan(themeId, preferredWords = []) {
  const themePool = PET_BY_THEME[themeId] || [];
  const pool = themePool.length >= 24 ? themePool : PET_WORDS;
  const schedule = ["meaning", "cloze", "meaning", "dictation", "meaning", "sentence", "cloze", "meaning", "dictation", "cloze", "meaning", "boss"];
  const used = new Set();
  const plan = [];
  const preferred = preferredWords
    .map((word) => (typeof word === "string" ? WORDS.find((item) => item.w === word) : word))
    .filter((word) => word && word.quiz);
  for (const type of schedule) {
    if (type === "boss") {
      const words = [];
      for (let i = 0; i < 5; i += 1) {
        const word = pickWeighted(pool, "meaning", used);
        if (!word) break;
        used.add(word.w);
        words.push(word);
      }
      if (words.length) plan.push({ type: "boss", words });
      continue;
    }
    let word = null;
    const preferredIndex = preferred.findIndex((item) => !used.has(item.w) && canUse(item, type));
    if (preferredIndex >= 0) {
      word = preferred[preferredIndex];
      preferred.splice(preferredIndex, 1);
    }
    if (!word) word = pickWeighted(pool, type, used);
    if (!word) word = pickWeighted(pool, "meaning", used);
    if (!word) break;
    used.add(word.w);
    plan.push({ type: canUse(word, type) ? type : "meaning", word });
  }
  return plan;
}

function trainingPlan(mode) {
  const scheduleLength = mode === "sentence" ? 8 : mode === "dictation" ? 10 : mode === "cloze" ? 10 : 12;
  let pool = mode === "foundation" ? WORDS.filter((word) => word.ket && word.quiz) : PET_WORDS;
  if (mode === "review") {
    const weak = WORDS.filter((word) => {
      const progress = save.progress[word.w];
      return progress && ((progress.wrong || 0) > 0 || (progress.mastery || 0) < 60) && word.quiz;
    });
    if (weak.length >= 12) pool = weak;
  }
  const used = new Set();
  const plan = [];
  const mixed = ["meaning", "cloze", "dictation", "sentence"];
  for (let i = 0; i < scheduleLength; i += 1) {
    const type = mode === "review" || mode === "foundation" ? mixed[i % mixed.length] : mode;
    let word = pickWeighted(pool, type, used);
    if (!word) word = pickWeighted(pool, "meaning", used);
    if (!word) break;
    used.add(word.w);
    plan.push({ type: canUse(word, type) ? type : "meaning", word });
  }
  return plan;
}

function startCampaign(themeId) {
  const index = THEMES.findIndex((theme) => theme.id === themeId);
  if (index < 0) return;
  if (!sectorUnlocked(index)) {
    toast("星域尚未解锁", "先完成上一星域。", "bad");
    openOverlay("map");
    return;
  }
  startLearning({ themeId, count: 6, returnTo: "campaign" });
}

function startSession(mode, themeId, options = {}) {
  if (!dataReady) return;
  clearTimers();
  session = null;
  learn = null;
  hideAllOverlays();
  $("learn")?.classList.add("hidden");
  $("learn-match")?.classList.add("hidden");
  $("learn-done")?.classList.add("hidden");
  if (world) world.exitLab();
  const theme = themeById(themeId || currentThemeId);
  const config = MODE_CONFIG[mode] || MODE_CONFIG.campaign;
  const themeIndex = THEMES.findIndex((item) => item.id === theme.id);
  const plan = mode === "campaign" ? campaignPlan(theme.id, options.priorityWords || []) : mode === "sprint" ? [] : trainingPlan(mode);
  if (!plan.length && mode !== "sprint") {
    toast("词库还没有准备好", "请刷新页面后重试。", "bad");
    return;
  }
  const baseShields = config.shields + (save.pilot.upgrades.shield || 0);
  const hints = 2 + (save.pilot.upgrades.decode || 0) + (mode === "sentence" ? 1 : 0);
  currentThemeId = theme.id;
  save.lastTheme = theme.id;
  ensureDaily();
  session = {
    mode,
    theme,
    themeIndex,
    config,
    plan,
    dynamic: mode === "sprint",
    index: -1,
    score: 0,
    combo: 0,
    maxCombo: 0,
    shields: config.shields ? baseShields : 0,
    maxShields: config.shields ? baseShields : 0,
    correct: 0,
    wrong: 0,
    answers: [],
    hintsLeft: hints,
    hintsUsed: 0,
    sprintLeft: SPRINT_TIME,
    sprintCount: 0,
    bossHp: 0,
    bossMax: 0,
    bossAsked: 0,
    bossWords: [],
    question: null,
    node: null,
    finished: false,
    paused: false,
    startTime: Date.now(),
    xpEarned: 0,
    newWords: 0,
    newlyMastered: 0,
    perfects: 0,
    levelUps: [],
    startLevel: save.pilot.level,
    startRank: rankFor(save.pilot.level).name,
    achievements: [],
    wrongWords: [],
  };
  $("home").classList.add("hidden");
  $("hud").classList.remove("hidden");
  $("overlay-result").classList.add("hidden");
  $("boss-bar").classList.add("hidden");
  $("hud-sector").textContent = mode === "campaign" ? `SECTOR ${String(themeIndex + 1).padStart(2, "0")}` : "TRAINING";
  $("hud-mode-name").textContent = theme.name;
  $("hud-score").textContent = "0";
  $("progress-dots").innerHTML = "";
  document.body.classList.remove("console-open");
  if (world) {
    world.setTheme(theme, { animate: true });
    world.setInteractive(false);
    world.exitLab();
    world.showCockpit(true);
  }
  warp();
  renderHUD();
  const intro = mode === "campaign"
    ? `SECTOR ${String(themeIndex + 1).padStart(2, "0")} // ${theme.en}`
    : `${config.label.toUpperCase()} // ${theme.en}`;
  showNodeToast(intro, `${theme.name} · ${mode === "campaign" ? "混合任务" : config.label}`);
  audio.boss();
  later(() => {
    if (session && !session.finished) showNode(0);
  }, 700);
}

function renderHUD() {
  if (!session) return;
  $("hud-score").textContent = formatNum(session.score);
  const comboNode = $("combo");
  const comboValue = comboNode?.querySelector("b");
  if (comboValue) comboValue.textContent = session.combo;
  if (comboNode) {
    comboNode.classList.toggle("hot", session.combo >= 5);
    comboNode.classList.toggle("overdrive", session.combo >= 10);
  }
  const track = comboNode?.querySelector(".combo-track i");
  if (track) {
    const step = save.pilot.upgrades.combo >= 2 ? 2 : 3;
    const progress = ((session.combo % step) / step) * 100;
    track.style.width = `${session.combo ? Math.max(8, progress) : 0}%`;
  }
  if ($("hud-streak")) $("hud-streak").textContent = `STREAK ${session.maxCombo}`;
  if ($("hint-count")) $("hint-count").textContent = session.hintsLeft;
  $("btn-hint")?.classList.toggle("empty", session.hintsLeft <= 0);
  renderShields();
  renderProgress();
  updateBossBar();
}

function renderShields() {
  const node = $("hud-shields");
  if (!node) return;
  if (!session || !session.maxShields) {
    node.innerHTML = "";
    node.classList.add("hidden");
    return;
  }
  node.classList.remove("hidden");
  node.innerHTML = Array.from({ length: session.maxShields }, (_, index) => (
    `<i class="${index < session.shields ? "" : "off"}"></i>`
  )).join("");
}

function renderProgress() {
  const node = $("progress-dots");
  if (!node || !session) return;
  if (session.dynamic) {
    node.innerHTML = `<span class="sprint-time">${Math.max(0, session.sprintLeft).toFixed(1)}<small>s</small></span>`;
    return;
  }
  const count = session.plan.length;
  node.innerHTML = Array.from({ length: count }, (_, index) => {
    const type = session.plan[index].type;
    const classes = ["", index < session.index ? "done" : "", index === session.index ? "current" : "", type === "boss" ? "boss" : ""].filter(Boolean).join(" ");
    return `<i class="${classes}"></i>`;
  }).join("");
}

function updateBossBar() {
  const node = $("boss-bar");
  if (!node) return;
  if (!session || session.bossHp <= 0) {
    node.classList.add("hidden");
    return;
  }
  node.classList.remove("hidden");
  const fill = node.querySelector(".boss-track i");
  if (fill) fill.style.width = `${(session.bossHp / session.bossMax) * 100}%`;
  const label = node.querySelector("span");
  if (label) label.textContent = `词王核心 // WORDEN · HIT ${session.bossAsked}/${session.bossWords.length}`;
}

function showNodeToast(line, sub = "") {
  const node = $("node-toast");
  if (!node) return;
  node.innerHTML = `${escapeHtml(line)}${sub ? `<small>${escapeHtml(sub)}</small>` : ""}`;
  node.classList.remove("show");
  void node.offsetWidth;
  node.classList.add("show");
}

function makeOptions(word, type) {
  const themePool = (PET_BY_THEME[word.theme] || []).filter((item) => item.quiz && item.w !== word.w);
  const allPool = PET_WORDS.filter((item) => item.quiz && item.w !== word.w);
  const group = posGroup(word.pos);
  const isUsable = (item) => !zhOverlap(item.zh, word.zh) && item.w !== word.w;
  let candidates = themePool.filter((item) => isUsable(item) && posGroup(item.pos) === group);
  if (candidates.length < 3) {
    const more = themePool.filter((item) => isUsable(item) && !candidates.includes(item));
    candidates = candidates.concat(more);
  }
  if (candidates.length < 3) {
    const more = allPool.filter((item) => isUsable(item) && !candidates.includes(item) && posGroup(item.pos) === group);
    candidates = candidates.concat(more);
  }
  if (candidates.length < 3) {
    const more = allPool.filter((item) => isUsable(item) && !candidates.includes(item));
    candidates = candidates.concat(more);
  }
  const distractors = sample(candidates, 3);
  const options = shuffle([word, ...distractors]);
  return { options, correctIndex: options.findIndex((item) => item.w === word.w) };
}

function setPrompt({ kicker, main, sub = "", pos = "", extra = "", cls = "", timer = true }) {
  const prompt = $("prompt");
  if (!prompt) return;
  prompt.className = `prompt-card ${cls}`.trim();
  if (!timer) prompt.classList.add("no-timer");
  $("prompt-kicker").textContent = kicker;
  $("prompt-main").innerHTML = main;
  $("prompt-sub").textContent = sub;
  const posNode = $("prompt-pos");
  if (pos) {
    posNode.textContent = pos;
    posNode.classList.remove("hidden");
  } else {
    posNode.classList.add("hidden");
  }
  const extraNode = $("prompt-extra");
  if (extra) {
    extraNode.innerHTML = extra;
    extraNode.classList.remove("hidden");
  } else {
    extraNode.innerHTML = "";
    extraNode.classList.add("hidden");
  }
  $("timer-fill").style.width = "100%";
  $("timer-fill").classList.remove("low");
}

function showNode(index) {
  if (!session || session.finished) return;
  session.index = index;
  let node = null;
  if (session.dynamic) {
    node = makeDynamicNode();
  } else {
    node = session.plan[index];
  }
  if (!node) {
    finishSession(true, "complete");
    return;
  }
  session.node = node;
  hideFeedback();
  hideConsoles();
  $("prompt")?.classList.remove("good", "bad", "cloze-mode");
  if ($("prompt-extra")) {
    $("prompt-extra").innerHTML = "";
    $("prompt-extra").classList.add("hidden");
  }
  if (node.type === "boss") {
    session.bossWords = node.words;
    session.bossHp = 3;
    session.bossMax = 3;
    session.bossAsked = 0;
    if (world) world.showBoss();
    updateBossBar();
    beginQuestion("boss", node.words[0]);
    showNodeToast("BOSS // 词王核心", "5 次机会 · 命中 3 次即可击破");
    audio.boss();
    return;
  }
  if (session.dynamic) {
    showNodeToast(`NODE ${String(session.sprintCount).padStart(2, "0")} // 连发`, session.config.label);
  } else {
    const labels = { meaning: "意义锁定", cloze: "语境填空", dictation: "听写解码", sentence: "语序重构" };
    showNodeToast(`NODE ${String(index + 1).padStart(2, "0")} // ${labels[node.type] || "任务"}`, "");
  }
  beginQuestion(node.type, node.word);
}

function makeDynamicNode() {
  session.sprintCount += 1;
  const type = session.sprintCount % 3 === 0 ? "cloze" : "meaning";
  let word = pickWeighted(PET_WORDS, type, new Set());
  if (!word) word = pickWeighted(PET_WORDS, "meaning", new Set());
  return { type, word };
}

function beginQuestion(type, word) {
  if (!session || !word) return;
  session.question = null;
  if (world) world.setInteractive(false);
  const durationBase = { meaning: 12, cloze: 14, dictation: 19, sentence: 0, boss: 11 }[type] || 12;
  const difficulty = session.mode === "campaign" ? sectorDifficulty(session.themeIndex) : 0;
  const duration = type === "sentence"
    ? 0
    : Math.max(6, durationBase - difficulty + (save.pilot.upgrades.time || 0) * 0.5);
  const question = {
    type,
    word,
    options: [],
    correctIndex: -1,
    answered: false,
    duration,
    timeLeft: duration,
    hintUsed: false,
    attempts: 0,
    blankIndex: -1,
    disabled: new Set(),
  };
  session.question = question;
  session.nodeStartedAt = performance.now();
  document.body.classList.toggle("console-open", type === "dictation" || type === "sentence");

  if (type === "meaning" || type === "boss") {
    const made = makeOptions(word, type);
    question.options = made.options;
    question.correctIndex = made.correctIndex;
    if (world) {
      world.showTargets(question.options);
      world.setInteractive(true);
    }
    const kicker = type === "boss" ? `词王核心 · HIT ${session.bossAsked + 1}` : "意义锁定";
    setPrompt({
      kicker,
      main: escapeHtml(word.zh),
      sub: "点击场景中的目标晶体，或按数字键 1–4",
      pos: word.pos,
      extra: "",
    });
  } else if (type === "cloze") {
    const made = makeOptions(word, type);
    question.options = made.options;
    question.correctIndex = made.correctIndex;
    const blanked = blankSentence(word);
    question.blankIndex = blanked?.index ?? -1;
    let main = "选择最符合语境的词";
    if (blanked) {
      main = blanked.tokens.map((token, index) => {
        if (index !== blanked.index) return escapeHtml(token);
        const punctuation = token.match(/[.,!?;:]+$/)?.[0] || "";
        return `<span class="blank-word" id="cloze-blank">____</span>${escapeHtml(punctuation)}`;
      }).join(" ");
    }
    if (world) {
      world.showTargets(question.options);
      world.setInteractive(true);
    }
    setPrompt({
      kicker: "语境填空",
      main,
      sub: "根据上下文选择正确单词 · 提示可查看中文",
      pos: "",
      extra: "",
      cls: "cloze-mode",
    });
  } else if (type === "dictation") {
    session.dictation = buildDictation(word);
    setPrompt({
      kicker: "听写解码",
      main: "听发音，补全缺失字母",
      sub: "点击重听或按空格；填完按 Enter 检查",
      pos: word.pos,
      extra: `<div class="sentence-zh">中文提示：${escapeHtml(word.zh)} · 缺失约 30% 字母</div>`,
    });
    showDictationConsole();
    later(() => {
      if (session?.question === question && !question.answered) audio.playWord(word);
    }, 420);
    later(() => {
      const first = $("dictation-slots")?.querySelector("input");
      first?.focus({ preventScroll: true });
    }, 700);
  } else if (type === "sentence") {
    session.sentence = buildSentence(word);
    setPrompt({
      kicker: "语序重构",
      main: "把词块排成一句完整的话",
      sub: "按顺序点击词块；点击已放入的词块可撤回",
      pos: "",
      extra: `<div class="sentence-zh">TARGET <b>${escapeHtml(word.w)}</b> · ${escapeHtml(word.zh)}</div>`,
      timer: false,
      cls: "sentence-mode",
    });
    showSentenceConsole();
  }
  renderHUD();
  updateTimerBar();
}

function updateTimerBar() {
  if (!session?.question) return;
  const question = session.question;
  const fill = $("timer-fill");
  if (!fill) return;
  if (!question.duration) {
    fill.style.width = "100%";
    fill.classList.remove("low");
    return;
  }
  const ratio = clamp(question.timeLeft / question.duration, 0, 1);
  fill.style.width = `${ratio * 100}%`;
  fill.classList.toggle("low", ratio < 0.3);
}


/* ============================================================
   Dictation
   ============================================================ */
function buildDictation(word) {
  const chars = [...word.w.toLowerCase()];
  const letterPositions = chars.map((char, index) => (/[a-z]/.test(char) ? index : -1)).filter((index) => index >= 0);
  const blankCount = Math.max(1, Math.round(letterPositions.length * 0.3));
  let candidates = letterPositions.filter((index) => index > 0);
  if (candidates.length < blankCount) candidates = [...letterPositions];
  const blanks = shuffle(candidates).slice(0, blankCount);
  const blankSet = new Set(blanks);
  return { word, chars, blankSet, blanks };
}

function showDictationConsole() {
  $("console-dictation")?.classList.remove("hidden");
  $("console-sentence")?.classList.add("hidden");
  renderDictationSlots();
}

function renderDictationSlots() {
  const data = session?.dictation;
  const node = $("dictation-slots");
  if (!data || !node) return;
  node.innerHTML = data.chars.map((char, index) => {
    if (data.blankSet.has(index)) {
      return `<input class="slot blank" data-slot="${index}" maxlength="1" inputmode="text" autocomplete="off" autocapitalize="none" spellcheck="false" aria-label="第 ${index + 1} 个字母" />`;
    }
    if (char === " ") return '<span class="slot fixed">·</span>';
    return `<span class="slot fixed">${escapeHtml(char)}</span>`;
  }).join("");
  const inputs = [...node.querySelectorAll("input[data-slot]")];
  inputs.forEach((input, index) => {
    input.addEventListener("input", (event) => {
      const value = event.target.value.toLowerCase().replace(/[^a-z]/g, "").slice(-1);
      event.target.value = value;
      event.target.classList.toggle("filled", !!value);
      if (value && index < inputs.length - 1) inputs[index + 1].focus({ preventScroll: true });
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" && !event.target.value) {
        event.preventDefault();
        inputs[Math.max(0, index - 1)]?.focus({ preventScroll: true });
      } else if (event.key === "Enter") {
        event.preventDefault();
        checkDictation();
      } else if (event.key === " ") {
        event.preventDefault();
        audio.playWord(session?.dictation?.word || session?.question?.word);
      }
    });
    input.addEventListener("paste", (event) => {
      event.preventDefault();
      const text = (event.clipboardData?.getData("text") || "").toLowerCase().replace(/[^a-z]/g, "");
      if (!text) return;
      if (text.length === inputs.length) {
        inputs.forEach((item, itemIndex) => {
          item.value = text[itemIndex] || "";
          item.classList.toggle("filled", !!item.value);
        });
      } else {
        const word = session?.dictation?.word?.w?.toLowerCase() || "";
        inputs.forEach((item, itemIndex) => {
          const slot = Number(item.dataset.slot);
          if (word[slot]) {
            item.value = word[slot];
            item.classList.toggle("filled", true);
          }
        });
      }
    });
  });
  later(() => inputs[0]?.focus({ preventScroll: true }), 120);
}

function checkDictation() {
  if (!session?.question || session.question.type !== "dictation" || session.question.answered) return;
  const question = session.question;
  const data = session.dictation;
  if (!data) return;
  const inputs = [...$("dictation-slots").querySelectorAll("input[data-slot]")];
  if (inputs.some((input) => !input.value)) {
    audio.warn();
    $("dictation-slots").classList.add("shake");
    setTimeout(() => $("dictation-slots").classList.remove("shake"), 450);
    return;
  }
  const assembled = data.chars.map((char, index) => (data.blankSet.has(index) ? inputs.find((input) => Number(input.dataset.slot) === index)?.value || "" : char)).join("");
  const correct = assembled === data.word.w.toLowerCase();
  question.answered = true;
  inputs.forEach((input) => { input.disabled = true; });
  if (correct) {
    inputs.forEach((input) => input.classList.add("correct"));
    const perfect = question.duration > 0 && question.timeLeft / question.duration >= 0.55 && !question.hintUsed;
    const result = commitCorrect({
      word: data.word,
      type: "dictation",
      base: 170,
      perfect,
    });
    if (world) world.burst(new THREE.Vector3(0, 3.4, 0.5), currentTheme().color, 44, 3.2);
    showFeedback(perfect ? `PERFECT +${result.gain}` : `解码成功 +${result.gain}`, `${data.word.w} · ${data.word.zh}`, "good");
    showScorePop(`+${result.gain}`);
    audio.hit(session.combo);
    audio.playWord(data.word);
    later(advance, 1100);
  } else {
    inputs.forEach((input) => {
      input.classList.add("wrong");
      const slot = Number(input.dataset.slot);
      input.value = data.word.w[slot] || "";
    });
    const result = commitWrong({ word: data.word, type: "dictation" });
    showFeedback("听写未通过 · 护盾 -1", `正确答案：${data.word.w} · ${data.word.zh}`, "bad");
    revealPromptAnswer(data.word);
    audio.wrong();
    audio.playWord(data.word);
    if (result.dead) {
      later(() => finishSession(false, "shields"), 1500);
    } else {
      later(advance, 1600);
    }
  }
}

/* ============================================================
   Sentence building
   ============================================================ */
function buildSentence(word) {
  const tokens = sentenceTokens(word.ex);
  const correctItems = tokens.map((token, index) => ({ id: index, token }));
  let shuffled = shuffle(correctItems);
  if (shuffled.map((item) => item.id).join(",") === correctItems.map((item) => item.id).join(",") && shuffled.length > 1) {
    shuffled = [...shuffled.slice(1), shuffled[0]];
  }
  return {
    word,
    tokens,
    correctItems,
    bank: shuffled,
    line: [],
    attempts: 0,
    hintUsed: false,
    solved: false,
    reveal: false,
  };
}

function showSentenceConsole() {
  $("console-sentence")?.classList.remove("hidden");
  $("console-dictation")?.classList.add("hidden");
  renderSentenceChips();
}

function renderSentenceChips() {
  const data = session?.sentence;
  if (!data) return;
  const lineNode = $("sentence-line");
  const bankNode = $("chip-bank");
  if (!lineNode || !bankNode) return;
  if (!data.line.length) {
    lineNode.innerHTML = '<span class="sentence-placeholder">按顺序点击下方词块…</span>';
  } else {
    lineNode.innerHTML = data.line.map((item) => (
      `<button class="chip placed ${data.reveal && data.solved ? "correct" : ""}" data-chip="${item.id}">${escapeHtml(item.token)}</button>`
    )).join("");
  }
  bankNode.innerHTML = data.bank.map((item) => (
    `<button class="chip" data-chip="${item.id}">${escapeHtml(item.token)}</button>`
  )).join("");
  if ($("sentence-target")) {
    $("sentence-target").innerHTML = `TARGET <b>${escapeHtml(data.word.w)}</b> · ${escapeHtml(data.word.zh)}`;
  }
}

function moveSentenceChip(id, fromLine) {
  const data = session?.sentence;
  if (!data || data.solved) return;
  if (fromLine) {
    const index = data.line.findIndex((item) => item.id === id);
    if (index >= 0) {
      const [item] = data.line.splice(index, 1);
      data.bank.push(item);
    }
  } else {
    const index = data.bank.findIndex((item) => item.id === id);
    if (index >= 0) {
      const [item] = data.bank.splice(index, 1);
      data.line.push(item);
    }
  }
  audio.ui();
  renderSentenceChips();
}

function checkSentence() {
  if (!session?.question || session.question.type !== "sentence" || session.question.answered) return;
  const data = session.sentence;
  if (!data) return;
  if (data.line.length !== data.tokens.length) {
    audio.warn();
    toast("还差一些词块", "请把所有词块按顺序放入句子。", "bad");
    return;
  }
  const answer = data.line.map((item) => item.token).join(" ");
  const correctAnswer = data.tokens.join(" ");
  data.attempts += 1;
  if (answer === correctAnswer) {
    data.solved = true;
    session.question.answered = true;
    data.line = [...data.correctItems];
    data.bank = [];
    renderSentenceChips();
    const perfect = data.attempts === 1 && !data.hintUsed;
    const result = commitCorrect({
      word: data.word,
      type: "sentence",
      base: 210,
      perfect,
    });
    if (world) world.burst(new THREE.Vector3(0, 3.6, 0.4), currentTheme().color2, 60, 4);
    showFeedback(perfect ? `PERFECT +${result.gain}` : `语序正确 +${result.gain}`, data.tokens.join(" "), "good");
    showScorePop(`+${result.gain}`);
    audio.sentence();
    audio.playWord(data.word);
    audio.speak(correctAnswer, { rate: 0.86 });
    later(advance, 1900);
    return;
  }
  if (data.attempts >= 2) {
    data.solved = true;
    session.question.answered = true;
    data.reveal = true;
    data.line = [...data.correctItems];
    data.bank = [];
    renderSentenceChips();
    const result = commitWrong({ word: data.word, type: "sentence", shield: false });
    showFeedback("语序未通过", `正确语序：${correctAnswer}`, "bad");
    audio.wrong();
    audio.speak(correctAnswer, { rate: 0.84 });
    if (result.dead) later(() => finishSession(false, "shields"), 1500);
    else later(advance, 2200);
  } else {
    const wrongNode = $("sentence-line");
    wrongNode?.classList.add("shake");
    setTimeout(() => wrongNode?.classList.remove("shake"), 450);
    audio.warn();
    toast("语序还差一点", "再调整一下，或点“提示”查看下一个词。", "bad");
  }
}

function hintSentence() {
  const data = session?.sentence;
  if (!data || data.solved) return false;
  const current = data.line.map((item) => item.id);
  const correct = data.correctItems.map((item) => item.id);
  const nextIndex = current.findIndex((id, index) => id !== correct[index]);
  const wantedId = correct[nextIndex >= 0 ? nextIndex : current.length];
  const chip = $("chip-bank")?.querySelector(`[data-chip="${wantedId}"]`);
  if (chip) {
    chip.classList.add("hint");
    setTimeout(() => chip.classList.remove("hint"), 2400);
    data.hintUsed = true;
    return true;
  }
  return false;
}

/* ============================================================
   Answer / scoring
   ============================================================ */
function recordAnswer(word, type, correct, chosen = null, timeout = false) {
  if (!session) return;
  session.answers.push({ w: word.w, type, correct, chosen: chosen?.w || null, timeout });
}

function markWord(word, correct, type) {
  const progress = save.progress[word.w] || {
    seen: 0, correct: 0, wrong: 0, streak: 0, mastery: 0, last: 0,
  };
  const wasNew = progress.seen === 0;
  const oldMastery = progress.mastery || 0;
  progress.seen += 1;
  if (correct) {
    progress.correct += 1;
    progress.streak = (progress.streak || 0) + 1;
  } else {
    progress.wrong += 1;
    progress.streak = 0;
  }
  progress.mastery = clamp(Math.round(progress.correct * 13 + progress.streak * 6 - progress.wrong * 10), 0, 100);
  progress.last = Date.now();
  save.progress[word.w] = progress;
  save.stats.answers += 1;
  save.daily.answers = (save.daily.answers || 0) + 1;
  if (correct) {
    save.stats.correct += 1;
    if (type === "dictation") save.stats.dictations += 1;
    if (type === "sentence") save.stats.sentences += 1;
    if (type === "cloze") save.stats.clozes += 1;
    if (wasNew) save.daily.newWords = (save.daily.newWords || 0) + 1;
  } else {
    save.stats.wrong += 1;
  }
  return { wasNew, masteredNow: oldMastery < 80 && progress.mastery >= 80 };
}

function commitCorrect({ word, type, base, perfect }) {
  const multiplier = comboMultiplier(session.combo);
  const gain = Math.round(base * multiplier * (perfect ? 1.4 : 1) * (1 + (save.pilot.upgrades.power || 0) * 0.08));
  const xp = Math.round((base / 12 + (perfect ? 5 : 0)) * (1 + (save.pilot.upgrades.xp || 0) * 0.1));
  session.combo += 1;
  session.maxCombo = Math.max(session.maxCombo, session.combo);
  save.stats.bestCombo = Math.max(save.stats.bestCombo, session.maxCombo);
  session.correct += 1;
  session.score += gain;
  session.xpEarned += xp;
  if (perfect) {
    session.perfects += 1;
    save.stats.perfects += 1;
  }
  const progressResult = markWord(word, true, type);
  if (progressResult.wasNew) session.newWords += 1;
  if (progressResult.masteredNow) session.newlyMastered += 1;
  const levels = addXp(xp);
  if (levels.length) session.levelUps.push(...levels);
  recordAnswer(word, type, true);
  const unlocked = checkAchievements();
  if (unlocked.length) session.achievements.push(...unlocked);
  renderHUD();
  persist();
  return { gain, xp, perfect, multiplier };
}

function commitWrong({ word, type, shield = true }) {
  session.combo = 0;
  session.wrong += 1;
  markWord(word, false, type);
  const hadShield = session.maxShields > 0;
  if (shield && hadShield) session.shields = Math.max(0, session.shields - 1);
  recordAnswer(word, type, false);
  renderHUD();
  persist();
  return { dead: hadShield && shield && session.shields <= 0 };
}

function showFeedback(title, body = "", kind = "good") {
  const node = $("feedback");
  if (!node) return;
  node.classList.remove("hidden", "good", "bad", "show");
  node.classList.add(kind);
  $("feedback-title").textContent = title;
  $("feedback-body").textContent = body;
  void node.offsetWidth;
  node.classList.add("show");
}

function hideFeedback() {
  const node = $("feedback");
  if (!node) return;
  node.classList.remove("show", "good", "bad");
  node.classList.add("hidden");
}

function hideConsoles() {
  $("console-dictation")?.classList.add("hidden");
  $("console-sentence")?.classList.add("hidden");
  document.body.classList.remove("console-open");
}

function showScorePop(text, bad = false) {
  const node = $("score-pop");
  if (!node) return;
  node.textContent = text;
  node.classList.remove("pop", "bad");
  if (bad) node.classList.add("bad");
  void node.offsetWidth;
  node.classList.add("pop");
}

function flashScreen(kind) {
  const node = $("flash");
  if (!node) return;
  node.className = "flash";
  void node.offsetWidth;
  node.className = `flash ${kind}`;
}

function revealPromptAnswer(word) {
  const blank = $("cloze-blank");
  if (blank) {
    blank.textContent = word.w;
    blank.classList.add("revealed");
  }
  const extra = $("prompt-extra");
  if (extra) {
    extra.innerHTML = `<div class="sentence-zh">正确答案：<b>${escapeHtml(word.w)}</b> · ${escapeHtml(word.zh)}</div>`;
    extra.classList.remove("hidden");
  }
}

function handleChoice(index) {
  if (!session?.question || session.question.answered || session.paused || session.finished || overlayOpen) return;
  const question = session.question;
  if (!["meaning", "cloze", "boss"].includes(question.type)) return;
  if (question.disabled?.has(index)) return;
  const chosen = question.options[index];
  if (!chosen) return;
  question.answered = true;
  if (world) world.setInteractive(false);
  audio.shoot();
  if (world) world.shoot(index);
  const correct = chosen.w === question.word.w;
  if (correct) {
    const perfect = question.duration > 0 && question.timeLeft / question.duration >= 0.55 && !question.hintUsed;
    const result = commitCorrect({
      word: question.word,
      type: question.type,
      base: question.type === "boss" ? 220 : question.type === "cloze" ? 125 : 100,
      perfect,
    });
    if (world) {
      world.pulseCorrect(index);
      later(() => world.explode(index), 110);
    }
    $("prompt")?.classList.add("good");
    const synonymLine = question.word.syn?.length ? ` · ≈ ${question.word.syn.join(" / ")}` : "";
    showFeedback(perfect ? `PERFECT +${result.gain}` : `命中 +${result.gain}`, `${question.word.w} · ${question.word.zh}${synonymLine}`, "good");
    showScorePop(`+${result.gain}`);
    flashScreen("good");
    audio.hit(session.combo);
    later(() => audio.playWord(question.word), 160);
    if (session.mode === "sprint") {
      session.sprintLeft = Math.min(120, session.sprintLeft + 2.5);
    }
    if (question.type === "boss") {
      session.bossAsked += 1;
      session.bossHp = Math.max(0, session.bossHp - 1);
      if (world) world.damageBoss();
      updateBossBar();
      if (session.bossHp <= 0) {
        if (world) world.defeatBoss();
        save.stats.bosses += 1;
        showFeedback("词王核心已击破", `+${result.gain} · 星域净化`, "good");
        later(() => finishSession(true, "boss"), 1500);
      } else if (session.bossAsked >= session.bossWords.length) {
        later(() => finishSession(false, "boss"), 1400);
      } else {
        later(() => beginQuestion("boss", session.bossWords[session.bossAsked]), 950);
      }
    } else {
      later(advance, 900);
    }
  } else {
    if (world) {
      world.pulseWrong(index);
      if (question.correctIndex >= 0) world.pulseCorrect(question.correctIndex);
    }
    $("prompt")?.classList.add("bad");
    const result = commitWrong({ word: question.word, type: question.type });
    showFeedback("未命中 · 护盾 -1", `正确答案：${question.word.w} · ${question.word.zh}`, "bad");
    revealPromptAnswer(question.word);
    showScorePop("MISS", true);
    flashScreen("bad");
    audio.wrong();
    later(() => audio.playWord(question.word), 260);
    if (session.mode === "sprint") {
      session.sprintLeft -= 4;
      if (session.sprintLeft <= 0) {
        session.sprintLeft = 0;
        later(() => finishSession(true, "time"), 900);
      } else {
        later(advance, 1250);
      }
    } else if (question.type === "boss") {
      session.bossAsked += 1;
      updateBossBar();
      if (result.dead) later(() => finishSession(false, "shields"), 1400);
      else if (session.bossAsked >= session.bossWords.length) later(() => finishSession(false, "boss"), 1400);
      else later(() => beginQuestion("boss", session.bossWords[session.bossAsked]), 1500);
    } else {
      later(advance, 1550);
    }
  }
}

function handleTimeout() {
  if (!session?.question || session.question.answered) return;
  const question = session.question;
  question.answered = true;
  if (world) world.setInteractive(false);
  if (question.type === "sentence") return;
  const result = commitWrong({ word: question.word, type: question.type });
  $("prompt")?.classList.add("bad");
  showFeedback("时间到 · 护盾 -1", `正确答案：${question.word.w} · ${question.word.zh}`, "bad");
  revealPromptAnswer(question.word);
  flashScreen("bad");
  audio.wrong();
  audio.playWord(question.word);
  if (question.type === "boss") {
    session.bossAsked += 1;
    updateBossBar();
    if (result.dead) later(() => finishSession(false, "shields"), 1400);
    else if (session.bossAsked >= session.bossWords.length) later(() => finishSession(false, "boss"), 1400);
    else later(() => beginQuestion("boss", session.bossWords[session.bossAsked]), 1500);
  } else if (session.mode === "sprint") {
    session.sprintLeft -= 4;
    if (session.sprintLeft <= 0) later(() => finishSession(true, "time"), 900);
    else later(advance, 1300);
  } else {
    if (result.dead) later(() => finishSession(false, "shields"), 1400);
    else later(advance, 1550);
  }
}

function advance() {
  if (!session || session.finished) return;
  if (session.dynamic) {
    showNode(session.index + 1);
    return;
  }
  if (session.index + 1 >= session.plan.length) {
    finishSession(true, "complete");
  } else {
    showNode(session.index + 1);
  }
}

/* ============================================================
   Hints
   ============================================================ */
function useHint() {
  if (!session?.question || session.question.answered || session.paused || session.finished) return;
  if (session.hintsLeft <= 0) {
    toast("提示已用完", "升级“解码辅助”模块可获得更多提示。", "bad");
    return;
  }
  const question = session.question;
  let used = false;
  if (["meaning", "cloze", "boss"].includes(question.type)) {
    const wrongIndex = question.options.findIndex((option, index) => option.w !== question.word.w && world?.targets[index]?.group.visible);
    if (wrongIndex >= 0 && world) {
      world.disableTarget(wrongIndex);
      question.disabled?.add(wrongIndex);
      used = true;
    }
    if (question.type === "cloze") {
      const extra = $("prompt-extra");
      if (extra) {
        extra.innerHTML = `<div class="hint-line">中文释义：${escapeHtml(question.word.zh)}</div>`;
        extra.classList.remove("hidden");
      }
      used = true;
    }
  } else if (question.type === "dictation") {
    const inputs = [...$("dictation-slots").querySelectorAll("input[data-slot]")].filter((input) => !input.value && !input.disabled);
    if (inputs.length) {
      const input = inputs[0];
      const slot = Number(input.dataset.slot);
      input.value = question.word.w[slot]?.toLowerCase() || "";
      input.readOnly = true;
      input.classList.add("correct");
      input.classList.remove("blank");
      used = true;
    }
  } else if (question.type === "sentence") {
    used = hintSentence();
  }
  if (!used) return;
  session.hintsLeft -= 1;
  session.hintsUsed += 1;
  session.score = Math.max(0, session.score - 30);
  question.hintUsed = true;
  audio.ui();
  renderHUD();
  toast("提示已使用", "本题得分 -30 · 不影响继续答题。");
}

/* ============================================================
   Pause / finish / result
   ============================================================ */
function pauseGame() {
  if (!session || session.finished) return;
  session.paused = true;
  const stats = $("pause-stats");
  if (stats) {
    stats.innerHTML = `
      <div><b>${formatNum(session.score)}</b>得分</div>
      <div><b>${session.maxCombo}</b>最高连击</div>
      <div><b>${session.correct}</b>命中</div>
    `;
  }
  const soundButton = $("btn-pause-sound");
  if (soundButton) soundButton.textContent = `音效：${save.settings.sfx ? "ON" : "OFF"}`;
  openOverlay("pause");
}

function resumeGame() {
  if (!session) return;
  session.paused = false;
  lastFrame = performance.now();
  $("overlay-pause").classList.add("hidden");
  overlayOpen = null;
}

function quitToHome() {
  clearTimers();
  session = null;
  overlayOpen = null;
  overlayReturn = null;
  hideAllOverlays();
  $("hud").classList.add("hidden");
  $("learn")?.classList.add("hidden");
  $("learn-match")?.classList.add("hidden");
  $("learn-done")?.classList.add("hidden");
  learn = null;
  $("home").classList.remove("hidden");
  document.body.classList.remove("console-open");
  if (world) {
    world.exitLab();
    world.hideTargets();
    world.hideBoss();
    world.setInteractive(false);
    world.showCockpit(false);
    world.setTheme(currentTheme(), { animate: true });
  }
  updateHome();
}

function finishSession(success, reason = "complete") {
  if (!session || session.finished || session.finishing) return;
  session.finishing = true;
  clearTimers();
  if (world) {
    world.setInteractive(false);
    world.hideTargets();
    world.hideBoss();
    world.showCockpit(false);
  }
  hideConsoles();
  hideFeedback();
  const finished = session;
  finished.finished = true;
  const totalAnswers = finished.correct + finished.wrong;
  const accuracy = totalAnswers ? Math.round((finished.correct / totalAnswers) * 100) : 0;
  let stars = 0;
  if (success) {
    if (finished.mode === "sprint") {
      stars = finished.score >= 2500 ? 3 : finished.score >= 1500 ? 2 : finished.score >= 800 ? 1 : 0;
    } else {
      stars = accuracy >= 90 ? 3 : accuracy >= 75 ? 2 : 1;
    }
  }
  let bonusXp = 0;
  if (success) {
    if (finished.mode === "campaign") {
      bonusXp = 180 + stars * 90;
      const record = save.sectors[finished.theme.id] || { cleared: false, stars: 0, best: 0, plays: 0 };
      const wasCleared = record.cleared;
      record.cleared = true;
      record.stars = Math.max(record.stars || 0, stars);
      record.best = Math.max(record.best || 0, finished.score);
      record.plays = (record.plays || 0) + 1;
      save.sectors[finished.theme.id] = record;
      save.stats.sectorsCleared = Object.values(save.sectors).filter((item) => item.cleared).length;
      if (!wasCleared) {
        finished.unlockedNext = THEMES[finished.themeIndex + 1]?.name || "";
      }
    } else {
      bonusXp = 80;
      save.best[finished.mode] = Math.max(save.best[finished.mode] || 0, finished.score);
    }
    save.daily.missions = (save.daily.missions || 0) + 1;
  }
  if (bonusXp) {
    const levels = addXp(bonusXp);
    if (levels.length) finished.levelUps.push(...levels);
    finished.xpEarned += bonusXp;
  }
  const unlocked = checkAchievements();
  if (unlocked.length) finished.achievements.push(...unlocked);
  persist();

  const wrongMap = new Map();
  for (const answer of finished.answers) {
    if (!answer.correct && !wrongMap.has(answer.w)) {
      const word = WORDS.find((item) => item.w === answer.w);
      if (word) wrongMap.set(answer.w, word);
    }
  }
  const endLevel = save.pilot.level;
  const startRank = finished.startRank;
  const endRank = rankFor(endLevel).name;
  const primary = success && finished.mode === "campaign" && finished.themeIndex + 1 < THEMES.length
    ? { type: "next", themeId: THEMES[finished.themeIndex + 1].id }
    : success && finished.mode === "campaign"
      ? { type: "home" }
      : { type: "retry" };

  const result = {
    success,
    reason,
    stars,
    mode: finished.mode,
    themeId: finished.theme.id,
    theme: finished.theme,
    score: finished.score,
    accuracy,
    maxCombo: finished.maxCombo,
    correct: finished.correct,
    wrong: finished.wrong,
    xpEarned: finished.xpEarned,
    newWords: finished.newWords,
    newlyMastered: finished.newlyMastered,
    duration: Math.max(1, Math.round((Date.now() - finished.startTime) / 1000)),
    levelUps: [...new Set(finished.levelUps)],
    endLevel,
    startLevel: finished.startLevel,
    rankUp: endRank !== startRank ? endRank : null,
    wrongWords: [...wrongMap.values()],
    achievements: finished.achievements,
    primary,
  };
  $("hud").classList.add("hidden");
  overlayOpen = null;
  renderResult(result);
  $("overlay-result").classList.remove("hidden");
  session = null;
  if (success) audio.level();
}

function renderResult(result) {
  const isCampaign = result.mode === "campaign";
  const title = result.success
    ? isCampaign ? "星域已净化" : result.mode === "sprint" ? "突围结束" : "训练完成"
    : result.reason === "shields" ? "护盾耗尽" : result.reason === "boss" ? "词王仍在" : "任务中断";
  const kicker = result.success ? "MISSION COMPLETE" : "MISSION FAILED";
  $("levelup-toast")?.classList.add("hidden");
  if ($("result-kicker")) $("result-kicker").textContent = kicker;
  if ($("result-title")) $("result-title").textContent = title;
  if ($("result-banner")) $("result-banner").style.background = `linear-gradient(90deg, transparent, ${result.theme.color}, ${result.theme.color2}, transparent)`;
  const stars = $("result-stars");
  if (stars) {
    stars.innerHTML = Array.from({ length: 3 }, (_, index) => (
      `<i class="${index < result.stars ? "" : "off"}">★</i>`
    )).join("");
  }
  if ($("result-score")) $("result-score").textContent = formatNum(result.score);
  if ($("result-stats")) {
    $("result-stats").innerHTML = `
      <div><b>${result.accuracy}%</b><span>正确率</span></div>
      <div><b>${result.maxCombo}</b><span>最高连击</span></div>
      <div><b>${result.newlyMastered || result.newWords}</b><span>新掌握</span></div>
      <div><b>${Math.floor(result.duration / 60)}:${String(result.duration % 60).padStart(2, "0")}</b><span>用时</span></div>
    `;
  }
  const levelNode = $("result-levelup");
  if (levelNode) {
    if (result.levelUps.length || result.rankUp) {
      levelNode.classList.remove("hidden");
      levelNode.innerHTML = `
        <b>LEVEL UP // LV.${result.endLevel}</b>
        ${result.rankUp ? `军衔晋升：${escapeHtml(result.rankUp)}<br />` : ""}
        获得 ${result.levelUps.length} 个模块点 · 返回基地即可升级舰载模块。
      `;
    } else {
      levelNode.classList.add("hidden");
      levelNode.innerHTML = "";
    }
  }
  const wrongList = $("result-wrong-list");
  if (wrongList) {
    if (!result.wrongWords.length) {
      wrongList.innerHTML = '<div class="wrong-empty">全部命中。<br />这次没有需要回收的错词。</div>';
    } else {
      wrongList.innerHTML = result.wrongWords.slice(0, 8).map((word) => `
        <div class="wrong-item">
          <div class="wi-copy"><b>${escapeHtml(word.w)}</b><span>${escapeHtml(word.zh)}${word.syn?.length ? ` · ≈ ${escapeHtml(word.syn.join(" / "))}` : ""}${word.ex ? `<br />${escapeHtml(word.ex)}` : ""}</span></div>
          <button class="wc-audio" data-speak-word="${escapeHtml(word.w)}" aria-label="播放发音">▶</button>
        </div>
      `).join("");
    }
    if ($("result-wrong-count")) $("result-wrong-count").textContent = `${result.wrongWords.length} 词`;
  }
  const achievements = $("result-achievements");
  if (achievements) {
    if (result.achievements.length) {
      achievements.classList.remove("hidden");
      achievements.innerHTML = result.achievements.map((item) => `<span>✦ ${escapeHtml(item.name)}</span>`).join("");
    } else {
      achievements.classList.add("hidden");
      achievements.innerHTML = "";
    }
  }
  const primary = $("btn-result-primary");
  if (primary) {
    primary.textContent = result.primary.type === "next" ? "下一星域 →" : result.primary.type === "home" ? "返回基地" : "再次挑战";
  }
  const retry = $("btn-result-retry");
  if (retry) {
    retry.textContent = result.primary.type === "next" ? "重打本关" : "再来一次";
    retry.style.display = result.primary.type === "retry" ? "none" : "";
  }
  $("overlay-result")?.classList.remove("hidden");
}

/* ============================================================
   Global input / loop
   ============================================================ */
function isTypingTarget(target) {
  return target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (overlayOpen) {
      if (overlayOpen === "pause" && session?.paused) resumeGame();
      else closeOverlay();
      event.preventDefault();
      return;
    }
    if (session && !session.finished) {
      if (session.paused) resumeGame();
      else pauseGame();
      event.preventDefault();
    }
    return;
  }
  if (overlayOpen || !session || session.paused || session.finished) return;
  if (event.key >= "1" && event.key <= "4") {
    if (isTypingTarget(document.activeElement)) return;
    const index = Number(event.key) - 1;
    if (session.question && ["meaning", "cloze", "boss"].includes(session.question.type)) {
      event.preventDefault();
      handleChoice(index);
    }
    return;
  }
  if (event.key === " " && session.question?.type === "dictation") {
    event.preventDefault();
    audio.playWord(session.question.word);
    return;
  }
  if (event.key === "Enter") {
    if (session.question?.type === "dictation") {
      event.preventDefault();
      checkDictation();
    } else if (session.question?.type === "sentence") {
      event.preventDefault();
      checkSentence();
    }
    return;
  }
  if (event.key.toLowerCase() === "h") {
    event.preventDefault();
    useHint();
  }
});

/* Pointer interaction on the 3D canvas */
let pointerDown = false;
let pointerMoved = false;
let pointerStartX = 0;
let pointerStartY = 0;
let pointerLastX = 0;

$("canvas")?.addEventListener("pointerdown", (event) => {
  if (!session?.question || session.paused || session.finished) return;
  if (!["meaning", "cloze", "boss"].includes(session.question.type)) return;
  pointerDown = true;
  pointerMoved = false;
  pointerStartX = event.clientX;
  pointerStartY = event.clientY;
  pointerLastX = event.clientX;
  try { $("canvas").setPointerCapture(event.pointerId); } catch (error) { /* noop */ }
});

$("canvas")?.addEventListener("pointermove", (event) => {
  if (!session?.question || session.paused || session.finished) return;
  if (pointerDown) {
    const dx = event.clientX - pointerLastX;
    pointerLastX = event.clientX;
    if (Math.abs(event.clientX - pointerStartX) > 8 || Math.abs(event.clientY - pointerStartY) > 8) pointerMoved = true;
    if (pointerMoved && world) world.setOrbit(world.orbitTarget + dx * 0.004);
    return;
  }
  if (["meaning", "cloze", "boss"].includes(session.question.type) && world) {
    world.setHover(world.pick(event.clientX, event.clientY));
  }
});

$("canvas")?.addEventListener("pointerup", (event) => {
  if (!pointerDown) return;
  pointerDown = false;
  if (!session || session.paused || session.finished) return;
  if (!pointerMoved && world && ["meaning", "cloze", "boss"].includes(session.question?.type)) {
    const index = world.pick(event.clientX, event.clientY);
    if (index >= 0) handleChoice(index);
    else if (world) world.setOrbit(0);
  }
});

$("canvas")?.addEventListener("pointerleave", () => {
  pointerDown = false;
  if (world) world.setHover(-1);
});

$("canvas")?.addEventListener("contextmenu", (event) => event.preventDefault());

$("btn-pause")?.addEventListener("click", () => pauseGame());
$("btn-resume")?.addEventListener("click", () => resumeGame());
$("btn-restart")?.addEventListener("click", () => {
  if (!session) return;
  const mode = session.mode;
  const themeId = session.theme.id;
  clearTimers();
  session = null;
  $("overlay-pause").classList.add("hidden");
  overlayOpen = null;
  startSession(mode, themeId);
});
$("btn-quit")?.addEventListener("click", () => quitToHome());
$("btn-pause-library")?.addEventListener("click", () => openOverlay("library", { returnTo: "pause" }));
$("btn-pause-sound")?.addEventListener("click", () => {
  save.settings.sfx = !save.settings.sfx;
  audio.setSfx(save.settings.sfx);
  updateSoundButton();
  persist();
  if ($("btn-pause-sound")) $("btn-pause-sound").textContent = `音效：${save.settings.sfx ? "ON" : "OFF"}`;
});
$("btn-hint")?.addEventListener("click", () => useHint());
$("btn-replay")?.addEventListener("click", () => audio.playWord(session?.question?.word));
$("btn-slow")?.addEventListener("click", () => {
  const slow = audio.rate === 1;
  audio.rate = slow ? 0.75 : 1;
  if ($("btn-slow")) $("btn-slow").textContent = slow ? "1.0×" : "0.8×";
  audio.playWord(session?.question?.word, { rate: audio.rate });
});
$("btn-check-dictation")?.addEventListener("click", () => checkDictation());
$("btn-check-sentence")?.addEventListener("click", () => checkSentence());
$("btn-undo")?.addEventListener("click", () => {
  if (!session?.sentence) return;
  const data = session.sentence;
  const item = data.line.pop();
  if (item) data.bank.push(item);
  renderSentenceChips();
  audio.ui();
});
$("btn-reset-sentence")?.addEventListener("click", () => {
  if (!session?.sentence) return;
  const data = session.sentence;
  data.bank.push(...data.line);
  data.line = [];
  renderSentenceChips();
  audio.ui();
});
$("btn-hint-sentence")?.addEventListener("click", () => {
  if (!session?.question || session.question.answered) return;
  if (session.hintsLeft <= 0) {
    toast("提示已用完", "升级“解码辅助”可增加提示次数。", "bad");
    return;
  }
  if (!hintSentence()) return;
  session.hintsLeft -= 1;
  session.hintsUsed += 1;
  session.question.hintUsed = true;
  session.score = Math.max(0, session.score - 30);
  renderHUD();
  toast("已标出下一个词块", "本题得分 -30。");
});
$("chip-bank")?.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-chip]");
  if (!chip) return;
  moveSentenceChip(Number(chip.dataset.chip), false);
});
$("sentence-line")?.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-chip]");
  if (!chip) return;
  moveSentenceChip(Number(chip.dataset.chip), true);
});

$("result-wrong-list")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-speak-word]");
  if (!button) return;
  const word = WORDS.find((item) => item.w === button.dataset.speakWord);
  if (word) audio.playWord(word);
});

$("btn-result-primary")?.addEventListener("click", () => {
  const result = window.__lastResult;
  if (!result) return;
  audio.ui();
  if (result.primary.type === "next") {
    $("overlay-result").classList.add("hidden");
    startCampaign(result.primary.themeId);
  } else if (result.primary.type === "home") {
    $("overlay-result").classList.add("hidden");
    quitToHome();
  } else {
    $("overlay-result").classList.add("hidden");
    startSession(result.mode, result.themeId);
  }
});
$("btn-result-retry")?.addEventListener("click", () => {
  const result = window.__lastResult;
  if (!result) return;
  $("overlay-result").classList.add("hidden");
  startSession(result.mode, result.themeId);
});
$("btn-result-home")?.addEventListener("click", () => {
  $("overlay-result").classList.add("hidden");
  quitToHome();
});

/* keep the last result for buttons */
const originalRenderResult = renderResult;
renderResult = function patchedRenderResult(result) {
  window.__lastResult = result;
  return originalRenderResult(result);
};

/* keyboard offset for mobile */
function updateKeyboardOffset() {
  if (!window.visualViewport) return;
  const offset = Math.max(0, window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop);
  document.documentElement.style.setProperty("--kb", `${offset}px`);
}
window.visualViewport?.addEventListener("resize", updateKeyboardOffset);
window.visualViewport?.addEventListener("scroll", updateKeyboardOffset);
document.addEventListener("focusin", (event) => {
  if (event.target.matches?.("#dictation-slots input")) setTimeout(updateKeyboardOffset, 220);
});
document.addEventListener("focusout", (event) => {
  if (event.target.matches?.("#dictation-slots input")) setTimeout(() => document.documentElement.style.setProperty("--kb", "0px"), 220);
});

window.addEventListener("resize", () => {
  if (world) world.resize();
});
window.addEventListener("beforeunload", () => persist());
document.addEventListener("visibilitychange", () => {
  if (document.hidden && session && !session.paused && !session.finished) pauseGame();
});

/* render loop */
function gameLoop(now) {
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  if (session && !session.paused && !session.finished) {
    if (session.mode === "sprint") {
      session.sprintLeft -= dt;
      if (session.sprintLeft <= 0) {
        session.sprintLeft = 0;
        finishSession(true, "time");
      } else if (!session.hudTick || now - session.hudTick > 120) {
        session.hudTick = now;
        renderProgress();
      }
    }
    const question = session?.question;
    if (question && !question.answered && question.duration > 0) {
      question.timeLeft -= dt;
      if (question.timeLeft <= 0) {
        question.timeLeft = 0;
        updateTimerBar();
        handleTimeout();
      } else {
        updateTimerBar();
      }
    }
  }
  if (world) {
    if (!save.settings.motion) world.orbitTarget *= 0.98;
    world.update(dt);
    world.render();
  }
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame((now) => {
  lastFrame = now;
  requestAnimationFrame(gameLoop);
});

/* debug/automation hook (safe: no mutation API exposed) */
window.__pet = {
  get session() { return session; },
  get learn() { return learn; },
  get save() { return save; },
  get words() { return WORDS; },
  get themes() { return THEMES; },
  get world() { return world; },
  get ready() { return dataReady; },
  actions: {
    end: () => finishSession(true, "debug"),
    advance: () => advance(),
    jump: (index) => showNode(index),
  },
};

/* service worker for offline shell + cached audio */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}


