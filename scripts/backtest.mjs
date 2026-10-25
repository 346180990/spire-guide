// ============================================================================
// 定投策略回测引擎（开发期工具；数据缓存到 scripts/data/，之后离线可复现）
//
// 用真实历史月线检验「趋势分档 + 分段止盈 + 年度再平衡」到底有没有用。
//
// 口径（看结论前必读）：
//  1. 全收益：2012-05 后用 510300 ETF 前复权价算月度收益（含分红再投资）；
//     更早的月份用「指数价格收益 + 年化股息率假设」，股息率见 ASSUME。
//  2. 前视偏差：均线用 200 日 SMA、回撤用历史峰值，全部只用当时已知数据。
//  3. 滚动窗口：单一路径无意义，同时输出 3/5/10/15 年滚动起点的正收益占比。
//  4. 成本：按年化费率损耗参数化扣除（默认 0.3%/年），非逐笔真实申赎费。
//  5. 债券：未接入真实债基历史，按年化 3% 固定假设（止盈与再平衡的转入端）。
//  6. 止盈只是「权益 → 债券」的账户内搬移，钱没离开账户，
//     因此既不计入 XIRR 现金流，也不在收益里单独加回（否则双重计数）。
//
// 运行: node scripts/backtest.mjs [--debug]
// ============================================================================

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, 'data');
const DEBUG = process.argv.includes('--debug');

// ---------------------------------------------------------------- 参数假设
export const ASSUME = {
  monthlyBase: 5000,
  feePerYear: 0.003,
  bondRatePerYear: 0.03,
  takeProfitFirst: 0.5,
  takeProfitStep: 0.3,
  takeProfitSellRatio: 0.2,
  takeProfitMaxPerMonth: 4,
  targetEquity: 0.9,
  rebalanceBand: 0.05,
  // 流速模型（逆熵者思路的清理版）
  flowPace: 12,      // 合理估值时用多少个月投完现金池
  flowSellZ: 1.0,    // z 高于此值开始卖出
  flowWindow: 120,   // 滚动 z 的窗口（月），约 10 年
  dividendYield: { hs300: 0.020, a500: 0.022, sp500: 0.018, ndx: 0.006, hsi: 0.035, div: 0.045 },
};

export const TARGETS = {
  hs300: { secid: '1.000300', name: '沪深300', note: '' },
  a500: { secid: '1.000510', name: '中证A500', note: '2024 年发布，历史为回溯计算，存在编制偏差' },
  sp500: { secid: '100.SPX', name: '标普500', note: '美元计价，未计汇率' },
  ndx: { secid: '100.NDX', name: '纳斯达克100', note: '美元计价，未计汇率' },
  hsi: { secid: '100.HSI', name: '恒生指数', note: '港币计价' },
  div: { secid: '1.000922', name: '中证红利', note: '' },
};

export const ETF_SECID = { etf300: '1.510300', bond: '1.511010' };

// ---------------------------------------------------------------- 数据获取
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };

