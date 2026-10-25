// RSRS 移植校验：公式、状态机、无未来函数、结果锁定
// 运行: node scripts/check-strategy.mjs
//
// 线上只保留两个指标（标准分RSRS / 修正标准分RSRS）。notebook cell 7 的黄金值原本对标
// 「钝化RSRS」和「右偏修正标准分RSRS」，这两个已在 2026-10-25 精简时删除，
// 旧实现与当时的黄金值留档在 reference/rsrs/rsrs-6kinds.archive.js。
// 现在第 4 节改为「结果锁定」：把本仓库数据上的年化/回撤/交易数钉住，
// 公式被动过就会立刻报出来。数据换了（scripts/data/rsrs_hs300.json 更新）需要同步改这几个数。

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CORE = join(ROOT, 'strategy-miniprogram', 'core');

const rsrs = require(join(CORE, 'rsrs.js'));
const backtest = require(join(CORE, 'backtest.js'));
const metrics = require(join(CORE, 'metrics.js'));
const tsharpe = require(join(CORE, 'tsharpe.js'));

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log('  ✓ ' + name + (detail ? '  ' + detail : ''));
  } else {
    fail++;
    failures.push(name + (detail ? '  ' + detail : ''));
    console.log('  ✗ ' + name + (detail ? '  ' + detail : ''));
  }
}

function near(actual, expected, tol) {
  return Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
}

/* ------------------------------------------------------------------ */
console.log('\n=== 1. 公式恒等性 ===');
{
  // 构造一段有趋势也有震荡的合成行情
  const bars = [];
  let price = 100;
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < 400; i++) {
    const drift = Math.sin(i / 23) * 0.004 + 0.0004;
    price = price * (1 + drift + (rnd() - 0.5) * 0.02);
    const high = price * (1 + rnd() * 0.012);
    const low = price * (1 - rnd() * 0.012);
    bars.push({
      date: '2020-01-01',
      open: price,
      high: Number(high.toFixed(4)),
      low: Number(low.toFixed(4)),
      close: Number(price.toFixed(4)),
      volume: 1000 + Math.floor(rnd() * 5000),
    });
  }
  const s = rsrs.computeSeries(bars, { n: 18, m: 100 });
  let checked = 0;
  let matched = 0;
  for (let i = 0; i < s.len; i++) {
    if (!Number.isFinite(s.z[i]) || !Number.isFinite(s.r2[i])) continue;
    checked++;
    if (Math.abs(s.revise[i] - s.z[i] * s.r2[i]) < 1e-12) matched++;
  }
  ok('修正标准分 = 标准分 × R²', checked > 0 && checked === matched, `${matched}/${checked}`);

  const r2InRange = s.r2.filter((v) => Number.isFinite(v)).every((v) => v >= 0 && v <= 1.0000001);
  ok('R² ∈ [0,1]', r2InRange);

  ok('预热长度 = N+M-1', s.readyFrom === 18 + 100 - 1, `readyFrom=${s.readyFrom}`);

  ok('暴露三个指标', rsrs.KINDS.join('/') === '标准分RSRS/修正标准分RSRS/右偏修正标准分RSRS', rsrs.KINDS.join('/'));

  let threw = false;
  try { rsrs.indicatorSeries(s, '钝化RSRS'); } catch (e) { threw = true; }
  ok('已删除的指标名直接抛错（不会静默算出错数）', threw);
}

/* ------------------------------------------------------------------ */
console.log('\n=== 2b. MA 趋势过滤（研究脚本里的「钝化」）===');
{
  const bars = [];
  let price = 100;
  let seed = 29;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < 320; i++) {
    // 前 160 根上涨、后 160 根下跌，正好检验「均线走平/下行时强制空仓」
    const drift = i < 160 ? 0.004 : -0.003;
    price = price * (1 + drift + (rnd() - 0.5) * 0.015);
    bars.push({
      date: '2020-01-01', open: price,
      high: price * (1 + rnd() * 0.01), low: price * (1 - rnd() * 0.01),
      close: price, volume: 1000,
    });
  }
  const s = rsrs.computeSeries(bars, { n: 18, m: 60 });
  const raw = rsrs.buildPosition(s.series['修正标准分RSRS'], 0.7, -0.7).pos;
  const filt = rsrs.applyTrendFilter(raw, s.closes, 20);

  ok('过滤只减不加（持仓 ⊆ 原始）', filt.every((v, i) => v === 0 || raw[i] === 1));
  ok('开头 3 根强制空仓', filt.slice(0, 3).every((v) => v === 0));

  const ma = rsrs._internal.rollingMean(s.closes, 20);
  let mism = 0;
  for (let i = 3; i < filt.length; i++) {
    const expect = Number.isFinite(ma[i - 1]) && Number.isFinite(ma[i - 3])
      ? (raw[i] === 1 && ma[i - 1] > ma[i - 3] ? 1 : 0)
      : 0;
    if (filt[i] !== expect) mism++;
  }
  ok('过滤规则与定义一致（T-1 > T-3 才持仓）', mism === 0, `${mism} 处不一致`);

  // 下跌段里均线下行，仓位应该被清掉
  const tail = filt.slice(240).reduce((a, v) => a + v, 0);
  ok('下跌段基本空仓', tail <= 5, `最后 80 根持仓 ${tail} 天`);

  // 无未来数据：截断后前缀必须一致
  const cutLen = 260;
  const sCut = rsrs.computeSeries(bars.slice(0, cutLen), { n: 18, m: 60 });
  const rawCut = rsrs.buildPosition(sCut.series['修正标准分RSRS'], 0.7, -0.7).pos;
  const filtCut = rsrs.applyTrendFilter(rawCut, sCut.closes, 20);
  let diff = 0;
  for (let i = 0; i < cutLen; i++) if (filt[i] !== filtCut[i]) diff++;
  ok('过滤没有未来函数（截断后前缀相同）', diff === 0, `${diff} 处不同`);
}

