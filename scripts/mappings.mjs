/**
 * mappings.mjs — Chinese→English translation dictionaries for STS2 Obsidian vault
 *
 * Comprehensive mapping of all Chinese metadata labels, character names,
 * rarities, card types, mechanics, section headings, and WikiLink pages.
 * Built from analysis of all ~800 files in the mutjan/ vault.
 */

// ─── Character Name Mapping ────────────────────────────────────────────────
export const CHARACTER_MAP = {
  '铁甲战士': 'Ironclad',
  '静默猎手': 'Silent',
  '故障机器人': 'Defect',
  '储君': 'Regent',
  // Necrobinder has two Chinese names in the vault
  '死灵契约师': 'Necrobinder',
  '死灵法师': 'Necrobinder',
  // Universal / colorless
  '无色': 'Colorless',
};

export const CHARACTERS = ['Ironclad', 'Silent', 'Defect', 'Regent', 'Necrobinder', 'Colorless'];

// ─── Rarity Mapping ─────────────────────────────────────────────────────────
// Card rarities: 普通, 罕见, 稀有 (+ empty brackets = Starter)
// Relic rarities: adds 初始, 远古, 商店
// Potion rarities: adds 事件
export const RARITY_MAP = {
  // Card rarities
  '普通': 'Common',
  '罕见': 'Uncommon',
  '稀有': 'Rare',
  // Relic-specific rarities
  '初始': 'Starter',
  '远古': 'Boss',
  '商店': 'Shop',
  // Potion-specific
  '事件': 'Event',
  // Reserved
  '代币': 'Token',
};

// ─── Card Type Mapping ──────────────────────────────────────────────────────
export const TYPE_MAP = {
  '攻击牌': 'Attack',
  '技能牌': 'Skill',
  '能力牌': 'Power',
};

// ─── Mechanic / Keyword Mapping ─────────────────────────────────────────────
// Every game keyword found in mechanic files (06-机制/), card body WikiLinks,
// and enemy descriptions. Used for translating [[Chinese|English]] WikiLinks.
export const MECHANIC_KEYWORD_MAP = {
  // Stats
  '格挡': 'Block',
  '力量': 'Strength',
  '敏捷': 'Dexterity',
  '集中': 'Focus',
  // Debuffs
  '虚弱': 'Weak',
  '易伤': 'Vulnerable',
  '脆弱': 'Frail',
  '毒素': 'Poison',
  '灼伤': 'Burn',
  '伤口': 'Wound',
  '眩晕': 'Dazed',
  '虚空': 'Void',
  '黏液': 'Slimed',
  // Buffs
  '活力': 'Vigor',
  '荆棘': 'Thorns',
  '护甲': 'Plating',
  '神器': 'Artifact',
  '无形': 'Intangible',
  '缓冲': 'Buffer',
  // Card mechanics
  '消耗': 'Exhaust',
  '虚无': 'Ethereal',
  '固有': 'Innate',
  '保留': 'Retain',
  '不可打出': 'Unplayable',
  '升级': 'Upgrade',
  '转化': 'Transform',
  '锻造': 'Forge',
  // Orbs
  '充能球': 'Orb',
  '充能球槽': 'Orb Slot',
  '充能': 'Channel',
  '激发': 'Evoke',
  '闪电球': 'Lightning',
  '冰霜球': 'Frost',
  '黑暗球': 'Dark',
  '等离子球': 'Plasma',
  '玻璃球': 'Glass',
  // Summons / Minions
  '召唤': 'Summon',
  '仆从': 'Minion',
  '仆从打击': 'Minion Strike',
  '仆从牺牲': 'Minion Sacrifice',
  // Token cards
  '匕首': 'Shiv',
  '剑': 'Sword',
  '灵魂': 'Soul',
  '扫视': 'Sweeping Gaze',
  '王权之剑': 'Sovereign Blade',
  '巨石': 'Giant Rock',
  // Necrobinder keywords
  '灾厄': 'Doom',
  '厄运': 'Doom',
  '奥斯蒂': 'Osty',
  '狡猾': 'Sly',
  '聚焦': 'Star',
};

// ─── Section Heading Mapping ────────────────────────────────────────────────
export const SECTION_HEADING_MAP = {
  // Card files
  '基本信息': 'Basic Info',
  '效果描述': 'Effect',
  '相关链接': 'Related Links',
  '相关卡牌': 'Related Cards',
  // Relic/Potion files
  '数据字段': 'Data Fields',
  // Character files
  '统计信息': 'Statistics',
  '专属卡牌': 'Exclusive Cards',
  '专属遗物': 'Exclusive Relics',
  '专属药水': 'Exclusive Potions',
  '抓牌攻略': 'Card Pick Strategy',
  '英文名称': 'English Name',
  '标签': 'Tags',
  // Mechanic files
  '描述': 'Description',
  // Enemy files
  '行动模式': 'Action Pattern',
  '行动规律': 'Action Rhythm',
  '应对策略': 'Counter Strategy',
  '核心机制': 'Core Mechanic',
  '伤害计算': 'Damage Calculation',
  '各角色应对': 'Character-Specific Counters',
};