async function fetchKlines(secid, klt, fqt) {
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}`
    + `&fields1=f1,f2,f3,f4&fields2=f51,f53&klt=${klt}&fqt=${fqt}&beg=19900101&end=20500101`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 15000);
      const res = await fetch(url, { signal: ctl.signal, headers: UA });
      clearTimeout(timer);
      const json = await res.json();
      const klines = json?.data?.klines;
      if (!Array.isArray(klines) || klines.length === 0) return [];
      return klines
        .map((s) => {
          const [date, close] = s.split(',');
          return { date, close: Number(close) };
        })
        .filter((x) => Number.isFinite(x.close) && x.close > 0);
    } catch (e) {
      if (attempt === 3) {
        console.warn(`  ! 拉取失败 ${secid}: ${e.message}`);
        return null;
      }
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  return null;
}

export async function loadSeries(key, secid, kind) {
  await mkdir(DATA_DIR, { recursive: true });
  const cacheFile = join(DATA_DIR, `${key}.json`);
  if (existsSync(cacheFile)) {
    const cached = JSON.parse(await readFile(cacheFile, 'utf8'));
    if (Array.isArray(cached.daily) && cached.daily.length > 100) {
      console.log(`  缓存命中 ${key.padEnd(8)} 日线 ${cached.daily.length} 根`);
      return cached;
    }
  }
  console.log(`  联网拉取 ${key.padEnd(8)} ...`);
  const fqt = kind === 'etf' ? 1 : 0;
  const daily = await fetchKlines(secid, 101, fqt);
  const monthly = await fetchKlines(secid, 103, fqt);
  if (daily === null && monthly === null) return null;
  const payload = {
    key, secid, fetchedAt: new Date().toISOString(),
    daily: daily ?? [], monthly: monthly ?? [],
  };
  await writeFile(cacheFile, JSON.stringify(payload), 'utf8');
  console.log(`  写入缓存 ${key.padEnd(8)} 日线 ${payload.daily.length} 根 / 月线 ${payload.monthly.length} 根`);
  return payload;
}

// ---------------------------------------------------------------- 序列构建
/** 日线聚合成月末收盘 + 200 日均线；日线不足时退化用月线 + 10 月均线 */
export function toMonthly(payload) {
  const out = [];
  if (payload.daily.length >= 500) {
    let i = 0;
    while (i < payload.daily.length) {
      const ym = payload.daily[i].date.slice(0, 7);
      let last = i;
      while (last + 1 < payload.daily.length && payload.daily[last + 1].date.slice(0, 7) === ym) last++;
      const ma200 = i >= 199
        ? payload.daily.slice(i - 199, i + 1).reduce((s, x) => s + x.close, 0) / 200
        : null;
      out.push({ ym, close: payload.daily[last].close, ma200 });
      i = last + 1;
    }
    return out;
  }
  const m = payload.monthly;
  for (let i = 0; i < m.length; i++) {
    const ma = i >= 9 ? m.slice(i - 9, i + 1).reduce((s, x) => s + x.close, 0) / 10 : null;
    out.push({ ym: m[i].date.slice(0, 7), close: m[i].close, ma200: ma });
  }
  return out;
}

/** 全收益序列：优先用 ETF 前复权月度收益（含分红），否则指数价格收益 + 股息假设 */
export function buildTotalReturn(indexMonthly, etfMonthly, dividendYield) {
  const etfByYm = new Map();
  if (etfMonthly) for (const r of etfMonthly) etfByYm.set(r.ym, r.close);
  const rows = [];
  let tr = 1000;
  for (let i = 0; i < indexMonthly.length; i++) {
    const cur = indexMonthly[i];
    let ret = 0;
    if (i > 0) {
      const prev = indexMonthly[i - 1];
      const etfCur = etfByYm.get(cur.ym);
      const etfPrev = etfByYm.get(prev.ym);
      if (etfCur !== undefined && etfPrev !== undefined) {
        ret = etfCur / etfPrev - 1;
      } else {
        ret = cur.close / prev.close - 1 + dividendYield / 12;
      }
    }
    tr *= 1 + ret;
    rows.push({ ym: cur.ym, price: cur.close, ma: cur.ma200, tr });
  }
  return rows;
}

// ---------------------------------------------------------------- 指标
const DAY_MS = 86400000;
const ymToDay = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return Date.UTC(y, m, 0) / DAY_MS;
};

export function xirr(flows) {
  if (flows.length < 2) return NaN;
  const t0 = Math.min(...flows.map((f) => ymToDay(f.ym)));
  const npv = (rate) => flows.reduce(
    (s, f) => s + f.amount / Math.pow(1 + rate, (ymToDay(f.ym) - t0) / 365), 0);
  let lo = -0.9999;
  let hi = 10;
  let fLo = npv(lo);
  const fHi = npv(hi);
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) return NaN;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (!Number.isFinite(fMid)) return NaN;
    if (Math.abs(fMid) < 1e-7) return mid;
    if (fLo * fMid <= 0) hi = mid;
    else { lo = mid; fLo = fMid; }
  }
  return (lo + hi) / 2;
}

export function maxDrawdown(values) {
  let peak = -Infinity;
  let mdd = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    if (peak > 0) mdd = Math.min(mdd, v / peak - 1);
  }
  return mdd;
}

export const pct = (x, d = 1) => (Number.isFinite(x) ? (x * 100).toFixed(d) + '%' : '—');
export const num = (x) => Math.round(x).toLocaleString('zh-CN');

/** 判断某个月是否为再平衡检查月 */
export function isRebalanceMonth(ym, freq) {
  if (freq === 'M') return true;
  if (freq === 'Q') return ['-03', '-06', '-09', '-12'].some((s) => ym.endsWith(s));
  return ym.endsWith('-12');
}

// ---------------------------------------------------------------- 策略模拟
/**
 * 单标的定投模拟。
 * opts.mode: 'fixed' | 'ma' | 'drawdown' | 'flow'
 * opts.takeProfit / opts.rebalance: boolean
 * opts.tpToBond: 卖出所得转入债券（true）还是留现金（false，原作做法）
 * bondTr: 债券全收益序列（与 rows 等长）；缺省时按固定年化合成
 */
export function simulate(rows, opts, bondTr) {
  const feeM = Math.pow(1 - ASSUME.feePerYear, 1 / 12) - 1;
  const base = ASSUME.monthlyBase;
  const bondAt = (i) => (bondTr ? bondTr[i] : Math.pow(1 + ASSUME.bondRatePerYear, i / 12));

  let units = 0;        // 权益份额（全收益指数份额）
  let bondUnits = 0;    // 债券份额（债券全收益指数份额）
  let cash = 0;         // 现金池（原作机制：先攒后投）
  let invested = 0;
  let sold = 0;
  let sellCount = 0;
  let boostMonths = 0;
  let paceSum = 0;
  let paceCount = 0;
  let peakPrice = -Infinity;
  let nextTpThreshold = ASSUME.takeProfitFirst;

  const flows = [];
  const accountSeries = [];
  let lastTotal = 0;
  let lastCashShare = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // units 以「全收益指数份额」计价，价值 = units × tr 自动随指数增长，
    // 这里绝不能再乘一次收益率（会把复利平方）。每月只做：扣费 + 买入。
    units *= 1 + feeM;

    peakPrice = Math.max(peakPrice, row.price);

    // ---- 每月入金
    let mult = 1;
    if (opts.mode === 'flow') {
      // 现金池模式：入金先进现金池，再按估值决定投放速度
      invested += base;
      cash += base;
      flows.push({ ym: row.ym, amount: -base });
    } else {
      if (i > 0) {
        if (opts.mode === 'ma') {
          if (row.ma !== null && row.price < row.ma) mult = 1.5;
        } else if (opts.mode === 'drawdown') {
          const dd = row.price / peakPrice - 1;
          if (dd <= -0.35) mult = 2;
          else if (dd <= -0.20) mult = 1.5;
        }
      }
      if (mult > 1) boostMonths++;
      const contrib = base * mult;
      invested += contrib;
      units += contrib / row.tr;
      flows.push({ ym: row.ym, amount: -contrib });
    }

    // ---- 流速模型：按滚动 z 决定「本月投放多少现金」，高估时反向卖出
    if (opts.mode === 'flow') {
      const z = row.z;
      if (z !== null && z !== undefined && Math.abs(z) < 100) {
        if (z > ASSUME.flowSellZ) {
          const intensity = Math.min(0.5, 0.1 + 0.1 * (z - ASSUME.flowSellZ));
          const equityValueNow = units * row.tr;
          const sellAmount = equityValueNow * intensity;
          if (sellAmount > 0) {
            units -= sellAmount / row.tr;
            if (opts.tpToBond) {
              bondUnits += sellAmount / bondAt(i);
            } else {
              cash += sellAmount;
            }
            sold += sellAmount;
            sellCount++;
          }
        } else {
          const pace = Math.max(1, Math.min(ASSUME.flowPace * 4, ASSUME.flowPace * Math.pow(2, z)));
          const spend = Math.min(cash, cash / pace);
          if (spend > 0) {
            units += spend / row.tr;
            cash -= spend;
          }
          paceSum += pace;
          paceCount++;
        }
      }
    }

    // ---- 分段止盈：累计收益率每突破一个台阶，卖出权益的 20%
    if (opts.takeProfit) {
      let guard = 0;
      while (guard < ASSUME.takeProfitMaxPerMonth) {
        const equityValue = units * row.tr;
        const total = equityValue + bondUnits * bondAt(i) + cash;
        const gainRatio = invested > 0 ? (total - invested) / invested : 0;
        if (gainRatio < nextTpThreshold) break;
        const sellAmount = equityValue * ASSUME.takeProfitSellRatio;
        if (sellAmount <= 0) break;
        units -= sellAmount / row.tr;
        if (opts.tpToBond) {
          bondUnits += sellAmount / bondAt(i);
        } else {
          cash += sellAmount;
        }
        sold += sellAmount;
        sellCount++;
        nextTpThreshold += ASSUME.takeProfitStep;
        guard++;
      }
    }

    // ---- 定期再平衡（默认年度，可切月度/季度；可选「高估时不回补权益」）
    if (opts.rebalance && isRebalanceMonth(row.ym, opts.rebalanceFreq)) {
      const equityValue = units * row.tr;
      const bondValue = bondUnits * bondAt(i);
      const total = equityValue + bondValue + cash;
      if (total > 0) {
        const share = equityValue / total;
        if (Math.abs(share - ASSUME.targetEquity) > ASSUME.rebalanceBand) {
          let diff = total * ASSUME.targetEquity - equityValue;
          // 估值很高时不把债券/现金换回权益，避免「越贵越买」
          if (diff > 0 && opts.rebalanceZMax !== undefined
            && row.z !== null && row.z !== undefined && row.z > opts.rebalanceZMax) {
            diff = 0;
          }
          if (diff !== 0) {
            units += diff / row.tr;
            bondUnits -= diff / bondAt(i);
          }
        }
      }
    }

    const equityValue = units * row.tr;
    const bondValue = bondUnits * bondAt(i);
    lastTotal = equityValue + bondValue + cash;
    lastCashShare = lastTotal > 0 ? cash / lastTotal : 0;
    accountSeries.push(lastTotal);
    if (DEBUG && (i < 3 || i === rows.length - 1)) {
      console.log(`    [debug] i=${i} ym=${row.ym} tr=${row.tr.toFixed(2)} units=${units.toFixed(4)}`
        + ` bond=${bondUnits.toFixed(2)} cash=${cash.toFixed(0)} invested=${invested} value=${lastTotal.toFixed(0)}`);
    }
  }

  const finalValue = lastTotal;
  flows.push({ ym: rows[rows.length - 1].ym, amount: finalValue });

  return {
    months: rows.length,
    contributeSum: invested,
    finalValue,
    sold,
    gain: finalValue - invested,
    gainRatio: invested > 0 ? (finalValue - invested) / invested : 0,
    xirr: xirr(flows),
    maxDrawdown: maxDrawdown(accountSeries),
    sellCount,
    boostMonths,
    avgPace: paceCount > 0 ? paceSum / paceCount : 0,
    cashShare: lastCashShare,
    accountSeries,
  };
}

/** 一次性全投对照：期初就投入与定投总额等额的资金（同一费率） */
function lumpSum(rows, totalCapital) {
  const feeDrag = Math.pow(1 - ASSUME.feePerYear, rows.length / 12);
  const units = (totalCapital / rows[0].tr) * feeDrag;
  const series = rows.map((r) => units * r.tr);
  const finalValue = units * rows[rows.length - 1].tr;
  return {
    months: rows.length,
    contributeSum: totalCapital,
    finalValue,
    sold: 0,
    gain: finalValue - totalCapital,
    gainRatio: (finalValue - totalCapital) / totalCapital,
    xirr: xirr([
      { ym: rows[0].ym, amount: -totalCapital },
      { ym: rows[rows.length - 1].ym, amount: finalValue },
    ]),
    maxDrawdown: maxDrawdown(series),
    sellCount: 0,
    boostMonths: 0,
  };
}

// ---------------------------------------------------------------- 辅助序列
/** 债券全收益序列：优先用国债 ETF(511010) 复权价，缺失月份按固定年化合成 */
export function buildBondTr(rows, bondMonthly, fallbackRate) {
  const map = new Map();
  if (bondMonthly) for (const r of bondMonthly) map.set(r.ym, r.close);
  const out = [];
  let tr = 1000;
  const fm = Math.pow(1 + fallbackRate, 1 / 12);
  for (let i = 0; i < rows.length; i++) {
    if (i > 0) {
      const cur = map.get(rows[i].ym);
      const prev = map.get(rows[i - 1].ym);
      if (cur !== undefined && prev !== undefined && prev > 0) tr *= cur / prev;
      else tr *= fm;
    }
    out.push(tr);
  }
  return out;
}

/** 给每行算 ln(价格) 的滚动 z 值：只用「当时已知」的窗口，避免未来函数 */
export function addFlowSignal(rows, window, minPeriod) {
  const lnp = rows.map((r) => Math.log(r.price));
  for (let i = 0; i < rows.length; i++) {
    const from = Math.max(0, i - window + 1);
    const sample = lnp.slice(from, i + 1);
    if (sample.length < minPeriod) {
      rows[i].z = null;
      continue;
    }
    const mean = sample.reduce((s, x) => s + x, 0) / sample.length;
    const varr = sample.reduce((s, x) => s + (x - mean) * (x - mean), 0) / sample.length;
    const sd = Math.sqrt(varr);
    rows[i].z = sd > 1e-9 ? (lnp[i] - mean) / sd : null;
  }
  return rows;
}

export const STRATEGIES = [
  { key: 'A', name: '普通定投', opts: { mode: 'fixed' } },
  { key: 'B', name: '均线分档', opts: { mode: 'ma' } },
  { key: 'C', name: '回撤分档', opts: { mode: 'drawdown' } },
  { key: 'D', name: '均线+分段止盈', opts: { mode: 'ma', takeProfit: true, tpToBond: true } },
  { key: 'E', name: '均线+止盈+再平衡', opts: { mode: 'ma', takeProfit: true, tpToBond: true, rebalance: true } },
  { key: 'F', name: '流速模型(留现金)', opts: { mode: 'flow', tpToBond: false } },
  { key: 'G', name: '流速模型(转债+再平衡)', opts: { mode: 'flow', tpToBond: true, rebalance: true } },
];

// ---------------------------------------------------------------- 滚动窗口
function rollingStats(rows, opts, windowMonths, bondTr) {
  const results = [];
  for (let s = 0; s + windowMonths <= rows.length; s++) {
    const slice = rows.slice(s, s + windowMonths);
    const r = simulate(slice, opts, bondTr ? bondTr.slice(s, s + windowMonths) : null);
    if (r.contributeSum <= 0) continue;
    results.push({ start: slice[0].ym, gainRatio: r.gainRatio, xirr: r.xirr, maxDrawdown: r.maxDrawdown });
  }
  if (results.length === 0) return null;
  const wins = results.filter((r) => r.gainRatio > 0).length;
  const sorted = [...results].sort((a, b) => a.gainRatio - b.gainRatio);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].gainRatio;
  return {
    windowMonths,
    samples: results.length,
    winRate: wins / results.length,
    worst: at(0),
    p10: at(0.1),
    median: at(0.5),
    best: at(0.999),
  };
}

// ---------------------------------------------------------------- 主流程
async function main() {
  console.log('\n=== 1. 准备数据 ===');
  const raw = {};
  for (const key of Object.keys(TARGETS)) {
    raw[key] = await loadSeries(key, TARGETS[key].secid, 'index');
  }
  raw.etf300 = await loadSeries('etf300', ETF_SECID.etf300, 'etf');
  raw.bond = await loadSeries('bond', ETF_SECID.bond, 'etf');

  const series = {};
  const seriesBond = {};
  const bondMonthly = raw.bond ? toMonthly(raw.bond) : null;
  for (const key of Object.keys(TARGETS)) {
    if (!raw[key]) {
      console.warn(`  跳过 ${key}：无数据`);
      continue;
    }
    const idxMonthly = toMonthly(raw[key]);
    const etfMonthly = key === 'hs300' && raw.etf300 ? toMonthly(raw.etf300) : null;
    series[key] = buildTotalReturn(idxMonthly, etfMonthly, ASSUME.dividendYield[key]);
    addFlowSignal(series[key], ASSUME.flowWindow, 36);
    seriesBond[key] = buildBondTr(series[key], bondMonthly, ASSUME.bondRatePerYear);
  }

  console.log('\n=== 2. 序列体检 + 交叉校验 ===');
  console.log('  （参考终值 = 每笔 5000 独立持有到期末的逐笔求和；普通定投必须与它一致）');
  let checkFailed = false;
  for (const key of Object.keys(series)) {
    const rows = series[key];
    const p0 = rows[0].price;
    const p1 = rows[rows.length - 1].price;
    const t0 = rows[0].tr;
    const t1 = rows[rows.length - 1].tr;
    let mx = -Infinity;
    let mn = Infinity;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i].tr / rows[i - 1].tr - 1;
      if (r > mx) mx = r;
      if (r < mn) mn = r;
    }
    const years = rows.length / 12;
    const cagr = Math.pow(t1 / t0, 1 / years) - 1;

    let ref = 0;
    for (let k = 0; k < rows.length; k++) {
      const monthsHeld = rows.length - 1 - k;
      ref += ASSUME.monthlyBase * (t1 / rows[k].tr) * Math.pow(1 - ASSUME.feePerYear, monthsHeld / 12);
    }
    const chk = simulate(rows, STRATEGIES[0].opts, seriesBond[key]);
    const dev = (chk.finalValue - ref) / ref;
    const ok = Math.abs(dev) <= 0.005;
    if (!ok) checkFailed = true;

    console.log(`\n  ${TARGETS[key].name}（${rows[0].ym} → ${rows[rows.length - 1].ym}，${rows.length} 个月）`);
    console.log(`    价格 ${p0.toFixed(2)} → ${p1.toFixed(2)}（${(p1 / p0).toFixed(2)}x）`
      + `　全收益 1000 → ${t1.toFixed(0)}（${(t1 / t0).toFixed(2)}x，年化 ${pct(cagr)}）`);
    console.log(`    单月最大涨/跌 ${pct(mx)} / ${pct(mn)}`
      + `　${ok ? '✓' : '✗'} 校验 ${num(chk.finalValue)} vs 参考 ${num(ref)}（偏差 ${pct(dev, 2)}）`);
  }
  if (checkFailed) {
    console.error('\n✗ 交叉校验未通过，结果不可信，已中止。');
    process.exit(1);
  }

  const report = { generatedAt: new Date().toISOString(), assume: ASSUME, targets: {} };

  console.log('\n=== 3. 单标的全周期对比（每月基础额 5,000 元）===');
  for (const key of Object.keys(series)) {
    const rows = series[key];
    const t = TARGETS[key];
    console.log(`\n■ ${t.name}（${rows[0].ym} → ${rows[rows.length - 1].ym}，${rows.length} 个月）`
      + (t.note ? `  ⚠ ${t.note}` : ''));
    console.log('  组  策略                  累计投入        终值     收益倍率   XIRR   账户最大回撤 止盈次数');

    const bucket = { single: {}, rolling: {} };
    for (const s of STRATEGIES) {
      const r = simulate(rows, s.opts, seriesBond[key]);
      bucket.single[s.key] = {
        name: s.name, months: r.months, contributeSum: r.contributeSum, finalValue: r.finalValue,
        sold: r.sold, gainRatio: r.gainRatio, xirr: r.xirr, maxDrawdown: r.maxDrawdown,
        sellCount: r.sellCount, boostMonths: r.boostMonths,
        avgPace: r.avgPace, cashShare: r.cashShare,
      };
      console.log(`  ${s.key}   ${s.name.padEnd(22)} ${num(r.contributeSum).padStart(12)}`
        + ` ${num(r.finalValue).padStart(11)} ${pct(r.gainRatio).padStart(9)}`
        + ` ${pct(r.xirr).padStart(7)} ${pct(r.maxDrawdown).padStart(11)} ${String(r.sellCount).padStart(6)}`
        + (s.opts.mode === 'flow' ? `  现金占用 ${pct(r.cashShare)}` : ''));
    }
    const totalCap = ASSUME.monthlyBase * rows.length;
    const ls = lumpSum(rows, totalCap);
    bucket.single.X = {
      name: '期初一次性全投', months: ls.months, contributeSum: ls.contributeSum,
      finalValue: ls.finalValue, sold: 0, gainRatio: ls.gainRatio, xirr: ls.xirr,
      maxDrawdown: ls.maxDrawdown, sellCount: 0, boostMonths: 0, cashShare: 0,
    };
    console.log(`  X   ${'期初一次性全投(对照)'.padEnd(22)} ${num(ls.contributeSum).padStart(12)}`
      + ` ${num(ls.finalValue).padStart(11)} ${pct(ls.gainRatio).padStart(9)}`
      + ` ${pct(ls.xirr).padStart(7)} ${pct(ls.maxDrawdown).padStart(11)} ${'—'.padStart(6)}`);

    console.log('  --- 滚动窗口：定投期内正收益的窗口占比 ---');
    for (const w of [36, 60, 120, 180]) {
      const parts = [];
      for (const s of [STRATEGIES[0], STRATEGIES[3]]) {
        const rr = rollingStats(rows, s.opts, w, seriesBond[key]);
        if (rr) {
          parts.push(`${s.key}: ${pct(rr.winRate)}（${rr.samples} 窗口，最差 ${pct(rr.worst)} / 中位 ${pct(rr.median)}）`);
          bucket.rolling[`${s.key}_${w}`] = rr;
        }
      }
      if (parts.length) console.log(`   ${String(w / 12).padStart(2)} 年  ${parts.join('　　')}`);
    }
    report.targets[key] = {
      name: t.name, note: t.note,
      from: rows[0].ym, to: rows[rows.length - 1].ym, months: rows.length,
      ...bucket,
    };
  }

  const html = renderHtml(report);
  await writeFile(join(HERE, '..', 'backtest-report.html'), html, 'utf8');
  await writeFile(join(DATA_DIR, 'backtest-result.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log('\n=== 4. 输出 ===');
  console.log('  报告: backtest-report.html');
  console.log('  数据: scripts/data/backtest-result.json');
}

// ---------------------------------------------------------------- HTML
function renderHtml(report) {
  const colorOf = {
    A: '#8896B3', B: '#4C8DFF', C: '#A78BFA', D: '#3DDC97',
    E: '#F5B63F', F: '#FF6B6B', G: '#E879F9', X: '#5C6884',
  };
  const order = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'X'];

  const rowsOf = (t) => order.filter((k) => t.single[k]).map((k) => {
    const s = t.single[k];
    return `<tr>
      <td><span class="dot" style="background:${colorOf[k]}"></span>${k}　${s.name}</td>
      <td class="n">${num(s.contributeSum)}</td>
      <td class="n">${num(s.finalValue)}</td>
      <td class="n ${s.gainRatio >= 0 ? 'up' : 'down'}">${pct(s.gainRatio)}</td>
      <td class="n ${s.xirr >= 0 ? 'up' : 'down'}">${pct(s.xirr)}</td>
      <td class="n down">${pct(s.maxDrawdown)}</td>
      <td class="n">${s.sellCount || '—'}</td>
    </tr>`;
  }).join('');

  const rollingOf = (t) => [36, 60, 120, 180].map((w) => {
    const a = t.rolling[`A_${w}`];
    const d = t.rolling[`D_${w}`];
    if (!a && !d) return '';
    return `<tr>
      <td>${w / 12} 年</td>
      <td class="n">${a ? pct(a.winRate) : '—'}</td>
      <td class="n">${d ? pct(d.winRate) : '—'}</td>
      <td class="n">${a ? a.samples : '—'}</td>
      <td class="n down">${a ? pct(a.worst) : '—'}</td>
      <td class="n">${a ? pct(a.median) : '—'}</td>
      <td class="n up">${a ? pct(a.best) : '—'}</td>
    </tr>`;
  }).join('');

  const sections = Object.keys(report.targets).map((k) => {
    const t = report.targets[k];
    return `<section>
      <h2>${t.name} <span class="range">${t.from} → ${t.to}　${t.months} 个月</span></h2>
      ${t.note ? `<p class="warn">⚠ ${t.note}</p>` : ''}
      <table>
        <thead><tr><th>组 / 策略</th><th>累计投入</th><th>终值</th><th>收益倍率</th><th>XIRR</th><th>账户最大回撤</th><th>止盈次数</th></tr></thead>
        <tbody>${rowsOf(t)}</tbody>
      </table>
      <h3>滚动窗口正收益占比（A 普通定投 vs D 均线+分段止盈）</h3>
      <table>
        <thead><tr><th>窗口</th><th>A 正收益</th><th>D 正收益</th><th>样本窗口</th><th>A 最差</th><th>A 中位</th><th>A 最好</th></tr></thead>
        <tbody>${rollingOf(t)}</tbody>
      </table>
    </section>`;
  }).join('');

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>定投策略回测报告</title>
<style>
  :root{--bg:#0a0f1c;--card:#111a2c;--bd:#1f2c47;--fg:#e9eef9;--dim:#8896b3;--up:#3ddc97;--down:#ff6b6b}
  *{box-sizing:border-box}
  body{margin:0;padding:28px;background:var(--bg);color:var(--fg);font:14px/1.7 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif}
  h1{font-size:22px;margin:0 0 6px}
  h2{font-size:17px;margin:34px 0 10px;padding-top:16px;border-top:1px solid var(--bd)}
  h3{font-size:13px;color:var(--dim);margin:20px 0 8px;font-weight:500}
  .range{font-size:12px;color:var(--dim);font-weight:400;margin-left:8px}
  .meta{color:var(--dim);font-size:12px;margin-bottom:8px}
  .warn{background:#2a2113;border-left:3px solid #f5b63f;color:#f5b63f;padding:8px 12px;border-radius:6px;font-size:12px}
  table{width:100%;border-collapse:collapse;background:var(--card);border-radius:10px;overflow:hidden;font-size:13px}
  th,td{padding:9px 12px;text-align:left;border-bottom:1px solid var(--bd)}
  th{color:var(--dim);font-weight:500;font-size:12px;white-space:nowrap}
  tr:last-child td{border-bottom:none}
  .n{text-align:right;font-variant-numeric:tabular-nums}
  .up{color:var(--up)} .down{color:var(--down)}
  .dot{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px}
  .foot{margin-top:34px;padding:14px 16px;background:var(--card);border:1px solid var(--bd);border-radius:10px;font-size:12px;color:var(--dim)}
  .foot b{color:var(--fg)}
</style></head><body>
<h1>定投策略回测报告</h1>
<p class="meta">生成于 ${report.generatedAt}　·　基础月投 ${num(report.assume.monthlyBase)} 元
　·　年化费率损耗 ${pct(report.assume.feePerYear)}　·　债券假设年化 ${pct(report.assume.bondRatePerYear)}</p>
${sections}
<div class="foot">
<b>口径说明</b><br>
1. 全收益：2012-05 起用 510300 ETF 前复权价（含分红再投资），更早月份用「指数价格收益 + 股息率假设」近似。<br>
2. 前视偏差：均线用 200 日 SMA、回撤用历史峰值，全部只用当时已知数据，未使用全样本分位。<br>
3. 滚动窗口：从每个可能起点重跑同样长度，统计正收益占比与分布，比单一区间更接近「胜率」。<br>
4. 分段止盈：账户累计收益率首次达 50% 卖出权益 20%，之后每再涨 30 个百分点再卖 20%，可重复触发；卖出资金转入债券桶（年化 3% 假设）。<br>
5. 再平衡：股债目标 90/10，每年 12 月检查，偏离超 5 个百分点调回。<br>
6. F 组是「期初一次性投入等额资金」的对照，用来对比「钱在市场里的时间」；它假设你现在就有全部资金，不符合靠工资定投的现实。<br>
7. 未计汇率、QDII 溢价、申赎费；境外指数为本地货币计价。<br>
<b>回测只能说明「历史上这套规则表现如何」，不能预测未来收益。本报告不构成投资建议。</b>
</div>
</body></html>`;
}

if (process.argv[1] && process.argv[1].endsWith('backtest.mjs')) {
  main().catch((e) => {
    console.error('回测失败:', e);
    process.exit(1);
  });
}
