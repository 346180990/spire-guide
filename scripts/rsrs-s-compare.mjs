// S=0.7 vs S=0.8 全面对比（标准分 / 钝化·右偏 两个版本都测）
import { readFileSync, writeFileSync } from 'node:fs';

const N = 16;
const M = 300;
const MA_WIN = 20;
const COST = 0.001;
const FROM = '2006-04-05';

const hs = JSON.parse(readFileSync('scripts/data/rsrs_hs300.json', 'utf8')).daily;

/* ---------- 指标 ---------- */
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

function run(sig, fromDate, cost) {
  let from = hs.findIndex((d) => d.date >= fromDate);
  if (from < 0) return null;
  const nav = [1];
  const dates = [hs[from].date];
  let peak = 1; let mdd = 0; let hold = 0; let n = 0; let sw = 0;
  let prev = sig[from] || 0;
  const rets = [];
  for (let i = from + 1; i < hs.length; i++) {
    const r = hs[i].close / hs[i - 1].close - 1;
    const pos = sig[i - 1];
    let pr = r * pos;
    if (pos !== prev) { pr -= cost; sw++; }
    rets.push(pr);
    const nv = nav[nav.length - 1] * (1 + pr);
    nav.push(nv); dates.push(hs[i].date);
    if (pos === 1) hold++;
    prev = pos; n++;
    if (nv > peak) peak = nv;
    mdd = Math.min(mdd, nv / peak - 1);
  }
  let mean = 0;
  for (const r of rets) mean += r;
  mean /= n;
  let sq = 0;
  for (const r of rets) sq += (r - mean) * (r - mean);
  const sd = Math.sqrt(sq / (n - 1));
  return {
    nav, dates,
    cagr: Math.pow(nav[nav.length - 1], 250 / n) - 1,
    total: nav[nav.length - 1] - 1,
    mdd,
    sharpe: sd > 0 ? (mean / sd) * Math.sqrt(250) : 0,
    holdRatio: hold / n,
    switches: sw,
    years: n / 250,
  };
}

function yearly(nav, dates) {
  const out = [];
  let startNav = nav[0]; let lastNav = nav[0]; let lastYear = dates[0].slice(0, 4);
  for (let i = 1; i < nav.length; i++) {
    const y = dates[i].slice(0, 4);
    if (y !== lastYear) { out.push({ year: lastYear, ret: lastNav / startNav - 1 }); startNav = lastNav; lastYear = y; }
    lastNav = nav[i];
  }
  out.push({ year: lastYear, ret: lastNav / startNav - 1 });
  return out;
}

/* ---------- 计算 ---------- */
const br = computeBetaR2(hs, N);
const betas = br.map((x) => (x ? x.beta : null));
const r2s = br.map((x) => (x ? x.r2 : null));
const z = rollingZ(betas, M);
const zr = z.map((v, i) => (v === null || r2s[i] === null ? null : v * r2s[i]));
const zp = zr.map((v, i) => (v === null || betas[i] === null ? null : v * betas[i]));
const closes = hs.map((d) => d.close);

function build(S) {
  const sigZ = makeSignal(z, S, -S);
  const sigPos = makeSignal(zp, S, -S);
  return {
    z: sigZ,
    posMA: smoothSignal(sigPos, closes, MA_WIN),
    zMA: smoothSignal(sigZ, closes, MA_WIN),
  };
}
const s07 = build(0.7);
const s08 = build(0.8);

const sets = [
  { key: 'buy', name: '买入持有', sig: hs.map(() => 1), cost: 0, color: '#8896B3' },
  { key: 'z07', name: '标准分 S=0.7', sig: s07.z, cost: COST, color: '#4C8DFF' },
  { key: 'z08', name: '标准分 S=0.8', sig: s08.z, cost: COST, color: '#6FA8FF' },
  { key: 'p07', name: '钝化·右偏 S=0.7', sig: s07.posMA, cost: COST, color: '#FF6B6B' },
  { key: 'p08', name: '钝化·右偏 S=0.8', sig: s08.posMA, cost: COST, color: '#F5B63F' },
];
for (const st of sets) {
  Object.assign(st, run(st.sig, FROM, st.cost));
  st.yearly = yearly(st.nav, st.dates);
}

const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';