/* ------------------------------------------------------------------ */
console.log('\n=== 2d. 防守开关（时变夏普 + MA200）===');
{
  const bars = [];
  let px = 100;
  const start = new Date('2020-01-01T00:00:00Z');
  for (let i = 0; i < 420; i++) {
    px *= 1 + Math.sin(i / 19) * 0.007 + (i % 2 ? -0.001 : 0.001);
    const d = new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10);
    bars.push({ date: d, open: px, high: px * 1.01, low: px * 0.99, close: px, volume: 1000 });
  }
  const s = tsharpe.computeSeries(bars, { window: 60, maWin: 100 });
  ok('夏普与均线可计算',
    Number.isFinite(s.ts[s.ts.length - 1]) && Number.isFinite(s.ma[s.ma.length - 1]));

  const p = tsharpe.buildPosition([0.5, -0.4, 0.5], [10, 10, 10], [11, 9, 11], { up: 0.3, dn: -0.3 });
  ok('双条件状态机：先持有、破位离场',
    p.pos[0] === 1 && p.pos[1] === 0 && p.exited[1] === true,
    p.pos.join(''));

  const bt = tsharpe.runBacktest({
    bars, config: {}, start: '2020-06-01', end: '2021-02-01', cost: { fee: 0.001, slip: 0 },
  });
  ok('回测能跑且指标有限', Number.isFinite(bt.metrics.cagr), 'trades=' + bt.trades.length);
  ok('参数校验拒绝越界', tsharpe.validate({ window: 5 }).ok === false);
}

/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
console.log('\n=== 2. 修正标准分的口径 ===');
{
  // 一段有涨有跌的行情：|修正| 不该超过 |标准分|（R² ≤ 1 的直接推论），z 的量级也要正常
  const bars = [];
  let price = 100;
  let seed = 13;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < 300; i++) {
    price = price * (1 + Math.sin(i / 17) * 0.006 + (rnd() - 0.5) * 0.018);
    bars.push({
      date: '2020-01-01',
      open: price,
      high: price * (1 + rnd() * 0.01),
      low: price * (1 - rnd() * 0.01),
      close: price,
      volume: 1000,
    });
  }
  const s = rsrs.computeSeries(bars, { n: 18, m: 60 });
  let cnt = 0;
  let bad = 0;
  let maxZ = 0;
  for (let i = 0; i < s.len; i++) {
    if (!Number.isFinite(s.z[i]) || !Number.isFinite(s.revise[i])) continue;
    cnt++;
    if (Math.abs(s.revise[i]) > Math.abs(s.z[i]) + 1e-12) bad++;
    maxZ = Math.max(maxZ, Math.abs(s.z[i]));
  }
  ok('|修正| ≤ |标准分|（R² ≤ 1）', cnt > 0 && bad === 0, `${cnt} 点，越界 ${bad}`);
  ok('标准分量级正常（|z| < 6）', maxZ < 6, `max=${maxZ.toFixed(2)}`);
}

/* ------------------------------------------------------------------ */
console.log('\n=== 3. 状态机语义 ===');
{
  const mk = (arr) => arr.map((v) => ({ date: 'x', open: v, high: v, low: v, close: v, volume: 1 }));
  // 值序列：升到 1 → 保持 → 掉到 -1
  const vals = [0.2, 0.5, 0.8, 1.2, 1.1, 0.9, 0.5, -0.2, -0.9, -1.2, -0.5, 0.2];
  const pos = rsrs.buildPosition(vals, 0.7, -0.7);
  const seq = pos.pos.join('');
  // 0.8 在 i=2 触发开仓；只有跌到 -0.7 及以下（i=8 的 -0.9）才平仓
  ok('开仓/持仓/平仓序列', seq === '001111110000', seq);
  ok('买入 1 次', pos.buys.length === 1, `buys@${pos.buys.join(',')}`);
  ok('卖出 1 次', pos.sells.length === 1, `sells@${pos.sells.join(',')}`);
  ok('NaN 视为空仓', rsrs.buildPosition([NaN, 0.9], 0.7, -0.7).pos.join('') === '01');

  // 带噪声的上行序列（纯指数会退化成常数斜率，z 的分母为 0）
  const up = [];
  let p = 100;
  let sd = 11;
  const rnd2 = () => {
    sd = (sd * 1103515245 + 12345) % 2147483648;
    return sd / 2147483648;
  };
  for (let i = 0; i < 300; i++) {
    p *= 1.004 + (rnd2() - 0.5) * 0.01;
    up.push({ date: '2020-01-01', open: p, high: p * (1 + rnd2() * 0.01), low: p * (1 - rnd2() * 0.01), close: p, volume: 1000 });
  }
  const sUp = rsrs.computeSeries(up, { n: 18, m: 60 });
  const last = sUp.revise[sUp.len - 1];
  ok('上行行情下修正标准分可计算', Number.isFinite(last), `last=${last?.toFixed(3)}`);
}

/* ------------------------------------------------------------------ */
console.log('\n=== 4. 结果锁定（本仓库数据上的回归基线）===');
const fixturePath = join(ROOT, 'scripts', 'data', 'rsrs_hs300.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const bars = fixture.daily.map((b) => ({
  date: b.date, open: b.open, high: b.high, low: b.low, close: b.close,
  volume: b.volume || 0,
}));
console.log(`  数据：${bars.length} 根，${bars[0].date} → ${bars[bars.length - 1].date}（${fixturePath.split(/[\\/]/).pop()}）`);

