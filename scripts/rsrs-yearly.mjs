// ============================================================================
// RSRS 年度收益可视化
// 生成 rsrs-yearly.html：
//   图A 年度收益率分组柱状图（买入持有 / 右偏标准分 / 钝化·右偏）
//   图B 年度超额收益柱状图（钝化·右偏 − 买入持有）
//   图C 年度收益热力表（全部 7 个策略 × 21 年）
//   图D 累计净值曲线
// 参数：N=16, M=300, S=0.7，MA20 钝化，含 0.1% 单次换仓成本
// ============================================================================

import { readFileSync, writeFileSync } from 'node:fs';

const N = 16;
const M = 300;
const S = 0.7;
const MA_WIN = 20;
const COST = 0.001;
const FROM_DATE = '2006-04-05';

const hs = JSON.parse(readFileSync('scripts/data/rsrs_hs300.json', 'utf8')).daily;

/* ---------------- 指标 ---------------- */

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

function makeSignal(values, up, lo) {
  const sig = []; let hold = 0;
  for (const v of values) {
    if (v === null || !Number.isFinite(v)) { sig.push(hold); continue; }
    if (v > up) hold = 1; else if (v < lo) hold = 0;
    sig.push(hold);
  }
  return sig;
}

function rollingMean(arr, w) {
  const out = []; let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
    if (i >= w) sum -= arr[i - w];
    out.push(i + 1 >= w ? sum / w : null);
  }
  return out;
}

function smoothSignal(sig, closes, w) {
  const ma = rollingMean(closes, w);
  return sig.map((s, i) => {
    if (i < 3 || ma[i - 1] === null || ma[i - 3] === null) return 0;
    return (s === 1 && ma[i - 1] > ma[i - 3]) ? 1 : 0;
  });
}

/* ---------------- 回测（逐日） ---------------- */

function run(sig, cost) {
  let from = hs.findIndex((d) => d.date >= FROM_DATE);
  if (from < 0) from = 0;
  const nav = [1];
  const dates = [hs[from].date];
  let prev = sig[from] || 0;
  for (let i = from + 1; i < hs.length; i++) {
    const r = hs[i].close / hs[i - 1].close - 1;
    const pos = sig[i - 1];
    let pr = r * pos;
    if (pos !== prev) pr -= cost;
    nav.push(nav[nav.length - 1] * (1 + pr));
    dates.push(hs[i].date);
    prev = pos;
  }
  return { nav, dates, start: hs[from].date, end: hs[hs.length - 1].date };
}

/** 按自然年切分，算每年收益 */
function yearlyReturns(nav, dates) {
  const out = [];
  let lastNav = nav[0];
  let lastYear = dates[0].slice(0, 4);
  let startNav = nav[0];
  for (let i = 1; i < nav.length; i++) {
    const y = dates[i].slice(0, 4);
    if (y !== lastYear) {
      out.push({ year: lastYear, ret: lastNav / startNav - 1 });
      startNav = lastNav;
      lastYear = y;
    }
    lastNav = nav[i];
  }
  out.push({ year: lastYear, ret: lastNav / startNav - 1 });
  return out;
}

/* ---------------- 主流程 ---------------- */

const br = computeBetaR2(hs, N);
const betas = br.map((x) => (x ? x.beta : null));
const r2s = br.map((x) => (x ? x.r2 : null));
const z = rollingZ(betas, M);
const zr = z.map((v, i) => (v === null || r2s[i] === null ? null : v * r2s[i]));
const zp = zr.map((v, i) => (v === null || betas[i] === null ? null : v * betas[i]));
const closes = hs.map((d) => d.close);

const sigBuy = hs.map(() => 1);
const sigZ = makeSignal(z, S, -S);
const sigRev = makeSignal(zr, S, -S);
const sigPos = makeSignal(zp, S, -S);
const sigZMA = smoothSignal(sigZ, closes, MA_WIN);
const sigRevMA = smoothSignal(sigRev, closes, MA_WIN);
const sigPosMA = smoothSignal(sigPos, closes, MA_WIN);

const strategies = [
  { name: '沪深300 买入持有', sig: sigBuy, cost: 0, color: '#8896B3' },
  { name: '标准分', sig: sigZ, cost: COST, color: '#4C8DFF' },
  { name: '修正标准分', sig: sigRev, cost: COST, color: '#3DDC97' },
  { name: '右偏标准分', sig: sigPos, cost: COST, color: '#F5B63F' },
  { name: '钝化·标准分', sig: sigZMA, cost: COST, color: '#A78BFA' },
  { name: '钝化·修正', sig: sigRevMA, cost: COST, color: '#E879F9' },
  { name: '钝化·右偏', sig: sigPosMA, cost: COST, color: '#FF6B6B' },
];

