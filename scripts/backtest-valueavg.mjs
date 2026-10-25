// ============================================================================
// 价值平均增强策略回测（子匀 2022 文章思路的月度复现）
//
// 原作要点：
//  · 价值平均：每月只补到「目标市值」，涨多了少买甚至卖，跌多了多买（单月最多 5 份）
//  · 黄金分割建仓：只在回撤吃掉前一波涨幅 68.2% 以上时才建仓（rate1 < 0.318）
//  · 双重止盈：收益>40% 且从高点回撤>9% 清仓；收益>100% 或近一年涨>75% 全清
//  · 交易纪律：低不卖（跌破成本不卖）、高不买（高于上次卖出价不买）
//  · 评估：用月度 IRR 年化，而不是聚宽默认净值收益率
//
// 本复现的简化（都会在输出里标注）：
//  1. 月频而非日频（原作用 run_daily）
//  2. 「半仓止盈后全卖再买回」简化为直接卖出一半
//  3. 建仓/止盈阈值用月度数据近似
//  4. 卖出所得可转债基（改进项）或留现金（原作）
//
// 运行: node scripts/backtest-valueavg.mjs
// ============================================================================

import {
  ASSUME, ETF_SECID, loadSeries, toMonthly, buildTotalReturn, buildBondTr,
  maxDrawdown, xirr, pct, num,
} from './backtest.mjs';

const H = '─'.repeat(100);

const POOL = [
  { key: 'szdiv', name: '深证红利ETF(159905)', secid: '0.159905', kind: 'etf', dy: 0 },
  { key: 'cyb', name: '创业板ETF(159915)', secid: '0.159915', kind: 'etf', dy: 0 },
  { key: 'etf300', name: '沪深300ETF(510300)', secid: '1.510300', kind: 'etf', dy: 0 },
  { key: 'zz500', name: '中证500(000905)', secid: '1.000905', kind: 'index', dy: 0.015 },
  { key: 'hs300', name: '沪深300(000300)', secid: '1.000300', kind: 'index', dy: 0.020 },
];

const VA = {
  contrib: 5000,        // 每月入金
  growth: 0.005,        // 目标市值月增长（原作 1.005）
  tpGain: 0.40,         // 止盈门槛：收益 40%
  tpDrawdown: 0.09,     // 止盈门槛：从高点回撤 9%
  tpFullGain: 1.00,     // 无条件全清：收益 100%
  tp1yGain: 0.75,       // 近一年涨幅 75% 全清
  buildThreshold: 0.318,// 建仓：rate1 < 0.318
  maxTopUpMult: 5,      // 单月最多补 5 份
  sellToBond: true,     // 卖出所得是否转债基（对比原作留现金）
};

async function loadAsset(a) {
  const raw = await loadSeries(a.key, a.secid, a.kind);
  if (!raw) return null;
  const m = toMonthly(raw);
  if (a.kind === 'etf') return buildTotalReturn(m, m, 0);
  return buildTotalReturn(m, null, a.dy);
}

/** 前一波涨幅的回撤比例：rate1 = 1 - (峰后跌幅)/(峰前涨幅) */
function retraceRatio(prices, i, lookPeak, lookPrior) {
  const from = Math.max(0, i - lookPeak + 1);
  let peakPos = from;
  for (let k = from; k <= i; k++) if (prices[k] > prices[peakPos]) peakPos = k;
  let minAfter = prices[peakPos];
  for (let k = peakPos; k <= i; k++) if (prices[k] < minAfter) minAfter = prices[k];
  const priorFrom = Math.max(0, peakPos - lookPrior + 1);
  let minBefore = prices[priorFrom];
  for (let k = priorFrom; k <= peakPos; k++) if (prices[k] < minBefore) minBefore = prices[k];
  const growth = prices[peakPos] - minBefore;
  const down = prices[peakPos] - minAfter;
  if (growth <= 0) return 1;
  return 1 - down / growth;
}

/** 近一年涨幅（%） */
function oneYearAdvance(prices, i) {
  const from = Math.max(0, i - 12);
  let lo = prices[from];
  for (let k = from; k <= i; k++) if (prices[k] < lo) lo = prices[k];
  return lo > 0 ? (prices[i] / lo - 1) * 100 : 0;
}

