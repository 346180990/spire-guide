// ============================================================================
// RSRS（阻力支撑相对强度）择时指标 —— 本地复现与回测
//
// 复现自 hugo2046/QuantsPlaybook 的 RSRS notebook：
//  · 基础斜率：high = α + β·low 的 β（N 日 OLS）
//  · 标准分：  z = (β − M日均值) / M日标准差
//  · 修正版：  R² × z        ← 原作认为最优
//  · 交易规则：z > S 持仓；z < −S 空仓；中间维持（S = 0.7）
//
// 要回答的问题：
//  1. 能不能复现原作的结论
//  2. 它比我们现在的信号（三年区间位置 / 200日均线）更好吗
//  3. 用"定投倍数"的方式使用，能不能提升 XIRR
//
// 运行: node scripts/backtest-rsrs.mjs
// ============================================================================

import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const H = '─'.repeat(96);
const DATA_DIR = 'scripts/data';

const TARGETS = [
  { key: 'rsrs_hs300', name: '沪深300', symbol: 'sh000300', secid: '1.000300', fqt: 0 },
  { key: 'rsrs_sp500', name: '标普500', symbol: 'us.INX', secid: '100.SPX', fqt: 0 },
  { key: 'rsrs_cyb', name: '创业板指', symbol: 'sz399006', secid: '0.399006', fqt: 0 },
  { key: 'rsrs_zz500', name: '中证500', symbol: 'sh000905', secid: '1.000905', fqt: 0 },
];

const N = 18;      // 回归窗口
const M = 600;     // 标准分窗口
const S = 0.7;     // 信号阈值

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

async function httpGet(url) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 20000);
  const r = await fetch(url, { signal: c.signal, headers: { 'User-Agent': UA } });
  clearTimeout(t);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}

/**
 * 抓日线 OHLC。东财为主（全历史），腾讯为备（上限 1600 根）。
 * 字段：日期, 开, 收, 高, 低
 */
async function loadDaily(t) {
  await mkdir(DATA_DIR, { recursive: true });
  const cache = join(DATA_DIR, t.key + '.json');
  if (existsSync(cache)) {
    const j = JSON.parse(readFileSync(cache, 'utf8'));
    if (Array.isArray(j.daily) && j.daily.length > 700) {
      console.log('  缓存命中 ' + t.name.padEnd(8) + ' ' + j.daily.length + ' 根');
      return j.daily;
    }
  }

  // —— 主源：东财全历史
  let daily = [];
  try {
    console.log('  拉取东财 ' + t.name.padEnd(8) + ' ...');
    const url = 'https://push2his.eastmoney.com/api/qt/stock/kline/get'
      + '?secid=' + t.secid + '&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55'
      + '&klt=101&fqt=' + t.fqt + '&beg=20050101&end=20500101';
    const txt = await httpGet(url);
    const json = JSON.parse(txt);
    const klines = json && json.data && json.data.klines;
    if (Array.isArray(klines)) {
      for (const s of klines) {
        const p = String(s).split(',');
        const d = {
          date: p[0],
          open: Number(p[1]),
          close: Number(p[2]),
          high: Number(p[3]),
          low: Number(p[4]),
        };
        if ([d.open, d.close, d.high, d.low].every((x) => Number.isFinite(x) && x > 0)) {
          // 校验：high 必须 >= 开/收，low 必须 <= 开/收，否则说明字段顺序错了
          if (d.high >= Math.max(d.open, d.close) - 1e-9
            && d.low <= Math.min(d.open, d.close) + 1e-9) {
            daily.push(d);
          }
        }
      }
    }
  } catch (e) {
    console.log('    东财失败：' + e.message);
  }

  // —— 备源：腾讯
  if (daily.length < 700) {
    try {
      console.log('  改用腾讯 ' + t.name.padEnd(8) + ' ...');
      const url = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get'
        + '?param=' + t.symbol + ',day,,,1600,qfq';
      const txt = await httpGet(url);
      const json = JSON.parse(txt);
      const node = json && json.data && json.data[t.symbol];
      const rows = (node && (node.day || node.qfqday)) || [];
      const out = [];
      for (const r of rows) {
        if (!Array.isArray(r) || r.length < 5) continue;
        const d = {
          date: r[0],
          open: Number(r[1]),
          close: Number(r[2]),
          high: Number(r[3]),
          low: Number(r[4]),
        };
        if ([d.open, d.close, d.high, d.low].every((x) => Number.isFinite(x) && x > 0)) {
          if (d.high >= Math.max(d.open, d.close) - 1e-9
            && d.low <= Math.min(d.open, d.close) + 1e-9) {
            out.push(d);
          }
        }
      }
      if (out.length > daily.length) daily = out;
    } catch (e) {
      console.log('    腾讯也失败：' + e.message);
    }
  }

  if (daily.length > 0) {
    await writeFile(cache, JSON.stringify({
      key: t.key, fetchedAt: new Date().toISOString(), bars: daily.length, daily,
    }), 'utf8');
    console.log('  ' + t.name.padEnd(10) + daily.length + ' 根  ' + daily[0].date + ' → ' + daily[daily.length - 1].date);
  } else {
    console.log('  ' + t.name.padEnd(10) + '无数据');
  }
  return daily;
}

