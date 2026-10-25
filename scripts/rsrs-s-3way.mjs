// S = 0.70 / 0.75 / 0.80 三方对比
// 重点：0.75 落在两者之间是平滑过渡，还是断崖？这能判断 0.7 的"最优"是真是假
import { readFileSync, writeFileSync } from 'node:fs';

const N = 16;
const M = 300;
const MA_WIN = 20;
const COST = 0.001;
const FROM = '2006-04-05';
const SVALS = [0.70, 0.75, 0.80];

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
const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';

const colors = ['#4C8DFF', '#3DDC97', '#F5B63F'];
const sets = [{ key: 'buy', name: '买入持有', sig: hs.map(() => 1), cost: 0, color: '#8896B3' }];
for (let i = 0; i < SVALS.length; i++) {
  const S = SVALS[i];
  sets.push({
    key: 'z' + S, name: '钝化·右偏 S=' + S.toFixed(2),
    sig: smoothSignal(makeSignal(zp, S, -S), closes, MA_WIN),
    cost: COST, color: colors[i],
  });
  sets.push({
    key: 'p' + S, name: '标准分 S=' + S.toFixed(2),
    sig: makeSignal(z, S, -S),
    cost: COST, color: colors[i], plain: true,
  });
}
for (const st of sets) {
  Object.assign(st, run(st.sig, FROM, st.cost));
  st.yearly = yearly(st.nav, st.dates);
}

/* ---------- 输出 ---------- */
const last = sets[0].dates[sets[0].dates.length - 1];
console.log('=== 全周期（' + sets[0].dates[0] + ' → ' + last + '，含 0.1% 换仓成本）===');
console.log('  策略                     年化     累计      回撤    Sharpe  持仓占比  换仓次数  成本拖累');
console.log('  ' + '─'.repeat(98));
for (const st of sets) {
  const noCost = run(st.sig, FROM, 0);
  const drag = noCost.cagr - st.cagr;
  console.log(`  ${st.name.padEnd(22)}${pct(st.cagr).padStart(7)}${pct(st.total).padStart(10)}`
    + `${pct(st.mdd).padStart(9)}${st.sharpe.toFixed(2).padStart(8)}`
    + `${pct(st.holdRatio).padStart(9)}${String(st.switches).padStart(9)}${pct(drag).padStart(9)}`);
}

const dz = sets.filter((s) => s.key.startsWith('z'));
const dp = sets.filter((s) => s.key.startsWith('p'));

console.log('\n=== 钝化·右偏：三档 S 横向对比 ===');
console.log('  S       年化     回撤    Sharpe  换仓次数');
console.log('  ' + '─'.repeat(50));
for (const s of dz) {
  console.log(`  ${s.name.split('=')[1]}${pct(s.cagr).padStart(9)}${pct(s.mdd).padStart(9)}`
    + `${s.sharpe.toFixed(2).padStart(8)}${String(s.switches).padStart(9)}`);
}
const best = dz.reduce((a, b) => (b.cagr > a.cagr ? b : a));
console.log('  → 最优 S = ' + best.name.split('=')[1] + '（' + pct(best.cagr) + '）');
console.log('  → 0.70 与 0.75 差 ' + ((dz[0].cagr - dz[1].cagr) * 100).toFixed(2) + 'pt，'
  + '0.75 与 0.80 差 ' + ((dz[1].cagr - dz[2].cagr) * 100).toFixed(2) + 'pt');

console.log('\n=== 年度收益（钝化·右偏三档 + 买入持有）===');
console.log('  年份   买入持有   S=0.70   S=0.75   S=0.80   最好的是');
console.log('  ' + '─'.repeat(62));
const yrs = sets[0].yearly.map((x) => x.year);
const winCount = [0, 0, 0];
for (let i = 0; i < yrs.length; i++) {
  const vals = dz.map((s) => s.yearly[i].ret);
  let bi = 0;
  for (let k = 1; k < 3; k++) if (vals[k] > vals[bi]) bi = k;
  winCount[bi]++;
  console.log(`  ${yrs[i]}${(sets[0].yearly[i].ret * 100).toFixed(1).padStart(9)}%`
    + `${(vals[0] * 100).toFixed(1).padStart(8)}%${(vals[1] * 100).toFixed(1).padStart(8)}%${(vals[2] * 100).toFixed(1).padStart(8)}%`
    + `   S=${SVALS[bi].toFixed(2)}`);
}
console.log(`\n  年度胜出次数：S=0.70 ${winCount[0]} 年 / S=0.75 ${winCount[1]} 年 / S=0.80 ${winCount[2]} 年`);