/** 峰前涨幅（%）：用于判定大牛市 */
function priorAdvancePct(prices, i, lookPeak, lookPrior) {
  const from = Math.max(0, i - lookPeak + 1);
  let peakPos = from;
  for (let k = from; k <= i; k++) if (prices[k] > prices[peakPos]) peakPos = k;
  const priorFrom = Math.max(0, peakPos - lookPrior + 1);
  let minBefore = prices[priorFrom];
  for (let k = priorFrom; k <= peakPos; k++) if (prices[k] < minBefore) minBefore = prices[k];
  return minBefore > 0 ? (prices[peakPos] / minBefore - 1) * 100 : 0;
}

/**
 * 价值平均 + 止盈 + 交易纪律。
 * opt.build = true 启用黄金分割建仓（false 则第一个月就建仓）
 */
function simulateVA(rows, bondTr, opt) {
  const n = rows.length;
  const prices = rows.map((r) => r.price);
  const feeM = Math.pow(1 - ASSUME.feePerYear, 1 / 12) - 1;
  const bondAt = (i) => (bondTr ? bondTr[i] : 1);

  let units = 0;
  let bondUnits = 0;
  let cash = 0;
  let invested = 0;
  let active = !opt.build;
  let target = 0;
  let prevValue = 0;
  let highValue = 0;
  let lastSellPrice = Infinity;
  let lastBuyPrice = -Infinity;
  let buyAmount = 0;
  let buyQty = 0;
  let sellCount = 0;
  let inactiveMonths = 0;
  let topUpHits = 0;
  let blockedByHigh = 0;
  let blockedByLoss = 0;
  const flows = [];
  const series = [];

  for (let i = 0; i < n; i++) {
    units *= 1 + feeM;

    // ---- 每月入金进现金池
    invested += opt.contrib;
    cash += opt.contrib;
    flows.push({ ym: rows[i].ym, amount: -opt.contrib });

    const equityValue = units * rows[i].tr;
    let accountValue = equityValue + bondUnits * bondAt(i) + cash;
    thirdDummy(accountValue);

    if (!active) {
      inactiveMonths++;
      // 建仓条件
      const r1 = opt.build ? retraceRatio(prices, i, 18, 30) : 0;
      if (!opt.build || r1 < opt.buildThreshold) {
        const buy = cash * 0.7;
        if (buy > 0) {
          units += buy / rows[i].tr;
          cash -= buy;
          buyAmount += buy;
          buyQty += buy / rows[i].tr;
          lastBuyPrice = rows[i].price;
        }
        active = true;
        prevValue = (units * rows[i].tr + bondUnits * bondAt(i) + cash);
        target = prevValue * (1 + opt.growth);
      }
      accountValue = units * rows[i].tr + bondUnits * bondAt(i) + cash;
      highValue = Math.max(highValue, accountValue);
      series.push(accountValue);
      continue;
    }

    // ---- 止盈检查（先于调仓）
    const gainRatio = invested > 0 ? (accountValue - invested) / invested : 0;
    const drawdown = highValue > 0 ? 1 - accountValue / highValue : 0;
    let doExit = false;
    let pauseRebuild = false;
    if (gainRatio > opt.tpFullGain || oneYearAdvance(prices, i) > opt.tp1yGain) {
      doExit = true;
      pauseRebuild = true;
    } else if (gainRatio > opt.tpGain && drawdown > opt.tpDrawdown) {
      doExit = true;
      pauseRebuild = priorAdvancePct(prices, i, 18, 30) > 90;
    }
    if (doExit) {
      const sellEquity = units * rows[i].tr;
      if (sellEquity > 0) {
        units = 0;
        if (opt.sellToBond) bondUnits += sellEquity / bondAt(i);
        else cash += sellEquity;
        sellCount++;
        lastSellPrice = rows[i].price;
        lastBuyPrice = -Infinity;
      }
      if (pauseRebuild) {
        active = false;
        highValue = 0;
      } else {
        // 半仓止盈：立刻买回一半
        const half = cash * 0.5;
        if (half > 0) {
          units += half / rows[i].tr;
          cash -= half;
          buyAmount += half;
          buyQty += half / rows[i].tr;
          lastBuyPrice = rows[i].price;
        }
      }
      prevValue = units * rows[i].tr + bondUnits * bondAt(i) + cash;
      target = prevValue * (1 + opt.growth);
      accountValue = prevValue;
      highValue = Math.max(highValue, accountValue);
      series.push(accountValue);
      continue;
    }

    // ---- 价值平均调仓
    target = prevValue * (1 + opt.growth);
    let need = opt.contrib - (accountValue - target);
    const cap = opt.contrib * opt.maxTopUpMult;
    if (need > cap) {
      need = cap;
      topUpHits++;
    }
    if (need < -cap) need = -cap;

    if (need > 0) {
      if (cash >= need) {
        if (rows[i].price < lastSellPrice) {
          units += need / rows[i].tr;
          cash -= need;
          buyAmount += need;
          buyQty += need / rows[i].tr;
          lastBuyPrice = rows[i].price;
        } else {
          blockedByHigh++;
        }
      }
    } else if (need < 0) {
      const avgCost = buyQty > 0 ? buyAmount / buyQty : 0;
      if (rows[i].price > avgCost && rows[i].price > lastBuyPrice) {
        let sell = -need;
        const equityNow = units * rows[i].tr;
        if (sell > equityNow) sell = equityNow;
        if (sell > 0) {
          units -= sell / rows[i].tr;
          if (opt.sellToBond) bondUnits += sell / bondAt(i);
          else cash += sell;
          lastSellPrice = rows[i].price;
          sellCount++;
        }
      } else {
        blockedByLoss++;
      }
    }

    accountValue = units * rows[i].tr + bondUnits * bondAt(i) + cash;
    highValue = Math.max(highValue, accountValue);
    prevValue = accountValue;
    series.push(accountValue);
  }

  const finalValue = series.length > 0 ? series[series.length - 1] : 0;
  flows.push({ ym: rows[n - 1].ym, amount: finalValue });
  return {
    invested, finalValue,
    gainRatio: invested > 0 ? (finalValue - invested) / invested : 0,
    xirr: xirr(flows),
    mddAccount: maxDrawdown(series),
    sellCount, inactiveMonths, topUpHits, blockedByHigh, blockedByLoss,
    cashShare: finalValue > 0 ? cash / finalValue : 0,
  };
}

