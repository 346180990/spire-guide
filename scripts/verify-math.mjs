// 计算引擎数值校验：复利推演、XIRR、估值分档、再平衡、止盈。
// 公式与 harmony/entry/src/main/ets/core/Calc.ets 逐行一致，用于确认算法本身算得对。
// 运行: node scripts/verify-math.mjs

function round2(n) { return Math.round(n * 100) / 100; }

function project(plan, annualReturnPct) {
  const years = Math.max(0, plan.retireAge - plan.currentAge);
  const months = Math.round(years * 12);
  const rm = Math.pow(1 + annualReturnPct / 100, 1 / 12) - 1;
  let value = Math.max(0, plan.existing);
  let invested = Math.max(0, plan.existing);
  const points = [{ year: 0, age: plan.currentAge, invested, value }];
  for (let m = 1; m <= months; m++) {
    const yearIndex = Math.floor((m - 1) / 12);
    const contrib = Math.max(0, plan.monthly) * Math.pow(1 + plan.stepUpPct / 100, yearIndex);
    value = value * (1 + rm) + contrib;
    invested += contrib;
    if (m % 12 === 0) points.push({ year: m / 12, age: plan.currentAge + m / 12, invested, value });
  }
  const infl = Math.pow(1 + plan.inflationPct / 100, years);
  return {
    years, months, points,
    totalInvested: round2(invested),
    finalValue: round2(value),
    finalReal: round2(infl > 0 ? value / infl : value),
    gain: round2(value - invested)
  };
}

const DAY = 86400000;
function dayNumber(date) {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY;
}
function npv(flows, t0, rate) {
  let sum = 0;
  for (const f of flows) sum += f.amount / Math.pow(1 + rate, (dayNumber(f.date) - t0) / 365);
  return sum;
}
function xirr(flows) {
  if (flows.length < 2) return NaN;
  const hasNeg = flows.some((f) => f.amount < 0);
  const hasPos = flows.some((f) => f.amount > 0);
  const times = flows.map((f) => dayNumber(f.date));
  const t0 = Math.min(...times);
  if (!hasNeg || !hasPos || Math.max(...times) - t0 < 30) return NaN;
  let lo = -0.9999, hi = 10, fLo = npv(flows, t0, lo);
  const fHi = npv(flows, t0, hi);
  if (!isFinite(fLo) || !isFinite(fHi) || fLo * fHi > 0) return NaN;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2, fMid = npv(flows, t0, mid);
    if (!isFinite(fMid)) return NaN;
    if (Math.abs(fMid) < 1e-7) return mid;
    if (fLo * fMid <= 0) hi = mid; else { lo = mid; fLo = fMid; }
  }
  return (lo + hi) / 2;
}

function bandFor(p) {
  if (p < 0 || !isFinite(p)) return { label: '不计估值', mult: 1 };
  if (p <= 10) return { label: '极度低估', mult: 2 };
  if (p <= 30) return { label: '低估', mult: 1.5 };
  if (p <= 70) return { label: '合理', mult: 1 };
  if (p <= 80) return { label: '偏高', mult: 0.5 };
  return { label: '高估', mult: 0 };
}
function niceAmount(n) {
  if (n <= 0) return 0;
  if (n >= 200) return Math.round(n / 100) * 100;
  return Math.round(n / 10) * 10;
}

// 最大余数法：保证各项之和等于「四舍五入后的总额」
function roundedAllocation(raws, step) {
  const n = raws.length;
  const out = new Array(n).fill(0);
  let sumRaw = 0;
  for (const r of raws) sumRaw += Math.max(0, r);
  if (n === 0 || step <= 0 || sumRaw <= 0) return out;
  const target = Math.round(sumRaw / step) * step;
  let given = 0;
  for (let i = 0; i < n; i++) {
    out[i] = raws[i] > 0 ? Math.floor(raws[i] / step) * step : 0;
    given += out[i];
  }
  let units = Math.round((target - given) / step);
  while (units > 0) {
    let bestIdx = -1, bestRem = -1;
    for (let i = 0; i < n; i++) {
      if (raws[i] <= 0) continue;
      const rem = raws[i] - out[i];
      if (rem > bestRem) { bestRem = rem; bestIdx = i; }
    }
    if (bestIdx < 0) break;
    out[bestIdx] += step;
    units--;
  }
  while (units < 0) {
    let worstIdx = -1, worstRem = Number.MAX_VALUE;
    for (let i = 0; i < n; i++) {
      if (out[i] <= 0) continue;
      const rem = raws[i] - out[i];
      if (rem < worstRem) { worstRem = rem; worstIdx = i; }
    }
    if (worstIdx < 0) break;
    out[worstIdx] -= step;
    units++;
  }
  return out;
}