/* ---------------- RSRS 计算 ---------------- */

/** 滚动 OLS：high = α + β·low，同时给出 R² */
function computeBetaAndR2(daily, n) {
  const out = [];  // { beta, r2 }
  const len = daily.length;
  for (let i = 0; i < len; i++) {
    if (i + 1 < n) {
      out.push(null);
      continue;
    }
    const start = i - n + 1;
    let sx = 0; let sy = 0; let sxx = 0; let syy = 0; let sxy = 0;
    for (let k = start; k <= i; k++) {
      const x = daily[k].low;
      const y = daily[k].high;
      sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
    }
    const num = n * sxy - sx * sy;
    const denX = n * sxx - sx * sx;
    const denY = n * syy - sy * sy;
    if (denX <= 1e-12 || denY <= 1e-12) {
      out.push(null);
      continue;
    }
    const beta = num / denX;
    const r2 = (num * num) / (denX * denY);
    out.push({ beta, r2 });
  }
  return out;
}

/** 滚动标准分 */
function rollingZscore(values, m) {
  const out = [];
  const len = values.length;
  for (let i = 0; i < len; i++) {
    if (i + 1 < m) {
      out.push(null);
      continue;
    }
    const start = i - m + 1;
    let sum = 0; let cnt = 0;
    for (let k = start; k <= i; k++) {
      const v = values[k];
      if (v === null || !Number.isFinite(v)) continue;
      sum += v; cnt++;
    }
    if (cnt < m * 0.8) {
      out.push(null);
      continue;
    }
    const mean = sum / cnt;
    let sq = 0;
    for (let k = start; k <= i; k++) {
      const v = values[k];
      if (v === null || !Number.isFinite(v)) continue;
      sq += (v - mean) * (v - mean);
    }
    const sd = Math.sqrt(sq / (cnt - 1));
    const cur = values[i];
    out.push(sd > 1e-12 && cur !== null ? (cur - mean) / sd : null);
  }
  return out;
}

/**
 * 生成信号：v > upper 开仓；v < lower 平仓；中间维持原仓位。
 * 注意原作对基础斜率用的是不对称阈值（1.02 进 / 0.78 出），
 * 不能套用标准分的 ±S 对称写法，否则 β 永远为正、平仓条件永不触发。
 */
function makeSignal(values, upper, lower) {
  const sig = [];
  let hold = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null || !Number.isFinite(v)) {
      sig.push(hold);
      continue;
    }
    if (v > upper) hold = 1;
    else if (v < lower) hold = 0;
    sig.push(hold);
  }
  return sig;
}

/* ---------------- 指标 ---------------- */

function backtestTiming(daily, sig, fromIdx) {
  const rets = [];
  const nav = [1];
  let holdDays = 0;
  let trades = 0;
  let prev = 0;
  for (let i = fromIdx + 1; i < daily.length; i++) {
    const r = daily[i].close / daily[i - 1].close - 1;
    const pos = sig[i - 1]; // 用昨天的信号持仓，避免未来函数
    rets.push(r * pos);
    nav.push(nav[nav.length - 1] * (1 + r * pos));
    if (pos === 1) holdDays++;
    if (pos === 1 && prev === 0) trades++;
    prev = pos;
  }
  const n = rets.length;
  const cagr = Math.pow(nav[nav.length - 1], 250 / n) - 1;
  let peak = -Infinity;
  let mdd = 0;
  for (const v of nav) {
    if (v > peak) peak = v;
    if (peak > 0) mdd = Math.min(mdd, v / peak - 1);
  }
  let mean = 0;
  for (const r of rets) mean += r;
  mean /= n;
  let sq = 0;
  for (const r of rets) sq += (r - mean) * (r - mean);
  const sd = Math.sqrt(sq / (n - 1));
  const sharpe = sd > 0 ? (mean / sd) * Math.sqrt(250) : 0;
  return {
    cagr, mdd, sharpe, trades,
    holdRatio: holdDays / n,
    total: nav[nav.length - 1] - 1,
    days: n,
    nav,
  };
}

