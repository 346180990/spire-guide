// ============================================================================
// RSRS 四版本对比回测（2006-2026）+ 净值曲线图
//
// 严格照 hugo2046/QuantsPlaybook 的 RSRS notebook：
//  · 基础斜率 β：high = α + β·low 的 OLS 斜率
//  · 标准分      RSRS_Z      = (β − M日均值) / M日标准差
//  · 修正标准分  RSRS_Revise = R² × RSRS_Z
//  · 右偏标准分  RSRS_Positive = RSRS_Revise × β
//  · 钝化        RRS_MA = 上面的信号 ∩ (MA20[t−1] > MA20[t−3])
//  · 信号规则    v > 0.7 开仓；v < −0.7 平仓；中间维持
//
// 参数用 N=16, M=300（原作跑三策略对比时的参数），预热仅需 300 日，
// 因此沪深300（2005-01 起）可从 2006 年中开始，满足 2006-2026 区间。
//
// 运行: node scripts/backtest-rsrs-compare.mjs
// 产物: rsrs-report.html（净值曲线对比图）
// ============================================================================

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const N = 16;
const M = 300;
const S = 0.7;
const MA_WIN = 20;

const CACHE = 'scripts/data/rsrs_hs300.json';
const SH_CACHE = 'scripts/data/rsrs_szzz.json';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

async function fetchDaily(secid, cachePath, label) {
  if (existsSync(cachePath)) {
    const j = JSON.parse(readFileSync(cachePath, 'utf8'));
    if (j.daily && j.daily.length > 1000) {
      console.log('  ' + label.padEnd(10) + j.daily.length + ' 根（缓存）  ' + j.daily[0].date + ' → ' + j.daily[j.daily.length - 1].date);
      return j.daily;
    }
  }
  console.log('  拉取 ' + label + ' ...');
  const url = 'https://push2his.eastmoney.com/api/qt/stock/kline/get'
    + '?secid=' + secid + '&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55'
    + '&klt=101&fqt=0&beg=20000101&end=20500101';
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 25000);
  const r = await fetch(url, { signal: c.signal, headers: { 'User-Agent': UA } });
  clearTimeout(t);
  const j = await r.json();
  const k = j && j.data && j.data.klines;
  const daily = [];
  if (Array.isArray(k)) {
    for (const s of k) {
      const p = String(s).split(',');
      const d = { date: p[0], open: +p[1], close: +p[2], high: +p[3], low: +p[4] };
      if ([d.open, d.close, d.high, d.low].every((x) => Number.isFinite(x) && x > 0)
        && d.high >= Math.max(d.open, d.close) - 1e-9
        && d.low <= Math.min(d.open, d.close) + 1e-9) {
        daily.push(d);
      }
    }
  }
  writeFileSync(cachePath, JSON.stringify({ fetchedAt: new Date().toISOString(), daily }), 'utf8');
  console.log('  ' + label.padEnd(10) + daily.length + ' 根  ' + (daily[0] ? daily[0].date : '-') + ' → ' + (daily.length ? daily[daily.length - 1].date : '-'));
  return daily;
}

/* ---------------- 指标计算 ---------------- */

function computeBetaR2(daily, n) {
  const out = [];
  for (let i = 0; i < daily.length; i++) {
    if (i + 1 < n) { out.push(null); continue; }
    const st = i - n + 1;
    let sx = 0; let sy = 0; let sxx = 0; let syy = 0; let sxy = 0;
    for (let k = st; k <= i; k++) {
      const x = daily[k].low; const y = daily[k].high;
      sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
    }
    const num = n * sxy - sx * sy;
    const dx = n * sxx - sx * sx;
    const dy = n * syy - sy * sy;
    if (dx <= 1e-12 || dy <= 1e-12) { out.push(null); continue; }
    out.push({ beta: num / dx, r2: (num * num) / (dx * dy) });
  }
  return out;
}

function rollingZ(values, m) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    if (i + 1 < m) { out.push(null); continue; }
    const st = i - m + 1;
    let sum = 0; let cnt = 0;
    for (let k = st; k <= i; k++) {
      const v = values[k];
      if (v === null || !Number.isFinite(v)) continue;
      sum += v; cnt++;
    }
    if (cnt < m * 0.8) { out.push(null); continue; }
    const mean = sum / cnt;
    let sq = 0;
    for (let k = st; k <= i; k++) {
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

/** 原作 get_singal：> upper 开仓，< lower 平仓，中间维持 */
function makeSignal(values, upper, lower) {
  const sig = [];
  let hold = 0;
  for (const v of values) {
    if (v === null || !Number.isFinite(v)) { sig.push(hold); continue; }
    if (v > upper) hold = 1;
    else if (v < lower) hold = 0;
    sig.push(hold);
  }
  return sig;
}

function rollingMean(arr, w) {
  const out = [];
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
    if (i >= w) sum -= arr[i - w];
    out.push(i + 1 >= w ? sum / w : null);
  }
  return out;
}

