// 12 个主题星域：每个星域 40 个 PET 高频核心词，并对应一套程序化 3D 场景。
export const THEMES = [
  {
    id: 'daily', name: '生活环舱', en: 'HABITAT RING', scene: 'station',
    color: '#3df0ff', color2: '#7d8cff', bg: ['#04101a', '#071426'],
    tagline: '从清晨的闹钟到深夜的台灯，词汇就在生活里。',
    description: '家居 · 习惯 · 家务 · 租赁',
  },
  {
    id: 'food', name: '霓虹夜市', en: 'NEON NIGHT MARKET', scene: 'market',
    color: '#ffc63d', color2: '#ff6b3d', bg: ['#1a0d05', '#0b0710'],
    tagline: '蒸汽、香料与账单，在烟火气里记住单词。',
    description: '食物 · 口味 · 购物 · 支付',
  },
  {
    id: 'travel', name: '跃迁港湾', en: 'WARP HARBOUR', scene: 'warp',
    color: '#7d8cff', color2: '#3df0ff', bg: ['#060a20', '#0a0820'],
    tagline: '每一张登机牌，都是一次语言跃迁。',
    description: '交通 · 住宿 · 行程 · 证件',
  },
  {
    id: 'school', name: '轨道学院', en: 'ORBITAL ACADEMY', scene: 'academy',
    color: '#b6ff3d', color2: '#3dffb8', bg: ['#08150a', '#061018'],
    tagline: '把考试、面试与截止日期，变成升级经验值。',
    description: '学习 · 考试 · 职场 · 技能',
  },
  {
    id: 'health', name: '零号医疗舱', en: 'MEDBAY ZERO', scene: 'medbay',
    color: '#ff5e8a', color2: '#ff9faf', bg: ['#1a0710', '#0a0714'],
    tagline: '诊断、治疗、恢复，用词汇修复每一格护盾。',
    description: '身体 · 疾病 · 治疗 · 运动',
  },
  {
    id: 'nature', name: '翡翠穹顶', en: 'EMERALD DOME', scene: 'biodome',
    color: '#4dffb8', color2: '#b6ff3d', bg: ['#02140d', '#04120a'],
    tagline: '在会呼吸的穹顶里，听懂地球的词汇。',
    description: '环境 · 灾害 · 动植物 · 气候',
  },
  {
    id: 'feelings', name: '极光心海', en: 'AURORA MINDSEA', scene: 'aurora',
    color: '#c77dff', color2: '#ff6bcb', bg: ['#12061f', '#080616'],
    tagline: '情绪不是噪音，是能被命名的光。',
    description: '情绪 · 性格 · 态度 · 社交',
  },
  {
    id: 'tech', name: '数据矩阵', en: 'DATA MATRIX', scene: 'matrix',
    color: '#00ffd0', color2: '#00a2ff', bg: ['#020f12', '#020814'],
    tagline: '下载、连接、上传，把单词写进神经网络。',
    description: '科技 · 网络 · 媒体 · 隐私',
  },
  {
    id: 'sport', name: '零重力竞技场', en: 'ZERO-G ARENA', scene: 'arena',
    color: '#ff7a3d', color2: '#ffd23d', bg: ['#180a04', '#0b0710'],
    tagline: '每一次命中，都是一次漂亮的得分。',
    description: '比赛 · 球类 · 户外 · 健身',
  },
  {
    id: 'city', name: '霓虹都市', en: 'NEON METROPOLIS', scene: 'city',
    color: '#ff3d9a', color2: '#7d5cff', bg: ['#12051a', '#060716'],
    tagline: '穿过街区与人群，读懂城市运转的词。',
    description: '城市 · 公共设施 · 社区 · 出行',
  },
  {
    id: 'culture', name: '星环艺术馆', en: 'HALO GALLERY', scene: 'gallery',
    color: '#ffd36b', color2: '#ff7ac7', bg: ['#150f06', '#0a0714'],
    tagline: '音乐、绘画与舞台，让词汇拥有审美。',
    description: '艺术 · 音乐 · 文学 · 传统',
  },
  {
    id: 'people', name: '羁绊花园', en: 'BOND GARDEN', scene: 'garden',
    color: '#ff9f43', color2: '#ff5e8a', bg: ['#160b05', '#0a0712'],
    tagline: '家人、朋友与陌生人，构成语言最柔软的部分。',
    description: '家庭 · 关系 · 邀请 · 信任',
  },
];

export const THEME_MAP = Object.fromEntries(THEMES.map((theme) => [theme.id, theme]));