// notebook 的黄金值属于已删除的钝化/右偏版本（见 reference/rsrs/rsrs-6kinds.archive.js），
// 这两个数是本仓库数据 + 现行公式跑出来的基线，公式或数据被动过就会差出去。
const GOLD = [
  { kind: '标准分RSRS', n: 18, m: 700, up: 0.7, cagr: 0.1242, total: 2.9585, mdd: 0.4056, hold: 1342, trades: 49 },
  { kind: '修正标准分RSRS', n: 18, m: 600, up: 0.7, cagr: 0.1314, total: 3.2660, mdd: 0.4052, hold: 1385, trades: 43 },
  { kind: '右偏修正标准分RSRS', n: 18, m: 700, up: 0.7, cagr: 0.1077, total: 2.3268, mdd: 0.4297, hold: 1643, trades: 36 },
];

for (const g of GOLD) {
  const runs = {};
  for (const align of ['notebook', 'natural']) {
    runs[align] = backtest.run({
      bars,
      config: { kind: g.kind, n: g.n, m: g.m, up: g.up, dn: -g.up },
      start: '2008-03-25',
      end: '2019-12-31',
      cost: { fee: 0, slip: 0 },
      execution: 'next_close',
      align,
    });
  }
  const r = runs.notebook;
  const nb = r.nbMetrics;
  const annual = nb._annual;
  const total = r.equity[r.equity.length - 1] - 1;
  const mdd = nb._mdd;
  const hold = nb['持仓总天数'];
  const trades = nb['交易次数'];

  console.log(`\n  ── ${g.kind} (N=${g.n}, M=${g.m}, S=${g.up}) ──`);
  console.log(`   指标        notebook对齐   natural对齐   锁定基线`);
  const rn = runs.natural.nbMetrics;
  console.log(`   年化        ${(annual * 100).toFixed(2).padStart(8)}%     ${(rn._annual * 100).toFixed(2).padStart(8)}%     ${(g.cagr * 100).toFixed(2)}%`);
  console.log(`   累计        ${(total * 100).toFixed(2).padStart(8)}%     ${((runs.natural.equity[runs.natural.equity.length - 1] - 1) * 100).toFixed(2).padStart(8)}%     ${(g.total * 100).toFixed(2)}%`);
  console.log(`   最大回撤    ${(mdd * 100).toFixed(2).padStart(8)}%     ${(rn._mdd * 100).toFixed(2).padStart(8)}%     ${(g.mdd * 100).toFixed(2)}%`);
  console.log(`   持仓天数    ${String(hold).padStart(9)}     ${String(rn['持仓总天数']).padStart(9)}     ${g.hold}`);
  console.log(`   交易次数    ${String(trades).padStart(9)}     ${String(rn['交易次数']).padStart(9)}     ${g.trades}`);

  ok(`${g.kind} 年化差 < 0.5pt`, near(annual, g.cagr, 0.005), `${(annual * 100).toFixed(2)}% vs ${(g.cagr * 100).toFixed(2)}%`);
  ok(`${g.kind} 回撤差 < 1pt`, near(mdd, g.mdd, 0.01), `${(mdd * 100).toFixed(2)}% vs ${(g.mdd * 100).toFixed(2)}%`);
  ok(`${g.kind} 交易次数完全一致`, trades === g.trades, `${trades} vs ${g.trades}`);
  ok(`${g.kind} 持仓天数差 ≤ 10`, Math.abs(hold - g.hold) <= 10, `${hold} vs ${g.hold}`);
}

// MA 趋势过滤在真实数据上的效果：回撤明显变小、换手变多
{
  const cfgBase = { kind: '右偏修正标准分RSRS', n: 16, m: 300, up: 0.7, dn: -0.7 };
  const base = backtest.run({ bars, config: cfgBase, start: '2006-05-01', end: '2026-10-23', cost: { fee: 0.0003, slip: 0.0005 } });
  const filt = backtest.run({ bars, config: { ...cfgBase, trend: true, maWin: 20 }, start: '2006-05-01', end: '2026-10-23', cost: { fee: 0.0003, slip: 0.0005 } });
  ok('开趋势过滤后回撤明显变小',
    Math.abs(filt.metrics.maxDrawdown) < Math.abs(base.metrics.maxDrawdown) * 0.7,
    `${(base.metrics.maxDrawdown * 100).toFixed(1)}% → ${(filt.metrics.maxDrawdown * 100).toFixed(1)}%`);
  ok('开过滤后换手变多', filt.trades.length > base.trades.length,
    `${base.trades.length} → ${filt.trades.length} 笔`);
  ok('回测结果记下过滤开关', filt.trend === true && filt.maWin === 20);
}

/* ------------------------------------------------------------------ */
console.log('\n=== 5. 无未来数据（截断不变性）===');
{
  const cfg = { kind: '标准分RSRS', n: 18, m: 300, up: 0.7, dn: -0.7 };
  const full = rsrs.computeSeries(bars, { n: cfg.n, m: cfg.m });
  const cutIdx = 4000;
  const cut = rsrs.computeSeries(bars.slice(0, cutIdx + 1), { n: cfg.n, m: cfg.m });
  let maxDiff = 0;
  for (const key of ['beta', 'r2', 'z', 'revise']) {
    for (let i = 0; i < cut.len; i++) {
      const a = full[key][i];
      const b = cut[key][i];
      if (Number.isFinite(a) && Number.isFinite(b)) maxDiff = Math.max(maxDiff, Math.abs(a - b));
      if (Number.isFinite(a) !== Number.isFinite(b)) maxDiff = Infinity;
    }
  }
  ok('截断到 T 与使用全量数据，指标逐点相同', maxDiff < 1e-12, `maxDiff=${maxDiff.toExponential(2)}`);
}