/** 钝化：信号为 1 且 MA20 上倾（t−1 > t−3）才持仓 */
function smoothSignal(sig, closes, w) {
  const ma = rollingMean(closes, w);
  return sig.map((s, i) => {
    if (i < 3 || ma[i - 1] === null || ma[i - 3] === null) return 0;
    return (s === 1 && ma[i - 1] > ma[i - 3]) ? 1 : 0;
  });
}

/* ---------------- 回测 ---------------- */

function backtest(daily, sig, fromIdx) {
  const nav = [1];
  const dates = [daily[fromIdx].date];
  let hold = 0;
  let trades = 0;
  let prev = sig[fromIdx] || 0;
  let peak = 1;
  let mdd = 0;
  const rets = [];

  for (let i = fromIdx + 1; i < daily.length; i++) {
    const r = daily[i].close / daily[i - 1].close - 1;
    const pos = sig[i - 1];           // 用昨日信号持仓，避免未来函数
    const pr = r * pos;
    rets.push(pr);
    const nv = nav[nav.length - 1] * (1 + pr);
    nav.push(nv);
    dates.push(daily[i].date);
    if (pos === 1) hold++;
    if (pos === 1 && prev === 0) trades++;
    prev = pos;
    if (nv > peak) peak = nv;
    mdd = Math.min(mdd, nv / peak - 1);
  }

  const n = rets.length;
  let mean = 0;
  for (const r of rets) mean += r;
  mean /= n;
  let sq = 0;
  for (const r of rets) sq += (r - mean) * (r - mean);
  const sd = Math.sqrt(sq / (n - 1));
  return {
    dates,
    nav,
    cagr: Math.pow(nav[nav.length - 1], 250 / n) - 1,
    total: nav[nav.length - 1] - 1,
    mdd,
    sharpe: sd > 0 ? (mean / sd) * Math.sqrt(250) : 0,
    holdRatio: hold / n,
    trades,
    days: n,
  };
}

function pct(x, d = 1) {
  return Number.isFinite(x) ? (x * 100).toFixed(d) + '%' : '—';
}

/* ---------------- 主流程 ---------------- */