// ─── WikiLink Page Name → English Slug Mapping ─────────────────────────────
export const WIKILINK_SLUG_MAP = {
  // Character pages
  '铁甲战士': 'ironclad',
  '静默猎手': 'silent',
  '故障机器人': 'defect',
  '储君': 'regent',
  '死灵契约师': 'necrobinder',
  '死灵法师': 'necrobinder',
  '无色': 'colorless',
  // Directory/index pages
  '角色目录': 'characters',
  '卡牌目录': 'cards',
  '遗物目录': 'relics',
  '药水目录': 'potions',
  '机制目录': 'mechanics',
  '敌人目录': 'enemies',
  // Strategy guide pages
  '铁甲战士抓牌攻略': 'ironclad-card-pick-guide',
  '静默猎手抓牌攻略': 'silent-card-pick-guide',
  '故障机器人抓牌攻略': 'defect-card-pick-guide',
  '死灵契约师抓牌攻略': 'necrobinder-card-pick-guide',
  '死灵法师抓牌攻略': 'necrobinder-card-pick-guide',
  '储君抓牌攻略': 'regent-card-pick-guide',
  '双人模式角色搭配攻略': 'duo-character-pairing-guide',
  '遗物选择攻略': 'relic-selection-guide',
};

// ─── Directory Name → Entity Type Mapping ───────────────────────────────────
export const DIRECTORY_TYPE_MAP = {
  '01-角色': 'character',
  '02-卡牌': 'card',
  '攻击牌': 'card',
  '技能牌': 'card',
  '能力牌': 'card',
  '03-遗物': 'relic',
  '04-药水': 'potion',
  '05-导航': 'navigation',
  '06-机制': 'mechanic',
  '07-敌人': 'enemy',
  '08-攻略': 'strategy',
};

export const CARD_TYPE_TO_DIR = {
  'Attack': '攻击牌',
  'Skill': '技能牌',
  'Power': '能力牌',
};

// ─── Character Statistics ───────────────────────────────────────────────────
export const CHARACTER_STATS = {
  'Ironclad': { cards: 87, relics: 8, potions: 3 },
  'Silent': { cards: 87, relics: 8, potions: 3 },
  'Defect': { cards: 87, relics: 8, potions: 3 },
  'Regent': { cards: 88, relics: 8, potions: 3 },
  'Necrobinder': { cards: 88, relics: 8, potions: 3 },
};

// ─── Utility Functions ──────────────────────────────────────────────────────

export function toSlug(name) {
  if (typeof name !== 'string') {
    console.warn(`  ⚠ toSlug received non-string: ${JSON.stringify(name)}`);
    return 'unknown';
  }
  if (WIKILINK_SLUG_MAP[name]) return WIKILINK_SLUG_MAP[name];
  return name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

export function parseWikiLink(text) {
  const inner = text.replace(/^\[\[|\]\]$/g, '');
  const parts = inner.split('|');
  return { target: parts[0].trim(), display: (parts[1] || parts[0]).trim() };
}

export function translate(chinese, context = 'auto') {
  if (typeof chinese !== 'string') return { translated: chinese, found: false };
  const trimmed = chinese.trim();
  if (context === 'auto') {
    for (const map of [CHARACTER_MAP, RARITY_MAP, TYPE_MAP, MECHANIC_KEYWORD_MAP, SECTION_HEADING_MAP]) {
      if (map[trimmed]) return { translated: map[trimmed], found: true };
    }
    return { translated: trimmed, found: false };
  }
  const map = {
    character: CHARACTER_MAP, rarity: RARITY_MAP, type: TYPE_MAP,
    keyword: MECHANIC_KEYWORD_MAP, section: SECTION_HEADING_MAP,
  }[context];
  if (map && map[trimmed]) return { translated: map[trimmed], found: true };
  return { translated: trimmed, found: false };
}

export function getAllKnownChineseTerms() {
  return new Set([
    ...Object.keys(CHARACTER_MAP), ...Object.keys(RARITY_MAP),
    ...Object.keys(TYPE_MAP), ...Object.keys(MECHANIC_KEYWORD_MAP),
    ...Object.keys(SECTION_HEADING_MAP), ...Object.keys(WIKILINK_SLUG_MAP),
  ]);
}