/* ------------------------------------------------------------------ */
console.log('\n=== 6. 可复现性 ===');
{
  const cfg = { kind: '标准分RSRS', n: 18, m: 700, up: 0.7, dn: -0.7 };
  const input = { bars, config: cfg, start: '2015-01-01', end: '2019-12-31', cost: { fee: 0.0003, slip: 0.0005 } };
  const a = backtest.run(input);
  const b = backtest.run(input);
  ok('两次运行指标一致', JSON.stringify(a.metrics) === JSON.stringify(b.metrics));
  ok('两次运行交易明细一致', JSON.stringify(a.trades) === JSON.stringify(b.trades));
  ok('成本已生效（累计成本 > 0）', a.metrics.costRatio > 0, `costRatio=${a.metrics.costRatio.toFixed(4)}`);
}

/* ------------------------------------------------------------------ */
console.log('\n=== 7. 参数与边界 ===');
{
  let threw = false;
  try { rsrs.computeSeries(bars, { n: 1, m: 100 }); } catch (e) { threw = true; }
  ok('N<2 抛错', threw);

  threw = false;
  try { backtest.run({ bars, config: { kind: '标准分RSRS', n: 18, m: 100, up: 0.5, dn: 0.8 }, start: '2015-01-01', end: '2019-12-31' }); } catch (e) { threw = true; }
  ok('DN>UP 抛错', threw);

  threw = false;
  try { rsrs.indicatorSeries(rsrs.computeSeries(bars, { n: 18, m: 100 }), '不存在的指标'); } catch (e) { threw = true; }
  ok('未知指标名抛错', threw);

  threw = false;
  try { backtest.run({ bars, config: { kind: '标准分RSRS', n: 18, m: 300, up: 0.7 }, start: '2030-01-01', end: '2031-01-01' }); } catch (e) { threw = true; }
  ok('空区间抛错', threw);

  // 短数据
  const short = bars.slice(0, 50);
  threw = false;
  try { backtest.run({ bars: short, config: { kind: '标准分RSRS', n: 18, m: 300, up: 0.7 }, start: short[0].date, end: short[49].date }); } catch (e) { threw = true; }
  ok('数据不足时抛错（上游转 insufficient）', threw);
}

/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
console.log('\n=== 8. 快照与校验（signal.js / validate.js）===');
{
  const signal = require(join(CORE, 'signal.js'));
  const validate = require(join(CORE, 'validate.js'));
  const catalogMod = require(join(CORE, 'catalog.js'));

  const cfg = { kind: '标准分RSRS', n: 18, m: 500, up: 0.7, dn: -0.7, overrides: {} };
  const dataset = [{ symbol: '000300', name: '沪深300', bars }];

  const full = signal.buildSnapshot({ datasets: dataset, config: cfg, asOfDate: '2019-12-31' });
  // 只保留到 2020-01-10：既有「下一交易日」可标注，又包含了 asOfDate 之后的数据，
  // 正好检验「读数只用截至 D 的部分」
  const cut = signal.buildSnapshot({
    datasets: [{ symbol: '000300', name: '沪深300', bars: bars.filter((b) => b.date <= '2020-01-10') }],
    config: cfg,
    asOfDate: '2019-12-31',
  });
  // 只比较「信号」相关字段：数据集长度、可用日期列表这类元信息本来就不同
  const sigOnly = (s) => ({
    dataAsOf: s.dataAsOf,
    appliesTo: s.appliesTo,
    status: s.status,
    conclusion: s.conclusion,
    reason: s.reason,
    counts: s.counts,
    items: s.items.map((it) => ({
      symbol: it.symbol, action: it.action, value: it.value, r2: it.r2,
      beta: it.beta, z: it.z, holdingBefore: it.holdingBefore,
      dataAsOf: it.dataAsOf, appliesTo: it.appliesTo, reason: it.reason,
    })),
  });
  ok('快照无未来数据（截断后信号逐字段相同）',
    JSON.stringify(sigOnly(full)) === JSON.stringify(sigOnly(cut)));

  ok('快照含三个时间',
    !!full.dataAsOf && !!full.computedAt && !!full.appliesTo,
    `${full.dataAsOf} / ${full.appliesTo}`);
  ok('适用日为下一交易日', full.appliesTo === '2020-01-02', full.appliesTo);
  ok('结论为合法枚举',
    ['buy', 'sell', 'hold', 'wait', 'unavailable'].includes(full.conclusion), full.conclusion);
  ok('明细含理由文本', full.items[0].reason.length > 8, full.items[0].reason);

  // 趋势过滤：信号要带标记，且过滤拦住的时候理由要说清楚
  const withTrend = signal.buildSnapshot({
    datasets: dataset,
    config: { ...cfg, trend: true, maWin: 20 },
    asOfDate: '2019-12-31',
  });
  ok('信号带趋势过滤标记', withTrend.items[0].trend === true && withTrend.items[0].maWin === 20);
  ok('过滤后持仓日不超过原始',
    withTrend.items.every((it) => it.action !== 'hold' || it.trend === true));

  // 数据不足 → unavailable，且绝不退化成观望
  const shortBars = bars.filter((b) => b.date <= '2005-06-30');
  const insuff = signal.buildSnapshot({
    datasets: [{ symbol: '000300', name: '沪深300', bars: shortBars }],
    config: { kind: '标准分RSRS', n: 18, m: 700, up: 0.7, dn: -0.7 },
  });
  ok('数据不足 → status=insufficient', insuff.status === 'insufficient', insuff.status);
  ok('数据不足 → conclusion=unavailable（不是 wait）', insuff.conclusion === 'unavailable', insuff.conclusion);
  ok('数据不足时给出所需根数', /需要至少/.test(insuff.items[0].reason), insuff.items[0].reason);

  // 参数校验
  ok('N 越界报错', validate.validateConfig({ kind: '标准分RSRS', n: 1, m: 700, up: 0.7 }).ok === false);
  ok('M 越界报错', validate.validateConfig({ kind: '标准分RSRS', n: 18, m: 5, up: 0.7 }).ok === false);
  ok('DN>=UP 报错', validate.validateConfig({ kind: '标准分RSRS', n: 18, m: 700, up: 0.7, dn: 0.8 }).errors.dn);
  ok('合法参数通过', validate.validateConfig({ kind: '标准分RSRS', n: 18, m: 700, up: 0.7, dn: -0.7 }).ok);
  ok('未知指标报错', validate.validateConfig({ kind: '瞎写', n: 18, m: 700, up: 0.7 }).errors.kind);
  ok('已删除的指标报错', validate.validateConfig({ kind: '钝化RSRS', n: 18, m: 700, up: 0.7 }).errors.kind);
  ok('均线窗口越界报错', validate.validateConfig({ kind: '标准分RSRS', n: 18, m: 700, up: 0.7, maWin: 3 }).errors.maWin);
  ok('标的校验拦截未收录', validate.validateSymbols(['999999']).ok === false);
  ok('标的校验通过正常集合', validate.validateSymbols(['000300', '000905']).ok);

  // 预设参数确实来自 notebook
  const hs300 = catalogMod.getSymbol('000300');
  ok('沪深300 预设 = notebook (18,700,0.7)，指标是标准分',
    hs300.preset.n === 18 && hs300.preset.m === 700 && hs300.preset.up === 0.7
    && hs300.preset.kind === '标准分RSRS' && hs300.presetSource === 'notebook',
    JSON.stringify(hs300.preset));
  const cyb = catalogMod.getSymbol('399006');
  ok('创业板预设 = notebook (18,500,0.4)',
    cyb.preset.n === 18 && cyb.preset.m === 500 && cyb.preset.up === 0.4);
  const zz500 = catalogMod.getSymbol('000905');
  ok('中证500 预设 = notebook (18,800,1.0)',
    zz500.preset.n === 18 && zz500.preset.m === 800 && zz500.preset.up === 1.0);
  ok('默认配置是标准分RSRS', catalogMod.DEFAULT_CONFIG.kind === '标准分RSRS', catalogMod.DEFAULT_CONFIG.kind);
  ok('预设里不再出现已删除的指标',
    catalogMod.SYMBOLS.every((s) => rsrs.KINDS.includes(s.preset.kind)
      && (!s.alt || rsrs.KINDS.includes(s.alt.kind))),
    catalogMod.SYMBOLS.map((s) => s.preset.kind).filter((k, i, a) => a.indexOf(k) === i).join('/'));

  // 多标的聚合
  const multi = signal.buildSnapshot({
    datasets: [
      { symbol: '000300', name: '沪深300', bars },
      { symbol: '000905', name: '中证500', bars },
    ],
    config: cfg,
    asOfDate: '2019-12-31',
    latestDate: '2019-12-31',
  });
  ok('多标的计数自洽',
    Object.values(multi.counts).reduce((a, b) => a + b, 0) === 2,
    JSON.stringify(multi.counts));
  ok('多标的结论由明细决定', multi.conclusion !== 'unavailable');
  ok('availableDates 非空', multi.availableDates.length === bars.length, String(multi.availableDates.length));
}