async function main() {
  console.log('\n=== 加载数据 ===');
  const hs = await fetchDaily('1.000300', CACHE, '沪深300');

  console.log('\n=== 计算指标（N=' + N + ', M=' + M + '）===');
  const br = computeBetaR2(hs, N);
  const betas = br.map((x) => (x ? x.beta : null));
  const r2s = br.map((x) => (x ? x.r2 : null));
  const z = rollingZ(betas, M);
  const zRevise = z.map((v, i) => (v === null || r2s[i] === null ? null : v * r2s[i]));
  const zPositive = zRevise.map((v, i) => (v === null || betas[i] === null ? null : v * betas[i]));

  const sigZ = makeSignal(z, S, -S);
  const sigRev = makeSignal(zRevise, S, -S);
  const sigPos = makeSignal(zPositive, S, -S);
  const closes = hs.map((d) => d.close);
  const sigZMA = smoothSignal(sigZ, closes, MA_WIN);
  const sigRevMA = smoothSignal(sigRev, closes, MA_WIN);
  const sigPosMA = smoothSignal(sigPos, closes, MA_WIN);

  // 预热：取 M+1，使起点尽量早（约 2006 年中）
  let fromIdx = 0;
  for (let i = 0; i < hs.length; i++) {
    if (zPositive[i] !== null) { fromIdx = i + 1; break; }
  }
  // 若首个有效值早于 2006-01，就按 2006-01 起
  const idx2006 = hs.findIndex((d) => d.date >= '2006-01-01');
  if (idx2006 > fromIdx) fromIdx = idx2006;

  console.log('回测区间：' + hs[fromIdx].date + ' → ' + hs[hs.length - 1].date
    + '（' + ((hs.length - fromIdx) / 250).toFixed(1) + ' 年）');

  const bench = hs.map(() => 1);
  const runs = [
    { key: 'bench', name: '沪深300 买入持有', sig: bench, color: '#8896B3' },
    { key: 'z', name: '标准分策略', sig: sigZ, color: '#4C8DFF' },
    { key: 'rev', name: '修正标准分策略', sig: sigRev, color: '#3DDC97' },
    { key: 'pos', name: '右偏标准分策略', sig: sigPos, color: '#F5B63F' },
    { key: 'zma', name: '钝化·标准分', sig: sigZMA, color: '#A78BFA' },
    { key: 'revma', name: '钝化·修正标准分', sig: sigRevMA, color: '#E879F9' },
    { key: 'posma', name: '钝化·右偏标准分', sig: sigPosMA, color: '#FF6B6B' },
  ];

  const results = [];
  for (const r of runs) {
    results.push({ ...r, ...backtest(hs, r.sig, fromIdx) });
  }

  console.log('\n' + '─'.repeat(104));
  console.log('RSRS 各版本对比（' + hs[fromIdx].date + ' → ' + hs[hs.length - 1].date + '）');
  console.log('─'.repeat(104));
  console.log('  策略                     年化      累计收益   最大回撤   Sharpe  持仓占比  交易次数');
  for (const r of results) {
    console.log(`  ${r.name.padEnd(22)}${pct(r.cagr).padStart(8)}${pct(r.total).padStart(12)}`
      + `${pct(r.mdd).padStart(11)}${r.sharpe.toFixed(2).padStart(9)}`
      + `${pct(r.holdRatio).padStart(10)}${String(r.trades).padStart(10)}`);
  }
  console.log('─'.repeat(104));

  // 相对基准
  const b = results[0];
  console.log('\n  相对买入持有的超额年化：');
  for (const r of results.slice(1)) {
    const d = r.cagr - b.cagr;
    console.log(`    ${r.name.padEnd(22)}${(d >= 0 ? '+' : '') + (d * 100).toFixed(1)}pt`
      + `   回撤变化 ${((r.mdd - b.mdd) * 100).toFixed(1)}pt`);
  }

  /* ---------------- 生成 HTML 图 ---------------- */
  const html = renderHtml(results, hs[fromIdx].date + ' ~ ' + hs[hs.length - 1].date, N, M, S);
  writeFileSync('rsrs-report.html', html, 'utf8');
  console.log('\n已生成图表：rsrs-report.html');
}

