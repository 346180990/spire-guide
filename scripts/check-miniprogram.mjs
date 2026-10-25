// 精简版小程序自检：拉真实行情 → 跑推荐引擎 → 断言 + 打印今日建议
// 运行: node scripts/check-miniprogram.mjs

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'miniprogram');

// store.js 依赖 wx，做个最小 mock
globalThis.wx = {
  _d: null,
  getStorageSync() { return this._d; },
  setStorageSync(k, v) { this._d = v; },
};

const { TARGETS, DEFAULT_WEIGHTS } = require(join(ROOT, 'core/targets.js'));
const { recommend, adjustBySignal, allocateTotal } = require(join(ROOT, 'core/recommend.js'));
const store = require(join(ROOT, 'core/store.js'));
const marketFn = require(join(ROOT, 'cloudfunctions/market/index.js'));

let fail = 0;
function check(name, actual, expected, tol) {
  const ok = (typeof expected === 'number' && typeof actual === 'number')
    ? Math.abs(actual - expected) <= (tol === undefined ? 0.01 : tol)
    : actual === expected;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${actual}${ok ? '' : ' (期望 ' + expected + ')'}`);
}

console.log('=== 1. 目标与配置 ===');
check('标的数 4', TARGETS.length, 4);
const wsum = Object.values(DEFAULT_WEIGHTS).reduce((s, v) => s + v, 0);
check('默认权重合计 100', wsum, 100);
const cfg = store.defaultConfig();
check('默认月投 5000', cfg.monthly, 5000);

console.log('\n=== 2. 金额分配自洽 ===');
const alloc = allocateTotal([20, 20, 40, 20], 5000, 100);
check('合计等于月投', alloc.reduce((s, v) => s + v, 0), 5000);
check('按权重分配正确', alloc.join(','), '1000,1000,2000,1000');
const alloc2 = allocateTotal([1, 1, 1, 1], 1000, 100);
check('等权各 250', alloc2.join(','), '300,300,200,200');
check('等权合计 1000', alloc2.reduce((s, v) => s + v, 0), 1000);

console.log('\n=== 3. 信号分档 ===');
const tA = TARGETS.find((t) => t.key === 'a');
const tUS = TARGETS.find((t) => t.key === 'us');
const tBond = TARGETS.find((t) => t.key === 'bond');

check('A股 区间位置 10% → 1.3 倍',
  adjustBySignal(tA, { rangePos: 10, ddFromPeak: -60, ret1y: -20 }).mult, 1.3);
check('A股 区间位置 50% → 1 倍',
  adjustBySignal(tA, { rangePos: 50, ddFromPeak: -10, ret1y: 5 }).mult, 1);
check('A股 区间位置 90% → 0.85 倍',
  adjustBySignal(tA, { rangePos: 90, ddFromPeak: -2, ret1y: 30 }).mult, 0.85);
check('美股 低于年线 8% → 1.3 倍',
  adjustBySignal(tUS, { maGapPct: -8, rangePos: 30, ret1y: -10 }).mult, 1.3);
check('美股 在年线上方 → 不减仓（1 倍）',
  adjustBySignal(tUS, { maGapPct: 6, rangePos: 96, ret1y: 13 }).mult, 1);
check('债券恒定 1 倍',
  adjustBySignal(tBond, { ret1y: -3, maGapPct: 1 }).mult, 1);
check('无数据时 1 倍', adjustBySignal(tA, null).mult, 1);
check('每条推荐都有理由',
  adjustBySignal(tA, { rangePos: 10, ddFromPeak: -60, ret1y: -20 }).reasons.length > 0, true);

console.log('\n=== 4. 拉真实行情 ===');
const market = await marketFn.main({});
check('行情获取成功', market.ok, true);
check('拿到 4 个标的', market.items.length, 4);
for (const it of market.items) {
  check(`  ${it.name} 有价格`, it.signal.last > 0, true);
}

console.log('\n=== 5. 推荐结果 ===');
const rec = recommend(cfg, market);
check('推荐行数 4', rec.rows.length, 4);
check('合计等于月投', rec.total, cfg.monthly);
check('每行都有理由', rec.rows.every((r) => r.reasons.length > 0), true);
check('无市值时不做再平衡判断', rec.needRebalance, false);

// 故意把市值调成权益超配
const cfg2 = store.defaultConfig();
cfg2.holdings = { a: 50000, us: 50000, bond: 20000, gold: 20000 };
const rec2 = recommend(cfg2, market);
check('权益超配触发倾斜', rec2.needRebalance, true);
const eqRow = rec2.rows.find((r) => r.key === 'a');
const bondRow = rec2.rows.find((r) => r.key === 'bond');
check('超配的权益被减配（低于基础额）', eqRow.amount < 1000, true);
check('低配的债券被加配（高于基础额）', bondRow.amount > 2000, true);
check('倾斜后总额仍等于月投', rec2.total, cfg2.monthly);

console.log('\n=== 6. 权重不完整也不崩 ===');
const cfg3 = store.defaultConfig();
cfg3.weights = { a: 30, us: 0, bond: 30, gold: 0 };
const rec3 = recommend(cfg3, market);
check('只有两只标的也能算', rec3.rows.filter((r) => r.amount > 0).length, 2);
check('总额仍等于月投', rec3.total, cfg3.monthly);

console.log('\n' + '─'.repeat(64));
console.log('今日实际建议（真实行情 ' + rec.asOf + '）');
console.log('─'.repeat(64));
console.log('市场状态：' + rec.state);
console.log('');
for (const r of rec.rows) {
  console.log(`${r.name.padEnd(9)} ${String(r.amount).padStart(6)} 元  ${r.verdict}  ×${r.mult.toFixed(2)}`);
  for (const line of r.reasons) console.log('           · ' + line);
  console.log('');
}
if (rec.needRebalance) console.log('倾斜：' + rec.rebalanceNotes.join('；'));
console.log('合计：' + rec.total + ' 元 / 月投上限 ' + rec.monthly + ' 元');
console.log('─'.repeat(64));

console.log('');
console.log(fail === 0 ? '✅ 全部通过' : `❌ ${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