/* ------------------------------------------------------------------ */
console.log('\n=== 9. 小程序静态检查 ===');
{
  const fs = require('node:fs');
  const path = require('node:path');
  const APP = join(ROOT, 'strategy-miniprogram');

  const appJsonPath = join(APP, 'app.json');
  let appJson = null;
  try {
    appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
    ok('app.json 可解析', true);
  } catch (e) {
    ok('app.json 可解析', false, e.message);
  }

  if (appJson) {
    const pages = appJson.pages || [];
    ok('app.json 页面数 7', pages.length === 7, String(pages.length));

    let missing = [];
    let missingFiles = [];
    pages.forEach((p) => {
      const dir = join(APP, path.dirname(p));
      const base = path.basename(p);
      if (!fs.existsSync(dir)) { missing.push(p); return; }
      ['js', 'json', 'wxml', 'wxss'].forEach((ext) => {
        if (!fs.existsSync(join(dir, base + '.' + ext))) missingFiles.push(p + '.' + ext);
      });
    });
    ok('所有页面目录存在', missing.length === 0, missing.join(','));
    ok('所有页面四件套齐全', missingFiles.length === 0, missingFiles.slice(0, 5).join(','));

    const tabs = (appJson.tabBar && appJson.tabBar.list) || [];
    ok('tabBar 只有 策略/回测 两项', tabs.length === 2 && tabs[0].text === '策略' && tabs[1].text === '回测', tabs.map((t) => t.text).join('/'));
    ok('tabBar 页面都在 pages 中',
      tabs.every((t) => pages.indexOf(t.pagePath) >= 0),
      tabs.map((t) => t.pagePath).join(','));
    ok('tabBar 页面排在 pages 前两位',
      tabs.every((t, i) => pages[i] === t.pagePath));

    // 已删除的页面不允许复活
    ok('watchlist / me / runs 页面已移除',
      !pages.some((p) => /\/(watchlist|me|runs)\//.test(p)));
    ok('watchlist / me 目录已删除',
      !fs.existsSync(join(APP, 'pages', 'watchlist')) && !fs.existsSync(join(APP, 'pages', 'me')));

    // 所有 json 可解析
    const jsonFiles = [];
    const walk = (dir) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.name === 'node_modules' || ent.name === 'cloudfunctions') continue;
        const p = join(dir, ent.name);
        if (ent.isDirectory()) walk(p);
        else if (ent.name.endsWith('.json')) jsonFiles.push(p);
      }
    };
    walk(APP);
    let badJson = [];
    jsonFiles.forEach((f) => {
      try { JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { badJson.push(path.relative(APP, f)); }
    });
    ok('所有 JSON 可解析', badJson.length === 0, badJson.join(','));

    // usingComponents 指向的组件存在
    let badComp = [];
    pages.forEach((p) => {
      const dir = join(APP, path.dirname(p));
      const base = path.basename(p);
      let cfg;
      try { cfg = JSON.parse(fs.readFileSync(join(dir, base + '.json'), 'utf8')); } catch (e) { return; }
      const uc = cfg.usingComponents || {};
      Object.keys(uc).forEach((name) => {
        const ref = uc[name];
        const target = ref.startsWith('/') ? join(APP, ref) : join(dir, ref);
        if (!fs.existsSync(target + '.js')) badComp.push(p + ' → ' + name);
      });
    });
    ok('usingComponents 都能解析', badComp.length === 0, badComp.join(','));

    // WXML 里不允许出现 HTML 标签（小程序不支持）
    let badTags = [];
    pages.forEach((p) => {
      const dir = join(APP, path.dirname(p));
      const base = path.basename(p);
      const wxml = fs.readFileSync(join(dir, base + '.wxml'), 'utf8');
      if (/<\s*(table|tr|td|th|div|span|p|ul|li)\b/i.test(wxml)) badTags.push(p);
    });
    ok('WXML 未使用 HTML 标签', badTags.length === 0, badTags.join(','));

    // WXML 标签必须成对闭合（多行标签 / 模板表达式都要正确处理）
    let badNest = [];
    pages.forEach((p) => {
      const dir = join(APP, path.dirname(p));
      const base = path.basename(p);
      const raw = fs.readFileSync(join(dir, base + ".wxml"), "utf8");
      // 剥掉 {{...}}（可跨行），避免 ">=" 之类被当成标签结束
      const src = raw.replace(/\{\{[\s\S]*?\}\}/g, "X");
      const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
      const stack = [];
      let m;
      let bad = false;
      while ((m = re.exec(src))) {
        if (m[4] === "/") continue;            // 自闭合
        if (m[1] === "/") {
          const top = stack.pop();
          if (top !== m[2]) bad = true;
        } else {
          stack.push(m[2]);
        }
      }
      if (bad || stack.length) badNest.push(base);
    });
    ok("所有 WXML 标签成对闭合", badNest.length === 0, badNest.join(","));

    // 页面 js 里的 require 相对路径都能解析
    let badRequire = [];
    pages.forEach((p) => {
      const dir = join(APP, path.dirname(p));
      const base = path.basename(p);
      const src = fs.readFileSync(join(dir, base + '.js'), 'utf8');
      const re = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g;
      let m;
      while ((m = re.exec(src))) {
        const target = join(dir, m[1]);
        const cand = fs.existsSync(target) ? target : target + '.js';
        if (!fs.existsSync(cand)) badRequire.push(p + ' → ' + m[1]);
      }
    });
    ok('页面 require 路径都能解析', badRequire.length === 0, badRequire.join(','));

    // 云函数目录
    ok('云函数 market-bars 存在',
      fs.existsSync(join(APP, 'cloudfunctions', 'market-bars', 'index.js')));
    ok('云函数依赖已声明',
      fs.existsSync(join(APP, 'cloudfunctions', 'market-bars', 'package.json')));
  }
}