for (const st of strategies) {
  const r = run(st.sig, st.cost);
  st.nav = r.nav;
  st.dates = r.dates;
  st.yearly = yearlyReturns(r.nav, r.dates);
  const n = r.nav.length - 1;
  let peak = 1; let mdd = 0;
  for (const v of r.nav) { if (v > peak) peak = v; mdd = Math.min(mdd, v / peak - 1); }
  st.cagr = Math.pow(r.nav[r.nav.length - 1], 250 / n) - 1;
  st.mdd = mdd;
  st.total = r.nav[r.nav.length - 1] - 1;
}

const years = strategies[0].yearly.map((x) => x.year);
console.log('年份：' + years.join(' '));
console.log('');
console.log('年度收益率：');
console.log('  年份    ' + strategies.map((s) => s.name.slice(0, 8).padStart(9)).join(''));
for (let i = 0; i < years.length; i++) {
  const cells = strategies.map((s) => {
    const v = s.yearly[i] ? s.yearly[i].ret : 0;
    return ((v * 100).toFixed(1) + '%').padStart(9);
  });
  console.log(`  ${years[i]}${cells.join('')}`);
}

const html = renderHtml(strategies, years);
writeFileSync('rsrs-yearly.html', html, 'utf8');
console.log('\n已生成：rsrs-yearly.html');

/* ---------------- HTML ---------------- */