function renderHtml(results, range, n, m, s) {
  const W = 1100;
  const H = 460;
  const PAD = { l: 62, r: 18, t: 18, b: 34 };
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;

  // 以基准的日期轴为准，降采样
  const dates = results[0].dates;
  const step = Math.max(1, Math.ceil(dates.length / 900));
  const total = dates.length;

  let maxV = 0;
  for (const r of results) for (let i = 0; i < r.nav.length; i++) if (r.nav[i] > maxV) maxV = r.nav[i];
  maxV = Math.ceil(maxV * 1.08);

  const xOf = (i) => PAD.l + (i / (total - 1)) * iw;
  const yOf = (v) => PAD.t + ih - (v / maxV) * ih;

  function path(nav) {
    let d = '';
    for (let i = 0; i < nav.length; i += step) {
      d += (d ? 'L' : 'M') + xOf(i).toFixed(1) + ' ' + yOf(nav[i]).toFixed(1) + ' ';
    }
    const last = nav.length - 1;
    d += 'L' + xOf(last).toFixed(1) + ' ' + yOf(nav[last]).toFixed(1);
    return d;
  }

  // 网格与刻度
  const yTicks = [];
  const yStep = maxV > 12 ? 2 : (maxV > 6 ? 1 : 0.5);
  for (let v = 0; v <= maxV; v += yStep) yTicks.push(v);
  let grid = '';
  for (const v of yTicks) {
    const y = yOf(v);
    grid += `<line x1="${PAD.l}" y1="${y.toFixed(1)}" x2="${PAD.l + iw}" y2="${y.toFixed(1)}" stroke="#1F2C47" stroke-width="1"/>`;
    grid += `<text x="${PAD.l - 8}" y="${(y + 4).toFixed(1)}" fill="#5C6884" font-size="11" text-anchor="end">${v.toFixed(1)}</text>`;
  }
  let xGrid = '';
  let lastYear = '';
  for (let i = 0; i < total; i++) {
    const y = dates[i].slice(0, 4);
    if (y !== lastYear) {
      lastYear = y;
      const x = xOf(i);
      xGrid += `<line x1="${x.toFixed(1)}" y1="${PAD.t}" x2="${x.toFixed(1)}" y2="${PAD.t + ih}" stroke="#141F35" stroke-width="1"/>`;
      xGrid += `<text x="${x.toFixed(1)}" y="${(H - 12)}" fill="#5C6884" font-size="11" text-anchor="middle">${y}</text>`;
    }
  }

  const legend = results.map((r, i) => `
    <div class="lg">
      <span class="dot" style="background:${r.color}"></span>
      <span class="lname">${r.name}</span>
      <span class="lval">${pct(r.cagr)}</span>
      <span class="lmdd">${pct(r.mdd)}</span>
    </div>`).join('');

  const rows = results.map((r) => `
    <tr>
      <td><span class="dot" style="background:${r.color}"></span>${r.name}</td>
      <td class="n">${pct(r.cagr)}</td>
      <td class="n">${pct(r.total)}</td>
      <td class="n down">${pct(r.mdd)}</td>
      <td class="n">${r.sharpe.toFixed(2)}</td>
      <td class="n">${pct(r.holdRatio)}</td>
      <td class="n">${r.trades}</td>
    </tr>`).join('');

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>RSRS 四版本对比回测</title>
<style>
  :root{--bg:#0a0f1c;--card:#111a2c;--bd:#1f2c47;--fg:#e9eef9;--dim:#8896b3;--up:#3ddc97;--down:#ff6b6b}
  *{box-sizing:border-box}
  body{margin:0;padding:24px;background:var(--bg);color:var(--fg);font:14px/1.7 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif}
  h1{font-size:21px;margin:0 0 4px}
  .meta{color:var(--dim);font-size:12px;margin-bottom:18px}
  .card{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:16px;margin-bottom:18px}
  svg{width:100%;height:auto;display:block}
  .legend{display:flex;flex-wrap:wrap;gap:8px 22px;margin-top:12px}
  .lg{display:flex;align-items:center;gap:8px;font-size:12px;min-width:250px}
  .lname{color:var(--fg);flex:1}
  .lval{color:var(--up);font-variant-numeric:tabular-nums;font-weight:600}
  .lmdd{color:var(--down);font-variant-numeric:tabular-nums}
  .dot{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:2px}
  table{width:100%;border-collapse:collapse;margin-top:6px;font-size:13px}
  th,td{padding:9px 12px;text-align:left;border-bottom:1px solid var(--bd)}
  th{color:var(--dim);font-weight:500;font-size:12px;white-space:nowrap}
  tr:last-child td{border-bottom:none}
  .n{text-align:right;font-variant-numeric:tabular-nums}
  .up{color:var(--up)} .down{color:var(--down)}
  .foot{margin-top:18px;padding:14px 16px;background:var(--card);border:1px solid var(--bd);border-radius:10px;font-size:12px;color:var(--dim);line-height:1.8}
  .foot b{color:var(--fg)}
</style></head><body>
<h1>RSRS 四版本对比回测</h1>
<p class="meta">沪深300（000300）　区间 ${range}　参数 N=${n} M=${m} S=${s}　钝化用 MA${MA_WIN} 上倾过滤</p>

<div class="card">
  <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    ${grid}${xGrid}
    ${results.map((r) => `<path d="${path(r.nav)}" fill="none" stroke="${r.color}" stroke-width="${r.key === 'bench' ? 1.4 : 2}" stroke-dasharray="${r.key === 'bench' ? '5 4' : ''}" opacity="${r.key === 'bench' ? 0.8 : 0.95}"/>`).join('')}
  </svg>
  <div class="legend">${legend}</div>
</div>

<div class="card">
  <table>
    <thead><tr><th>策略</th><th>年化</th><th>累计收益</th><th>最大回撤</th><th>Sharpe</th><th>持仓占比</th><th>交易次数</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>

<div class="foot">
<b>口径</b>：全部为「满仓 / 空仓」纯择时（不含定投、不含手续费、不含分红）。<br>
<b>信号</b>：指标 &gt; ${s} 开仓，&lt; −${s} 平仓，中间维持原仓位；用前一日信号持有当日，无未来函数。<br>
<b>钝化</b>：信号为 1 且 MA${MA_WIN} 上倾（T−1 高于 T−3）才持仓。<br>
<b>注意</b>：起点受 ${m} 日预热限制（约 ${range.split(' ~ ')[0]}）。换起点后结论会明显变化——这是这类择时指标最大的问题。<br>
<b>不构成投资建议。</b>
</div>
</body></html>`;
}

main().catch((e) => {
  console.error('失败:', e);
  process.exit(1);
});
