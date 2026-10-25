// ============================================================================
// 债熊敏感性：如果未来债券不是年年正收益，全天候还剩多少？
//
// 背景：2013-2026 中国国债几乎年年正收益，"股债对冲"看起来完美。
//      但 2016Q4 债灾、2022 全球股债双杀说明债券可以同时和股票下跌。
//
// 做法：把债券部分的年化收益强制替换成不同假设（+3% / 0% / -2% / 通胀挂钩），
//      看「均衡 40/40/20」这类组合的收益与回撤怎么变。
//
// 运行: node scripts/backtest-bondbear.mjs
// ============================================================================

import {
  ASSUME, loadSeries, toMonthly, buildTotalReturn, isRebalanceMonth,
  maxDrawdown, xirr, pct, num,
} from './backtest.mjs';

const H = '─'.repeat(96);

/** 用固定年化合成一条「假债券」净值序列 */
function syntheticBond(len, annualRate) {
  const m = Math.pow(1 + annualRate, 1 / 12);
  const out = [];
  let v = 1000;
  for (let i = 0; i < len; i++) {
    if (i > 0) v *= m;
    out.push(v);
  }
  return out;
}

/** 固定权重组合定投 + 季度再平衡；bond 用传入序列 */
function simulateMix(trList, weights, bondSeries, freq) {
  const n = trList.length;
  const len = trList[0].length;
  const feeM = Math.pow(1 - ASSUME.feePerYear, 1 / 12) - 1;
  const units = new Array(n).fill(0);
  let invested = 0;
  const flows = [];
  const series = [];

  for (let i = 0; i < len; i++) {
    for (let k = 0; k < n; k++) units[k] *= 1 + feeM;
    invested += ASSUME.monthlyBase;
    flows.push({ ym: ymList[i], amount: -ASSUME.monthlyBase });
    for (let k = 0; k < n; k++) {
      const price = (k === BOND_IDX) ? bondSeries[i] : trList[k][i];
      units[k] += (ASSUME.monthlyBase * weights[k]) / price;
    }
    if (isRebalanceMonth(ymList[i], freq)) {
      const vals = [];
      let total = 0;
      for (let k = 0; k < n; k++) {
        const price = (k === BOND_IDX) ? bondSeries[i] : trList[k][i];
        const v = units[k] * price;
        vals.push(v);
        total += v;
      }
      if (total > 0) {
        for (let k = 0; k < n; k++) {
          const price = (k === BOND_IDX) ? bondSeries[i] : trList[k][i];
          units[k] += (total * weights[k] - vals[k]) / price;
        }
      }
    }
    let tot = 0;
    for (let k = 0; k < n; k++) {
      const price = (k === BOND_IDX) ? bondSeries[i] : trList[k][i];
      tot += units[k] * price;
    }
    series.push(tot);
  }

  const last = len - 1;
  let finalValue = 0;
  for (let k = 0; k < n; k++) {
    const price = (k === BOND_IDX) ? bondSeries[last] : trList[k][last];
    finalValue += units[k] * price;
  }
  flows.push({ ym: ymList[last], amount: finalValue });

  // 时间加权净值，剔除入金
  const nav = [1];
  for (let k = 1; k < series.length; k++) {
    const prev = series[k - 1];
    const r = prev > 0 ? (series[k] - ASSUME.monthlyBase) / prev - 1 : 0;
    nav.push(nav[k - 1] * (1 + r));
  }
  return {
    invested, finalValue,
    gainRatio: (finalValue - invested) / invested,
    xirr: xirr(flows),
    mddNav: maxDrawdown(nav),
    series,
  };
}

let ymList = [];
let BOND_IDX = 3;