function renderHtml(strats, yrs) {
  const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';

  /* ---- 图A：分组柱状图 ---- */
  const groupKeys = ['买入持有', '右偏标准分', '钝化·右偏'];
  const groupSeries = [
    strats[0],
    strats.find((s) => s.name === '右偏标准分'),
    strats.find((s) => s.name === '钝化·右偏'),
  ];
  const allVals = [];
  for (const s of groupSeries) for (const y of s.yearly) allVals.push(y.ret);
  const yMax = Math.max(...allVals, 0.1);
  const yMin = Math.min(...allVals, -0.1);

  const W = 1180;
  const HGT = 400;
  const P = { l: 56, r: 16, t: 16, b: 46 };
  const iw = W - P.l - P.r;
  const ih = HGT - P.t - P.b;
  const zeroY = P.t + ih * (yMax / (yMax - yMin));
  const yOf = (v) => P.t + ih * ((yMax - v) / (yMax - yMin));
  const groupW = iw / yrs.length;
  const barW = Math.min(13, (groupW - 6) / groupSeries.length);

  let bars = '';
  let xLabels = '';
  yrs.forEach((yr, i) => {
    const gx = P.l + i * groupW + groupW / 2;
    groupSeries.forEach((s, k) => {
      const v = s.yearly[i] ? s.yearly[i].ret : 0;
      const x = gx - (groupSeries.length * barW) / 2 + k * barW;
      const y0 = yOf(v);
      const h = Math.abs(y0 - zeroY);
      bars += `<rect x="${x.toFixed(1)}" y="${Math.min(y0, zeroY).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(h, 0.5).toFixed(1)}" fill="${s.color}" opacity="0.9"/>`;
    });
    xLabels += `<text x="${gx.toFixed(1)}" y="${HGT - P.b + 16}" fill="#5C6884" font-size="10.5" text-anchor="middle" transform="rotate(-45 ${gx.toFixed(1)} ${HGT - P.b + 16})">${yr}</text>`;
  });

  // y 轴刻度
  let gridA = '';
  const stepA = (yMax - yMin) > 2 ? 0.5 : 0.25;
  for (let v = Math.ceil(yMin / stepA) * stepA; v <= yMax + 1e-9; v += stepA) {
    const y = yOf(v);
    gridA += `<line x1="${P.l}" y1="${y.toFixed(1)}" x2="${P.l + iw}" y2="${y.toFixed(1)}" stroke="${Math.abs(v) < 1e-9 ? '#3A455F' : '#1F2C47'}" stroke-width="${Math.abs(v) < 1e-9 ? 1.4 : 1}"/>`;
    gridA += `<text x="${P.l - 8}" y="${(y + 4).toFixed(1)}" fill="#5C6884" font-size="11" text-anchor="end">${(v * 100).toFixed(0)}%</text>`;
  }

  const legendA = groupSeries.map((s) => `<span class="lg"><span class="dot" style="background:${s.color}"></span>${s.name}</span>`).join('');

  /* ---- 图B：年度超额 ---- */
  const ex = strats.find((s) => s.name === '钝化·右偏');
  const base = strats[0];
  const excess = yrs.map((y, i) => (ex.yearly[i] ? ex.yearly[i].ret : 0) - (base.yearly[i] ? base.yearly[i].ret : 0));
  const eMax = Math.max(...excess, 0.05);
  const eMin = Math.min(...excess, -0.05);
  const H2 = 260;
  const ih2 = H2 - P.t - P.b;
  const zeroY2 = P.t + ih2 * (eMax / (eMax - eMin));
  const yOf2 = (v) => P.t + ih2 * ((eMax - v) / (eMax - eMin));
  const gw2 = iw / yrs.length;
  const bw2 = Math.min(20, gw2 - 8);
  let barsB = '';
  let labelsB = '';
  yrs.forEach((yr, i) => {
    const gx = P.l + i * gw2 + gw2 / 2;
    const v = excess[i];
    const y0 = yOf2(v);
    const h = Math.abs(y0 - zeroY2);
    barsB += `<rect x="${(gx - bw2 / 2).toFixed(1)}" y="${Math.min(y0, zeroY2).toFixed(1)}" width="${bw2.toFixed(1)}" height="${Math.max(h, 0.5).toFixed(1)}" fill="${v >= 0 ? '#3DDC97' : '#FF6B6B'}" opacity="0.9"/>`;
    labelsB += `<text x="${gx.toFixed(1)}" y="${H2 - P.b + 16}" fill="#5C6884" font-size="10.5" text-anchor="middle" transform="rotate(-45 ${gx.toFixed(1)} ${H2 - P.b + 16})">${yr}</text>`;
  });
  let gridB = '';
  const stepB = (eMax - eMin) > 1 ? 0.25 : 0.1;
  for (let v = Math.ceil(eMin / stepB) * stepB; v <= eMax + 1e-9; v += stepB) {
    const y = yOf2(v);
    gridB += `<line x1="${P.l}" y1="${y.toFixed(1)}" x2="${P.l + iw}" y2="${y.toFixed(1)}" stroke="${Math.abs(v) < 1e-9 ? '#3A455F' : '#1F2C47'}" stroke-width="${Math.abs(v) < 1e-9 ? 1.4 : 1}"/>`;
    gridB += `<text x="${P.l - 8}" y="${(y + 4).toFixed(1)}" fill="#5C6884" font-size="11" text-anchor="end">${(v * 100).toFixed(0)}%</text>`;
  }

  /* ---- 图C：热力表 ---- */
  function cellColor(v) {
    const a = Math.min(Math.abs(v) / 0.4, 1);
    return v >= 0
      ? `rgba(61,220,151,${(0.10 + a * 0.55).toFixed(2)})`
      : `rgba(255,107,107,${(0.10 + a * 0.55).toFixed(2)})`;
  }
  const heatHead = strats.map((s) => `<th class="n">${s.name}</th>`).join('');
  const heatRows = yrs.map((yr, i) => {
    const cells = strats.map((s) => {
      const v = s.yearly[i] ? s.yearly[i].ret : 0;
      return `<td class="n" style="background:${cellColor(v)};color:${v >= 0 ? '#B8F5DC' : '#FFC9C9'}">${(v * 100).toFixed(1)}</td>`;
    }).join('');
    return `<tr><td class="yr">${yr}</td>${cells}</tr>`;
  }).join('');

  /* ---- 图D：累计净值 ---- */
  const H3 = 360;
  const ih3 = H3 - P.t - P.b;
  let maxNav = 0;
  for (const s of strats) for (const v of s.nav) if (v > maxNav) maxNav = v;
  maxNav = Math.ceil(maxNav * 1.06);
  const yOf3 = (v) => P.t + ih3 - (v / maxNav) * ih3;
  const n0 = strats[0].nav.length;
  const stepIdx = Math.max(1, Math.ceil(n0 / 900));
  function pathOf(nav) {
    let d = '';
    for (let i = 0; i < nav.length; i += stepIdx) {
      d += (d ? 'L' : 'M') + (P.l + (i / (nav.length - 1)) * iw).toFixed(1) + ' ' + yOf3(nav[i]).toFixed(1) + ' ';
    }
    const L = nav.length - 1;
    d += 'L' + (P.l + iw).toFixed(1) + ' ' + yOf3(nav[L]).toFixed(1);
    return d;
  }
  let gridC = '';
  const stepC = maxNav > 15 ? 5 : (maxNav > 6 ? 2 : 1);
  for (let v = 0; v <= maxNav; v += stepC) {
    const y = yOf3(v);
    gridC += `<line x1="${P.l}" y1="${y.toFixed(1)}" x2="${P.l + iw}" y2="${y.toFixed(1)}" stroke="#1F2C47" stroke-width="1"/>`;
    gridC += `<text x="${P.l - 8}" y="${(y + 4).toFixed(1)}" fill="#5C6884" font-size="11" text-anchor="end">${v}</text>`;
  }
  let xGridC = '';
  let ly = '';
  for (let i = 0; i < n0; i++) {
    const y = strats[0].dates[i].slice(0, 4);
    if (y !== ly) {
      ly = y;
      const x = P.l + (i / (n0 - 1)) * iw;
      xGridC += `<line x1="${x.toFixed(1)}" y1="${P.t}" x2="${x.toFixed(1)}" y2="${P.t + ih3}" stroke="#141F35"/>`;
      xGridC += `<text x="${x.toFixed(1)}" y="${H3 - 12}" fill="#5C6884" font-size="11" text-anchor="middle">${y}</text>`;
    }
  }
  const pathsC = strats.map((s) => `<path d="${pathOf(s.nav)}" fill="none" stroke="${s.color}" stroke-width="${s.name.includes('买入') ? 1.4 : 2}" stroke-dasharray="${s.name.includes('买入') ? '5 4' : ''}" opacity="0.95"/>`).join('');
  const legendC = strats.map((s) => `<span class="lg"><span class="dot" style="background:${s.color}"></span>${s.name}<b>${pct(s.cagr)}</b><i>${pct(s.mdd)}</i></span>`).join('');

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>RSRS 年度收益图</title>
<style>
  :root{--bg:#0a0f1c;--card:#111a2c;--bd:#1f2c47;--fg:#e9eef9;--dim:#8896b3;--up:#3ddc97;--down:#ff6b6b}
  *{box-sizing:border-box}
  body{margin:0;padding:22px;background:var(--bg);color:var(--fg);font:14px/1.6 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif}
  h1{font-size:20px;margin:0 0 4px}
  h2{font-size:15px;margin:0 0 12px;font-weight:500}
  .meta{color:var(--dim);font-size:12px;margin-bottom:16px}
  .card{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:16px;margin-bottom:16px;overflow:hidden}
  svg{width:100%;height:auto;display:block}
  .legend{display:flex;flex-wrap:wrap;gap:6px 20px;margin-top:10px;font-size:12px}
  .lg{display:flex;align-items:center;gap:7px}
  .lg b{color:var(--up);font-weight:600;font-variant-numeric:tabular-nums}
  .lg i{color:var(--down);font-style:normal;font-variant-numeric:tabular-nums}
  .dot{display:inline-block;width:9px;height:9px;border-radius:2px}
  table{width:100%;border-collapse:collapse;font-size:11.5px}
  th,td{padding:5px 6px;text-align:right;border-bottom:1px solid rgba(31,44,71,.6)}
  th{color:var(--dim);font-weight:500;font-size:11px;white-space:nowrap}
  td.yr{text-align:left;color:var(--dim);font-variant-numeric:tabular-nums}
  .foot{margin-top:16px;padding:13px 15px;background:var(--card);border:1px solid var(--bd);border-radius:10px;font-size:12px;color:var(--dim);line-height:1.8}
  .foot b{color:var(--fg)}
</style></head><body>
<h1>RSRS 年度收益图</h1>
<p class="meta">沪深300（000300）　${strats[0].dates[0]} → ${strats[0].dates[strats[0].dates.length - 1]}　参数 N=${N} M=${M} S=${S}　钝化 MA${MA_WIN}　含 0.1% 单次换仓成本</p>

<div class="card">
  <h2>A · 年度收益率（分组柱状图）</h2>
  <svg viewBox="0 0 ${W} ${HGT}">${gridA}${bars}${xLabels}</svg>
  <div class="legend">${legendA}</div>
</div>

<div class="card">
  <h2>B · 年度超额收益（钝化·右偏 − 买入持有）</h2>
  <svg viewBox="0 0 ${W} ${H2}">${gridB}${barsB}${labelsB}</svg>
  <div class="legend"><span class="lg"><span class="dot" style="background:#3DDC97"></span>跑赢基准</span><span class="lg"><span class="dot" style="background:#FF6B6B"></span>跑输基准</span></div>
</div>

<div class="card">
  <h2>C · 年度收益率热力表（单位 %）</h2>
  <div style="overflow-x:auto">
    <table>
      <thead><tr><th style="text-align:left">年份</th>${heatHead}</tr></thead>
      <tbody>${heatRows}</tbody>
    </table>
  </div>
</div>

<div class="card">
  <h2>D · 累计净值曲线</h2>
  <svg viewBox="0 0 ${W} ${H3}">${gridC}${xGridC}${pathsC}</svg>
  <div class="legend">${legendC}</div>
</div>

<div class="foot">
<b>口径</b>：满仓/空仓纯择时，不含分红（价格指数）。含 0.1% 单次换仓成本。<br>
<b>首年</b>：${strats[0].dates[0].slice(0, 4)} 年是部分年份（从 ${strats[0].dates[0]} 起算），不代表完整年度。<br>
<b>注意</b>：收益端超额随时间衰减（2020 年后基本归零），回撤端改善较稳。不构成投资建议。
</div>
</body></html>`;
}