console.log('\n=== 起点敏感性（钝化·右偏）===');
console.log('  起点         买入持有   S=0.70   S=0.75   S=0.80    最好');
console.log('  ' + '─'.repeat(62));
const starts = ['2006-04-05', '2008-01-01', '2010-01-01', '2012-01-01', '2014-01-01', '2016-01-01', '2018-01-01', '2020-01-01', '2022-01-01'];
const sg = { s70: [], s75: [], s80: [] };
for (const s of starts) {
  const b = run(hs.map(() => 1), s, 0);
  const r = dz.map((x) => run(x.sig, s, COST));
  if (!b || r.some((x) => !x)) continue;
  sg.s70.push(r[0].cagr); sg.s75.push(r[1].cagr); sg.s80.push(r[2].cagr);
  let bi = 0;
  for (let k = 1; k < 3; k++) if (r[k].cagr > r[bi].cagr) bi = k;
  console.log(`  ${s}${pct(b.cagr).padStart(10)}${pct(r[0].cagr).padStart(9)}${pct(r[1].cagr).padStart(9)}`
    + `${pct(r[2].cagr).padStart(9)}    S=${SVALS[bi].toFixed(2)}`);
}
const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const worst = (a) => Math.min(...a);
console.log('');
console.log('  各起点平均年化：S=0.70 ' + pct(avg(sg.s70)) + '　S=0.75 ' + pct(avg(sg.s75)) + '　S=0.80 ' + pct(avg(sg.s80)));
console.log('  最差起点年化：  S=0.70 ' + pct(worst(sg.s70)) + '　S=0.75 ' + pct(worst(sg.s75)) + '　S=0.80 ' + pct(worst(sg.s80)));
const cnt70 = sg.s70.filter((v, i) => v >= sg.s75[i] && v >= sg.s80[i]).length;
const cnt75 = sg.s75.filter((v, i) => v > sg.s70[i] && v >= sg.s80[i]).length;
const cnt80 = sg.s80.filter((v, i) => v > sg.s70[i] && v > sg.s75[i]).length;
console.log('  起点胜出次数：  S=0.70 ' + cnt70 + '/9　S=0.75 ' + cnt75 + '/9　S=0.80 ' + cnt80 + '/9');

/* ---------- 出图 ---------- */
writeFileSync('rsrs-s-3way.html', renderHtml(sets, yrs, dz, dp, SVALS), 'utf8');
console.log('\n已生成图表：rsrs-s-3way.html');