function monthSheet(holdings, monthly) {
  const step = monthly >= 2000 ? 100 : 10;
  const bands = holdings.map((h) => bandFor(h.pePercentile));
  const raws = holdings.map((h, i) => (monthly * h.weight) / 100 * bands[i].mult);
  const amounts = roundedAllocation(raws, step);
  const rows = holdings.map((h, i) => ({
    name: h.name,
    base: (monthly * h.weight) / 100,
    band: bands[i],
    amount: amounts[i]
  }));
  return { rows, total: rows.reduce((s, r) => s + r.amount, 0) };
}
function targetEquityPct(age) {
  if (age < 45) return 90;
  if (age < 50) return 75;
  if (age < 55) return 55;
  return 35;
}

let failures = 0;
function check(name, actual, expected, tolerance) {
  const ok = typeof expected === 'number' && typeof actual === 'number'
    ? Math.abs(actual - expected) <= (tolerance ?? 0.01)
    : actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${actual}${ok ? '' : ' (期望 ' + expected + ')'}`);
}

// ---- 1. 复利推演：35→60 岁、每月 5000、年化 8% ----
const plan = {
  currentAge: 35, retireAge: 60, monthly: 5000, stepUpPct: 0,
  annualReturnPct: 8, existing: 0, inflationPct: 2.5
};
const p = project(plan, 8);
// 月定投终值闭式解: 5000 * ((1.08^25 - 1) / ((1.08)^(1/12)-1))
const rm = Math.pow(1.08, 1 / 12) - 1;
const closed = 5000 * ((Math.pow(1.08, 25) - 1) / rm);
check('25年累计投入', p.totalInvested, 1500000, 1);
check('退休时资产 vs 闭式解', p.finalValue, closed, 1);
check('退休时资产约 454.6 万', Math.round(p.finalValue / 10000), 455, 1);
check('折算今天购买力', Math.round(p.finalReal / 10000), Math.round(closed / Math.pow(1.025, 25) / 10000), 1);
check('复利收益为正且约为资产 2 倍', p.gain > p.totalInvested, true);
check('年数', p.years, 25);

// ---- 2. XIRR ----
check('单笔 1 年 10%', round2(xirr([
  { date: '2024-01-01', amount: -1000 },
  { date: '2025-01-01', amount: 1100 }
]) * 100), 10, 0.05);
check('亏损情形为负', xirr([
  { date: '2024-01-01', amount: -1000 },
  { date: '2025-01-01', amount: 900 }
]) < 0, true);
check('只有单向现金流返回 NaN', Number.isNaN(xirr([{ date: '2024-01-01', amount: -1000 }])), true);

// ---- 3. 估值分档 ----
check('分位 5% → 2 倍', bandFor(5).mult, 2);
check('分位 30% → 1.5 倍', bandFor(30).mult, 1.5);
check('分位 55% → 1 倍', bandFor(55).mult, 1);
check('分位 75% → 0.5 倍', bandFor(75).mult, 0.5);
check('分位 85% → 暂停', bandFor(85).mult, 0);
check('未启用估值 → 1 倍', bandFor(-1).mult, 1);
check('取整 2349→2300', niceAmount(2349), 2300);
check('取整 83→80', niceAmount(83), 80);

// ---- 4. 本月清单 ----
const holdings = [
  { name: '纳指100', weight: 25, pePercentile: -1 },
  { name: '标普500', weight: 15, pePercentile: -1 },
  { name: '沪深300Y', weight: 15, pePercentile: 25 },   // 低估 → 1.5 倍
  { name: 'A500Y', weight: 15, pePercentile: 85 },      // 高估 → 暂停
  { name: '养老2050', weight: 15, pePercentile: -1 },
  { name: '红利低波', weight: 10, pePercentile: -1 },
  { name: '黄金', weight: 5, pePercentile: -1 }
];
const sheet = monthSheet(holdings, 5000);
// 原始 1250+750+1125+0+750+500+250 = 4625，四舍五入到百 → 4600
check('分档后本月合计（含暂停项）', sheet.total, 4600);
check('暂停项的金额为 0', sheet.rows[3].amount, 0);
check('低估项拿到 1.5 倍的钱', sheet.rows[2].amount >= 1100, true);
check('各项之和等于总额', sheet.rows.reduce((s, r) => s + r.amount, 0), sheet.total);
check('全部不计估值时合计仍等于基础额 5000',
  monthSheet(holdings.map((h) => ({ ...h, pePercentile: -1 })), 5000).total, 5000);
check('小额定投按十元取整',
  monthSheet(holdings.map((h) => ({ ...h, pePercentile: -1 })), 600).total, 600);

// ---- 5. 再平衡年龄段 ----
check('35 岁目标权益 90%', targetEquityPct(35), 90);
check('47 岁目标权益 75%', targetEquityPct(47), 75);
check('52 岁目标权益 55%', targetEquityPct(52), 55);
check('58 岁目标权益 35%', targetEquityPct(58), 35);

// ---- 6. 止盈分档 ----
const gainLevel = (g) => (g >= 0.8 ? 2 : (g >= 0.5 ? 1 : 0));
check('收益 30% 未触发', gainLevel(0.3), 0);
check('收益 50% 第一档', gainLevel(0.5), 1);
check('收益 80% 第二档', gainLevel(0.8), 2);

console.log('');
console.log(failures === 0 ? '✅ 全部通过' : `❌ ${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
