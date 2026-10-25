// ============================================================================
// RSRS 夏普实验室 v2
//
// 问题：RSRS 还能怎么改，才能让夏普/收益更高？
// 方法：沪深300 日线 2005-01 → 2026-10，信号 T 日决定、赚 T+1，10bp 单边成本，
//       rf=3%（与 core/metrics.js 一致）。把候选改动做成「机制」，每个机制在
//       3 个指标 × 4 个 M × 2 个 S 的参数网格上各跑一遍，用**族中位数**排名，
//       避免「挑到最优参数」的过拟合；再拆 2017 前 / 后看衰减。
//
// 运行：node scripts/rsrs-sharpe-lab.mjs
//       node scripts/rsrs-sharpe-lab.mjs --weekly   额外跑周线
// ============================================================================

import { readFileSync, writeFileSync } from 'node:fs';

const WEEKLY = process.argv.includes('--weekly');
const DATA = 'scripts/data/rsrs_hs300.json';
const COST = 0.001;          // 单边 10bp（0.1%）
const COST_BP = COST * 10000;
const RF = 0.03;
const TD = 244;
const DEV_START = '2006-04-05';
const SPLIT = '2017-01-01';
const RECENT = '2019-01-01';

const daily = JSON.parse(readFileSync(DATA, 'utf8')).daily;
const dates = daily.map((d) => d.date);
const closes = daily.map((d) => d.close);
const N_BAR = daily.length;
const barFrom = Math.max(0, dates.findIndex((d) => d >= DEV_START));

const num = (v) => Number.isFinite(v);
const f2 = (x) => (num(x) ? x.toFixed(2) : '—');
const pct = (x, d = 1) => (num(x) ? (x * 100).toFixed(d) + '%' : '—');
const med = (arr) => {
  const a = arr.filter(num).sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)] : NaN;
};
const mean = (arr) => {
  const a = arr.filter(num);
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
};

/* ============================== 特征 ============================== */

function olsBetaR2(n) {
  const beta = new Array(N_BAR).fill(NaN);
  const r2 = new Array(N_BAR).fill(NaN);
  for (let i = 0; i < N_BAR; i++) {
    const start = i + 1 - n;
    if (start < 0) continue;
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    for (let k = start; k <= i; k++) {
      const x = daily[k].low, y = daily[k].high;
      sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
    }
    const nn = i + 1 - start;
    const nr = nn * sxy - sx * sy;
    const dx = nn * sxx - sx * sx;
    const dy = nn * syy - sy * sy;
    if (dx <= 1e-12 || dy <= 1e-12) continue;
    beta[i] = nr / dx;
    r2[i] = (nr * nr) / (dx * dy);
  }
  return { beta, r2 };
}

