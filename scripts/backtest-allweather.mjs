// ============================================================================
// 全天候 / 风险平价检验
//
// 回答三个问题：
//  1. 中国市场上，风险平价会不会把仓位几乎全压到债券上？（会，量化给你看）
//  2. 风险平价 vs 等权 vs 逆波动率 vs 经典 60/40，谁更适合「少赚不亏」
//  3. 全天候最大的软肋——股债同跌——在样本里出现过吗，杀伤多大
//
// 口径：
//  · 权重全部用「滚动 36 个月」估计，只用当时已知数据，无未来函数
//  · 定投：每月 5000 按当前权重新增，再平衡时把存量调回目标权重
//  · 资产：沪深300、标普500、中证红利、国债ETF(511010)、黄金ETF(518880)
//  · 共同区间受国债ETF(2013-03)与黄金ETF(2013-07)限制，约 13 年
//
// 运行: node scripts/backtest-allweather.mjs
// ============================================================================

import {
  ASSUME, loadSeries, toMonthly, buildTotalReturn, isRebalanceMonth,
  maxDrawdown, xirr, pct, num,
} from './backtest.mjs';

const H = '─'.repeat(98);
const WIN = 36;      // 风险估计窗口（月）
const MINW = 24;     // 最少需要多少个月才开始用估计权重

const ASSETS = [
  { key: 'hs300', name: '沪深300', secid: '1.000300', kind: 'index', dy: 0.020 },
  { key: 'sp500', name: '标普500', secid: '100.SPX', kind: 'index', dy: 0.018 },
  { key: 'div', name: '中证红利', secid: '1.000922', kind: 'index', dy: 0.045 },
  { key: 'bond', name: '国债ETF', secid: '1.511010', kind: 'etf', dy: 0 },
  { key: 'gold', name: '黄金ETF', secid: '1.518880', kind: 'etf', dy: 0 },
];

// ---------------------------------------------------------------- 数据
async function loadAsset(a) {
  const raw = await loadSeries(a.key, a.secid, a.kind);
  if (!raw) return null;
  const m = toMonthly(raw);
  if (a.kind === 'etf') return buildTotalReturn(m, m, 0);
  return buildTotalReturn(m, null, a.dy);
}

/** 把多个序列对齐到共同区间，返回 {ym[], tr[asset][month]} */
function align(seriesList) {
  let fromYm = '';
  let toYm = '9999-99';
  for (const s of seriesList) {
    if (s[0].ym > fromYm) fromYm = s[0].ym;
    const last = s[s.length - 1].ym;
    if (last < toYm) toYm = last;
  }
  const out = seriesList.map((s) => s.filter((r) => r.ym >= fromYm && r.ym <= toYm));
  const len = Math.min(...out.map((s) => s.length));
  const rows = out.map((s) => s.slice(0, len));
  return {
    yms: rows[0].map((r) => r.ym),
    tr: rows.map((s) => s.map((r) => r.tr)),
    len,
  };
}

// ---------------------------------------------------------------- 统计工具
function returnsOf(tr) {
  const r = [0];
  for (let i = 1; i < tr.length; i++) r.push(tr[i] / tr[i - 1] - 1);
  return r;
}

function stdev(arr) {
  if (arr.length < 2) return 0;
  const m = arr.reduce((s, x) => s + x, 0) / arr.length;
  const v = arr.reduce((s, x) => s + (x - m) * (x - m), 0) / (arr.length - 1);
  return Math.sqrt(v);
}

