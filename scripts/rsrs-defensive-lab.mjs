// ============================================================================
// RSRS 防守腿实验
//
// 问题：RSRS 空仓时拿现金，收益被 3% 无风险利率吃掉；改持真实资产（黄金ETF 518880）
//       能不能把年化和夏普抬起来？
//
// 数据：沪深300 日线（scripts/data/rsrs_hs300.json，2005-2026）
//       黄金ETF 518880 日线（web/data/bars/518880.json，2013-07 起）
// 区间：两者重叠段 2013-07 → 2026-10
//
// 口径：信号 T 日决定、赚 T+1；股↔现金 10bp/次，股↔金 20bp/次（卖+买两边）。
// ============================================================================

import { readFileSync } from 'node:fs';

const COST = 0.001;
const RF = 0.03;
const TD = 244;
const SPLIT = '2017-01-01';
const RECENT = '2022-01-01';

const hs = JSON.parse(readFileSync('scripts/data/rsrs_hs300.json', 'utf8')).daily;
const goldRaw = JSON.parse(readFileSync('web/data/bars/518880.json', 'utf8')).bars;

const num = (v) => Number.isFinite(v);
const f2 = (x) => (num(x) ? x.toFixed(2) : '—');
const pct = (x, d = 1) => (num(x) ? (x * 100).toFixed(d) + '%' : '—');

/** 黄金日期 → 收盘价 */
const goldMap = new Map();
for (const r of goldRaw) goldMap.set(String(r[0]), Number(r[2]));

/** 共同交易日（沪深300 有、黄金也有） */
const rows = [];
for (let i = 0; i < hs.length; i++) {
  const c = goldMap.get(hs[i].date);
  if (num(c) && c > 0) rows.push({ date: hs[i].date, hs: hs[i], gold: c, idx: i });
}
const N = rows.length;

/* ---------- RSRS 特征（用全历史，避免预热差异） ---------- */

function ols(n) {
  const beta = new Array(hs.length).fill(NaN);
  const r2 = new Array(hs.length).fill(NaN);
  for (let i = 0; i < hs.length; i++) {
    const st = i + 1 - n;
    if (st < 0) continue;
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    for (let k = st; k <= i; k++) {
      sx += hs[k].low; sy += hs[k].high; sxx += hs[k].low ** 2; syy += hs[k].high ** 2; sxy += hs[k].low * hs[k].high;
    }
    const nr = n * sxy - sx * sy;
    const dx = n * sxx - sx * sx;
    const dy = n * syy - sy * sy;
    if (dx <= 1e-12 || dy <= 1e-12) continue;
    beta[i] = nr / dx;
    r2[i] = (nr * nr) / (dx * dy);
  }
  return { beta, r2 };
}

function rollingZ(vals, m) {
  const out = new Array(vals.length).fill(NaN);
  for (let i = 0; i < vals.length; i++) {
    if (i + 1 < m) continue;
    const st = i - m + 1;
    let s = 0, c = 0;
    for (let k = st; k <= i; k++) if (num(vals[k])) { s += vals[k]; c++; }
    if (c < m) continue;
    const mu = s / c;
    let q = 0;
    for (let k = st; k <= i; k++) q += (vals[k] - mu) ** 2;
    const sd = Math.sqrt(q / (c - 1));
    if (sd > 1e-12) out[i] = (vals[i] - mu) / sd;
  }
  return out;
}

function rollingMean(arr, w) {
  const out = new Array(arr.length).fill(NaN);
  let s = 0, c = 0;
  for (let i = 0; i < arr.length; i++) {
    if (num(arr[i])) { s += arr[i]; c++; }
    if (i >= w && num(arr[i - w])) { s -= arr[i - w]; c--; }
    if (i + 1 >= w && c === w) out[i] = s / w;
  }
  return out;
}

const { beta, r2 } = ols(18);
const z = rollingZ(beta, 300);
const zr = z.map((v, i) => (num(v) && num(r2[i]) ? v * r2[i] : NaN));
const closes = hs.map((d) => d.close);
const ma20 = rollingMean(closes, 20);