function rollingZ(values, m) {
  const out = new Array(values.length).fill(NaN);
  for (let i = 0; i < values.length; i++) {
    if (i + 1 < m) continue;
    const st = i - m + 1;
    let s = 0, c = 0;
    for (let k = st; k <= i; k++) if (num(values[k])) { s += values[k]; c++; }
    if (c < m) continue;
    const mu = s / c;
    let q = 0;
    for (let k = st; k <= i; k++) q += (values[k] - mu) ** 2;
    const sd = Math.sqrt(q / (c - 1));
    if (!(sd > 1e-12)) continue;
    out[i] = (values[i] - mu) / sd;
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

const rets = new Array(N_BAR).fill(NaN);
for (let i = 1; i < N_BAR; i++) rets[i] = closes[i] / closes[i - 1] - 1;

function rollingVol(w) {
  const out = new Array(N_BAR).fill(NaN);
  for (let i = 0; i < N_BAR; i++) {
    if (i + 1 < w) continue;
    const st = i - w + 1;
    let s = 0, c = 0;
    for (let k = st; k <= i; k++) if (num(rets[k])) { s += rets[k]; c++; }
    const mu = s / c;
    let q = 0;
    for (let k = st; k <= i; k++) q += (rets[k] - mu) ** 2;
    out[i] = Math.sqrt(q / (c - 1)) * Math.sqrt(TD);
  }
  return out;
}

function rollingPctRank(arr, w) {
  const out = new Array(arr.length).fill(NaN);
  for (let i = 0; i < arr.length; i++) {
    if (i + 1 < w || !num(arr[i])) continue;
    let c = 0, less = 0;
    for (let k = i - w + 1; k <= i; k++) {
      if (!num(arr[k])) continue;
      c++;
      if (arr[k] <= arr[i]) less++;
    }
    out[i] = c ? less / c : NaN;
  }
  return out;
}

const ma20 = rollingMean(closes, 20);
const ma60 = rollingMean(closes, 60);
const ma200 = rollingMean(closes, 200);
const vol60 = rollingVol(60);
const volRank = rollingPctRank(rollingVol(20), 500);

const FEAT = new Map();
function features(n, m) {
  const key = n + ':' + m;
  if (FEAT.has(key)) return FEAT.get(key);
  const { beta, r2 } = olsBetaR2(n);
  const z = rollingZ(beta, m);
  const zr = new Array(N_BAR).fill(NaN);
  const zp = new Array(N_BAR).fill(NaN);
  for (let i = 0; i < N_BAR; i++) {
    if (num(z[i]) && num(r2[i])) {
      zr[i] = z[i] * r2[i];
      if (num(beta[i])) zp[i] = zr[i] * beta[i];
    }
  }
  const f = { z, zr, zp };
  FEAT.set(key, f);
  return f;
}

/** 指标名 → 序列 */
function kindSeries(f, kind) {
  return kind === '标准分' ? f.z : kind === '修正' ? f.zr : f.zp;
}

/* ============================== 仓位机制 ============================== */

function hysteresis(vals, up, dn) {
  const pos = new Array(N_BAR).fill(0);
  let hold = 0;
  for (let i = 0; i < N_BAR; i++) {
    const v = vals[i];
    if (!num(v)) { pos[i] = 0; continue; }
    if (!hold && v > up) hold = 1;
    else if (hold && v <= dn) hold = 0;
    pos[i] = hold;
  }
  return pos;
}

/** ATR 移动止损：离场线 = 持仓期最高收盘 - k×ATR(14) */
function atrStop(p, k) {
  const tr = new Array(N_BAR).fill(NaN);
  for (let i = 1; i < N_BAR; i++) {
    tr[i] = Math.max(daily[i].high - daily[i].low,
      Math.abs(daily[i].high - closes[i - 1]), Math.abs(daily[i].low - closes[i - 1]));
  }
  const atr = rollingMean(tr, 14);
  const out = new Array(N_BAR).fill(0);
  let hold = 0, peak = -Infinity;
  for (let i = 0; i < N_BAR; i++) {
    if (!hold) {
      if (p[i] === 1) { hold = 1; peak = closes[i]; }
    } else {
      if (closes[i] > peak) peak = closes[i];
      if (num(atr[i]) && closes[i] < peak - k * atr[i]) hold = 0;
      else if (p[i] === 0) hold = 0;
    }
    out[i] = hold;
  }
  return out;
}

function trailStop(p, dd) {
  const out = new Array(N_BAR).fill(0);
  let hold = 0, peak = -Infinity;
  for (let i = 0; i < N_BAR; i++) {
    if (!hold) {
      if (p[i] === 1) { hold = 1; peak = closes[i]; }
    } else {
      if (closes[i] > peak) peak = closes[i];
      if (closes[i] / peak - 1 < -dd) hold = 0;
      else if (p[i] === 0) hold = 0;
    }
    out[i] = hold;
  }
  return out;
}

function volBlock(p, rank, limit) {
  const out = new Array(N_BAR).fill(0);
  let hold = 0;
  for (let i = 0; i < N_BAR; i++) {
    if (!hold && p[i] === 1) hold = num(rank[i]) && rank[i] > limit ? 0 : 1;
    else if (p[i] === 0) hold = 0;
    out[i] = hold;
  }
  return out;
}

function volTarget(p, target) {
  const out = new Array(N_BAR).fill(0);
  let scale = 1, last = -5;
  for (let i = 0; i < N_BAR; i++) {
    if (p[i] !== 1) { out[i] = 0; scale = 1; continue; }
    if (i - last >= 5) {
      scale = num(vol60[i]) && vol60[i] > 0 ? Math.min(1, target / vol60[i]) : 1;
      last = i;
    }
    out[i] = scale;
  }
  return out;
}

const MECH = {
  '0 基线（无过滤）': (p) => p,

  '1 MA20 上倾过滤': (p) => p.map((v, i) => (v === 1 && num(ma20[i - 1]) && num(ma20[i - 3])
    && ma20[i - 1] > ma20[i - 3] ? 1 : 0)),

  '2 跌破 MA20 离场': (p) => {
    const out = new Array(N_BAR).fill(0);
    let hold = 0;
    for (let i = 0; i < N_BAR; i++) {
      if (!hold) hold = p[i] === 1 ? 1 : 0;
      else if (num(ma20[i]) && closes[i] < ma20[i]) hold = 0;
      else if (p[i] === 0) hold = 0;
      out[i] = hold;
    }
    return out;
  },

  '3 跌破 MA60 离场': (p) => {
    const out = new Array(N_BAR).fill(0);
    let hold = 0;
    for (let i = 0; i < N_BAR; i++) {
      if (!hold) hold = p[i] === 1 ? 1 : 0;
      else if (num(ma60[i]) && closes[i] < ma60[i]) hold = 0;
      else if (p[i] === 0) hold = 0;
      out[i] = hold;
    }
    return out;
  },

  '4 只在 MA200 上方做多': (p) => p.map((v, i) => (v === 1 && num(ma200[i - 1]) && closes[i] > ma200[i - 1] ? 1 : 0)),

  '5 MA20 上倾 + MA200': (p) => MECH['4 只在 MA200 上方做多'](MECH['1 MA20 上倾过滤'](p)),

  '6 MA20 上倾 + 8%移动止损': (p) => trailStop(MECH['1 MA20 上倾过滤'](p), 0.08),

  '7 MA20 上倾 + 12%移动止损': (p) => trailStop(MECH['1 MA20 上倾过滤'](p), 0.12),

  '8 MA20 上倾 + 波动过滤': (p) => volBlock(MECH['1 MA20 上倾过滤'](p), volRank, 0.8),

  '9 MA20 上倾 + 目标波动15%': (p) => volTarget(MECH['1 MA20 上倾过滤'](p), 0.15),

  '10 MA20 上倾 + 极端z降半仓': (p, f) => p.map((v, i) => {
    if (v !== 1) return 0;
    const x = f.zr[i];
    return num(x) && x > 2.5 ? 0.5 : 1;
  }),

  '11 MA20 上倾 + 入场需z上行': (p, f) => {
    const out = new Array(N_BAR).fill(0);
    let hold = 0;
    for (let i = 0; i < N_BAR; i++) {
      if (!hold) {
        const ok = p[i] === 1 && i > 0 && num(f.zr[i]) && num(f.zr[i - 1]) && f.zr[i] >= f.zr[i - 1];
        hold = ok ? 1 : 0;
      } else if (p[i] === 0) hold = 0;
      out[i] = hold;
    }
    return out;
  },

  '12 MA20 上倾 + 止损后冷却5日': (p) => {
    const base = MECH['1 MA20 上倾过滤'](p);
    const out = new Array(N_BAR).fill(0);
    let cooldown = 0, hold = 0;
    for (let i = 0; i < N_BAR; i++) {
      if (cooldown > 0) { cooldown--; hold = 0; }
      else if (!hold && base[i] === 1) hold = 1;
      else if (hold && base[i] === 0) { hold = 0; cooldown = 5; }
      out[i] = hold;
    }
    return out;
  },

  '13 仅 8% 移动止损（无MA过滤）': (p) => trailStop(p, 0.08),

  '14 MA20 上倾 + ATR(3倍)止损': (p) => atrStop(MECH['1 MA20 上倾过滤'](p), 3),

  '15 MA10 上倾过滤': (p) => {
    const m = rollingMean(closes, 10);
    return p.map((v, i) => (v === 1 && num(m[i - 1]) && num(m[i - 3]) && m[i - 1] > m[i - 3] ? 1 : 0));
  },

  '16 MA30 上倾过滤': (p) => {
    const m = rollingMean(closes, 30);
    return p.map((v, i) => (v === 1 && num(m[i - 1]) && num(m[i - 3]) && m[i - 1] > m[i - 3] ? 1 : 0));
  },

  '17 MA20 上倾(0.2%缓冲)': (p) => p.map((v, i) => (v === 1 && num(ma20[i - 1]) && num(ma20[i - 3])
    && ma20[i - 1] > ma20[i - 3] * 1.002 ? 1 : 0)),

  '18 3日z中位数 + MA20': (p, f, q, vals) => {
    const sm = vals.map((v, i) => {
      if (i < 2) return NaN;
      const a = [vals[i], vals[i - 1], vals[i - 2]].filter(num).sort((x, y) => x - y);
      return a.length === 3 ? a[1] : NaN;
    });
    return MECH['1 MA20 上倾过滤'](hysteresis(sm, q.s, -0.7));
  },

  '19 连亏后减半（60日≥2次止损）': (p) => {
    const base = MECH['6 MA20 上倾 + 8%移动止损'](p);
    const out = new Array(N_BAR).fill(0);
    const exits = [];
    let hold = 0;
    for (let i = 0; i < N_BAR; i++) {
      if (hold && base[i] === 0) exits.push(i);
      hold = base[i];
      const recent = exits.filter((e) => i - e <= 60).length;
      out[i] = base[i] === 1 ? (recent >= 2 ? 0.5 : 1) : 0;
    }
    return out;
  },

  '20 MA20 + 止损8% + 冷却5日': (p) => {
    const base = MECH['6 MA20 上倾 + 8%移动止损'](p);
    const out = new Array(N_BAR).fill(0);
    let cooldown = 0, hold = 0;
    for (let i = 0; i < N_BAR; i++) {
      if (cooldown > 0) { cooldown--; hold = 0; }
      else if (!hold && base[i] === 1) hold = 1;
      else if (hold && base[i] === 0) { hold = 0; cooldown = 5; }
      out[i] = hold;
    }
    return out;
  },

  '21 MA20 + 止损8% + 目标波动15%': (p) => volTarget(MECH['6 MA20 上倾 + 8%移动止损'](p), 0.15),

  '22 入场需连续 2 日 > S': (p, f, q, vals) => confirmHold(p, vals, q.s, 2),

  '23 入场需连续 3 日 > S': (p, f, q, vals) => confirmHold(p, vals, q.s, 3),

  '24 按 z 分档加仓': (p, f, q, vals) => p.map((v, i) => {
    if (v !== 1) return 0;
    const x = vals[i];
    if (!num(x)) return 0;
    return x > 1.4 ? 1 : 0.5;
  }),
};

/** 连续 k 日指标 > up 才允许持有（退出仍按原状态机） */
function confirmHold(p, vals, up, k) {
  const out = new Array(N_BAR).fill(0);
  for (let i = 0; i < N_BAR; i++) {
    if (p[i] !== 1) { out[i] = 0; continue; }
    if (i + 1 < k) { out[i] = 0; continue; }
    let ok = true;
    for (let j = 0; j < k; j++) if (!(vals[i - j] > up)) { ok = false; break; }
    out[i] = ok ? 1 : 0;
  }
  return out;
}

/* ============================== 回测与统计 ============================== */

function simulate(pos, opt = {}) {
  const from = opt.from ?? barFrom;
  const cost = opt.cost ?? COST;
  const defDaily = opt.defDaily ?? 0; // 空仓时的日收益（0=现金，rf=货基/短债）
  const ret = [];
  let nav = 1, prev = 0, switches = 0;
  for (let i = from + 1; i < N_BAR; i++) {
    const p = pos[i - 1];
    const dp = Math.abs(p - prev);
    const r = rets[i] * p + defDaily * (1 - p) - cost * dp;
    if (dp > 1e-9) switches++;
    nav *= 1 + r;
    ret.push(r);
    prev = p;
  }
  return { ret, nav, switches, from };
}

function statsOf(ret, nav, switches, from) {
  const n = ret.length;
  const mu = mean(ret);
  const sd = Math.sqrt(ret.reduce((a, r) => a + (r - mu) ** 2, 0) / (n - 1));
  let peak = 1, mdd = 0, curve = 1;
  for (const r of ret) { curve *= 1 + r; if (curve > peak) peak = curve; mdd = Math.min(mdd, curve / peak - 1); }
  let down = 0, dc = 0;
  for (const r of ret) if (r < 0) { down += r * r; dc++; }
  const dsd = dc ? Math.sqrt(down / dc) * Math.sqrt(TD) : NaN;
  const cagr = nav > 0 ? Math.pow(nav, TD / n) - 1 : NaN;
  return {
    cagr, vol: sd * Math.sqrt(TD),
    sharpe: sd > 0 ? ((mu - RF / TD) / sd) * Math.sqrt(TD) : NaN,
    sortino: dsd > 0 ? (mu * TD - RF) / dsd : NaN,
    mdd: -mdd,
    calmar: mdd < 0 ? cagr / -mdd : NaN,
    switches, turnover: switches / (n / TD),
  };
}

function subStats(sim, start, end = '9999') {
  const ret = [];
  for (let k = 0; k < sim.ret.length; k++) {
    const d = dates[sim.from + 1 + k];
    if (d >= start && d < end) ret.push(sim.ret[k]);
  }
  if (ret.length < 60) return null;
  let nav = 1;
  for (const r of ret) nav *= 1 + r;
  const mu = mean(ret);
  const sd = Math.sqrt(ret.reduce((a, r) => a + (r - mu) ** 2, 0) / (ret.length - 1));
  let peak = 1, mdd = 0, curve = 1;
  for (const r of ret) { curve *= 1 + r; if (curve > peak) peak = curve; mdd = Math.min(mdd, curve / peak - 1); }
  return {
    cagr: Math.pow(nav, TD / ret.length) - 1,
    sharpe: sd > 0 ? ((mu - RF / TD) / sd) * Math.sqrt(TD) : NaN,
    mdd: -mdd,
    n: ret.length,
  };
}

function evaluate(pos, opt = {}) {
  const sim = simulate(pos, opt);
  const full = statsOf(sim.ret, sim.nav, sim.switches, sim.from);
  return { sim, full, dev: subStats(sim, DEV_START, SPLIT), oos: subStats(sim, SPLIT), recent: subStats(sim, RECENT) };
}

/* ============================== 一览表 ============================== */

const KINDS = ['标准分', '修正', '右偏'];
const PARAMS = [];
for (const kind of KINDS) for (const m of [120, 250, 300, 600]) for (const s of [0.7, 0.9]) PARAMS.push({ kind, m, s });

/** 某机制在整个参数网格上的表现族 */
function family(mechKey) {
  const fn = MECH[mechKey];
  const rows = [];
  for (const p of PARAMS) {
    const f = features(18, p.m);
    const series = kindSeries(f, p.kind);
    const sig = hysteresis(series, p.s, -0.7);
    const pos = fn(sig, f, p, series);
    rows.push({ ...p, ...evaluate(pos) });
  }
  return {
    key: mechKey,
    sharpe: med(rows.map((r) => r.full.sharpe)),
    cagr: med(rows.map((r) => r.full.cagr)),
    vol: med(rows.map((r) => r.full.vol)),
    mdd: med(rows.map((r) => r.full.mdd)),
    calmar: med(rows.map((r) => r.full.calmar)),
    turnover: med(rows.map((r) => r.full.turnover)),
    oos: med(rows.map((r) => (r.oos ? r.oos.sharpe : NaN))),
    recent: med(rows.map((r) => (r.recent ? r.recent.sharpe : NaN))),
    rows,
  };
}

const families = Object.keys(MECH).map(family);
const baseline = families.find((f) => f.key.startsWith('0'));

console.log('RSRS 夏普实验室　沪深300　' + dates[barFrom] + ' → ' + dates[N_BAR - 1]
  + '　' + COST_BP.toFixed(0) + 'bp/边　rf ' + (RF * 100).toFixed(0) + '%　T 日信号赚 T+1');
console.log('参数网格：指标 3 种 × M{120,250,300,600} × S{0.7,0.9}（N=18）= 24 组/机制；表中为族中位数');

console.log('\n' + '═'.repeat(108));
console.log('一、机制对比（族中位数，按全样本夏普排序）');
console.log('─'.repeat(108));
console.log('机制'.padEnd(30) + '年化'.padStart(8) + '波动'.padStart(8) + '夏普'.padStart(7)
  + '回撤'.padStart(8) + '卡玛'.padStart(7) + '换手'.padStart(7) + '2017后'.padStart(8) + '2019后'.padStart(8));
console.log('─'.repeat(108));
for (const f of [...families].sort((a, b) => b.sharpe - a.sharpe)) {
  console.log(f.key.padEnd(30) + pct(f.cagr).padStart(8) + pct(f.vol).padStart(8) + f2(f.sharpe).padStart(7)
    + pct(f.mdd).padStart(8) + f2(f.calmar).padStart(7) + f2(f.turnover).padStart(7)
    + f2(f.oos).padStart(8) + f2(f.recent).padStart(8));
}
console.log('─'.repeat(108));
console.log('基线（无过滤）夏普 ' + f2(baseline.sharpe) + '，回撤 ' + pct(baseline.mdd)
  + '；表中「2017后/2019后」是同一机制在子区间的夏普中位数。');

/* 每个机制赢基线的比例（同参数配对） */
console.log('\n' + '═'.repeat(108));
console.log('二、同参数配对：该机制在 24 组参数里有多少组跑赢「无过滤」');
console.log('─'.repeat(108));
console.log('机制'.padEnd(30) + '夏普提升'.padStart(10) + '胜率'.padStart(8) + '回撤改善'.padStart(10) + '年化变化'.padStart(10));
console.log('─'.repeat(108));
for (const f of families) {
  if (f.key === baseline.key) continue;
  let win = 0, ds = 0, dd = 0, dc = 0;
  for (let i = 0; i < f.rows.length; i++) {
    const a = f.rows[i].full;
    const b = baseline.rows[i].full;
    if (a.sharpe > b.sharpe) win++;
    ds += a.sharpe - b.sharpe;
    dd += a.mdd - b.mdd;
    dc += a.cagr - b.cagr;
  }
  console.log(f.key.padEnd(30) + f2(ds / f.rows.length).padStart(10)
    + (Math.round((win / f.rows.length) * 100) + '%').padStart(8)
    + pct(dd / f.rows.length).padStart(10) + pct(dc / f.rows.length).padStart(10));
}

/* ============================== 口径：现金还是无风险利率 ============================== */

console.log('\n' + '═'.repeat(108));
console.log('三、口径问题：空仓时现金收益算 0 还是算 rf？——同一策略，夏普差多少');
console.log('─'.repeat(108));
console.log('当前 metrics.js 把现金当 0 收益、却从收益里减 3% 无风险利率，等于「空仓还倒贴 3%」。');
console.log('若空仓改拿货基/短债（≈rf），同一策略的夏普会变成：');
console.log('─'.repeat(108));
console.log('策略'.padEnd(30) + '现金口径夏普'.padStart(12) + 'rf口径夏普'.padStart(12) + '差'.padStart(8) + '  年化(现金/rf)');
console.log('─'.repeat(108));
const rfDaily = (1 + RF) ** (1 / TD) - 1;
for (const name of ['修正', '右偏']) {
  for (const s of [0.7, 0.9]) {
    const f = features(18, 300);
    const sig = hysteresis(kindSeries(f, name), s, -0.7);
    const pos = MECH['1 MA20 上倾过滤'](sig, f, {});
    const a = evaluate(pos);
    const b = evaluate(pos, { defDaily: rfDaily });
    console.log((name + ' + MA20 上倾 S=' + s).padEnd(30)
      + f2(a.full.sharpe).padStart(12) + f2(b.full.sharpe).padStart(12)
      + f2(b.full.sharpe - a.full.sharpe).padStart(8)
      + '  ' + pct(a.full.cagr) + ' / ' + pct(b.full.cagr));
  }
}
console.log('注：这不是策略变好，是记账口径。真实国债ETF(511010) 年化约 3%、波动约 2.5%，');
console.log('    比「恒定 rf」略好一点，但远小于上表差额的大部分。');

/* ============================== 周线 ============================== */

if (WEEKLY) {
  console.log('\n' + '═'.repeat(108));
  console.log('四、周线 RSRS（N=18 周≈4 个月，M=52 周≈1 年）——降频能否减少假信号');
  console.log('─'.repeat(108));
  const weeks = [];
  let curKey = null;
  for (let i = 0; i < N_BAR; i++) {
    const d = new Date(dates[i] + 'T00:00:00Z');
    const onejan = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((d - onejan) / 86400000) + onejan.getUTCDay() + 1) / 7);
    const key = d.getUTCFullYear() + '-' + week;
    if (key !== curKey) { weeks.push({ key, idx: i }); curKey = key; }
    else weeks[weeks.length - 1].idx = i;
  }
  const wCloses = weeks.map((w) => closes[w.idx]);
  const wHigh = weeks.map((w) => daily[w.idx].high);
  const wLow = weeks.map((w) => daily[w.idx].low);
  const WN = wCloses.length;

  const wBeta = new Array(WN).fill(NaN);
  const wR2 = new Array(WN).fill(NaN);
  for (let i = 0; i < WN; i++) {
    const st = i + 1 - 18;
    if (st < 0) continue;
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    for (let k = st; k <= i; k++) {
      sx += wLow[k]; sy += wHigh[k]; sxx += wLow[k] ** 2; syy += wHigh[k] ** 2; sxy += wLow[k] * wHigh[k];
    }
    const nr = 18 * sxy - sx * sy;
    const dx = 18 * sxx - sx * sx;
    const dy = 18 * syy - sy * sy;
    if (dx <= 1e-12 || dy <= 1e-12) continue;
    wBeta[i] = nr / dx;
    wR2[i] = (nr * nr) / (dx * dy);
  }
  const wZ = rollingZ(wBeta, 52);
  const wZr = wZ.map((v, i) => (num(v) && num(wR2[i]) ? v * wR2[i] : NaN));
  const wHys = (vals, up) => {
    const out = []; let hold = 0;
    for (let i = 0; i < vals.length; i++) {
      const v = vals[i];
      if (!num(v)) { out.push(0); continue; }
      if (!hold && v > up) hold = 1;
      else if (hold && v <= -0.7) hold = 0;
      out.push(hold);
    }
    return out;
  };
  function backtestWeekly(wPos) {
    const startW = weeks.findIndex((w) => dates[w.idx] >= DEV_START);
    const r = [];
    let nav = 1, prev = 0, sw = 0;
    for (let k = startW + 1; k < WN; k++) {
      const retW = wCloses[k] / wCloses[k - 1] - 1;
      const p = wPos[k - 1];
      const dp = Math.abs(p - prev);
      const pr = retW * p - COST * dp;
      if (dp > 1e-9) sw++;
      nav *= 1 + pr;
      r.push({ date: dates[weeks[k].idx], ret: pr });
      prev = p;
    }
    const mu = mean(r.map((x) => x.ret));
    const sd = Math.sqrt(r.reduce((a, x) => a + (x.ret - mu) ** 2, 0) / (r.length - 1));
    let peak = 1, mdd = 0, curve = 1;
    for (const x of r) { curve *= 1 + x.ret; if (curve > peak) peak = curve; mdd = Math.min(mdd, curve / peak - 1); }
    const years = r.length / 52;
    const sharpe = ((mu - RF / 52) / sd) * Math.sqrt(52);
    const sub = (startDate) => {
      const rr = r.filter((x) => x.date >= startDate).map((x) => x.ret);
      let nv = 1; for (const x of rr) nv *= 1 + x;
      const m = mean(rr);
      const s = Math.sqrt(rr.reduce((a, x) => a + (x - m) ** 2, 0) / (rr.length - 1));
      return ((m - RF / 52) / s) * Math.sqrt(52);
    };
    return {
      cagr: Math.pow(nav, 1 / years) - 1, sharpe,
      mdd: -mdd, turnover: sw / years, oos: sub(SPLIT), recent: sub(RECENT),
    };
  }
  console.log('策略'.padEnd(30) + '年化'.padStart(8) + '夏普'.padStart(7) + '回撤'.padStart(8) + '换手'.padStart(7) + '2017后'.padStart(8) + '2019后'.padStart(8));
  console.log('─'.repeat(108));
  for (const kind of ['标准分', '修正', '右偏']) {
    const vals = kind === '标准分' ? wZ : kind === '修正' ? wZr : wZr.map((v, i) => (num(v) && num(wBeta[i]) ? v * wBeta[i] : NaN));
    const pos = wHys(vals, 0.7);
    const b = backtestWeekly(pos);
    console.log((kind + ' 周线 S=0.7').padEnd(30) + pct(b.cagr).padStart(8) + f2(b.sharpe).padStart(7)
      + pct(b.mdd).padStart(8) + f2(b.turnover).padStart(7) + f2(b.oos).padStart(8) + f2(b.recent).padStart(8));
  }
  console.log('注：周线信号在周五收盘定，赚下一周收益；成本仍按 10bp/次。');
}