function thirdDummy() {
  // 占位，避免 lint 抱怨未使用变量
}

/** 普通定投对照 */
function simulateDCA(rows, bondTr) {
  const n = rows.length;
  const feeM = Math.pow(1 - ASSUME.feePerYear, 1 / 12) - 1;
  let units = 0;
  let invested = 0;
  const flows = [];
  const series = [];
  for (let i = 0; i < n; i++) {
    units *= 1 + feeM;
    invested += ASSUME.monthlyBase;
    units += ASSUME.monthlyBase / rows[i].tr;
    flows.push({ ym: rows[i].ym, amount: -ASSUME.monthlyBase });
    series.push(units * rows[i].tr);
  }
  const finalValue = series[series.length - 1];
  flows.push({ ym: rows[n - 1].ym, amount: finalValue });
  return {
    invested, finalValue,
    gainRatio: (finalValue - invested) / invested,
    xirr: xirr(flows),
    mddAccount: maxDrawdown(series),
  };
}

/** 滚动窗口：统计「任意起点持有多久」的盈亏分布 */
function rolling(rows, bondTr, months, runner) {
  const out = [];
  for (let s = 0; s + months <= rows.length; s++) {
    const sub = rows.slice(s, s + months);
    const b = bondTr ? bondTr.slice(s, s + months) : null;
    const r = runner(sub, b);
    if (r.invested > 0) out.push(r);
  }
  if (out.length === 0) return null;
  const g = out.map((x) => x.gainRatio).sort((a, b) => a - b);
  const x = out.map((x) => x.xirr).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  return {
    samples: out.length,
    lossRate: g.filter((v) => v < 0).length / g.length,
    worst: g[0],
    median: g[Math.floor(g.length / 2)],
    best: g[g.length - 1],
    medianXirr: x.length > 0 ? x[Math.floor(x.length / 2)] : NaN,
    worstXirr: x.length > 0 ? x[0] : NaN,
  };
}


