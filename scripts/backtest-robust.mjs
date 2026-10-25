// ============================================================================
// 稳健性检验：上一轮"流速模型在 A股 +2.5 个点"到底是真的，还是参数运气？
//
// 四道检验：
//  1. z 分布诊断   —— 为什么同一策略在美股会"卖飞并永久离场"
//  2. 参数敏感性   —— 扫 window × pace × sellZ，看结果是否稳定为正
//  3. 子区间稳定   —— 前半段 vs 后半段，方向是否一致
//  4. 再平衡频率   —— 月度 / 季度 / 年度
//  5. 组合回测     —— 真实会投的多标的组合（含黄金）
//
// 运行: node scripts/backtest-robust.mjs
// ============================================================================

import {
  ASSUME, TARGETS, ETF_SECID, loadSeries, toMonthly, buildTotalReturn,
  buildBondTr, addFlowSignal, simulate, isRebalanceMonth,
  maxDrawdown, xirr, pct, num,
} from './backtest.mjs';

const H = '─'.repeat(92);

async function prepare(key) {
  const raw = await loadSeries(key, TARGETS[key].secid, 'index');
  if (!raw) return null;
  const monthly = toMonthly(raw);
  const etfRaw = key === 'hs300' ? await loadSeries('etf300', ETF_SECID.etf300, 'etf') : null;
  const rows = buildTotalReturn(monthly, etfRaw ? toMonthly(etfRaw) : null, ASSUME.dividendYield[key] ?? 0);
  addFlowSignal(rows, ASSUME.flowWindow, 36);
  return rows;
}

async function prepareGold() {
  const raw = await loadSeries('gold', '1.518880', 'etf');
  if (!raw) return null;
  const monthly = toMonthly(raw);
  const rows = buildTotalReturn(monthly, monthly, 0);
  addFlowSignal(rows, ASSUME.flowWindow, 36);
  return rows;
}

const G_OPTS = { mode: 'flow', tpToBond: true, rebalance: true };
const A_OPTS = { mode: 'fixed' };

// ---------------------------------------------------------------- 1. z 分布
function diagnoseZ(name, rows) {
  let n = 0;
  let above1 = 0;
  let above15 = 0;
  let above2 = 0;
  let below05 = 0;
  let below1 = 0;
  let sumZ = 0;
  for (const r of rows) {
    if (r.z === null || r.z === undefined) continue;
    n++;
    sumZ += r.z;
    if (r.z > 1.0) above1++;
    if (r.z > 1.5) above15++;
    if (r.z > 2.0) above2++;
    if (r.z < -0.5) below05++;
    if (r.z < -1.0) below1++;
  }
  return {
    name, samples: n,
    meanZ: n > 0 ? sumZ / n : 0,
    above1: n > 0 ? above1 / n : 0,
    above15: n > 0 ? above15 / n : 0,
    above2: n > 0 ? above2 / n : 0,
    below05: n > 0 ? below05 / n : 0,
    below1: n > 0 ? below1 / n : 0,
  };
}

// ---------------------------------------------------------------- 5. 组合回测
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

    if (isRebalanceMonth(rowsList[0][i].ym, freq)) {
      const vals = [];
      let total = 0;
      for (let k = 0; k < n; k++) {
        const v = units[k] * rowsList[k][i].tr;
        vals.push(v);
        total += v;
      }
      if (total > 0) {
        for (let k = 0; k < n; k++) {
          units[k] += (total * weights[k] - vals[k]) / rowsList[k][i].tr;
        }
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
    invested,
    finalValue,
    gainRatio: (finalValue - invested) / invested,
    xirr: xirr(flows),
    maxDrawdown: maxDrawdown(series),
  };
}

function sliceByRange(rows, fromYm, toYm) {
  return rows.filter((r) => r.ym >= fromYm && r.ym <= toYm);
}