/* ============================== 逐年 & 结论 ============================== */

console.log('\n' + '═'.repeat(108));
console.log('五、逐年：修正 + MA20 上倾 vs 买入持有（看钱到底从哪来）');
console.log('─'.repeat(108));
{
  const f = features(18, 300);
  const pos = MECH['1 MA20 上倾过滤'](hysteresis(f.zr, 0.7, -0.7), f, {});
  const a = evaluate(pos);
  const b = evaluate(new Array(N_BAR).fill(1));
  const yearly = (sim) => {
    const map = new Map();
    let cur = null, startNav = 1, nav = 1;
    for (let k = 0; k < sim.ret.length; k++) {
      const y = dates[sim.from + 1 + k].slice(0, 4);
      if (y !== cur) { if (cur) map.set(cur, nav / startNav - 1); cur = y; startNav = nav; }
      nav *= 1 + sim.ret[k];
    }
    if (cur) map.set(cur, nav / startNav - 1);
    return map;
  };
  const ya = yearly(a.sim), yb = yearly(b.sim);
  const ys = [...ya.keys()];
  console.log('年份   ' + ys.map((y) => y.slice(2).padStart(6)).join(''));
  console.log('RSRS   ' + ys.map((y) => ((ya.get(y) * 100).toFixed(0) + '%').padStart(6)).join(''));
  console.log('买入   ' + ys.map((y) => ((yb.get(y) * 100).toFixed(0) + '%').padStart(6)).join(''));
  const win = ys.filter((y) => ya.get(y) > yb.get(y)).length;
  console.log('跑赢年份 ' + win + '/' + ys.length + '；RSRS 全样本 ' + pct(a.full.cagr) + ' / 夏普 ' + f2(a.full.sharpe)
    + ' / 回撤 ' + pct(a.full.mdd) + '；2019 后夏普 ' + f2(a.recent ? a.recent.sharpe : NaN));
}