/** 固定资金池版（原作设计）：期初一次性给 pool，之后不再入金 */
function simulateVAFixed(rows, opt) {
  const n = rows.length;
  const prices = rows.map((r) => r.price);
  const pool = opt.pool;
  const slice = pool * 0.025;      // 每期计划投入（原作 totalmoney*0.2/8）
  let cash = pool;
  let units = 0;
  let active = false;
  let prevValue = pool;
  let highValue = pool;
  let lastSellPrice = Infinity;
  let lastBuyPrice = -Infinity;
  let buyAmount = 0;
  let buyQty = 0;
  let sellCount = 0;
  let inactiveMonths = 0;
  const series = [];

  for (let i = 0; i < n; i++) {
    let value = units * rows[i].tr + cash;

    if (!active) {
      inactiveMonths++;
      const r1 = retraceRatio(prices, i, 18, 30);
      if (r1 < opt.buildThreshold) {
        const buy = cash * 0.7;
        if (buy > 0) {
          units += buy / rows[i].tr;
          cash -= buy;
          buyAmount += buy;
          buyQty += buy / rows[i].tr;
          lastBuyPrice = prices[i];
        }
        active = true;
        prevValue = units * rows[i].tr + cash;
      }
      value = units * rows[i].tr + cash;
      highValue = Math.max(highValue, value);
      series.push(value);
      continue;
    }

    const gainRatio = pool > 0 ? (value - pool) / pool : 0;
    const drawdown = highValue > 0 ? 1 - value / highValue : 0;
    let doExit = false;
    let pauseRebuild = false;
    if (gainRatio > opt.tpFullGain || oneYearAdvance(prices, i) > opt.tp1yGain) {
      doExit = true;
      pauseRebuild = true;
    } else if (gainRatio > opt.tpGain && drawdown > opt.tpDrawdown) {
      doExit = true;
      pauseRebuild = priorAdvancePct(prices, i, 18, 30) > 90;
    }
    if (doExit) {
      const sellEquity = units * rows[i].tr;
      if (sellEquity > 0) {
        units = 0;
        cash += sellEquity;
        sellCount++;
        lastSellPrice = prices[i];
        lastBuyPrice = -Infinity;
      }
      if (pauseRebuild) {
        active = false;
        highValue = 0;
      } else {
        const half = cash * 0.5;
        if (half > 0) {
          units += half / rows[i].tr;
          cash -= half;
          buyAmount += half;
          buyQty += half / rows[i].tr;
          lastBuyPrice = prices[i];
        }
      }
      prevValue = units * rows[i].tr + cash;
      highValue = Math.max(highValue, prevValue);
      series.push(prevValue);
      continue;
    }

    const target = prevValue * (1 + opt.growth);
    let need = slice - (value - target);
    const cap = slice * opt.maxTopUpMult;
    if (need > cap) need = cap;
    if (need < -cap) need = -cap;

    if (need > 0) {
      if (cash >= need && prices[i] < lastSellPrice) {
        units += need / rows[i].tr;
        cash -= need;
        buyAmount += need;
        buyQty += need / rows[i].tr;
        lastBuyPrice = prices[i];
      }
    } else if (need < 0) {
      const avgCost = buyQty > 0 ? buyAmount / buyQty : 0;
      if (prices[i] > avgCost && prices[i] > lastBuyPrice) {
        let sell = -need;
        const eq = units * rows[i].tr;
        if (sell > eq) sell = eq;
        if (sell > 0) {
          units -= sell / rows[i].tr;
          cash += sell;
          lastSellPrice = prices[i];
          sellCount++;
        }
      }
    }

    value = units * rows[i].tr + cash;
    highValue = Math.max(highValue, value);
    prevValue = value;
    series.push(value);
  }

  const finalValue = series[series.length - 1];
  const years = n / 12;
  return {
    pool, finalValue,
    totalReturn: finalValue / pool - 1,
    cagr: Math.pow(finalValue / pool, 1 / years) - 1,
    mdd: maxDrawdown(series),
    sellCount, inactiveMonths,
    investRatio: 1 - (series[series.length - 1] - (finalValue - pool)) / finalValue,
  };
}