/** 滚动窗口的协方差矩阵 */
function covMatrix(retsList, endIdx, win, minw) {
  const n = retsList.length;
  const from = Math.max(1, endIdx - win + 1);
  const usable = endIdx - from + 1;
  const cov = [];
  for (let i = 0; i < n; i++) {
    cov.push(new Array(n).fill(0));
  }
  if (usable < minw) return null;
  const means = retsList.map((r) => {
    let s = 0;
    for (let t = from; t <= endIdx; t++) s += r[t];
    return s / usable;
  });
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let s = 0;
      for (let t = from; t <= endIdx; t++) {
        s += (retsList[i][t] - means[i]) * (retsList[j][t] - means[j]);
      }
      const v = s / (usable - 1);
      cov[i][j] = v;
      cov[j][i] = v;
    }
  }
  return cov;
}

/** 逆波动率权重 */
function inverseVolWeights(cov) {
  if (!cov) return null;
  const n = cov.length;
  const inv = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const sd = Math.sqrt(Math.max(cov[i][i], 1e-12));
    const x = 1 / sd;
    inv.push(x);
    sum += x;
  }
  return inv.map((x) => x / sum);
}

/** 真正风险平价（ERC）：迭代使各资产的风险贡献相等 */
function ercWeights(covIn) {
  if (!covIn) return null;
  const n = covIn.length;
  // 对角加微小岭项，避免奇异矩阵导致迭代发散
  const cov = covIn.map((row, i) => row.map((v, j) => (i === j ? v + Math.max(v, 1e-10) * 1e-4 : v)));
  let w = new Array(n).fill(1 / n);
  for (let iter = 0; iter < 2000; iter++) {
    const mrc = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) mrc[i] += cov[i][j] * w[j];
    }
    const variance = mrc.reduce((s2, x, i) => s2 + x * w[i], 0);
    if (!(variance > 0)) break;
    // 目标：每个资产的风险贡献都等于组合方差 / n
    const target = variance / n;
    let maxDev = 0;
    const next = new Array(n);
    for (let i = 0; i < n; i++) {
      const rc = w[i] * mrc[i];
      const dev = target > 0 ? Math.abs(rc - target) / target : 0;
      if (dev > maxDev) maxDev = dev;
      const factor = rc > 0 ? Math.pow(target / rc, 0.5) : 1.2;
      next[i] = Math.max(w[i] * factor, 1e-6);
    }
    let sum = 0;
    for (let i = 0; i < n; i++) sum += next[i];
    for (let i = 0; i < n; i++) w[i] = next[i] / sum;
    if (maxDev < 1e-8) break;
  }
  return w;
}

// ---------------------------------------------------------------- 回测
/**
 * 定投 + 定期按方案调仓。
 * weightFn(endIdx) 返回权重数组（用 endIdx 及之前的数据，调用时已错开一个月避免未来函数）
 */
function simulateAW(trList, yms, weightFn, rebalanceFreq) {
  const n = trList.length;
  const len = trList[0].length;
  const rets = trList.map(returnsOf);
  const feeM = Math.pow(1 - ASSUME.feePerYear, 1 / 12) - 1;
  const units = new Array(n).fill(0);
  let w = new Array(n).fill(1 / n);
  let invested = 0;
  const flows = [];
  const series = [];
  const weightLog = [];

  for (let i = 1; i < len; i++) {
    for (let k = 0; k < n; k++) units[k] *= 1 + feeM;

    const c = ASSUME.monthlyBase;
    invested += c;
    flows.push({ ym: yms[i], amount: -c });
    for (let k = 0; k < n; k++) units[k] += (c * w[k]) / trList[k][i];

    if (isRebalanceMonth(yms[i], rebalanceFreq)) {
      // 用 i-1 及之前的数据估权重，避免用到当月收益
      const cov = covMatrix(rets, i - 1, WIN, MINW);
      {
        const nw = weightFn(cov);
        if (nw) {
          w = nw;
          weightLog.push({ i, w: nw.slice() });
          // 把存量调回目标
          const vals = [];
          let total = 0;
          for (let k = 0; k < n; k++) {
            const v = units[k] * trList[k][i];
            vals.push(v);
            total += v;
          }
          if (total > 0) {
            for (let k = 0; k < n; k++) units[k] += (total * w[k] - vals[k]) / trList[k][i];
          }
        }
      }
    }

    let tot = 0;
    for (let k = 0; k < n; k++) tot += units[k] * trList[k][i];
    series.push(tot);
  }

  const last = len - 1;
  let finalValue = 0;
  for (let k = 0; k < n; k++) finalValue += units[k] * trList[k][last];
  flows.push({ ym: yms[len - 1], amount: finalValue });

  // 剔除每月入金，构造时间加权净值序列（否则新钱会把回撤和波动都掩盖掉）
  const nav = [1];
  const portRets = [];
  for (let k = 1; k < series.length; k++) {
    const c = ASSUME.monthlyBase;
    const prev = series[k - 1];
    const r = prev > 0 ? (series[k] - c) / prev - 1 : 0;
    portRets.push(r);
    nav.push(nav[k - 1] * (1 + r));
  }
  const vol = stdev(portRets) * Math.sqrt(12);

  return {
    invested, finalValue,
    gainRatio: (finalValue - invested) / invested,
    xirr: xirr(flows),
    mddNav: maxDrawdown(nav),
    mddAccount: maxDrawdown(series),
    nav,
    vol,
    weightLog,
    series,
    flows,
  };
}