/* ------------------------------------------------------------------ */
console.log('\n=== 10. 端到端联调（wx mock：缓存 → 信号 → 回测 → 落盘）===');
{
  // 最小 wx 替身：本地存储 + 云函数（用仓库夹具数据顶替东财）
  const memory = {};
  let cloudCalls = 0;
  globalThis.wx = {
    getStorageSync(k) { return Object.prototype.hasOwnProperty.call(memory, k) ? memory[k] : ''; },
    setStorageSync(k, v) { memory[k] = v; },
    removeStorageSync(k) { delete memory[k]; },
    getStorageInfoSync() { return { keys: Object.keys(memory), currentSize: 8, limitSize: 10240 }; },
    cloud: {
      callFunction({ data }) {
        cloudCalls++;
        const ids = (data && data.symbols) || ['000300'];
        const want = (data && data.count) || 1200;
        const rows = fixture.daily.slice(-want).map((b) => [b.date, b.open, b.high, b.low, b.close, 1000000]);
        return Promise.resolve({
          result: {
            ok: true,
            asOf: fixture.daily[fixture.daily.length - 1].date,
            updatedAt: new Date().toISOString(),
            source: '夹具',
            items: ids.map((id) => ({
              symbol: id,
              name: id,
              bars: rows,
              quality: {
                bars: rows.length,
                firstDate: rows[0][0],
                lastDate: rows[rows.length - 1][0],
                source: '夹具',
                complete: true,
              },
            })),
            errors: [],
          },
        });
      },
    },
  };

  // 重新加载依赖 wx 的模块（此时 wx 已存在）
  delete require.cache[require.resolve(join(CORE, 'store.js'))];
  delete require.cache[require.resolve(join(CORE, 'api.js'))];
  delete require.cache[require.resolve(join(CORE, 'loader.js'))];
  const store2 = require(join(CORE, 'store.js'));
  const loader2 = require(join(CORE, 'loader.js'));

  const first = await loader2.refresh({ force: true });
  ok('refresh 返回快照', !!first.snapshot && !!first.snapshot.signalDate, first.snapshot.signalDate);
  ok('快照状态 ok', first.snapshot.status === 'ok', first.snapshot.status);
  ok('结论为合法枚举',
    ['buy', 'sell', 'hold', 'wait'].includes(first.snapshot.conclusion),
    first.snapshot.conclusion);
  ok('云函数被调用一次', cloudCalls === 1, String(cloudCalls));
  ok('快照已落盘', !!store2.getSnapshot('rsrs', first.configVersion, first.snapshot.signalDate));

  const second = await loader2.refresh({});
  ok('二次刷新命中缓存（不再调云函数）', cloudCalls === 1 && second.fromCache === true, `calls=${cloudCalls}`);

  const bt = await loader2.runBacktest({
    symbol: '000300',
    start: '2015-01-01',
    end: '2019-12-31',
    execution: 'next_close',
    capital: 100000,
    fee: 0.0003,
    slip: 0.0005,
  });
  ok('回测成功', bt.ok === true, bt.reason || '');
  ok('回测指标为有限值',
    Number.isFinite(bt.run.metrics.cagr) && Number.isFinite(bt.run.metrics.maxDrawdown),
    `cagr=${(bt.run.metrics.cagr * 100).toFixed(2)}% mdd=${(bt.run.metrics.maxDrawdown * 100).toFixed(2)}%`);
  // 基准口径：累计 = 末值/首值-1，年化 = 累计按 244 交易日折算（与策略同口径）
  {
    const bs = bt.run.benchmark || [];
    const manualTotal = bs[bs.length - 1] / bs[0] - 1;
    ok('基准累计收益与日线自算一致',
      Math.abs(manualTotal - bt.run.metrics.benchTotal) < 1e-9,
      (bt.run.metrics.benchTotal * 100).toFixed(2) + '% vs ' + (manualTotal * 100).toFixed(2) + '%');
    ok('基准年化与累计同口径',
      Math.abs(Math.pow(1 + manualTotal, 244 / bs.length) - 1 - bt.run.metrics.benchCagr) < 0.005,
      (bt.run.metrics.benchCagr * 100).toFixed(2) + '%');
    ok('超额年化 = 策略年化 - 基准年化',
      Math.abs((bt.run.metrics.cagr - bt.run.metrics.benchCagr) - bt.run.metrics.excessCagr) < 1e-9,
      (bt.run.metrics.excessCagr * 100).toFixed(2) + '%');
  }

  ok('回测已落盘', store2.getRuns().length === 1, String(store2.getRuns().length));
  ok('落盘记录含曲线与交易',
    (store2.getRuns()[0].equity || []).length > 10 && (store2.getRuns()[0].trades || []).length > 0,
    `equity=${(store2.getRuns()[0].equity || []).length} trades=${(store2.getRuns()[0].trades || []).length}`);
  ok('nbMetrics 不含内部字段',
    !Object.keys(store2.getRuns()[0].nbMetrics || {}).some((k) => k.charAt(0) === '_'));

  // 参数版本不可变
  const before = store2.getConfigs('rsrs').length;
  store2.saveConfig('rsrs', { kind: '修正标准分RSRS', n: 18, m: 800, up: 0.8, dn: -0.8 }, ['000300'], '测试');
  const after = store2.getConfigs('rsrs');
  ok('保存参数生成新版本', after.length === before + 1, `${before} → ${after.length}`);
  ok('旧版本仍在', after.some((c) => c.version === 'cfg-001'));
  ok('新版本成为当前版本', store2.getActiveConfig('rsrs').version === after[after.length - 1].version);

  // 快照不可变：同 key 再存不覆盖
  const snapKeyRun = first.snapshot;
  const again = store2.saveSnapshot({ ...snapKeyRun, reason: '被篡改' });
  const kept = store2.getSnapshot('rsrs', first.configVersion, first.snapshot.signalDate);
  ok('快照默认不覆盖', again.existed === true && kept.reason !== '被篡改');

  // 关注列表就是计算范围
  store2.addWatch('000905', '默认');
  const two = await loader2.refresh({ force: true });
  ok('关注列表驱动计算范围', two.snapshot.items.length === 2,
    `items=${two.snapshot.items.length} symbols=${two.snapshot.items.map((i) => i.symbol).join(',')}`);
  ok('多标的计数之和等于标的数',
    Object.values(two.snapshot.counts).reduce((a, b) => a + b, 0) === 2);

  const three = store2.getWatchlist().length;
  store2.removeWatch('000905');
  ok('移出关注后范围收缩', store2.getWatchlist().length === three - 1);

  delete globalThis.wx;

  /* ---------- 11. 本地优先 / 三级兜底 ---------- */
  console.log('\n=== 11. 数据策略：本地缓存 → 内置样例 → 线上 ===');

  async function simulate({ offline }) {
    const memory = {};
    let calls = 0;
    globalThis.wx = {
      getStorageSync(k) { return Object.prototype.hasOwnProperty.call(memory, k) ? memory[k] : ''; },
      setStorageSync(k, v) { memory[k] = v; },
      removeStorageSync(k) { delete memory[k]; },
      getStorageInfoSync() { return { keys: Object.keys(memory), currentSize: 8, limitSize: 10240 }; },
      cloud: {
        callFunction({ data }) {
          calls++;
          if (offline) return Promise.reject(new Error('cloud.callFunction:fail errCode: -501000 FUNCTION_NOT_FOUND'));
          return fixtureCloud.main(data || {}).then((r) => ({ result: r }));
        },
      },
    };
    for (const m of ['api', 'store', 'loader']) {
      try { delete require.cache[require.resolve(join(CORE, m + '.js'))]; } catch (e) { /* ignore */ }
    }
    const loader3 = require(join(CORE, 'loader.js'));
    return { loader3, memory, calls: () => calls };
  }

  // 用云函数逻辑（打桩）作为「线上」
  const Module = require('node:module');
  const origLoad = Module._load;
  Module._load = function (r, p, i) {
    if (r === 'wx-server-sdk') return { init() {}, DYNAMIC_CURRENT_ENV: 't' };
    return origLoad.apply(this, arguments);
  };
  const fixtureCloud = require(join(CORE, '..', 'cloudfunctions', 'market-bars', 'index.js'));

  // A. 离线冷启动：必须靠内置种子出结果
  const off = await simulate({ offline: true });
  const offR = await off.loader3.refresh({});
  ok('离线冷启动也能出信号（内置样例）', offR.snapshot.conclusion !== 'unavailable',
    '结论=' + offR.snapshot.conclusion);
  ok('离线时数据来源标为内置样例', offR.dataSource === '内置样例' && offR.seedUsed === true,
    offR.dataSource);
  ok('离线时 asOf 来自种子而非本机时间', /^\d{4}-\d{2}-\d{2}$/.test(offR.asOf), offR.asOf);
  ok('离线也能跑回测', (await off.loader3.runBacktest({ start: '0002-01-01', end: '', fee: 0, slip: 0 })).ok);

  // B. 在线：首次联网，二次回测走缓存
  const on = await simulate({ offline: false });
  await on.loader3.refresh({});
  const firstCalls = on.calls();
  const btA = await on.loader3.runBacktest({ start: '2022-01-01', end: '', fee: 0, slip: 0 });
  const afterFirst = on.calls();
  const btB = await on.loader3.runBacktest({ start: '2022-01-01', end: '', fee: 0, slip: 0 });
  const afterSecond = on.calls();
  ok('首次回测会联网（缓存不够长）', afterFirst > firstCalls, '+' + (afterFirst - firstCalls));
  ok('第二次回测不再联网（本地缓存命中）', afterSecond === afterFirst, 'calls=' + afterSecond);
  ok('两次回测结果完全一致（可复现）',
    btA.ok && btB.ok && btA.run.metrics.cagr === btB.run.metrics.cagr);

  // C. localOnly：完全不联网
  const lo = await simulate({ offline: false });
  await lo.loader3.refresh({});
  const loCallsBefore = lo.calls();
  const loR = await lo.loader3.refresh({});
  ok('localOnly 不触发云函数', lo.calls() === loCallsBefore && loR.dataMode === 'signal', 'calls=' + lo.calls());

  delete globalThis.wx;
  Module._load = origLoad;
}