/* ============================== 推荐配置 ============================== */

console.log('\n' + '═'.repeat(108));
console.log('六、推荐配置：<指标> + MA20 上倾 + 8% 移动止损 + 止损后冷却 5 日');
console.log('─'.repeat(108));
console.log('N   M    S   指标    年化     夏普   回撤    卡玛   2017后夏普  2019后夏普');
console.log('─'.repeat(108));
const picks = [];
for (const kind of ['修正', '右偏']) {
  for (const n of [16, 18, 20]) {
    for (const m of [250, 300]) {
      for (const s of [0.7, 0.9]) {
        const f = features(n, m);
        const sig = hysteresis(kindSeries(f, kind), s, -0.7);
        const pos = MECH['20 MA20 + 止损8% + 冷却5日'](sig, f, { s });
        const e = evaluate(pos);
        picks.push({ kind, n, m, s, ...e });
        console.log(String(n).padEnd(3) + String(m).padEnd(5) + String(s).padEnd(5) + kind.padEnd(6)
          + pct(e.full.cagr).padStart(8) + f2(e.full.sharpe).padStart(7) + pct(e.full.mdd).padStart(8)
          + f2(e.full.calmar).padStart(7) + f2(e.oos ? e.oos.sharpe : NaN).padStart(10)
          + f2(e.recent ? e.recent.sharpe : NaN).padStart(10));
      }
    }
  }
}
const pickSharpes = picks.map((x) => x.full.sharpe);
console.log('─'.repeat(108));
console.log('夏普范围 ' + f2(Math.min(...pickSharpes)) + ' ~ ' + f2(Math.max(...pickSharpes))
  + '，其中 2017 后为正的 ' + picks.filter((x) => x.oos && x.oos.sharpe > 0).length + '/' + picks.length + ' 组');

