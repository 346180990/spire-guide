// ============================================================================
// 保本优先检验：目标不是「赚最多」，而是「尽量不要亏钱」
//
// 与 backtest.mjs（比 XIRR / 收益）不同，这里看的全是下行风险：
//  1. 亏钱概率 vs 持有年限      —— 拿多久才基本不可能亏
//  2. 水下期（回本要多久）      —— 最长要熬多少个月看不到赚钱
//  3. 退休时点风险（序列风险）  —— 撞在熊市退休会怎样
//  4. 股债比例前沿              —— 降低权益能换来多少「不亏钱」
//  5. 绝对保本的代价            —— 100% 债/存款 = 购买力必亏
//
// 运行: node scripts/backtest-safety.mjs
// ============================================================================

import {
  ASSUME, TARGETS, ETF_SECID, loadSeries, toMonthly, buildTotalReturn,
  buildBondTr, addFlowSignal, simulate, maxDrawdown, xirr, pct, num,
} from './backtest.mjs';

const H = '─'.repeat(96);
const KEYS = ['hs300', 'a500', 'hsi', 'div', 'sp500', 'ndx'];

async function prepare(key) {
  const raw = await loadSeries(key, TARGETS[key].secid, 'index');
  if (!raw) return null;
  const monthly = toMonthly(raw);
  const etfRaw = key === 'hs300' ? await loadSeries('etf300', ETF_SECID.etf300, 'etf') : null;
  const rows = buildTotalReturn(monthly, etfRaw ? toMonthly(etfRaw) : null, ASSUME.dividendYield[key] ?? 0);
  addFlowSignal(rows, ASSUME.flowWindow, 36);
  return rows;
}

const FIXED = { mode: 'fixed' };

/** 多标的组合定投（每月按权重投入，定期再平衡回目标权重） */
function simulatePortfolio(rowsList, weights, freq) {
  const n = rowsList.length;
  const len = rowsList[0].length;
  const units = new Array(n).fill(0);
  const feeM = Math.pow(1 - ASSUME.feePerYear, 1 / 12) - 1;
  let invested = 0;
  const flows = [];
  const series = [];

  for (let i = 0; i < len; i++) {
    for (let k = 0; k < n; k++) units[k] *= 1 + feeM;
    const c = ASSUME.monthlyBase;
    invested += c;
    flows.push({ ym: rowsList[0][i].ym, amount: -c });
    for (let k = 0; k < n; k++) units[k] += (c * weights[k]) / rowsList[k][i].tr;

    if (freq && ['-03', '-06', '-09', '-12'].indexOf(rowsList[0][i].ym.slice(-3)) >= 0) {
      const vals = [];
      let total = 0;
      for (let k = 0; k < n; k++) {
        const v = units[k] * rowsList[k][i].tr;
        vals.push(v);
        total += v;
      }
      if (total > 0) {
        for (let k = 0; k < n; k++) units[k] += (total * weights[k] - vals[k]) / rowsList[k][i].tr;
      }
    }

    let tot = 0;
    for (let k = 0; k < n; k++) tot += units[k] * rowsList[k][i].tr;
    series.push(tot);
  }

  let finalValue = 0;
  for (let k = 0; k < n; k++) finalValue += units[k] * rowsList[k][rowsList[k].length - 1].tr;
  flows.push({ ym: rowsList[0][len - 1].ym, amount: finalValue });
  return {
    invested, finalValue,
    gainRatio: (finalValue - invested) / invested,
    xirr: xirr(flows),
    maxDrawdown: maxDrawdown(series),
    series,
  };
}

/** 给定持有月数，统计所有滚动窗口的盈亏分布 */
function lossProfile(rows, months, bondTr) {
  const gains = [];
  for (let s = 0; s + months <= rows.length; s++) {
    const slice = rows.slice(s, s + months);
    const r = simulate(slice, FIXED, bondTr ? bondTr.slice(s, s + months) : null);
    if (r.contributeSum <= 0) continue;
    gains.push(r.gainRatio);
  }
  if (gains.length === 0) return null;
  gains.sort((a, b) => a - b);
  const at = (q) => gains[Math.min(gains.length - 1, Math.floor(q * gains.length))];
  return {
    months,
    samples: gains.length,
    lossRate: gains.filter((g) => g < 0).length / gains.length,
    worst: at(0),
    p10: at(0.1),
    median: at(0.5),
    best: at(gains.length - 1),
  };
}