/** 定投口径：按信号给倍数，每月第一个交易日投入 */
function backtestDCA(daily, sig, fromIdx, multFor) {
  const monthly = 5000;
  let units = 0;
  let invested = 0;
  let lastMonth = '';
  const flows = [];
  const series = [];

  for (let i = fromIdx; i < daily.length; i++) {
    const d = daily[i];
    const ym = d.date.slice(0, 7);
    if (ym !== lastMonth) {
      lastMonth = ym;
      const mult = i === 0 ? 1 : multFor(sig[i - 1], i);
      const amount = monthly * mult;
      invested += amount;
      units += amount / d.close;
      flows.push({ date: d.date, amount: -amount });
    }
    series.push(units * d.close);
  }
  const finalValue = series[series.length - 1];
  flows.push({ date: daily[daily.length - 1].date, amount: finalValue });

  // XIRR
  const DAY = 86400000;
  const dn = (s) => {
    const p = String(s).split('-').map(Number);
    return Date.UTC(p[0], p[1] - 1, p[2]) / DAY;
  };
  const t0 = Math.min(...flows.map((f) => dn(f.date)));
  const npv = (rate) => flows.reduce(
    (s, f) => s + f.amount / Math.pow(1 + rate, (dn(f.date) - t0) / 365), 0);
  let lo = -0.9999; let hi = 10; let fLo = npv(lo); const fHi = npv(hi);
  let irr = NaN;
  if (Number.isFinite(fLo) && fLo * fHi <= 0) {
    for (let k = 0; k < 200; k++) {
      const mid = (lo + hi) / 2; const fMid = npv(mid);
      if (Math.abs(fMid) < 1e-7) { irr = mid; break; }
      if (fLo * fMid <= 0) hi = mid; else { lo = mid; fLo = fMid; }
    }
    if (!Number.isFinite(irr)) irr = (lo + hi) / 2;
  }
  let peak = -Infinity; let mdd = 0;
  for (const v of series) {
    if (v > peak) peak = v;
    if (peak > 0) mdd = Math.min(mdd, v / peak - 1);
  }
  return { invested, finalValue, xirr: Number.isFinite(irr) ? irr : NaN, mdd, months: series.length };
}

function pct(x, d) {
  return Number.isFinite(x) ? (x * 100).toFixed(d === undefined ? 1 : d) + '%' : '—';
}
function num(x) {
  return Math.round(x).toLocaleString('zh-CN');
}

/* ---------------- 主流程 ---------------- */