// ---------------------------------------------------------------- 主流程
async function main() {
  console.log('\n准备数据 ...');
  const keys = ['hs300', 'a500', 'hsi', 'sp500', 'ndx', 'div'];
  const series = {};
  for (const k of keys) series[k] = await prepare(k);
  const gold = await prepareGold();
  const bondMonthly = toMonthly(await loadSeries('bond', ETF_SECID.bond, 'etf'));
  const bondOf = {};
  for (const k of keys) bondOf[k] = buildBondTr(series[k], bondMonthly, ASSUME.bondRatePerYear);
  if (gold) bondOf.gold = buildBondTr(gold, bondMonthly, ASSUME.bondRatePerYear);

  // ============================================================ 检验 1
  console.log(`\n${H}`);
  console.log('【检验 1】滚动 z 的分布 —— 为什么美股会被"卖飞并永久离场"');
  console.log(H);
  console.log('  标的        有效月数   平均z   z>1.0    z>1.5    z>2.0    z<-0.5   z<-1.0   F组现金占用');
  for (const k of keys) {
    const d = diagnoseZ(TARGETS[k].name, series[k]);
    const f = simulate(series[k], { mode: 'flow', tpToBond: false }, bondOf[k]);
    console.log(`  ${d.name.padEnd(12)} ${String(d.samples).padStart(6)}`
      + `  ${d.meanZ.toFixed(2).padStart(7)}`
      + `  ${pct(d.above1).padStart(7)}  ${pct(d.above15).padStart(7)}  ${pct(d.above2).padStart(7)}`
      + `  ${pct(d.below05).padStart(7)}  ${pct(d.below1).padStart(7)}`
      + `  ${pct(f.cashShare).padStart(10)}`);
  }
  console.log('\n  解读：z>1.0 的月份占比越高，说明该市场「长期高于自身滚动均值」——');
  console.log('        均值回归假设失效，流速模型的卖出规则会持续减仓，最后全变现金。');

  // ============================================================ 检验 2
  console.log(`\n${H}`);
  console.log('【检验 2】参数敏感性：window × pace × sellZ 全扫描（G 组，含转债+年度再平衡）');
  console.log(H);
  const windows = [60, 90, 120, 180, 240];
  const paces = [6, 12, 24];
  const sellZs = [0.5, 1.0, 1.5, 2.0];
  const sensKeys = ['hs300', 'a500', 'hsi', 'sp500', 'ndx'];
  console.log('  标的        A基准 XIRR   G组 min      G组 中位     G组 max     超A比例   结论');
  const sensitivity = {};
  for (const k of sensKeys) {
    const rows = series[k];
    const base = simulate(rows, A_OPTS, bondOf[k]).xirr;
    const xs = [];
    let beats = 0;
    for (const w of windows) {
      addFlowSignal(rows, w, 36);
      for (const p of paces) {
        for (const s of sellZs) {
          ASSUME.flowPace = p;
          ASSUME.flowSellZ = s;
          const r = simulate(rows, G_OPTS, bondOf[k]);
          xs.push(r.xirr);
          if (r.xirr > base) beats++;
        }
      }
    }
    xs.sort((a, b) => a - b);
    const median = xs[Math.floor(xs.length / 2)];
    const beatsRatio = beats / xs.length;
    const verdict = beatsRatio >= 0.8 ? '稳健占优' : (beatsRatio >= 0.5 ? '偏占优但不稳' : '不如普通定投');
    sensitivity[k] = {
      name: TARGETS[k].name, base, min: xs[0], median, max: xs[xs.length - 1],
      beatsRatio, samples: xs.length,
    };
    console.log(`  ${TARGETS[k].name.padEnd(11)} ${pct(base).padStart(9)}`
      + `  ${pct(xs[0]).padStart(8)}  ${pct(median).padStart(10)}  ${pct(xs[xs.length - 1]).padStart(9)}`
      + `  ${pct(beatsRatio).padStart(8)}  ${verdict}`);
  }
  // 恢复默认参数
  ASSUME.flowPace = 12;
  ASSUME.flowSellZ = 1.0;
  for (const k of keys) addFlowSignal(series[k], ASSUME.flowWindow, 36);

  // ============================================================ 检验 3
  console.log(`\n${H}`);
  console.log('【检验 3】子区间稳健性：把历史切成前后两半，方向是否一致');
  console.log(H);
  console.log('  标的        前半段区间              A        G      前半差值   后半段区间              A        G      后半差值   方向一致');
  const sub = {};
  for (const k of keys) {
    const rows = series[k];
    const mid = Math.floor(rows.length / 2);
    const first = rows.slice(0, mid);
    const second = rows.slice(mid);
    const b1 = bondOf[k].slice(0, mid);
    const b2 = bondOf[k].slice(mid);
    const a1 = simulate(first, A_OPTS, b1).xirr;
    const g1 = simulate(first, G_OPTS, b1).xirr;
    const a2 = simulate(second, A_OPTS, b2).xirr;
    const g2 = simulate(second, G_OPTS, b2).xirr;
    const d1 = g1 - a1;
    const d2 = g2 - a2;
    const same = (d1 > 0) === (d2 > 0);
    sub[k] = {
      name: TARGETS[k].name,
      first: { from: first[0].ym, to: first[first.length - 1].ym, a: a1, g: g1 },
      second: { from: second[0].ym, to: second[second.length - 1].ym, a: a2, g: g2 },
      diffFirst: d1, diffSecond: d2, sameDirection: same,
    };
    console.log(`  ${TARGETS[k].name.padEnd(11)}`
      + ` ${(first[0].ym + '~' + first[first.length - 1].ym).padEnd(21)}`
      + ` ${pct(a1).padStart(7)} ${pct(g1).padStart(8)} ${(d1 >= 0 ? '+' : '') + (d1 * 100).toFixed(1) + 'pt'}`.padStart(10)
      + ` ${(second[0].ym + '~' + second[second.length - 1].ym).padEnd(21)}`
      + ` ${pct(a2).padStart(7)} ${pct(g2).padStart(8)} ${(d2 >= 0 ? '+' : '') + (d2 * 100).toFixed(1) + 'pt'}`.padStart(10)
      + `   ${same ? '✓ 一致' : '✗ 反转'}`);
  }

  // ============================================================ 检验 4
  console.log(`\n${H}`);
  console.log('【检验 4】再平衡频率：月度 / 季度 / 年度（G 组，含转债）');
  console.log(H);
  console.log('  标的        XIRR：月度     季度     年度     MDD：月度     季度     年度    最好频率');
  const freqKeys = ['hs300', 'a500', 'hsi', 'sp500'];
  const freqRes = {};
  for (const k of freqKeys) {
    const rows = series[k];
    const out = {};
    for (const f of ['M', 'Q', 'Y']) {
      const r = simulate(rows, { ...G_OPTS, rebalanceFreq: f }, bondOf[k]);
      out[f] = { xirr: r.xirr, mdd: r.maxDrawdown };
    }
    const best = ['M', 'Q', 'Y'].reduce((a, b) => (out[a].xirr >= out[b].xirr ? a : b));
    freqRes[k] = { name: TARGETS[k].name, ...out, best };
    console.log(`  ${TARGETS[k].name.padEnd(11)}`
      + ` ${pct(out.M.xirr).padStart(9)} ${pct(out.Q.xirr).padStart(8)} ${pct(out.Y.xirr).padStart(8)}`
      + `   ${pct(out.M.mdd).padStart(9)} ${pct(out.Q.mdd).padStart(8)} ${pct(out.Y.mdd).padStart(8)}`
      + `   ${best}`);
  }

  // ============================================================ 检验 5
  if (gold) {
    console.log(`\n${H}`);
    console.log('【检验 5】组合回测：真实会投的多标的组合（含黄金，年度再平衡）');
    console.log(H);
    const fromYm = gold[0].ym;
    const toYm = gold[gold.length - 1].ym;
    const pool = {
      hs300: sliceByRange(series.hs300, fromYm, toYm),
      sp500: sliceByRange(series.sp500, fromYm, toYm),
      div: sliceByRange(series.div, fromYm, toYm),
      gold: sliceByRange(gold, fromYm, toYm),
    };
    console.log(`  共同区间 ${fromYm} → ${toYm}（${pool.gold.length} 个月），每月 ${num(ASSUME.monthlyBase)} 元`);
    console.log('  组合                                        累计投入      终值   收益倍率   XIRR   最大回撤');

    const portfolios = [
      { name: 'P1 沪深300 100%', names: ['hs300'], w: [1] },
      { name: 'P2 沪深300 60 / 红利 40', names: ['hs300', 'div'], w: [0.6, 0.4] },
      { name: 'P3 沪深300 40 / 标普500 40 / 红利 20', names: ['hs300', 'sp500', 'div'], w: [0.4, 0.4, 0.2] },
      { name: 'P4 沪深300 40 / 标普500 30 / 红利 15 / 黄金 15', names: ['hs300', 'sp500', 'div', 'gold'], w: [0.4, 0.3, 0.15, 0.15] },
    ];
    const portRes = [];
    for (const p of portfolios) {
      const rowsList = p.names.map((n) => pool[n]);
      const r = simulatePortfolio(rowsList, p.w, 'Y');
      portRes.push({ name: p.name, ...r });
      console.log(`  ${p.name.padEnd(44)} ${num(r.invested).padStart(10)}`
        + ` ${num(r.finalValue).padStart(9)} ${pct(r.gainRatio).padStart(9)}`
        + ` ${pct(r.xirr).padStart(7)} ${pct(r.maxDrawdown).padStart(10)}`);
    }
    console.log('\n  注意：共同区间只有约 13 年（受黄金 ETF 2013-07 上市限制），样本短，结论仅供参考。');
  }

  console.log(`\n${H}`);
  console.log('检验完成。');
  console.log(H);
}

main().catch((e) => {
  console.error('检验失败:', e);
  process.exit(1);
});