/* 与线上现状对比 */
{
  const f = features(18, 300);
  const live = evaluate(hysteresis(f.zr, 0.7, -0.7));
  const f2_ = features(18, 300);
  const improvedPos = MECH['20 MA20 + 止损8% + 冷却5日'](hysteresis(f2_.zr, 0.7, -0.7), f2_, { s: 0.7 });
  const improved = evaluate(improvedPos);
  const improvedBond = evaluate(improvedPos, { defDaily: rfDaily });
  console.log('\n线上现状（修正 18/300/0.7，无过滤）　年化 ' + pct(live.full.cagr)
    + '　夏普 ' + f2(live.full.sharpe) + '　回撤 ' + pct(live.full.mdd));
  console.log('推荐配置（同参数 + 三层过滤）　　年化 ' + pct(improved.full.cagr)
    + '　夏普 ' + f2(improved.full.sharpe) + '　回撤 ' + pct(improved.full.mdd)
    + '　（空仓按 rf 记：夏普 ' + f2(improvedBond.full.sharpe) + '）');
  console.log('　　空仓按 rf 的完整口径：年化 ' + pct(improvedBond.full.cagr)
    + '　回撤 ' + pct(improvedBond.full.mdd) + '　卡玛 ' + f2(improvedBond.full.calmar)
    + '　2017 后夏普 ' + f2(improvedBond.oos ? improvedBond.oos.sharpe : NaN)
    + '　2019 后夏普 ' + f2(improvedBond.recent ? improvedBond.recent.sharpe : NaN));
  const p9 = MECH['20 MA20 + 止损8% + 冷却5日'](hysteresis(f2_.zr, 0.9, -0.7), f2_, { s: 0.9 });
  const e9 = evaluate(p9);
  const e9b = evaluate(p9, { defDaily: rfDaily });
  console.log('推荐配置（S 改 0.9）　　　　　　年化 ' + pct(e9.full.cagr)
    + '　夏普 ' + f2(e9.full.sharpe) + '　回撤 ' + pct(e9.full.mdd)
    + '　（空仓按 rf 记：夏普 ' + f2(e9b.full.sharpe) + '）');
  console.log('　　空仓按 rf 的完整口径：年化 ' + pct(e9b.full.cagr)
    + '　回撤 ' + pct(e9b.full.mdd) + '　卡玛 ' + f2(e9b.full.calmar)
    + '　2017 后夏普 ' + f2(e9b.oos ? e9b.oos.sharpe : NaN)
    + '　2019 后夏普 ' + f2(e9b.recent ? e9b.recent.sharpe : NaN));
}