async function main() {
  console.log('\n加载资产 ...');
  const specs = [
    { key: 'hs300', name: '沪深300', secid: '1.000300', kind: 'index', dy: 0.020 },
    { key: 'sp500', name: '标普500', secid: '100.SPX', kind: 'index', dy: 0.018 },
    { key: 'div', name: '中证红利', secid: '1.000922', kind: 'index', dy: 0.045 },
    { key: 'bond', name: '国债ETF(真实)', secid: '1.511010', kind: 'etf', dy: 0 },
    { key: 'gold', name: '黄金ETF', secid: '1.518880', kind: 'etf', dy: 0 },
  ];
  const loaded = [];
  for (const s of specs) {
    const raw = await loadSeries(s.key, s.secid, s.kind);
    const m = toMonthly(raw);
    const rows = s.kind === 'etf' ? buildTotalReturn(m, m, 0) : buildTotalReturn(m, null, s.dy);
    loaded.push(rows);
    console.log(`  ${s.name.padEnd(14)} ${rows[0].ym} → ${rows[rows.length - 1].ym}  ${rows.length} 月`);
  }

  let from = '';
  let to = '9999-99';
  for (const r of loaded) {
    if (r[0].ym > from) from = r[0].ym;
    if (r[r.length - 1].ym < to) to = r[r.length - 1].ym;
  }
  const sliced = loaded.map((r) => r.filter((x) => x.ym >= from && x.ym <= to));
  const len = Math.min(...sliced.map((r) => r.length));
  const trList = sliced.map((r) => r.slice(0, len).map((x) => x.tr));
  ymList = sliced[0].slice(0, len).map((x) => x.ym);
  console.log(`\n共同区间 ${from} → ${to}（${len} 个月 ≈ ${(len / 12).toFixed(1)} 年）`);

  // 债券在 trList 里的下标
  const bondIdx = specs.findIndex((s) => s.key === 'bond');
  BOND_IDX = bondIdx;

  const equityIdx = [0, 1, 2];
  const goldIdx = 4;

  // 组合定义：股(沪深300/标普500/红利) + 债 + 金
  const portfolios = [
    { name: '均衡 40股/40债/20金', w: [0.2, 0.1, 0.1, 0.4, 0.2] },
    { name: '稳健 30股/50债/20金', w: [0.15, 0.075, 0.075, 0.5, 0.2] },
    { name: '经典 40股/60债', w: [0.2, 0.1, 0.1, 0.6, 0] },
    { name: '激进 70股/20债/10金', w: [0.35, 0.2, 0.15, 0.2, 0.1] },
  ];

  const bondScenarios = [
    { name: '真实国债ETF(≈3%)', real: true },
    { name: '债券年化 +4%', rate: 0.04 },
    { name: '债券年化 +3%', rate: 0.03 },
    { name: '债券年化 0%（十年不涨）', rate: 0.0 },
    { name: '债券年化 -2%（债熊）', rate: -0.02 },
  ];

  console.log(`\n${H}`);
  console.log('【债熊敏感性】把债券收益强制替换成不同假设（季度再平衡，每月 5,000）');
  console.log(H);

  for (const pf of portfolios) {
    console.log(`\n■ ${pf.name}`);
    console.log('  债券假设                    XIRR     累计收益    净值回撤    账户回撤');
    for (const sc of bondScenarios) {
      let bondSeries;
      if (sc.real) {
        bondSeries = trList[bondIdx];
      } else {
        bondSeries = syntheticBond(len, sc.rate);
      }
      const r = simulateMix(trList, pf.w, bondSeries, 'Q');
      console.log(`  ${sc.name.padEnd(26)}${pct(r.xirr).padStart(8)}${pct(r.gainRatio).padStart(11)}`
        + `${pct(r.mddNav).padStart(11)}${pct(maxDrawdown(r.series)).padStart(11)}`);
    }
  }

  // ---------------------------------------------------------------- 关键对比
  console.log(`\n${H}`);
  console.log('【结论表】同一组合在「真实债」与「零收益债」下的差额 = 债券假设贡献了多少收益');
  console.log(H);
  console.log('  组合                     真实债XIRR   零收益债XIRR   差额        债熊(-2%)XIRR   差额');
  for (const pf of portfolios) {
    const rReal = simulateMix(trList, pf.w, trList[bondIdx], 'Q');
    const rZero = simulateMix(trList, pf.w, syntheticBond(len, 0), 'Q');
    const rBear = simulateMix(trList, pf.w, syntheticBond(len, -0.02), 'Q');
    console.log(`  ${pf.name.padEnd(24)}${pct(rReal.xirr).padStart(10)}${pct(rZero.xirr).padStart(13)}`
      + `${((rZero.xirr - rReal.xirr) * 100).toFixed(1).padStart(10)}pt`
      + `${pct(rBear.xirr).padStart(14)}${((rBear.xirr - rReal.xirr) * 100).toFixed(1).padStart(10)}pt`);
  }

  console.log(`\n${H}`);
  console.log('回测完成。');
  console.log(H);
}

main().catch((e) => {
  console.error('回测失败:', e);
  process.exit(1);
});