/** 滚动窗口亏钱率（用同一套权重方案） */
function rollingLossRate(trList, yms, weightFn, freq, months) {
  const len = trList[0].length;
  const gains = [];
  for (let s = 0; s + months <= len; s++) {
    const sub = trList.map((tr) => tr.slice(s, s + months));
    const r = simulateAW(sub, yms.slice(s, s + months), weightFn, freq);
    if (r.invested > 0) gains.push(r.gainRatio);
  }
  if (gains.length === 0) return null;
  return {
    lossRate: gains.filter((g) => g < 0).length / gains.length,
    worst: Math.min(...gains),
    median: [...gains].sort((a, b) => a - b)[Math.floor(gains.length / 2)],
  };
}

// ---------------------------------------------------------------- 主流程
async function main() {
  console.log('\n加载资产 ...');
  const sers = [];
  for (const a of ASSETS) {
    const s = await loadAsset(a);
    if (!s) { console.error('缺少资产数据:', a.key); process.exit(1); }
    sers.push(s);
    console.log(`  ${a.name.padEnd(10)} ${s[0].ym} → ${s[s.length - 1].ym}  ${s.length} 月`);
  }
  const al = align(sers);
  const names = ASSETS.map((a) => a.name);
  console.log(`\n共同区间 ${al.yms[0]} → ${al.yms[al.yms.length - 1]}（${al.len} 个月 ≈ ${(al.len / 12).toFixed(1)} 年）`);

  // ============================================================ 1. 相关性与波动
  const rets = al.tr.map(returnsOf);
  console.log(`\n${H}`);
  console.log('【1】各资产的年化波动与相互相关性（全天候能否成立的前提）');
  console.log(H);
  console.log('  资产         年化波动');
  for (let i = 0; i < names.length; i++) {
    console.log(`  ${names[i].padEnd(11)} ${pct(stdev(rets[i].slice(1)) * Math.sqrt(12), 2).padStart(8)}`);
  }
  console.log('\n  月度收益相关性矩阵：');
  console.log('              ' + names.map((n) => n.padStart(9)).join(''));
  for (let i = 0; i < names.length; i++) {
    const cells = [];
    for (let j = 0; j < names.length; j++) {
      const a = rets[i].slice(1);
      const b = rets[j].slice(1);
      const ma = a.reduce((s, x) => s + x, 0) / a.length;
      const mb = b.reduce((s, x) => s + x, 0) / b.length;
      let num2 = 0; let da = 0; let db = 0;
      for (let t = 0; t < a.length; t++) {
        num2 += (a[t] - ma) * (b[t] - mb);
        da += (a[t] - ma) ** 2;
        db += (b[t] - mb) ** 2;
      }
      const corr = da > 0 && db > 0 ? num2 / Math.sqrt(da * db) : 0;
      cells.push(corr.toFixed(2).padStart(9));
    }
    console.log(`  ${names[i].padEnd(11)}${cells.join('')}`);
  }

  // ============================================================ 2. 权重方案
  console.log(`\n${H}`);
  console.log('【2】几种权重方案的平均目标权重（关键：风险平价在中国会给债券多少）');
  console.log(H);
  const finalCov = covMatrix(rets, al.len - 2, WIN, MINW);
  const schemes = [
    { key: 'EW', name: '等权', fn: (cov) => { const n = cov ? cov.length : 5; return new Array(n).fill(1 / n); } },
    { key: 'IV', name: '逆波动率', fn: inverseVolWeights },
    { key: 'ERC', name: '风险平价', fn: ercWeights },
    {
      key: 'S6040', name: '经典60/40(股/债)',
      fn: () => [0.3, 0.0, 0.1, 0.6, 0.0],
    },
    {
      key: 'BAL', name: '均衡(股40/债40/金20)',
      fn: () => [0.2, 0.1, 0.1, 0.4, 0.2],
    },
  ];
  console.log('  方案                ' + names.map((n) => n.padStart(9)).join('') + '   权益合计');
  for (const s of schemes) {
    const w = s.fn(finalCov);
    const eq = w[0] + w[1] + w[2];
    console.log(`  ${s.name.padEnd(18)}${w.map((x) => pct(x).padStart(9)).join('')}${pct(eq).padStart(10)}`);
  }
  // ERC 风险贡献校验
  const wErc = ercWeights(finalCov);
  const mrcErc = [];
  for (let i = 0; i < names.length; i++) {
    let s2 = 0;
    for (let j = 0; j < names.length; j++) s2 += finalCov[i][j] * wErc[j];
    mrcErc.push(wErc[i] * s2);
  }
  const rcSum = mrcErc.reduce((s, x) => s + x, 0);
  const rcPct = mrcErc.map((x) => x / rcSum);
  console.log(`\n  风险平价的风险贡献占比：${rcPct.map((x) => pct(x)).join('  ')}`);
  console.log('  （应各约 20%，说明求解收敛正确）');

  // ============================================================ 3. 回测
  console.log(`\n${H}`);
  console.log('【3】回测对比：季度再平衡，每月 5,000 元定投');
  console.log(H);
  console.log('  方案                累计投入      终值     收益倍率    XIRR   年化波动  净值回撤  账户回撤');
  const results = {};
  for (const s of schemes) {
    const r = simulateAW(al.tr, al.yms, s.fn, 'Q');
    results[s.key] = r;
    console.log(`  ${s.name.padEnd(18)}${num(r.invested).padStart(10)}${num(r.finalValue).padStart(10)}`
      + `${pct(r.gainRatio).padStart(10)}${pct(r.xirr).padStart(9)}`
      + `${pct(r.vol).padStart(10)}${pct(r.mddNav).padStart(10)}${pct(r.mddAccount).padStart(10)}`);
  }
  // 单资产对照
  const single = simulateAW([al.tr[0]], al.yms, () => [1], 'Q');
  console.log(`  ${'（对照）纯沪深300'.padEnd(18)}${num(single.invested).padStart(10)}${num(single.finalValue).padStart(10)}`
    + `${pct(single.gainRatio).padStart(10)}${pct(single.xirr).padStart(9)}`
    + `${pct(single.vol).padStart(10)}${pct(single.mddNav).padStart(10)}${pct(single.mddAccount).padStart(10)}`);

  // ============================================================ 4. 亏钱概率
  console.log(`\n${H}`);
  console.log('【4】亏钱概率（滚动窗口，季度再平衡）—— 对齐「尽量不亏钱」的目标');
  console.log(H);
  console.log('  方案                3年亏钱率  3年最差   5年亏钱率  5年最差   5年中位');
  for (const s of schemes) {
    const l3 = rollingLossRate(al.tr, al.yms, s.fn, 'Q', 36);
    const l5 = rollingLossRate(al.tr, al.yms, s.fn, 'Q', 60);
    console.log(`  ${s.name.padEnd(18)}${pct(l3.lossRate).padStart(10)}${pct(l3.worst).padStart(10)}`
      + `${pct(l5.lossRate).padStart(11)}${pct(l5.worst).padStart(10)}${pct(l5.median).padStart(10)}`);
  }

  // ============================================================ 5. 再平衡频率
  console.log(`\n${H}`);
  console.log('【5】再平衡频率对风险平价的影响');
  console.log(H);
  console.log('  频率      XIRR    年化波动  净值回撤  账户回撤');
  for (const f of ['M', 'Q', 'Y']) {
    const r = simulateAW(al.tr, al.yms, ercWeights, f);
    console.log(`  ${f.padEnd(6)}${pct(r.xirr).padStart(9)}${pct(r.vol).padStart(11)}${pct(r.mddNav).padStart(10)}${pct(r.mddAccount).padStart(10)}`);
  }

  // ============================================================ 6. 股债同跌
  console.log(`\n${H}`);
  console.log('【6】压力测试：股债同跌（全天候最大的软肋）');
  console.log(H);
  const eqRet = rets[0];
  const bondRet = rets[3];
  const goldRet = rets[4];
  let bothDown = 0;
  let allDown = 0;
  let worstBoth = { ym: '', eq: 0, bond: 0 };
  for (let i = 1; i < al.len; i++) {
    if (eqRet[i] < 0 && bondRet[i] < 0) {
      bothDown++;
      if (eqRet[i] + bondRet[i] < worstBoth.eq + worstBoth.bond) {
        worstBoth = { ym: al.yms[i], eq: eqRet[i], bond: bondRet[i] };
      }
    }
    if (eqRet[i] < 0 && bondRet[i] < 0 && goldRet[i] < 0) allDown++;
  }
  console.log(`  股债同跌月份：${bothDown} / ${al.len - 1}（${pct(bothDown / (al.len - 1))}）`);
  console.log(`  股债金三者同跌月份：${allDown}（${pct(allDown / (al.len - 1))}）`);
  console.log(`  最惨的股债同跌：${worstBoth.ym}  沪深300 ${pct(worstBoth.eq)} / 国债 ${pct(worstBoth.bond)}`);

  // 逐年股债表现
  console.log('\n  按年看股债方向（同跌年 = 全天候失效年）：');
  const yearMap = new Map();
  for (let i = 1; i < al.len; i++) {
    const y = al.yms[i].slice(0, 4);
    if (!yearMap.has(y)) yearMap.set(y, { eq: 1, bond: 1, gold: 1 });
    const o = yearMap.get(y);
    o.eq *= 1 + eqRet[i];
    o.bond *= 1 + bondRet[i];
    o.gold *= 1 + goldRet[i];
  }
  const ys = [...yearMap.keys()];
  const cells = ys.map((y) => {
    const o = yearMap.get(y);
    const flag = (o.eq - 1 < 0 && o.bond - 1 < 0) ? '⚠' : ' ';
    return `${y}:股${pct(o.eq - 1, 0).replace('%', '')}/债${pct(o.bond - 1, 0).replace('%', '')}${flag}`;
  });
  for (let i = 0; i < cells.length; i += 3) {
    console.log('    ' + cells.slice(i, i + 3).join('   '));
  }
  console.log('\n    ⚠ = 该年股债同跌，全天候在这个年份没有对冲可用');

  console.log(`\n${H}`);
  console.log('检验完成。');
  console.log(H);
}

main().catch((e) => {
  console.error('检验失败:', e);
  process.exit(1);
});