console.log('=== 全周期对比（' + sets[0].dates[0] + ' → ' + sets[0].dates[sets[0].dates.length - 1] + '，含 0.1% 换仓成本）===');
console.log('  策略                   年化     累计     回撤    Sharpe  持仓占比  换仓次数  成本拖累');
console.log('  ' + '─'.repeat(96));
for (const st of sets) {
  const noCost = run(st.sig, FROM, 0);
  const drag = noCost.cagr - st.cagr;
  console.log(`  ${st.name.padEnd(20)}${pct(st.cagr).padStart(7)}${pct(st.total).padStart(9)}`
    + `${pct(st.mdd).padStart(9)}${st.sharpe.toFixed(2).padStart(8)}`
    + `${pct(st.holdRatio).padStart(9)}${String(st.switches).padStart(9)}${pct(drag).padStart(9)}`);
}

console.log('\n=== 年度收益对比 ===');
const yrs = sets[0].yearly.map((x) => x.year);
console.log('  年份   买入持有  标分0.7  标分0.8   钝化0.7  钝化0.8   S更好');
console.log('  ' + '─'.repeat(70));
let win07 = 0; let win08 = 0;
for (let i = 0; i < yrs.length; i++) {
  const b = sets[0].yearly[i].ret;
  const z7 = sets[1].yearly[i].ret;
  const z8 = sets[2].yearly[i].ret;
  const p7 = sets[3].yearly[i].ret;
  const p8 = sets[4].yearly[i].ret;
  const better = p7 >= p8 ? '0.7' : '0.8';
  if (p7 > p8) win07++; else if (p8 > p7) win08++;
  console.log(`  ${yrs[i]}${(b * 100).toFixed(1).padStart(9)}%${(z7 * 100).toFixed(1).padStart(8)}%`
    + `${(z8 * 100).toFixed(1).padStart(8)}%${(p7 * 100).toFixed(1).padStart(9)}%${(p8 * 100).toFixed(1).padStart(8)}%`
    + `   ${better}`);
}
console.log(`\n  钝化·右偏：S=0.7 赢 ${win07} 年，S=0.8 赢 ${win08} 年`);

console.log('\n=== 起点敏感性（钝化·右偏，含成本）===');
console.log('  起点         买入持有   S=0.7    S=0.8    谁更好');
console.log('  ' + '─'.repeat(58));
const starts = ['2006-04-05', '2008-01-01', '2010-01-01', '2012-01-01', '2014-01-01', '2016-01-01', '2018-01-01', '2020-01-01', '2022-01-01'];
const rows = [];
for (const s of starts) {
  const b = run(hs.map(() => 1), s, 0);
  const a = run(s07.posMA, s, COST);
  const c = run(s08.posMA, s, COST);
  if (!b || !a || !c) continue;
  rows.push({ start: s, buy: b.cagr, s07: a.cagr, s08: c.cagr });
  console.log(`  ${s}${pct(b.cagr).padStart(10)}${pct(a.cagr).padStart(9)}${pct(c.cagr).padStart(9)}`
    + `   ${a.cagr >= c.cagr ? '0.7' : '0.8'}`);
}
const w7 = rows.filter((r) => r.s07 >= r.s08).length;
console.log(`\n  S=0.7 在 ${w7}/${rows.length} 个起点上更好`);

const avg07 = rows.reduce((s, r) => s + r.s07, 0) / rows.length;
const avg08 = rows.reduce((s, r) => s + r.s08, 0) / rows.length;
console.log(`  各起点平均年化：S=0.7 ${pct(avg07)}　S=0.8 ${pct(avg08)}`);

/* ---------- 出图 ---------- */
const html = renderHtml(sets, yrs);
writeFileSync('rsrs-s07-vs-s08.html', html, 'utf8');
console.log('\n已生成图表：rsrs-s07-vs-s08.html');