/** 修正标准分状态机 + MA20 上倾 + 8% 移动止损 + 冷却 5 日 */
function buildSignal() {
  const raw = new Array(hs.length).fill(0);
  let hold = 0;
  for (let i = 0; i < hs.length; i++) {
    const v = zr[i];
    if (!num(v)) { raw[i] = 0; continue; }
    if (!hold && v > 0.7) hold = 1;
    else if (hold && v <= -0.7) hold = 0;
    raw[i] = hold;
  }
  const filt = raw.map((v, i) => (v === 1 && num(ma20[i - 1]) && num(ma20[i - 3]) && ma20[i - 1] > ma20[i - 3] ? 1 : 0));
  const stopped = new Array(hs.length).fill(0);
  let hold2 = 0, peak = -Infinity;
  for (let i = 0; i < hs.length; i++) {
    if (!hold2) {
      if (filt[i] === 1) { hold2 = 1; peak = closes[i]; }
    } else {
      if (closes[i] > peak) peak = closes[i];
      if (closes[i] / peak - 1 < -0.08) hold2 = 0;
      else if (filt[i] === 0) hold2 = 0;
    }
    stopped[i] = hold2;
  }
  const out = new Array(hs.length).fill(0);
  let cool = 0, h3 = 0;
  for (let i = 0; i < hs.length; i++) {
    if (cool > 0) { cool--; h3 = 0; }
    else if (!h3 && stopped[i] === 1) h3 = 1;
    else if (h3 && stopped[i] === 0) { h3 = 0; cool = 5; }
    out[i] = h3;
  }
  return out;
}
const sig = buildSignal();

/* ---------- 回测 ---------- */

/** key: 0=空仓资产（现金/黄金），1=沪深300 */
function run(mode) {
  // mode: 'cash' | 'gold'
  const r = [];
  let prev = 0;
  for (let k = 1; k < N; k++) {
    const p = sig[rows[k - 1].idx];
    const rHs = rows[k].hs.close / rows[k - 1].hs.close - 1;
    const rG = rows[k].gold / rows[k - 1].gold - 1;
    const switchGold = mode === 'gold' && p !== prev;
    const cost = switchGold ? 2 * COST : Math.abs(p - prev) * COST;
    const ret = p * rHs + (1 - p) * (mode === 'gold' ? rG : 0) - cost;
    prev = p;
    r.push({ date: rows[k].date, ret });
  }
  return r;
}

function stats(r, start = '0000', end = '9999') {
  const sub = r.filter((x) => x.date >= start && x.date < end);
  if (sub.length < 60) return null;
  const rets = sub.map((x) => x.ret);
  const mu = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mu) ** 2, 0) / (rets.length - 1));
  let nav = 1, peak = 1, mdd = 0;
  for (const x of rets) { nav *= 1 + x; if (nav > peak) peak = nav; mdd = Math.min(mdd, nav / peak - 1); }
  const cagr = Math.pow(nav, TD / rets.length) - 1;
  return {
    cagr, vol: sd * Math.sqrt(TD),
    sharpe: sd > 0 ? ((mu - RF / TD) / sd) * Math.sqrt(TD) : NaN,
    mdd: -mdd, calmar: mdd < 0 ? cagr / -mdd : NaN,
  };
}

const cashR = run('cash');
const goldR = run('gold');
const bhHs = rows.map((r, k) => ({ date: r.date, ret: k ? r.hs.close / rows[k - 1].hs.close - 1 : 0 })).slice(1);
const bhGold = rows.map((r, k) => ({ date: r.date, ret: k ? r.gold / rows[k - 1].gold - 1 : 0 })).slice(1);

const defs = [
  ['沪深300 买入持有', bhHs],
  ['黄金ETF 买入持有', bhGold],
  ['RSRS择时（空仓现金）', cashR],
  ['RSRS择时（空仓黄金）', goldR],
];

console.log('防守腿实验　' + rows[0].date + ' → ' + rows[N - 1].date
  + '　信号=修正 N18/M300/S0.7 + MA20上倾 + 8%止损 + 冷却5日');
console.log('股↔现金 10bp/次，股↔金 20bp/次，rf=3%\n');
console.log('策略'.padEnd(24) + '年化'.padStart(8) + '波动'.padStart(8) + '夏普'.padStart(7)
  + '回撤'.padStart(8) + '卡玛'.padStart(7) + '  2017后夏普  2022后夏普');
console.log('─'.repeat(96));
for (const [name, r] of defs) {
  const a = stats(r);
  const b = stats(r, SPLIT);
  const c = stats(r, RECENT);
  console.log(name.padEnd(24) + pct(a.cagr).padStart(8) + pct(a.vol).padStart(8) + f2(a.sharpe).padStart(7)
    + pct(a.mdd).padStart(8) + f2(a.calmar).padStart(7)
    + f2(b ? b.sharpe : NaN).padStart(11) + f2(c ? c.sharpe : NaN).padStart(11));
}
console.log('─'.repeat(96));
console.log('注意：黄金 2013-2026 是一段大牛市，结论不能外推；这里只回答「空仓那部分钱有没有更好的去处」。');