async function main() {
  console.log('\n=== 1. 准备日线数据（含 high/low，RSRS 需要）===');
  const data = {};
  for (const t of TARGETS) {
    try {
      const d = await loadDaily(t);
      if (d.length > 0) data[t.key] = d;
    } catch (e) {
      console.log('  跳过 ' + t.name + '：' + e.message);
    }
  }

  console.log('\n' + H);
  console.log('【1】复现原作：RSRS 三种版本的纯择时表现（持有 vs 空仓）');
  console.log(H);
  console.log('  标的       版本           年化     累计收益   最大回撤   Sharpe  持仓占比  交易次数');
  const summaryRows = [];

  for (const t of TARGETS) {
    const daily = data[t.key];
    if (!daily) continue;

    const br = computeBetaAndR2(daily, N);
    const betas = br.map((x) => (x ? x.beta : null));
    const r2s = br.map((x) => (x ? x.r2 : null));
    const z = rollingZscore(betas, M);
    const zRevise = z.map((v, i) => (v === null || r2s[i] === null ? null : v * r2s[i]));

    const fromIdx = Math.max(N, M) + 1;
    console.log('  ' + t.name + ' 回测区间：' + daily[fromIdx].date + ' → ' + daily[daily.length - 1].date + '（600 日预热后）');
    if (fromIdx >= daily.length - 250) {
      console.log('  ' + t.name + ' 数据不足，跳过');
      continue;
    }

    const variants = [
      { name: '基准(买入持有)', sig: daily.map(() => 1) },
      { name: '基础斜率', sig: makeSignal(betas, 1.02, 0.78) },
      { name: '标准分', sig: makeSignal(z, S, -S) },
      { name: '修正标准分', sig: makeSignal(zRevise, S, -S) },
    ];

    for (const v of variants) {
      const r = backtestTiming(daily, v.sig, fromIdx);
      console.log(`  ${t.name.padEnd(10)} ${v.name.padEnd(14)} ${pct(r.cagr).padStart(8)}`
        + `${pct(r.total).padStart(11)}${pct(r.mdd).padStart(11)}${r.sharpe.toFixed(2).padStart(9)}`
        + `${pct(r.holdRatio).padStart(10)}${String(r.trades).padStart(10)}`);
      summaryRows.push({ target: t.name, variant: v.name, ...r, nav: undefined });
    }
    console.log('');
  }

  // ---------------------------------------------------------------- 2
  console.log(H);
  console.log('【2】定投口径：RSRS 当"倍数信号"用，能提升 XIRR 吗');
  console.log(H);
  console.log('  标的       倍数规则                        XIRR     账户回撤    说明');
  for (const t of TARGETS) {
    const daily = data[t.key];
    if (!daily) continue;

    const br = computeBetaAndR2(daily, N);
    const betas = br.map((x) => (x ? x.beta : null));
    const r2s = br.map((x) => (x ? x.r2 : null));
    const z = rollingZscore(betas, M);
    const zRevise = z.map((v, i) => (v === null || r2s[i] === null ? null : v * r2s[i]));
    const sigRev = makeSignal(zRevise, S, -S);
    const sigZ = makeSignal(z, S, -S);
    const fromIdx = Math.max(N, M) + 1;

    const rules = [
      { name: '普通定投（恒定 1 倍）', fn: () => 1, note: '对照' },
      {
        name: 'RSRS标准分 1.3/1.0/0.85',
        fn: (s) => (s === 1 ? 1.3 : 1.0),
        note: '持仓加码，空仓不减',
      },
      {
        name: 'RSRS标准分 1.3/0.85',
        fn: (s) => (s === 1 ? 1.3 : 0.85),
        note: '持仓加码，空仓减半',
      },
      {
        name: '修正RSRS 1.3/0.85',
        fn: (s) => (s === 1 ? 1.3 : 0.85),
        sig: sigRev,
        note: '原作最优版本',
      },
      {
        name: '区间位置（现用规则）',
        fn: null,
        note: '三年价格区间位置',
      },
    ];

    for (const r of rules) {
      let res;
      if (r.fn === null) {
        // 近三年区间位置分档
        const lookback = 750;
        res = backtestDCA(daily, sigZ, fromIdx, (s, i) => {
          let lo = Infinity; let hi = -Infinity;
          for (let k = Math.max(0, i - lookback); k < i; k++) {
            if (daily[k].close < lo) lo = daily[k].close;
            if (daily[k].close > hi) hi = daily[k].close;
          }
          const pos = hi > lo ? ((daily[i - 1].close - lo) / (hi - lo)) * 100 : 50;
          if (pos <= 30) return 1.3;
          if (pos >= 70) return 0.85;
          return 1.0;
        });
      } else {
        const useSig = r.sig || sigZ;
        res = backtestDCA(daily, useSig, fromIdx, r.fn);
      }
      console.log(`  ${t.name.padEnd(10)} ${r.name.padEnd(30)}${pct(res.xirr).padStart(8)}`
        + `${pct(res.mdd).padStart(11)}    ${r.note}`);
    }
    console.log('');
  }

  // ---------------------------------------------------------------- 3
  console.log(H);
  console.log('【3】参数敏感性：N × M × S 全扫描（沪深300，修正标准分）');
  console.log(H);
  const hs = data.rsrs_hs300;
  if (hs) {
    const brList = {};
    const nList = [8, 13, 18, 24, 30];
    const mList = [250, 400, 600, 900];
    const sList = [0.5, 0.7, 0.9, 1.1];
    console.log('  N    M     S=0.5          S=0.7          S=0.9          S=1.1');
    for (const n of nList) {
      for (const m of mList) {
        if (!brList[n]) brList[n] = computeBetaAndR2(hs, n);
        const betas = brList[n].map((x) => (x ? x.beta : null));
        const r2s = brList[n].map((x) => (x ? x.r2 : null));
        const z = rollingZscore(betas, m);
        const zr = z.map((v, i) => (v === null || r2s[i] === null ? null : v * r2s[i]));
        const fromIdx = Math.max(n, m) + 1;
        if (fromIdx >= hs.length - 500) continue;
        const cells = [];
        for (const s of sList) {
          const sig = makeSignal(zr, s, -s);
          const r = backtestTiming(hs, sig, fromIdx);
          cells.push(pct(r.cagr).padStart(14));
        }
        console.log(`  ${String(n).padEnd(4)} ${String(m).padEnd(5)}${cells.join('')}`);
      }
    }
    console.log('');
    console.log('  基准（买入持有）年化：' + pct(backtestTiming(hs, hs.map(() => 1), Math.max(N, M) + 1).cagr));
  }

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(join(DATA_DIR, 'rsrs-result.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), params: { N, M, S }, rows: summaryRows }, null, 2),
    'utf8');

  console.log('');
  console.log(H);
  console.log('回测完成。');
  console.log(H);
}

main().catch((e) => {
  console.error('回测失败:', e);
  process.exit(1);
});