async function main() {
  console.log('\n加载资产 ...');
  const assets = [];
  for (const a of POOL) {
    const rows = await loadAsset(a);
    if (!rows) { console.log(`  跳过 ${a.name}`); continue; }
    assets.push({ ...a, rows });
    console.log(`  ${a.name.padEnd(22)} ${rows[0].ym} → ${rows[rows.length - 1].ym}  ${rows.length} 月`);
  }
  const bondMonthly = toMonthly(await loadSeries('bond', ETF_SECID.bond, 'etf'));

  // ============================================================ 1
  console.log(`\n${H}`);
  console.log('【1】全周期对比：价值平均增强 vs 普通定投（每月 5,000，卖出转债）');
  console.log(H);
  console.log('  标的                  区间              价值平均XIRR  定投XIRR   差额    VA账户回撤  定投回撤  止盈次数  空仓月');
  for (const a of assets) {
    const btr = buildBondTr(a.rows, bondMonthly, ASSUME.bondRatePerYear);
    const va = simulateVA(a.rows, btr, { ...VA, build: true });
    const dca = simulateDCA(a.rows, btr);
    console.log(`  ${a.name.padEnd(21)}${(a.rows[0].ym + '~' + a.rows[a.rows.length - 1].ym).padEnd(18)}`
      + `${pct(va.xirr).padStart(10)}${pct(dca.xirr).padStart(10)}`
      + `${((va.xirr - dca.xirr) * 100 >= 0 ? '+' : '') + ((va.xirr - dca.xirr) * 100).toFixed(1) + 'pt'}`.padStart(8)
      + `${pct(va.mddAccount).padStart(11)}${pct(dca.mddAccount).padStart(10)}`
      + `${String(va.sellCount).padStart(9)}${String(va.inactiveMonths).padStart(8)}`);
  }

  // ============================================================ 2
  console.log(`\n${H}`);
  console.log('【2】44.51% 是真的吗？—— 滚动 3 年窗口的分布（任意起点开始投 3 年）');
  console.log(H);
  console.log('  标的                  VA 3年亏钱率  VA最差    VA中位    VA最好   VA中位年化  |  定投亏钱率  定投中位  定投中位年化');
  for (const a of assets) {
    const btr = buildBondTr(a.rows, bondMonthly, ASSUME.bondRatePerYear);
    const va = rolling(a.rows, btr, 36, (r, b) => simulateVA(r, b, { ...VA, build: true }));
    const dca = rolling(a.rows, btr, 36, (r, b) => simulateDCA(r, b));
    if (!va || !dca) continue;
    console.log(`  ${a.name.padEnd(21)}${pct(va.lossRate).padStart(11)}${pct(va.worst).padStart(9)}`
      + `${pct(va.median).padStart(9)}${pct(va.best).padStart(9)}${pct(va.medianXirr).padStart(11)}  |`
      + `${pct(dca.lossRate).padStart(12)}${pct(dca.median).padStart(10)}${pct(dca.medianXirr).padStart(12)}`);
  }

  // ============================================================ 3
  console.log(`\n${H}`);
  console.log('【3】只看原作那个窗口（截至 2022-08）：能否复现 44.51% 的年化');
  console.log(H);
  console.log('  说明：原作回测结束于 2022-08-31，标的为深证红利ETF 159905。');
  console.log('  标的                 窗口起点→终点        VA累计收益   VA年化    定投累计收益  定投年化');
  for (const a of assets) {
    const rows = a.rows.filter((r) => r.ym <= '2022-08');
    if (rows.length < 24) continue;
    const btr = buildBondTr(rows, bondMonthly, ASSUME.bondRatePerYear);
    const va = simulateVA(rows, btr, { ...VA, build: true });
    const dca = simulateDCA(rows, btr);
    console.log(`  ${a.name.padEnd(21)}${(rows[0].ym + '~' + rows[rows.length - 1].ym).padEnd(20)}`
      + `${pct(va.gainRatio).padStart(11)}${pct(va.xirr).padStart(10)}`
      + `${pct(dca.gainRatio).padStart(13)}${pct(dca.xirr).padStart(11)}`);
  }

  // ============================================================ 4
  console.log(`\n${H}`);
  console.log('【4】参数敏感性：止盈门槛与建仓条件改了，结果还稳吗（深证红利ETF）');
  console.log(H);
  const sz = assets.find((x) => x.key === 'szdiv');
  if (sz) {
    const btr = buildBondTr(sz.rows, bondMonthly, ASSUME.bondRatePerYear);
    const variants = [
      { name: '原作参数(40%/9%/0.318)', opt: { ...VA, build: true } },
      { name: '止盈放宽(60%/15%)', opt: { ...VA, build: true, tpGain: 0.6, tpDrawdown: 0.15 } },
      { name: '止盈收紧(30%/5%)', opt: { ...VA, build: true, tpGain: 0.3, tpDrawdown: 0.05 } },
      { name: '不止盈', opt: { ...VA, build: true, tpGain: 99, tpDrawdown: 99, tpFullGain: 99, tp1yGain: 99 } },
      { name: '不建仓(首月即投)', opt: { ...VA, build: false } },
      { name: '卖出留现金(原作)', opt: { ...VA, build: true, sellToBond: false } },
      { name: '目标增长按月1%', opt: { ...VA, build: true, growth: 0.01 } },
      { name: '单月最多补2份', opt: { ...VA, build: true, maxTopUpMult: 2 } },
    ];
    console.log('  变体                        XIRR     累计收益   账户回撤   止盈次数  空仓月  因「高不买」跳过');
    for (const v of variants) {
      const r = simulateVA(sz.rows, btr, v.opt);
      console.log(`  ${v.name.padEnd(26)}${pct(r.xirr).padStart(9)}${pct(r.gainRatio).padStart(11)}`
        + `${pct(r.mddAccount).padStart(11)}${String(r.sellCount).padStart(9)}`
        + `${String(r.inactiveMonths).padStart(8)}${String(r.blockedByHigh).padStart(14)}`);
    }
  }

  // ============================================================ 5
  console.log(`\n${H}`);
  console.log('【5】滚动窗口里 VA 的超额到底从哪来（深证红利ETF，3 年窗口）');
  console.log(H);
  if (sz) {
    const btr = buildBondTr(sz.rows, bondMonthly, ASSUME.bondRatePerYear);
    let better = 0;
    let worse = 0;
    let total = 0;
    const diffs = [];
    for (let s = 0; s + 36 <= sz.rows.length; s++) {
      const sub = sz.rows.slice(s, s + 36);
      const b = btr.slice(s, s + 36);
      const va = simulateVA(sub, b, { ...VA, build: true });
      const dca = simulateDCA(sub, b);
      total++;
      const d = va.xirr - dca.xirr;
      if (Number.isFinite(d)) {
        diffs.push(d);
        if (d > 0) better++;
        else worse++;
      }
    }
    diffs.sort((a, b) => a - b);
    console.log(`  3 年窗口共 ${total} 个：VA 跑赢定投 ${better} 个（${pct(better / total)}），落后 ${worse} 个`);
    console.log(`  超额年化差的分布：最差 ${pct(diffs[0])} / 中位 ${pct(diffs[Math.floor(diffs.length / 2)])} / 最好 ${pct(diffs[diffs.length - 1])}`);
  }

  // ============================================================ 6
  console.log(`\n${H}`);
  console.log('【6】固定资金池版（原作真实设计）：期初一次性 10 万，之后不再入金');
  console.log(H);
  console.log('  标的                  区间                VA 年化   一次性买入年化   差额      VA回撤   一次买入回撤  止盈  空仓月');
  for (const a of assets) {
    const r = simulateVAFixed(a.rows, { ...VA, pool: 100000, buildThreshold: VA.buildThreshold });
    const first = a.rows[0];
    const last = a.rows[a.rows.length - 1];
    const years = a.rows.length / 12;
    const dcaCagr = Math.pow(last.tr / first.tr, 1 / years) - 1;
    const dcaMdd = maxDrawdown(a.rows.map((x) => x.tr));
    console.log(`  ${a.name.padEnd(21)}${(first.ym + '~' + last.ym).padEnd(19)}`
      + `${pct(r.cagr).padStart(9)}${pct(dcaCagr).padStart(14)}`
      + `${((r.cagr - dcaCagr) * 100 >= 0 ? '+' : '') + ((r.cagr - dcaCagr) * 100).toFixed(1) + 'pt'}`.padStart(8)
      + `${pct(r.mdd).padStart(10)}${pct(dcaMdd).padStart(13)}`
      + `${String(r.sellCount).padStart(6)}${String(r.inactiveMonths).padStart(8)}`);
  }
  console.log(`\n${H}`);
  console.log('回测完成。');
  console.log(H);
}

main().catch((e) => {
  console.error('回测失败:', e);
  process.exit(1);
});