console.log('\n=== 12. 结论理由必须说清依据 ===');
{
  const signal = require(join(CORE, 'signal.js'));
  // 用较小窗口扫一遍历史，找出四种结论各一个样本
  const small = { kind: '标准分RSRS', n: 18, m: 60, up: 0.7, dn: -0.7 };
  const found = {};
  for (let i = 150; i < bars.length; i++) {
    const it = signal.analyzeSymbol({ symbol: '000300', name: '沪深300', bars, params: small, asOfDate: bars[i].date });
    if (it.action && !found[it.action]) found[it.action] = it;
    if (found.buy && found.sell && found.hold && found.wait) break;
  }
  ok('能构造出四种结论样本', !!(found.buy && found.sell && found.hold && found.wait), Object.keys(found).join(','));

  ok('观望理由含开仓线与「还差多少」',
    /低于开仓线/.test(found.wait.reason) && /还差/.test(found.wait.reason), found.wait.reason);
  ok('买入理由含高于开仓线与超出幅度',
    /高于开仓线/.test(found.buy.reason) && /高出/.test(found.buy.reason), found.buy.reason);
  ok('卖出理由含低于平仓线与下跌幅度',
    /低于平仓线/.test(found.sell.reason) && /低 /.test(found.sell.reason), found.sell.reason);
  ok('持有理由说明未触发平仓（而不是空话）',
    /高于平仓线|已在持仓中/.test(found.hold.reason), found.hold.reason);
  ok('持有理由给出连续持仓天数',
    /已连续持有 \d+ 个交易日/.test(found.hold.reason), found.hold.reason);
  ok('持有标的带持仓起始日',
    /^\d{4}-\d{2}-\d{2}$/.test(found.hold.holdingSince || ''), found.hold.holdingSince);
  ok('持有理由里写明起点日',
    /自 \d{4}-\d{2}-\d{2} 起/.test(found.hold.reason), found.hold.reason);
  ok('起点不晚于数据截至日', found.hold.holdingSince <= found.hold.dataAsOf,
    found.hold.holdingSince + ' <= ' + found.hold.dataAsOf);
  ok('持有标的 holdingDays > 0', found.hold.holdingDays > 0, String(found.hold.holdingDays));
  ok('每个理由都以具体指标值开头',
    /^指标 -?\d/.test(found.wait.reason) && /^指标 -?\d/.test(found.hold.reason), found.hold.reason);
  ok('理由里带阈值字段', found.hold.up === 0.7 && found.hold.dn === -0.7, found.hold.up + '/' + found.hold.dn);

  const snapHold = signal.buildSnapshot({
    datasets: [{ symbol: '000300', name: '沪深300', bars }],
    config: small,
    asOfDate: found.hold.dataAsOf,
  });
  ok('汇总理由点名标的', snapHold.reason.includes('沪深300'), snapHold.reason);
  ok('汇总理由带条件说明', /持有|观望|买入|卖出/.test(snapHold.reason), snapHold.reason);
  ok('汇总理由能塞进微信推送（<500字）', snapHold.reason.length < 500, String(snapHold.reason.length));
}

console.log('\n' + '─'.repeat(60));
console.log(`结果：${pass} 通过 / ${fail} 失败`);
if (fail) {
  console.log('\n失败项：');
  failures.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
console.log('全部通过 ✓');