function renderHtml(strats, yearsList, dzs, dps, sv) {
  const W = 1180;
  const P = { l: 58, r: 16, t: 16, b: 48 };
  const iw = W - P.l - P.r;

  function barChart(list, height, title) {
    const ih = height - P.t - P.b;
    const allV = [];
    for (const s of list) for (const y of s.yearly) allV.push(y.ret);
    const yMax = Math.max(...allV, 0.1);
    const yMin = Math.min(...allV, -0.1);
    const zeroY = P.t + ih * (yMax / (yMax - yMin));
    const yOf = (v) => P.t + ih * ((yMax - v) / (yMax - yMin));
    const gw = iw / yearsList.length;
    const bw = Math.min(11, (gw - 6) / list.length);
    let bars = ''; let xl = '';
    yearsList.forEach((yr, i) => {
      const gx = P.l + i * gw + gw / 2;
      list.forEach((s, k) => {
        const v = s.yearly[i] ? s.yearly[i].ret : 0;
        const x = gx - (list.length * bw) / 2 + k * bw;
        const y0 = yOf(v);
        bars += `<rect x="${x.toFixed(1)}" y="${Math.min(y0, zeroY).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(Math.abs(y0 - zeroY), 0.5).toFixed(1)}" fill="${s.color}" opacity="0.9"/>`;
      });
      xl += `<text x="${gx.toFixed(1)}" y="${height - P.b + 16}" fill="#5C6884" font-size="10" text-anchor="middle" transform="rotate(-45 ${gx.toFixed(1)} ${height - P.b + 16})">${yr}</text>`;
    });
    let grid = '';
    const step = (yMax - yMin) > 2 ? 0.5 : 0.25;
    for (let v = Math.ceil(yMin / step) * step; v <= yMax + 1e-9; v += step) {
      const y = yOf(v);
      grid += `<line x1="${P.l}" y1="${y.toFixed(1)}" x2="${P.l + iw}" y2="${y.toFixed(1)}" stroke="${Math.abs(v) < 1e-9 ? '#3A455F' : '#1F2C47'}" stroke-width="${Math.abs(v) < 1e-9 ? 1.4 : 1}"/>`;
      grid += `<text x="${P.l - 8}" y="${(y + 4).toFixed(1)}" fill="#5C6884" font-size="11" text-anchor="end">${(v * 100).toFixed(0)}%</text>`;
    }
    const lg = list.map((s) => `<span class="lg"><span class="dot" style="background:${s.color}"></span>${s.name}</span>`).join('');
    return `<h2>${title}</h2><svg viewBox="0 0 ${W} ${height}">${grid}${bars}${xl}</svg><div class="legend">${lg}</div>`;
  }

  // 累计净值
  const H = 360;
  const ih = H - P.t - P.b;
  let maxNav = 0;
  for (const s of strats) for (const v of s.nav) if (v > maxNav) maxNav = v;
  maxNav = Math.ceil(maxNav * 1.06);
  const yOf = (v) => P.t + ih - (v / maxNav) * ih;
  const n0 = strats[0].nav.length;
  const stepIdx = Math.max(1, Math.ceil(n0 / 900));
  const pathOf = (nav) => {
    let d = '';
    for (let i = 0; i < nav.length; i += stepIdx) {
      d += (d ? 'L' : 'M') + (P.l + (i / (nav.length - 1)) * iw).toFixed(1) + ' ' + yOf(nav[i]).toFixed(1) + ' ';
    }
    d += 'L' + (P.l + iw).toFixed(1) + ' ' + yOf(nav[nav.length - 1]).toFixed(1);
    return d;
  };
  let grid = '';
  const st = maxNav > 15 ? 5 : (maxNav > 6 ? 2 : 1);
  for (let v = 0; v <= maxNav; v += st) {
    const y = yOf(v);
    grid += `<line x1="${P.l}" y1="${y.toFixed(1)}" x2="${P.l + iw}" y2="${y.toFixed(1)}" stroke="#1F2C47"/>`;
    grid += `<text x="${P.l - 8}" y="${(y + 4).toFixed(1)}" fill="#5C6884" font-size="11" text-anchor="end">${v}</text>`;
  }
  let xg = '';
  let ly = '';
  for (let i = 0; i < n0; i++) {
    const y = strats[0].dates[i].slice(0, 4);
    if (y !== ly) {
      ly = y;
      const x = P.l + (i / (n0 - 1)) * iw;
      xg += `<line x1="${x.toFixed(1)}" y1="${P.t}" x2="${x.toFixed(1)}" y2="${P.t + ih}" stroke="#141F35"/>`;
      xg += `<text x="${x.toFixed(1)}" y="${H - 12}" fill="#5C6884" font-size="11" text-anchor="middle">${y}</text>`;
    }
  }
  const paths = strats.map((s) => `<path d="${pathOf(s.nav)}" fill="none" stroke="${s.color}" stroke-width="${s.key === 'buy' ? 1.3 : 2}" stroke-dasharray="${s.key === 'buy' ? '5 4' : ''}" opacity="0.95"/>`).join('');
  const lgNav = strats.map((s) => `<span class="lg"><span class="dot" style="background:${s.color}"></span>${s.name}<b>${pct(s.cagr)}</b><i>${pct(s.mdd)}</i></span>`).join('');

  const tbl = (list) => list.map((s) => `<tr><td><span class="dot" style="background:${s.color}"></span>${s.name}</td>
    <td class="n">${pct(s.cagr)}</td><td class="n">${pct(s.total)}</td>
    <td class="n down">${pct(s.mdd)}</td><td class="n">${s.sharpe.toFixed(2)}</td>
    <td class="n">${pct(s.holdRatio)}</td><td class="n">${s.switches}</td></tr>`).join('');

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>S=0.70 / 0.75 / 0.80 对比</title>
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
<h1>S = 0.70 / 0.75 / 0.80 对比</h1>
<p class="meta">沪深300　${strats[0].dates[0]} → ${strats[0].dates[strats[0].dates.length - 1]}　N=${N} M=${M}　MA${MA_WIN} 钝化　含 0.1% 换仓成本</p>

<div class="card">${barChart(dzs, 380, 'A · 钝化·右偏 年度收益（三档 S）')}</div>
<div class="card">${barChart(dps, 340, 'B · 标准分 年度收益（三档 S）')}</div>
<div class="card">
  <h2>C · 累计净值</h2>
  <svg viewBox="0 0 ${W} ${H}">${grid}${xg}${paths}</svg>
  <div class="legend">${lgNav}</div>
</div>
<div class="card">
  <h2>D · 钝化·右偏 全周期指标</h2>
  <table><thead><tr><th>策略</th><th>年化</th><th>累计</th><th>最大回撤</th><th>Sharpe</th><th>持仓占比</th><th>换仓次数</th></tr></thead>
  <tbody>${tbl(dzs)}</tbody></table>
</div>
<div class="card">
  <h2>E · 标准分 全周期指标</h2>
  <table><thead><tr><th>策略</th><th>年化</th><th>累计</th><th>最大回撤</th><th>Sharpe</th><th>持仓占比</th><th>换仓次数</th></tr></thead>
  <tbody>${tbl(dps)}</tbody></table>
</div>

<div class="foot">
<b>S</b>：z 的标准分阈值。z 均值≈0、标准差≈1，"均值±1σ"对应 S=1.0，所以 0.70~0.80 都是经验区间。<br>
<b>判断平滑性</b>：若三档结果接近 → 是宽平台；若某一档独高 → 是尖峰（过拟合特征）。<br>
<b>不构成投资建议。</b>
</div>
</body></html>`;
}
