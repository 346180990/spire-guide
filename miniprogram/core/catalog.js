/**
 * 标的池与 RSRS 预设参数
 *
 * notebook 里测过六个指标版本，这里保留三个：
 *   标准分RSRS、修正标准分RSRS、右偏修正标准分RSRS。
 * 另外三个（原始斜率 / R^(2q) 钝化 / 成交额加权钝化）存档在 reference/rsrs/rsrs-6kinds.archive.js。
 * 另有可选的「MA20 趋势过滤」（研究脚本里的「钝化」），由配置项 trend 控制，默认关闭。
 *
 * 各标的的 N/M/S 数值沿用 RSRS改进.ipynb 的推荐值（cell 5、cell 20）。
 * 未在 notebook 中测试过的标的（ETF、红利、海外）使用沪深300 的预设并标记 presetSource='default'，
 * UI 必须显示这个标记，不能默认用户以为已经过验证。
 */

'use strict';

/** 三个指标（顺序即 UI 排序） */
const KINDS = [
  { key: '标准分RSRS', short: '标准分', desc: '回归斜率 β 的 M 日标准分：高 = 支撑强于阻力' },
  { key: '修正标准分RSRS', short: '修正', desc: '标准分 × R²：拟合越好信号越强，震荡市自动减弱' },
  { key: '右偏修正标准分RSRS', short: '右偏', desc: '修正标准分 × β：收益最高、回撤最大，建议配 MA 过滤' },
];

/**
 * 标的池。id 与云函数 market-bars 的白名单一致。
 * preset: 该标的在 notebook 里的推荐参数
 */
const SYMBOLS = [
  {
    id: '000300', name: '沪深300', kind: '指数', market: 'A股',
    preset: { kind: '标准分RSRS', n: 18, m: 700, up: 0.7, dn: -0.7 },
    alt: { kind: '修正标准分RSRS', n: 18, m: 600, up: 0.7, dn: -0.7 },
    presetSource: 'notebook',
    note: 'notebook cell 5/7 的 N/M/S：18/700/0.7（预设=标准分，备选=修正 18/600/0.7）',
  },
  {
    id: '000001', name: '上证综指', kind: '指数', market: 'A股',
    preset: { kind: '标准分RSRS', n: 19, m: 800, up: 0.7, dn: -0.7 },
    alt: { kind: '修正标准分RSRS', n: 19, m: 800, up: 0.8, dn: -0.8 },
    presetSource: 'notebook',
    note: 'notebook cell 5 的 N/M/S：19/800/0.7（备选阈值 0.8）',
  },
  {
    id: '000016', name: '上证50', kind: '指数', market: 'A股',
    preset: { kind: '标准分RSRS', n: 16, m: 700, up: 0.3, dn: -0.3 },
    alt: { kind: '修正标准分RSRS', n: 18, m: 500, up: 0.6, dn: -0.6 },
    presetSource: 'notebook',
    note: 'notebook cell 5 的 N/M/S：16/700/0.3（备选 18/500/0.6）',
  },
  {
    id: '000905', name: '中证500', kind: '指数', market: 'A股',
    preset: { kind: '标准分RSRS', n: 18, m: 800, up: 1.0, dn: -1.0 },
    alt: { kind: '修正标准分RSRS', n: 19, m: 600, up: 0.8, dn: -0.8 },
    presetSource: 'notebook',
    note: 'notebook cell 5 的 N/M/S：18/800/1.0（备选 19/600/0.8）',
  },
  {
    id: '399006', name: '创业板指', kind: '指数', market: 'A股',
    preset: { kind: '标准分RSRS', n: 18, m: 500, up: 0.4, dn: -0.4 },
    alt: { kind: '修正标准分RSRS', n: 18, m: 600, up: 0.5, dn: -0.5 },
    presetSource: 'notebook',
    note: 'notebook cell 5 的 N/M/S：18/500/0.4（备选 18/600/0.5）',
  },
  {
    id: '000922', name: '中证红利', kind: '指数', market: 'A股',
    preset: { kind: '标准分RSRS', n: 18, m: 700, up: 0.7, dn: -0.7 },
    presetSource: 'default',
  },
  {
    id: '510300', name: '沪深300ETF', kind: 'ETF', market: 'A股',
    preset: { kind: '标准分RSRS', n: 18, m: 700, up: 0.7, dn: -0.7 },
    presetSource: 'default',
  },
  {
    id: '510500', name: '中证500ETF', kind: 'ETF', market: 'A股',
    preset: { kind: '标准分RSRS', n: 18, m: 800, up: 1.0, dn: -1.0 },
    presetSource: 'default',
  },
  {
    id: '159915', name: '创业板ETF', kind: 'ETF', market: 'A股',
    preset: { kind: '标准分RSRS', n: 18, m: 500, up: 0.4, dn: -0.4 },
    presetSource: 'default',
  },
  {
    id: '511010', name: '国债ETF', kind: 'ETF', market: 'A股',
    preset: { kind: '标准分RSRS', n: 18, m: 700, up: 0.7, dn: -0.7 },
    presetSource: 'default',
  },
  {
    id: '518880', name: '黄金ETF', kind: 'ETF', market: 'A股',
    preset: { kind: '标准分RSRS', n: 18, m: 700, up: 0.7, dn: -0.7 },
    presetSource: 'default',
  },
];

const DEFAULT_SYMBOL_ID = '000300';

/** 默认策略配置（等价于 notebook 沪深300 的那组 N/M/S，指标换成 标准分RSRS） */
const DEFAULT_CONFIG = {
  kind: '标准分RSRS',
  n: 18,
  m: 700,
  up: 0.7,
  dn: -0.7,
  /** MA 趋势过滤（研究脚本里的「钝化」），默认关闭 */
  trend: false,
  maWin: 20,
};

function listSymbols() {
  return SYMBOLS.slice();
}

function getSymbol(id) {
  for (let i = 0; i < SYMBOLS.length; i++) {
    if (SYMBOLS[i].id === id) return SYMBOLS[i];
  }
  return null;
}

/** 取该标的的预设，找不到退回默认 */
function presetFor(id, useAlt) {
  const s = getSymbol(id);
  if (!s) return Object.assign({}, DEFAULT_CONFIG);
  const p = useAlt && s.alt ? s.alt : s.preset;
  return Object.assign({}, p);
}

function kindMeta(key) {
  for (let i = 0; i < KINDS.length; i++) {
    if (KINDS[i].key === key) return KINDS[i];
  }
  return null;
}

module.exports = {
  KINDS: KINDS,
  SYMBOLS: SYMBOLS,
  DEFAULT_SYMBOL_ID: DEFAULT_SYMBOL_ID,
  DEFAULT_CONFIG: DEFAULT_CONFIG,
  listSymbols: listSymbols,
  getSymbol: getSymbol,
  presetFor: presetFor,
  kindMeta: kindMeta,
};