/** 水下期：账户市值低于累计投入的连续月数 */
function underwaterProfile(rows) {
  const out = [];
  for (let s = 2; s < rows.length; s++) {
    const slice = rows.slice(s);
    const r = simulate(slice, FIXED, null);
    let longest = 0;
    let cur = 0;
    for (let i = 0; i < r.accountSeries.length; i++) {
      const cost = ASSUME.monthlyBase * (i + 1);
      if (r.accountSeries[i] < cost) {
        cur++;
        if (cur > longest) longest = cur;
      } else {
        cur = 0;
      }
    }
    out.push({ start: slice[0].ym, longest, endUnderwater: cur > 0 });
  }
  if (out.length === 0) return null;
  const arr = out.map((x) => x.longest).sort((a, b) => a - b);
  return {
    samples: out.length,
    median: arr[Math.floor(arr.length / 2)],
    p90: arr[Math.floor(arr.length * 0.9)],
    max: arr[arr.length - 1],
    stillUnderwaterAtEnd: out.filter((x) => x.endUnderwater).length / out.length,
  };
}

async function main() {
  console.log('\n准备数据 ...');
  const series = {};
  for (const k of KEYS) series[k] = await prepare(k);
  const bondMonthly = toMonthly(await loadSeries('bond', ETF_SECID.bond, 'etf'));

  // ============================================================ 1
  console.log(`\n${H}`);
  console.log('【1】亏钱概率 vs 持有年限（滚动窗口：从每个可能起点开始定投，看有多少比例亏损）');
  console.log(H);
  const yearList = [1, 2, 3, 5, 7, 10, 15, 20];
  console.log('  标的          ' + yearList.map((y) => (y + '年').padStart(7)).join(''));
  for (const k of KEYS) {
    const cells = yearList.map((y) => {
      const lp = lossProfile(series[k], y * 12, null);
      return (lp ? pct(lp.lossRate) : '—').padStart(7);
    });
    console.log(`  ${TARGETS[k].name.padEnd(13)}${cells.join('')}`);
  }
  console.log('\n  同一批窗口的「最差」结果（亏的时候最多亏多少）：');
  console.log('  标的          ' + yearList.map((y) => (y + '年').padStart(8)).join(''));
  for (const k of KEYS) {
    const cells = yearList.map((y) => {
      const lp = lossProfile(series[k], y * 12, null);
      return (lp ? pct(lp.worst) : '—').padStart(8);
    });
    console.log(`  ${TARGETS[k].name.padEnd(13)}${cells.join('')}`);
  }

  // ============================================================ 2
  console.log(`\n${H}`);
  console.log('【2】水下期：买入后要熬多少个月账面才不低于成本（从每个可能起点起投）');
  console.log(H);
  console.log('  标的          样本   中位(月)   P90(月)   最长(月)   起点投到期末仍亏的比例');
  for (const k of KEYS) {
    const u = underwaterProfile(series[k]);
    if (!u) continue;
    console.log(`  ${TARGETS[k].name.padEnd(13)}${String(u.samples).padStart(6)}`
      + `${String(u.median).padStart(9)}${String(u.p90).padStart(9)}${String(u.max).padStart(10)}`
      + `${pct(u.stillUnderwaterAtEnd).padStart(14)}`);
  }

  // ============================================================ 3
  console.log(`\n${H}`);
  console.log('【3】退休时点风险：定投 20 年后「在哪个月退休」决定你拿到多少');
  console.log(H);
  console.log('  标的          最差退休时点   该时点收益   P10收益     中位收益    最好收益    负收益时点占比');
  for (const k of KEYS) {
    const rows = series[k];
    const W = 240;
    if (rows.length < W + 12) {
      console.log(`  ${TARGETS[k].name.padEnd(13)}（历史不足 20 年，跳过）`);
      continue;
    }
    const list = [];
    for (let e = W - 1; e < rows.length; e++) {
      const slice = rows.slice(e - W + 1, e + 1);
      const r = simulate(slice, FIXED, null);
      list.push({ end: slice[slice.length - 1].ym, gain: r.gainRatio });
    }
    list.sort((a, b) => a.gain - b.gain);
    const at = (q) => list[Math.min(list.length - 1, Math.floor(q * list.length))];
    const negCount = list.filter((x) => x.gain < 0).length;
    console.log(`  ${TARGETS[k].name.padEnd(13)}${at(0).end.padStart(12)}`
      + `${pct(at(0).gain).padStart(11)}${pct(at(0.1).gain).padStart(10)}`
      + `${pct(at(0.5).gain).padStart(12)}${pct(list[list.length - 1].gain).padStart(11)}`
      + `${pct(negCount / list.length).padStart(14)}`);
  }

  // ============================================================ 4
  console.log(`\n${H}`);
  console.log('【4】股债比例前沿：少赚多少，能换来多少「不亏钱」（沪深300 + 国债ETF，年度再平衡）');
  console.log(H);
  const rowsHs = series.hs300;
  const bondTrHs = buildBondTr(rowsHs, bondMonthly, ASSUME.bondRatePerYear);
  const bondRows = rowsHs.map((r, i) => ({ ym: r.ym, tr: bondTrHs[i] }));
  console.log('  权益比例   全周期XIRR  最大回撤   3年亏钱率   5年亏钱率  10年亏钱率   5年最差');
  for (const eq of [1.0, 0.9, 0.8, 0.7, 0.5, 0.3]) {
    const pr = simulatePortfolio([rowsHs, bondRows], [eq, 1 - eq], 'Q');
    // 滚动亏钱率：用组合法重算
    const lr = {};
    for (const y of [3, 5, 10]) {
      const gains = [];
      for (let s = 0; s + y * 12 <= rowsHs.length; s++) {
        const a = rowsHs.slice(s, s + y * 12);
        const b = bondRows.slice(s, s + y * 12);
        const r = simulatePortfolio([a, b], [eq, 1 - eq], 'Q');
        gains.push(r.gainRatio);
      }
      lr[y] = {
        lossRate: gains.filter((g) => g < 0).length / gains.length,
        worst: Math.min(...gains),
      };
    }
    console.log(`  ${(eq * 100).toFixed(0).padStart(6)}%`
      + `${pct(pr.xirr).padStart(12)}${pct(pr.maxDrawdown).padStart(10)}`
      + `${pct(lr[3].lossRate).padStart(11)}${pct(lr[5].lossRate).padStart(11)}${pct(lr[10].lossRate).padStart(12)}`
      + `${pct(lr[5].worst).padStart(10)}`);
  }

  // ============================================================ 5
  console.log(`\n${H}`);
  console.log('【5】绝对保本的代价：100% 债券/存款，本金不亏，但购买力会亏');
  console.log(H);
  const bondFirst = bondTrHs[0];
  const bondLast = bondTrHs[bondTrHs.length - 1];
  const bondYears = rowsHs.length / 12;
  const bondCagr = Math.pow(bondLast / bondFirst, 1 / bondYears) - 1;
  console.log(`  国债ETF(511010) 数据区间内年化：${pct(bondCagr)}（${bondYears.toFixed(1)} 年，含分红再投资）`);
  console.log('');
  console.log('  25 年、每月 5,000 元（累计投入 150 万）在不同年化下的终值与购买力：');
  console.log('  年化      名义终值        按 2.5% 通胀折算购买力    相当于今天每月能花');
  for (const r of [0.02, 0.03, bondCagr, 0.05, 0.08, 0.10]) {
    const rm = Math.pow(1 + r, 1 / 12) - 1;
    const fv = ASSUME.monthlyBase * ((Math.pow(1 + r, 25) - 1) / rm);
    const real = fv / Math.pow(1.025, 25);
    const perMonth = (real * 0.04) / 12; // 按 4% 提取率折算成今天购买力的月现金流
    console.log(`  ${pct(r).padStart(7)}${num(fv).padStart(15)}${num(real).padStart(24)}${num(perMonth).padStart(22)} 元`);
  }

  console.log(`\n${H}`);
  console.log('检验完成。');
  console.log(H);
}

main().catch((e) => {
  console.error('检验失败:', e);
  process.exit(1);
});