/* ============================== 稳健性 ============================== */

console.log('\n' + '═'.repeat(108));
console.log('七、稳健性：推荐配置在成本 / 无风险利率 / 子区间上的表现');
console.log('─'.repeat(108));
{
  const f = features(18, 300);
  const recPos = MECH['20 MA20 + 止损8% + 冷却5日'](hysteresis(f.zr, 0.7, -0.7), f, { s: 0.7 });
  const sharpeAt = (ret, rf) => {
    const mu = mean(ret);
    const sd = Math.sqrt(ret.reduce((a, r) => a + (r - mu) ** 2, 0) / (ret.length - 1));
    return ((mu - rf / TD) / sd) * Math.sqrt(TD);
  };
  console.log('成本(单边)   年化     夏普   回撤    换手/年');
  for (const c of [0.0005, 0.001, 0.002, 0.003]) {
    const e = evaluate(recPos, { cost: c });
    console.log((c * 10000).toFixed(0).padStart(4) + 'bp ' + pct(e.full.cagr).padStart(12)
      + f2(e.full.sharpe).padStart(8) + pct(e.full.mdd).padStart(8) + f2(e.full.turnover).padStart(8));
  }
  console.log('\nrf          夏普（全样本）');
  for (const r of [0, 0.015, 0.02, 0.03]) {
    const e = evaluate(recPos);
    console.log((r * 100).toFixed(1).padStart(4) + '% ' + f2(sharpeAt(e.sim.ret, r)).padStart(12));
  }
  console.log('\n子区间            年化     夏普   回撤');
  for (const [label, st, en] of [['2006-2011', DEV_START, '2012-01-01'], ['2012-2016', '2012-01-01', SPLIT],
    ['2017-2021', SPLIT, '2022-01-01'], ['2022-2026', '2022-01-01']]) {
    const e = evaluate(recPos);
    const sub = subStats(e.sim, st, en);
    if (sub) console.log(label.padEnd(18) + pct(sub.cagr).padStart(8) + f2(sub.sharpe).padStart(8) + pct(sub.mdd).padStart(8));
  }
}

/* ============================== 落盘 ============================== */

const out = {
  generatedAt: new Date().toISOString(),
  data: { symbol: '000300', from: dates[barFrom], to: dates[N_BAR - 1], bars: N_BAR },
  assumptions: { costPerSide: COST, rf: RF, tradingDays: TD, signalLag: 1 },
  families: families.map((f) => ({
    key: f.key, sharpe: f.sharpe, cagr: f.cagr, vol: f.vol, mdd: f.mdd,
    calmar: f.calmar, turnover: f.turnover, oos: f.oos, recent: f.recent,
    params: f.rows.map((r) => ({
      kind: r.kind, m: r.m, s: r.s,
      full: r.full, dev: r.dev, oos: r.oos, recent: r.recent,
    })),
  })),
};
writeFileSync('reports/rsrs-sharpe-lab.json', JSON.stringify(out, null, 2), 'utf8');
console.log('\n明细已写入 reports/rsrs-sharpe-lab.json');