function renderHtml(strats, yearsList) {
  const W = 1180;
  const HGT = 380;
  const P = { l: 58, r: 16, t: 16, b: 48 };
  const iw = W - P.l - P.r;

  // 图A：年度收益分组柱（只画 4 个策略，省空间）
  const grp = strats.filter((s) => s.key !== 'buy');
  const allV = [];
  for (const s of grp) for (const y of s.yearly) allV.push(y.ret);
  const yMax = Math.max(...allV, 0.1);
  const yMin = Math.min(...allV, -0.1);
  const ih = HGT - P.t - P.b;
  const zeroY = P.t + ih * (yMax / (yMax - yMin));
  const yOf = (v) => P.t + ih * ((yMax - v) / (yMax - yMin));
  const gw = iw / yearsList.length;
  const bw = Math.min(11, (gw - 6) / grp.length);
  let bars = '';
  let xl = '';
  yearsList.forEach((yr, i) => {
    const gx = P.l + i * gw + gw / 2;
    grp.forEach((s, k) => {
      const v = s.yearly[i] ? s.yearly[i].ret : 0;
      const x = gx - (grp.length * bw) / 2 + k * bw;
      const y0 = yOf(v);
      bars += `<rect x="${x.toFixed(1)}" y="${Math.min(y0, zeroY).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(Math.abs(y0 - zeroY), 0.5).toFixed(1)}" fill="${s.color}" opacity="0.9"/>`;
    });
    xl += `<text x="${gx.toFixed(1)}" y="${HGT - P.b + 16}" fill="#5C6884" font-size="10" text-anchor="middle" transform="rotate(-45 ${gx.toFixed(1)} ${HGT - P.b + 16})">${yr}</text>`;
  });
  let gridA = '';
  const stepA = (yMax - yMin) > 2 ? 0.5 : 0.25;
  for (let v = Math.ceil(yMin / stepA) * stepA; v <= yMax + 1e-9; v += stepA) {
    const y = yOf(v);
    gridA += `<line x1="${P.l}" y1="${y.toFixed(1)}" x2="${P.l + iw}" y2="${y.toFixed(1)}" stroke="${Math.abs(v) < 1e-9 ? '#3A455F' : '#1F2C47'}" stroke-width="${Math.abs(v) < 1e-9 ? 1.4 : 1}"/>`;
    gridA += `<text x="${P.l - 8}" y="${(y + 4).toFixed(1)}" fill="#5C6884" font-size="11" text-anchor="end">${(v * 100).toFixed(0)}%</text>`;
  }
  const legendA = grp.map((s) => `<span class="lg"><span class="dot" style="background:${s.color}"></span>${s.name}</span>`).join('');

  // 图B：累计净值
  const H2 = 360;
  const ih2 = H2 - P.t - P.b;
  let maxNav = 0;
  for (const s of strats) for (const v of s.nav) if (v > maxNav) maxNav = v;
  maxNav = Math.ceil(maxNav * 1.06);
  const yOf2 = (v) => P.t + ih2 - (v / maxNav) * ih2;
  const n0 = strats[0].nav.length;
  const stepIdx = Math.max(1, Math.ceil(n0 / 900));
  const pathOf = (nav) => {
    let d = '';
    for (let i = 0; i < nav.length; i += stepIdx) {
      d += (d ? 'L' : 'M') + (P.l + (i / (nav.length - 1)) * iw).toFixed(1) + ' ' + yOf2(nav[i]).toFixed(1) + ' ';
    }
    d += 'L' + (P.l + iw).toFixed(1) + ' ' + yOf2(nav[nav.length - 1]).toFixed(1);
    return d;
  };
  let gridB = '';
  const stepB = maxNav > 15 ? 5 : (maxNav > 6 ? 2 : 1);
  for (let v = 0; v <= maxNav; v += stepB) {
    const y = yOf2(v);
    gridB += `<line x1="${P.l}" y1="${y.toFixed(1)}" x2="${P.l + iw}" y2="${y.toFixed(1)}" stroke="#1F2C47"/>`;
    gridB += `<text x="${P.l - 8}" y="${(y + 4).toFixed(1)}" fill="#5C6884" font-size="11" text-anchor="end">${v}</text>`;
  }
  let xgB = '';
  let ly = '';
  for (let i = 0; i < n0; i++) {
    const y = strats[0].dates[i].slice(0, 4);
    if (y !== ly) {
      ly = y;
      const x = P.l + (i / (n0 - 1)) * iw;
      xgB += `<line x1="${x.toFixed(1)}" y1="${P.t}" x2="${x.toFixed(1)}" y2="${P.t + ih2}" stroke="#141F35"/>`;
      xgB += `<text x="${x.toFixed(1)}" y="${H2 - 12}" fill="#5C6884" font-size="11" text-anchor="middle">${y}</text>`;
    }
  }
  const paths = strats.map((s) => `<path d="${pathOf(s.nav)}" fill="none" stroke="${s.color}" stroke-width="${s.key === 'buy' ? 1.3 : 2}" stroke-dasharray="${s.key === 'buy' ? '5 4' : ''}" opacity="0.95"/>`).join('');
  const legendB = strats.map((s) => `<span class="lg"><span class="dot" style="background:${s.color}"></span>${s.name}<b>${pct(s.cagr)}</b><i>${pct(s.mdd)}</i></span>`).join('');

  // 表格
  const trow = strats.map((s) => `<tr><td><span class="dot" style="background:${s.color}"></span>${s.name}</td>
    <td class="n">${pct(s.cagr)}</td><td class="n">${pct(s.total)}</td>
    <td class="n down">${pct(s.mdd)}</td><td class="n">${s.sharpe.toFixed(2)}</td>
    <td class="n">${pct(s.holdRatio)}</td><td class="n">${s.switches}</td></tr>`).join('');

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>S=0.7 vs S=0.8 对比</title>
<style>
  :root{--bg:#0a0f1c;--card:#111a2c;--bd:#1f2c47;--fg:#e9eef9;--dim:#8896b3;--up:#3ddc97;--down:#ff6b6b}
  *{box-sizing:border-box}
  body{margin:0;padding:22px;background:var(--bg);color:var(--fg);font:14px/1.6 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif}
  h1{font-size:20px;margin:0 0 4px} h2{font-size:15px;margin:0 0 12px;font-weight:500}
  .meta{color:var(--dim);font-size:12px;margin-bottom:16px}
  .card{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:16px;margin-bottom:16px;overflow:hidden}
  svg{width:100%;height:auto;display:block}
  .legend{display:flex;flex-wrap:wrap;gap:6px 20px;margin-top:10px;font-size:12px}
  .lg{display:flex;align-items:center;gap:7px}
  .lg b{color:var(--up);font-weight:600;font-variant-numeric:tabular-nums}
  .lg i{color:var(--down);font-style:normal;font-variant-numeric:tabular-nums}
  .dot{display:inline-block;width:9px;height:9px;border-radius:2px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{padding:8px 10px;text-align:left;border-bottom:1px solid var(--bd)}
  th{color:var(--dim);font-weight:500;font-size:12px}
  tr:last-child td{border-bottom:none}
  .n{text-align:right;font-variant-numeric:tabular-nums}
  .down{color:var(--down)}
  .foot{margin-top:16px;padding:13px 15px;background:var(--card);border:1px solid var(--bd);border-radius:10px;font-size:12px;color:var(--dim);line-height:1.8}
  .foot b{color:var(--fg)}
</style></head><body>
<h1>S = 0.7 vs S = 0.8</h1>
<p class="meta">沪深300　${strats[0].dates[0]} → ${strats[0].dates[strats[0].dates.length - 1]}　N=${N} M=${M}　MA${MA_WIN} 钝化　含 0.1% 换仓成本</p>

<div class="card">
  <h2>A · 年度收益率对比</h2>
  <svg viewBox="0 0 ${W} ${HGT}">${gridA}${bars}${xl}</svg>
  <div class="legend">${legendA}</div>
</div>

<div class="card">
  <h2>B · 累计净值曲线</h2>
  <svg viewBox="0 0 ${W} ${H2}">${gridB}${xgB}${paths}</svg>
  <div class="legend">${legendB}</div>
</div>

<div class="card">
  <h2>C · 全周期指标</h2>
  <table>
    <thead><tr><th>策略</th><th>年化</th><th>累计</th><th>最大回撤</th><th>Sharpe</th><th>持仓占比</th><th>换仓次数</th></tr></thead>
    <tbody>${trow}</tbody>
  </table>
</div>

<div class="foot">
<b>S 的含义</b>：z 的标准分阈值。z 本身均值≈0、标准差≈1，"均值±1σ"对应 S=1.0。0.7 和 0.8 都是经验值，无理论推导。<br>
<b>钝化</b>：信号为 1 且 MA${MA_WIN} 上倾（T−1 高于 T−3）才持仓。<br>
<b>成本</b>：0.1% 单次换仓（佣金+滑点），已计入。<br>
<b>不构成投资建议。</b>
</div>
</body></html>`;
}
