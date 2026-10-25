/**
 * 前端逻辑 —— 无框架、无构建
 * 所有计算都在服务端（/api/*），这里只负责渲染与交互。
 */

import { drawEquity } from '/chart.js';

/* ================= 工具 ================= */

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
};

let toastTimer = null;
function toast(msg, ms = 3200) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* 非 JSON */ }
  if (!res.ok || (data && data.ok === false)) {
    const msg = (data && (data.error || data.reason)) || ('HTTP ' + res.status);
    const err = new Error(msg);
    err.payload = data;
    throw err;
  }
  return data;
}

const pct = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : (v * 100).toFixed(d) + '%');
const num = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : Number(v).toFixed(d));
const money = (v) => (Number.isFinite(v) ? Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 0 }) : '—');
const toneOf = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : '');

const ACTION = { buy: '买入', sell: '卖出', hold: '持有', wait: '观望', unavailable: '不可用' };
const ACTION_TONE = { buy: 'up', sell: 'down', hold: '', wait: 'muted', unavailable: 'warn' };

/* ================= 状态 ================= */

const state = {
  viewDate: '',
  schedule: null,
  catalog: null,
  params: null,
  symbols: [],
  snapshot: null,
  dataSource: '',
  stale: false,
  seedUsed: false,
  runs: [],
  run: null,
  pushStatus: null,
  srcFiles: null,
  srcFile: '',
  srcText: '',
  srcLines: [],
  jobLog: [],
  jobSchedule: null,
  dataSymbols: null,
  dataSymbol: '',
  data: null,
  defense: null,
  defenseParams: null,
  defenseSymbols: [],
  defenseChart: null,
};

/* ================= 策略视图 ================= */

function renderWarnings(list) {
  const box = $('warnings');
  box.innerHTML = '';
  for (const w of list) {
    const d = el('div', 'info-bar warn-bar', w);
    box.appendChild(d);
  }
}

function renderSignal(payload) {
  const snap = payload.snapshot;
  state.snapshot = snap;
  state.dataSource = payload.dataSource || '';
  state.stale = !!payload.stale;
  state.seedUsed = !!payload.seedUsed;

  state.viewMode = { viewDate: payload.viewDate || '', isLatest: payload.isLatest !== false,
    availableFirst: payload.availableFirst || '', availableLast: payload.availableLast || '' };

  $('dataAsOf').textContent = '数据截至 ' + snap.dataAsOf;
  $('asOfBig').textContent = snap.dataAsOf || '—';
  $('dataSource').textContent = '来源 ' + (payload.dataSource || '—');
  $('fetchedAt').textContent = '刷新于 ' + new Date().toLocaleTimeString('zh-CN', { hour12: false });

  const pill = $('statusPill');
  const insufficient = snap.status === 'insufficient';
  pill.textContent = insufficient ? '数据不足' : (state.stale ? '缓存数据' : '数据正常');
  pill.className = 'pill ' + (insufficient ? 'pill-warn' : state.stale ? 'pill-warn' : 'pill-ok');

  $('conclusion').textContent = snap.conclusion === 'unavailable'
    ? '不可用'
    : (ACTION[snap.conclusion] || snap.conclusion);
  $('conclusion').className = 'conclusion ' + (ACTION_TONE[snap.conclusion] || '');
  $('appliesTo').textContent = '数据截至 ' + snap.dataAsOf + ' · ' + (snap.appliesTo || '下一交易日') + ' 生效';
  $('reason').textContent = snap.reason || '';

  // 计数
  const box = $('counts');
  box.innerHTML = '';
  for (const k of ['buy', 'sell', 'hold', 'wait', 'unavailable']) {
    const c = el('div');
    const v = el('div', 'c-val ' + (ACTION_TONE[k] || ''), String(snap.counts[k] || 0));
    const t = el('div', 'c-key', ACTION[k]);
    c.appendChild(v); c.appendChild(t);
    box.appendChild(c);
  }

  // 明细：一行一个标的，「为什么」单独一列
  const table = $('detailTable');
  table.innerHTML = '';

  for (const it of snap.items || []) {
    const row = el('div', 'sym sym-' + (it.action || 'wait'));

    row.appendChild(el('span', 'sym-name', it.name || it.symbol));
    row.appendChild(el('span', 'pill sym-tag ' + tagClass(it.action), ACTION[it.action] || it.action));
    row.appendChild(el('span', 'sym-val ' + (ACTION_TONE[it.action] || ''),
      it.value === null || it.value === undefined ? '—' : Number(it.value).toFixed(4)));
    row.appendChild(el('span', 'sym-r2', it.r2 === null || it.r2 === undefined ? '—' : Number(it.r2).toFixed(2)));
    // 今天收盘后的仓位：买入/持有 = 持仓中，卖出/观望 = 空仓
    const inPos = it.action === 'buy' || it.action === 'hold';
    row.appendChild(el('span', 'sym-pos' + (inPos ? ' in' : ''), inPos ? '持仓中' : '空仓'));
    // 显示「自哪天起 + 多少天」，这样切日期时一眼能看出变化
    const holdText = it.holdingDays > 0
      ? (it.holdingSince ? it.holdingSince.slice(5) + ' 起 · ' : '') + it.holdingDays + ' 天'
      : '—';
    row.appendChild(el('span', 'sym-days', holdText));
    row.appendChild(el('span', 'sym-why', it.reason || ''));

    table.appendChild(row);
  }

  // 警告
  const warns = [];
  if (payload.seedUsed) warns.push('当前使用内置样例数据（构建时快照），不是实时行情。可点右上角 ⟳ 尝试联网刷新。');
  if (state.stale && !payload.seedUsed) warns.push('当前用的是本地缓存，联网刷新失败或已过期。');
  if (insufficient) warns.push('数据不足以完成计算：N+M 需要 ' + (snap.items[0] ? (snap.items[0].barsNeeded || '—') : '—') + ' 根日线。');
  for (const e of payload.errors || []) warns.push('抓取提示：' + e);
  renderWarnings(warns);
  renderViewMode(snap, payload);

  // 最近买点 / 卖点（语义：仓位翻转日才是真正的买卖信号）
  state.signals = payload.signals || {};
  const lb = state.signals.lastBuy;
  const ls = state.signals.lastSell;
  const btnB = $('btnLastBuy');
  const btnS = $('btnLastSell');
  if (btnB) {
    btnB.textContent = lb ? '买点 ' + lb.date.slice(5) : '无买点';
    btnB.disabled = !lb;
  }
  if (btnS) {
    btnS.textContent = ls ? '卖点 ' + ls.date.slice(5) : '无卖点';
    btnS.disabled = !ls;
  }

  // 参数回填
  const cfg = payload.config;
  if (cfg) {
    $('kindSelect').value = cfg.kind;
    $('inputN').value = cfg.n;
    $('inputM').value = cfg.m;
    $('inputUp').value = cfg.up;
    $('inputDn').value = cfg.dn;
    if ($('inputTrend')) $('inputTrend').checked = !!cfg.trend;
    state.params = cfg;
    $('paramsHint').textContent = '当前：' + cfg.kind + ' · N=' + cfg.n + ' · M=' + cfg.m
      + ' · 开仓 ' + cfg.up + ' / 平仓 ' + cfg.dn
      + (cfg.trend ? ' · MA' + (cfg.maWin || 20) + ' 过滤' : '');
  }
}

async function loadSignal(force = false) {
  const p = state.params ? new URLSearchParams({
    kind: state.params.kind, n: state.params.n, m: state.params.m, up: state.params.up, dn: state.params.dn,
    trend: state.params.trend ? '1' : '0',
    maWin: state.params.maWin || 20,
  }) : new URLSearchParams();
  if (state.symbols.length) p.set('symbols', state.symbols.join(','));
  if (state.viewDate) p.set('date', state.viewDate);
  if (force) p.set('force', '1');

  $('statusPill').textContent = '加载中';
  try {
    const r = await api('/api/signal?' + p.toString());
    renderSignal(r);
  } catch (e) {
    $('statusPill').textContent = '失败';
    $('statusPill').className = 'pill pill-danger';
    $('reason').textContent = e.message;
    renderWarnings([e.message]);
    toast(e.message, 5000);
  }
}

/** 验证模式提示：看的不是最新一天时，明确告诉用户这是历史回放 */
function renderViewMode(snap, payload) {
  const box = $('viewModeBanner');
  box.innerHTML = '';
  if (!state.viewDate || payload.isLatest) {
    $('dateHint').textContent = '默认今天，取该日之前的数据，不含未来'
      + (payload.availableLast ? '　可用行情 ' + payload.availableFirst + ' ~ ' + payload.availableLast : '');
    return;
  }
  $('dateHint').textContent = '可用行情 ' + payload.availableFirst + ' ~ ' + payload.availableLast;
  const d = el('div', 'info-bar warn-bar');
  const barCount = payload.barsUsed || (snap.items && snap.items[0] ? snap.items[0].bars : '?');
  d.textContent = '验证模式：用 ' + snap.dataAsOf + ' 收盘及之前的数据计算（' + barCount + ' 根），'
    + '信号在 ' + (snap.appliesTo || '下一交易日') + ' 生效；不含该日之后的任何数据。';
  box.appendChild(d);
}

/** 把当前关注标的写到服务端，保证定时推送和界面一致 */
async function saveWatchlist() {
  try {
    await api('/api/watchlist', { method: 'POST', body: JSON.stringify({ symbols: state.symbols }) });
  } catch (e) { /* 非关键，静默 */ }
}

function tagClass(action) {
  return { buy: 'pill-danger', sell: 'pill-ok', hold: 'pill-info', wait: '', unavailable: 'pill-warn' }[action] || '';
}

function renderChips() {
  const box = $('symbolChips');
  box.innerHTML = '';
  for (const s of state.catalog.symbols) {
    const c = el('div', 'chip' + (state.symbols.includes(s.id) ? ' on' : ''), s.name);
    c.dataset.id = s.id;
    c.onclick = () => {
      const i = state.symbols.indexOf(s.id);
      if (i >= 0) {
        if (state.symbols.length <= 1) { toast('至少保留一个标的'); return; }
        state.symbols.splice(i, 1);
      } else {
        if (state.symbols.length >= 12) { toast('最多 12 个标的'); return; }
        state.symbols.push(s.id);
      }
      renderChips();
      syncUrl();
      saveWatchlist();
    };
    box.appendChild(c);
  }
}

async function loadCatalog() {
  const r = await api('/api/catalog');
  state.catalog = r;
  state.params = { ...r.defaults };
  state.symbols = r.defaultSymbols.slice();

  const kindSel = $('kindSelect');
  kindSel.innerHTML = '';
  for (const k of r.kinds) {
    const o = el('option', '', k.key);
    o.value = k.key;
    kindSel.appendChild(o);
  }
  kindSel.value = state.params.kind;
  kindSel.onchange = () => {
    const preset = r.symbols[0].preset;
    $('kindSelect').value = kindSel.value;
  };

  const btSel = $('btSymbol');
  btSel.innerHTML = '';
  for (const s of r.symbols) {
    const o = el('option', '', s.name + '（' + s.id + '）');
    o.value = s.id;
    btSel.appendChild(o);
  }

  // 回测页的策略下拉
  const btKind = $('btKind');
  btKind.innerHTML = '';
  for (const k of r.kinds) {
    const o = el('option', '', k.key);
    o.value = k.key;
    btKind.appendChild(o);
  }
  btKind.value = state.params.kind;
  syncBtParams(state.params);
  updateKindDesc();

  $('inputN').value = state.params.n;
  $('inputM').value = state.params.m;
  $('inputUp').value = state.params.up;
  $('inputDn').value = state.params.dn;

  renderChips();
}

/* ================= 回测视图 ================= */

function renderBacktest(run, meta = {}) {
  state.run = run;
  $('btResult').classList.remove('hidden');
  // 标题必须一眼看出「哪个标的」的回测
  const c = run.config || {};
  const strat = (c.kind || '') + ' N=' + c.n + ' M=' + c.m + ' 开' + c.up + '/平' + c.dn
    + (c.trend ? ' · MA' + (c.maWin || 20) + ' 过滤' : '');
  $('btTitle').textContent = '「' + (meta.name || run.symbol) + '」' + strat + ' · ' + run.start + ' → ' + run.end;
  $('btSource').textContent = run.dataSource || '—';
  $('btSource').className = 'pill ' + (meta.stale ? 'pill-warn' : 'pill-ok');

  const m = run.metrics;
  const metrics = [
    ['年化', pct(m.cagr), toneOf(m.cagr)],
    ['累计', pct(m.totalReturn), toneOf(m.totalReturn)],
    ['最大回撤', pct(m.maxDrawdown), ''],
    ['夏普', num(m.sharpe), ''],
    ['波动', pct(m.volatility), ''],
    ['持仓占比', pct(m.holdRatio, 1), ''],
    ['换仓次数', String(m.switches), ''],
    ['单边成本', pct(m.costRatio), ''],
    ['基准年化', pct(m.benchCagr), toneOf(m.benchCagr)],
  ];
  const box = $('btMetrics');
  box.innerHTML = '';
  for (const [k, v, tone] of metrics) {
    const d = el('div', 'metric');
    d.appendChild(el('div', 'm-key', k));
    d.appendChild(el('div', 'm-val mono ' + tone, v));
    box.appendChild(d);
  }

  // 重新画图并绑定悬浮交互（先销毁上一次的监听，避免叠加）
  if (state.chart) { state.chart.destroy(); state.chart = null; }
  state.chart = drawEquity($('btChart'), $('btTip'), {
    dates: run.dates,
    equity: run.equity,
    benchmark: run.benchmark,
  });

  $('btNote').textContent = run.dataNote || (run.quality
    ? '日线 ' + run.quality.barsUsed + ' 根，其中 ' + run.quality.warmupBars + ' 根用于预热'
    : '');

  // 交易明细：backtest 返回的是「建仓→平仓」成对记录
  const trades = run.trades || [];
  const summary = summarizeTrades(trades);

  // 交易明细必须写明「交易的是什么标的」
  const symName = (meta && meta.name) || run.symbolName || run.symbol || '—';
  const symCode = run.symbol || '';

  const table = $('btTrades');
  table.innerHTML = '';

  const head = el('div', 'tr th');
  ['标的', '建仓', '平仓', '买入价', '卖出价', '持有', '收益'].forEach((t) => head.appendChild(el('span', '', t)));
  table.appendChild(head);

  const rows = trades.slice().reverse().slice(0, 50);
  for (const t of rows) {
    const row = el('div', 'tr');
    const symCell = el('span', 'sym-cell', symName);
    symCell.title = symName + (symCode ? '（' + symCode + '）' : '');
    row.appendChild(symCell);
    row.appendChild(el('span', 'mono', t.entryDate || '—'));
    row.appendChild(el('span', 'mono', t.exitDate || '—'));
    row.appendChild(el('span', 'mono', Number.isFinite(t.entryPrice) ? Number(t.entryPrice).toFixed(2) : '—'));
    row.appendChild(el('span', 'mono', Number.isFinite(t.exitPrice) ? Number(t.exitPrice).toFixed(2) : '—'));
    row.appendChild(el('span', 'mono', t.holdDays !== undefined ? t.holdDays + ' 天' : '—'));
    row.appendChild(el('span', 'mono ' + (t.ret >= 0 ? 'up' : 'down'), pct(t.ret)));
    table.appendChild(row);
  }
  if (!trades.length) {
    table.appendChild(el('div', 'tr', '该区间内没有完整交易（可能一直空仓）'));
  }

  $('btTradeCount').textContent = symName + (symCode ? '（' + symCode + '）' : '') + ' · ' + summary;
}

/** 交易统计：笔数、胜率、平均收益、最好/最差、平均持有 */
function summarizeTrades(trades) {
  if (!trades.length) return '（0 笔）';
  let wins = 0;
  let sum = 0;
  let days = 0;
  let best = trades[0];
  let worst = trades[0];
  for (const t of trades) {
    if (t.ret > 0) wins++;
    sum += t.ret || 0;
    days += t.holdDays || 0;
    if (t.ret > best.ret) best = t;
    if (t.ret < worst.ret) worst = t;
  }
  const n = trades.length;
  return '共 ' + n + ' 笔 · 胜率 ' + ((wins / n) * 100).toFixed(1) + '% · 平均 '
    + pct(sum / n) + ' · 平均持有 ' + Math.round(days / n) + ' 天 · 最好 ' + pct(best.ret)
    + ' · 最差 ' + pct(worst.ret);
}

async function runBacktest() {
  const btn = $('btnRun');
  btn.disabled = true;
  btn.textContent = '回测中…';
  try {
    const body = {
      symbol: $('btSymbol').value,
      start: $('btStart').value || undefined,
      end: $('btEnd').value || undefined,
      capital: Number($('btCapital').value) || 100000,
      fee: Number($('btFee').value),
      slip: Number($('btSlip').value),
      execution: $('btExec').value,
      // 策略参数来自表单，不再偷偷用策略页的
      kind: $('btKind').value,
      n: Number($('btN').value),
      m: Number($('btM').value),
      up: Number($('btUp').value),
      dn: Number($('btDn').value),
      trend: $('btTrend').checked,
      maWin: 20,
    };
    const r = await api('/api/backtest', { method: 'POST', body: JSON.stringify(body) });
    const sym = state.catalog.symbols.find((s) => s.id === body.symbol);
    renderBacktest(r.run, { name: sym ? sym.name : body.symbol, stale: r.stale });
    await loadRuns();
    toast('回测完成');
    $('btResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    toast(e.message, 6000);
  } finally {
    btn.disabled = false;
    btn.textContent = '开始回测';
  }
}

async function loadRuns() {
  try {
    const r = await api('/api/runs');
    state.runs = r.runs || [];
  } catch (e) { /* 静默 */ }
}

/* ================= 源码 ================= */

// 关键字表只影响颜色，两门语言合在一起也不会认错（js 的 const 在 py 里不会出现）
const SRC_KEYWORDS = new Set([
  'var', 'let', 'const', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'break', 'continue',
  'new', 'typeof', 'instanceof', 'in', 'of', 'null', 'undefined', 'true', 'false', 'this', 'try', 'catch',
  'finally', 'throw', 'switch', 'case', 'default', 'class', 'extends', 'import', 'export', 'from', 'async',
  'await', 'delete', 'void', 'yield',
  'def', 'import', 'from', 'as', 'pass', 'raise', 'with', 'lambda', 'global', 'nonlocal', 'assert', 'elif',
  'None', 'True', 'False', 'and', 'or', 'not', 'is', 'print',
]);

// [正则, 分类]。按「最早出现」取胜，所以字符串里的 // 不会被当注释
const SRC_RULES = {
  js: [
    [/\/\/[^\n]*/g, 'com'],
    [/\/\*[\s\S]*?\*\//g, 'com'],
    [/'(?:\\.|[^'\\\n])*'/g, 'str'],
    [/"(?:\\.|[^"\\\n])*"/g, 'str'],
    [/`(?:\\.|[^`\\])*`/g, 'str'],
  ],
  py: [
    [/#[^\n]*/g, 'com'],
    [/'''[\s\S]*?'''/g, 'str'],
    [/"""[\s\S]*?"""/g, 'str'],
    [/'(?:\\.|[^'\\\n])*'/g, 'str'],
    [/"(?:\\.|[^"\\\n])*"/g, 'str'],
  ],
  md: [
    [/^#{1,6} [^\n]*/gm, 'com'],
    [/`[^`\n]*`/g, 'str'],
  ],
};

const CODE_TOKEN = /[A-Za-z_$][\w$]*|\d+(?:\.\d+)?/g;

/** 把整段文本切成 [{t,c}]，c 为 com/str/code */
function lexSpans(text, lang) {
  const rules = SRC_RULES[lang] || SRC_RULES.js;
  const spans = [];
  let i = 0;
  while (i < text.length) {
    let best = null;
    for (const [re, cls] of rules) {
      re.lastIndex = i;
      const m = re.exec(text);
      if (!m || m.index < i) continue;
      if (!best || m.index < best.index) best = { index: m.index, end: m.index + m[0].length, text: m[0], cls };
    }
    if (!best) break;
    if (best.index > i) spans.push({ t: text.slice(i, best.index), c: 'code' });
    spans.push({ t: best.text, c: best.cls });
    i = best.end;
  }
  if (i < text.length) spans.push({ t: text.slice(i), c: 'code' });
  return spans;
}

/** [{t,c}] → 行数组；代码段再按关键字/数字二次切分 */
function spansToLines(spans) {
  const lines = [[]];
  const push = (t, c) => {
    if (!t) return;
    const parts = t.split('\n');
    parts.forEach((p, k) => {
      if (k > 0) lines.push([]);
      if (!p) return;
      if (c !== 'code') { lines[lines.length - 1].push({ t: p, c }); return; }
      // 代码段二次切分
      let last = 0;
      CODE_TOKEN.lastIndex = 0;
      let m;
      while ((m = CODE_TOKEN.exec(p))) {
        if (m.index > last) lines[lines.length - 1].push({ t: p.slice(last, m.index), c: '' });
        const w = m[0];
        const isWord = /^[A-Za-z_$]/.test(w);
        let cls = '';
        if (isWord) cls = SRC_KEYWORDS.has(w) ? 'kw' : '';
        else cls = 'num';
        lines[lines.length - 1].push({ t: w, c: cls });
        last = m.index + w.length;
      }
      if (last < p.length) lines[lines.length - 1].push({ t: p.slice(last), c: '' });
    });
  };
  for (const s of spans) push(s.t, s.c);
  return lines;
}

function renderCode(text, lang) {
  const box = $('srcCode');
  const frag = document.createDocumentFragment();
  const lines = spansToLines(lexSpans(text, lang));
  lines.forEach((tokens, idx) => {
    const row = el('div', 'code-line');
    row.appendChild(el('span', 'ln', String(idx + 1)));
    const code = el('span', 'lc');
    for (const tk of tokens) {
      if (tk.c) code.appendChild(el('span', 'tok-' + tk.c, tk.t));
      else code.appendChild(document.createTextNode(tk.t));
    }
    row.appendChild(code);
    frag.appendChild(row);
  });
  box.innerHTML = '';
  box.appendChild(frag);
}

function renderSourceList() {
  const box = $('srcList');
  box.innerHTML = '';
  let group = '';
  for (const f of (state.srcFiles || []).filter((x) => x.group === '策略核心')) {
    if (f.group !== group) {
      group = f.group;
      box.appendChild(el('div', 'src-group', group));
    }
    const b = el('button', 'src-item' + (f.id === state.srcFile ? ' active' : '') + (f.exists ? '' : ' missing'));
    b.type = 'button';
    b.appendChild(el('span', '', f.title));
    b.appendChild(el('span', 'n', f.exists ? f.lines + ' 行' : '缺失'));
    b.onclick = () => { if (f.exists) openSource(f.id); else toast('文件不存在：' + f.rel, 5000); };
    box.appendChild(b);
  }
}

async function openSource(id) {
  try {
    const f = await api('/api/source?id=' + encodeURIComponent(id));
    state.srcFile = f.id;
    state.srcText = f.lines.join('\n');
    state.srcLines = f.lines;
    renderSourceList();
    $('srcTitle').textContent = f.title;
    $('srcMeta').textContent = f.rel + ' · ' + f.lineCount + ' 行 · '
      + (f.bytes / 1024).toFixed(1) + ' KB · 改动于 '
      + new Date(f.mtime).toLocaleString('zh-CN', { hour12: false });
    $('srcNote').textContent = f.note || '';
    $('srcRaw').href = '/api/source?id=' + encodeURIComponent(f.id) + '&raw=1';
    renderCode(state.srcText, f.lang);
  } catch (e) {
    $('srcCode').textContent = '加载失败：' + e.message;
  }
}

async function openSourceTab() {
  if (!state.srcFiles) {
    try {
      const r = await api('/api/source');
      state.srcFiles = r.files || [];
      renderSourceList();
    } catch (e) {
      $('srcCode').textContent = '加载失败：' + e.message;
      return;
    }
  }
  if (!state.srcFile) {
    const first = (state.srcFiles || []).find((f) => f.exists);
    if (first) await openSource(first.id);
  }
}

/** 局域网 http 不是安全上下文，clipboard API 用不了，退回 textarea + execCommand */
function legacyCopy(text) {
  const ta = el('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.top = '-1000px';
  document.body.appendChild(ta);
  ta.select();
  const ok = typeof document.execCommand === 'function' && document.execCommand('copy');
  document.body.removeChild(ta);
  return !!ok;
}

async function copySource() {
  const text = state.srcText || '';
  if (!text) { toast('还没有内容'); return; }
  let ok = false;
  if (navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) { ok = false; }
  }
  if (!ok) {
    try { ok = legacyCopy(text); } catch (e) { ok = false; }
  }
  if (ok) toast('已复制 ' + (state.srcFile || '') + ' 全文');
  else toast('复制失败，可点「原始文件」后手动复制', 5000);
}

/* ================= 回看 / 推送 ================= */

async function loadPushStatus() {
  try {
    const r = await api('/api/push/status');
    state.pushStatus = r;
    const pill = $('pushPill');
    const ready = r.enabled && r.configured[r.provider];
    pill.textContent = r.enabled ? (ready ? '已配置' : '未配置') : '未启用';
    pill.className = 'pill ' + (ready ? 'pill-ok' : 'pill-warn');

    const lines = [];
    lines.push('通道：' + r.provider + (r.enabled ? '' : '（推送未启用）'));
    if (r.state && r.state.lastRunAt) lines.push('上次计算：' + new Date(r.state.lastRunAt).toLocaleString('zh-CN', { hour12: false }));
    if (r.state && r.state.lastPushAt) lines.push('上次推送：' + new Date(r.state.lastPushAt).toLocaleString('zh-CN', { hour12: false }) + (r.state.lastPushOk ? ' ✓' : ' ✗'));
    if (r.state && r.state.lastConclusion) lines.push('上次结论：' + (ACTION[r.state.lastConclusion] || r.state.lastConclusion));
    if (r.log && r.log[0] && r.log[0].error) lines.push('最近错误：' + r.log[0].error);
    $('pushInfo').textContent = lines.join('　');
  } catch (e) { /* 静默 */ }
}

async function previewPush() {
  const pre = $('pushPreview');
  try {
    const r = await api('/api/push/preview');
    pre.textContent = r.markdown;
    pre.classList.remove('hidden');
  } catch (e) {
    pre.textContent = e.message;
    pre.classList.remove('hidden');
  }
}

async function testPush() {
  try {
    const r = await api('/api/push/test', { method: 'POST', body: '{}' });
    toast('已发送：' + (r.detail || '成功'));
  } catch (e) {
    toast('发送失败：' + e.message, 6000);
  }
}

/* ================= 每日计算 ================= */

const TRIGGER_TEXT = { scheduler: '定时', catchup: '补算', manual: '手动' };

/** 北京时间（调度按这个时区跑，界面也要按它显示，不能用本机时区） */
function beijingParts() {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short',
  }).formatToParts(new Date());
  const g = (t) => (parts.find((p) => p.type === t) || {}).value || '';
  return { date: g('year') + '-' + g('month') + '-' + g('day'), hm: g('hour') + ':' + g('minute'), weekday: g('weekday') };
}

function actionSummary(entry) {
  return (entry.items || []).map((it) => (it.name || it.symbol) + ' ' + (ACTION[it.action] || it.action)).join(' · ');
}

async function loadJobs() {
  try {
    const r = await api('/api/jobs/log?limit=12');
    state.jobLog = r.log || [];
    state.jobSchedule = { enabled: r.enabled, slots: r.slots || [], nextRuns: r.nextRuns || [] };
    renderJobs();
  } catch (e) { /* 静默 */ }
}

/** 北京时间 'MM-DD HH:mm' */
function bjShort(iso) {
  const p = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', hour12: false,
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(iso));
  const g = (t) => (p.find((x) => x.type === t) || {}).value || '';
  return g('month') + '-' + g('day') + ' ' + g('hour') + ':' + g('minute');
}

function renderJobs() {
  const sc = state.jobSchedule || {};
  const pill = $('jobPill');
  pill.textContent = sc.enabled ? '已启用' : '未启用';
  pill.className = 'pill ' + (sc.enabled ? 'pill-ok' : 'pill-warn');

  const nr = (sc.nextRuns || [])[0];
  $('jobNext').textContent = nr
    ? '下一次 ' + bjShort(nr.next) + (nr.label ? ' · ' + nr.label : '')
    : (sc.enabled ? '今天没有待运行的时间点' : '定时任务未启用');

  const now = beijingParts();
  const weekend = /六|日|Sat|Sun/.test(now.weekday);
  const todayRuns = (state.jobLog || []).filter((x) => x.date === now.date);

  const slotsBox = $('jobSlots');
  slotsBox.innerHTML = '';
  for (const s of sc.slots || []) {
    const run = todayRuns.find((x) => (x.label || '').indexOf(s.at) >= 0 || (x.label || '').indexOf(s.label || '\u0000') >= 0);
    const row = el('div', 'job-slot');
    row.appendChild(el('span', 'job-slot-time mono', s.at));
    row.appendChild(el('span', 'job-slot-label', s.label || '定时'));
    let text;
    let cls = 'muted';
    if (run) {
      if (run.ok) {
        text = '已算 ' + run.hm + ' · ' + (ACTION[run.conclusion] || run.conclusion);
        cls = run.conclusion === 'buy' ? 'up' : run.conclusion === 'sell' ? 'down' : '';
      } else {
        text = '失败：' + (run.error || '未知错误');
        cls = 'warn';
      }
    } else if (weekend) {
      text = '周末不跑';
    } else if (now.hm < s.at) {
      text = '待运行';
    } else {
      text = '今天没跑（当时服务没启动）';
      cls = 'warn';
    }
    row.appendChild(el('span', 'job-slot-state ' + cls, text));
    slotsBox.appendChild(row);
  }

  const list = $('jobList');
  list.innerHTML = '';
  for (const x of (state.jobLog || []).slice(0, 8)) {
    const row = el('div', 'job-row');
    const head = el('div', 'job-row-head');
    head.appendChild(el('b', 'mono', x.beijing ? x.beijing.slice(5, 16) : String(x.at || '').slice(5, 16)));
    head.appendChild(el('span', 'job-tag', x.label || TRIGGER_TEXT[x.trigger] || '计算'));
    if (!x.ok) head.appendChild(el('span', 'pill pill-danger', '失败'));
    else {
      const tone = x.conclusion === 'buy' ? 'pill-danger' : x.conclusion === 'sell' ? 'pill-ok' : 'pill-info';
      head.appendChild(el('span', 'pill ' + tone, ACTION[x.conclusion] || x.conclusion));
    }
    row.appendChild(head);
    const dr = x.dataRefresh;
    const detail = x.ok
      ? '数据截至 ' + x.dataAsOf + (x.items && x.items.length ? ' · ' + actionSummary(x) : '')
        + (dr ? ' · 行情 ' + dr.okCount + '/' + dr.total + (dr.failed && dr.failed.length ? '（失败 ' + dr.failed.join('、') + '）' : '') : '')
      : (x.error || '计算失败')
        + (dr ? ' · 行情 ' + dr.okCount + '/' + dr.total : '');
    row.appendChild(el('div', 'hint job-meta', detail));
    list.appendChild(row);
  }
  if (!(state.jobLog || []).length) {
    list.appendChild(el('div', 'hint', '还没有计算记录；到点会自动算，也可以点下面的按钮立即跑一次。'));
  }
}

/* ================= 数据体检 ================= */

const fmtVol = (v) => {
  if (!Number.isFinite(v)) return '—';
  if (v >= 1e8) return (v / 1e8).toFixed(2) + ' 亿';
  if (v >= 1e4) return (v / 1e4).toFixed(0) + ' 万';
  return String(Math.round(v));
};

/** URL 里的 ?symbols= 就是「当前选中」，没有就用关注列表 */
function dataScopeFromUrl() {
  const raw = new URL(location.href).searchParams.get('symbols');
  if (!raw) return null;
  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 12);
  return ids.length ? ids : null;
}

function watchScope() {
  return (state.symbols && state.symbols.length) ? state.symbols.slice(0, 12) : null;
}

async function openDataTab() {
  if (!state.dataOverview) {
    state.dataScope = state.dataScope === undefined
      ? (dataScopeFromUrl() || watchScope())
      : state.dataScope;
    await loadOverview();
  }
  if (!state.dataSymbol) {
    const first = (state.dataOverview || []).find((r) => r.ok);
    if (first) await loadData(first.symbol);
  }
  renderScope();
}

async function loadOverview(force) {
  const q = new URLSearchParams();
  if (state.dataScope) q.set('symbols', state.dataScope.join(','));
  if (force) q.set('force', '1');
  try {
    const r = await api('/api/data/overview' + (q.toString() ? '?' + q.toString() : ''));
    state.dataOverview = r.rows || [];
  } catch (e) {
    state.dataOverview = [];
    toast('标的对比加载失败：' + e.message, 5000);
  }
  renderOverview();
  renderScope();
}

function renderScope() {
  const n = (state.dataOverview || []).length;
  $('dataScope').textContent = state.dataScope ? '只看关注标的（' + n + ' 个）' : '全部 ' + n + ' 个标的';
  $('btnDataScope').textContent = state.dataScope ? '显示全部' : '只看关注标的';
  $('btnDataScope').disabled = !state.dataScope && !watchScope();
}

function renderOverview() {
  const box = $('dataOverview');
  box.innerHTML = '';
  const head = el('div', 'bt-head bt-ov');
  ['标的', '数据截至', '收盘', '涨跌', '标准分', '修正', '右偏', '仓位', '距今'].forEach((t, i) => {
    head.appendChild(el('span', i >= 2 && i <= 7 ? 'num' : '', t));
  });
  box.appendChild(head);

  for (const r of state.dataOverview || []) {
    const row = el('div', 'bt-row bt-ov' + (r.symbol === state.dataSymbol ? ' active' : ''));
    row.appendChild(el('span', 'ov-name', r.name || r.symbol));
    if (!r.ok) {
      row.appendChild(el('span', 'num', '—'));
      row.appendChild(el('span', '', r.error || '无数据'));
      row.style.gridColumn = 'span 7';
      box.appendChild(row);
      continue;
    }
    row.appendChild(el('span', 'mono', r.date));
    row.appendChild(el('span', 'num', r.close === null ? '—' : Number(r.close).toFixed(2)));
    row.appendChild(el('span', 'num ' + toneOf(r.ret), r.ret === null ? '—' : pct(r.ret)));
    row.appendChild(el('span', 'num', r.z === null ? '—' : Number(r.z).toFixed(2)));
    row.appendChild(el('span', 'num', r.revise === null ? '—' : Number(r.revise).toFixed(2)));
    row.appendChild(el('span', 'num', r.positive === null ? '—' : Number(r.positive).toFixed(2)));
    if (r.warmupOk === false) {
      row.appendChild(el('span', 'num warn', '预热不足'));
    } else {
      row.appendChild(el('span', 'num ' + (r.pos === 1 ? 'up' : 'muted'), r.pos === 1 ? '持仓' : '空仓'));
    }
    row.appendChild(el('span', 'num ' + (r.ageDays > 7 ? 'warn' : 'muted'), r.ageDays + ' 天'));
    row.title = r.symbol + ' · ' + (r.source || '') + ' · ' + r.count + ' 根'
      + (r.warmupOk === false ? '（需 ' + r.need + ' 根才够预热）' : '');
    row.onclick = () => {
      loadData(r.symbol);
      const t = $('dataTitle');
      if (t && t.scrollIntoView) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    box.appendChild(row);
  }
  if (!(state.dataOverview || []).length) {
    box.appendChild(el('div', 'hint mt8', '没有可显示的标的'));
  }
}

async function loadData(id, force) {
  state.dataSymbol = id;
  renderOverview();
  $('dataTitle').textContent = '加载中…';
  $('dataMeta').textContent = '';
  try {
    const r = await api('/api/data?symbol=' + encodeURIComponent(id) + (force ? '&force=1' : ''));
    state.data = r;
    renderData(r);
  } catch (e) {
    $('dataTitle').textContent = id;
    $('dataMeta').textContent = '加载失败：' + e.message;
    $('dataChecks').innerHTML = '';
    $('dataBars').innerHTML = '';
  }
}

function renderData(r) {
  $('dataTitle').textContent = r.name + '（' + r.symbol + '）';
  const fetched = r.fetchedAt ? new Date(r.fetchedAt).toLocaleString('zh-CN', { hour12: false }) : '—';
  $('dataMeta').textContent = '数据截至 ' + r.last + ' · 来源 ' + (r.source || '—') + ' · 抓到 ' + fetched
    + ' · 共 ' + r.count + ' 根（' + r.first + ' 起）'
    + (r.stale ? ' · 缓存/样例' : '');

  // ---- 体检 ----
  const c = r.checks || {};
  const box = $('dataChecks');
  box.innerHTML = '';
  const chips = [
    [c.sorted ? '日期升序 ✓' : '日期乱序 ✗', c.sorted ? 'ok' : 'bad'],
    [c.duplicates ? '重复日期 ' + c.duplicates : '无重复日期', c.duplicates ? 'bad' : 'ok'],
    [c.badPrices ? '非法价格 ' + c.badPrices : '价格合法', c.badPrices ? 'bad' : 'ok'],
    [c.bigJumps ? '单日 >20% ' + c.bigJumps + ' 次' : '无异常跳空', c.bigJumps ? 'bad' : 'ok'],
    ['最大空档 ' + c.maxGapDays + ' 天' + (c.maxGapAt ? '（' + c.maxGapAt + '）' : ''), c.maxGapDays > 20 ? 'bad' : ''],
    ['距今天 ' + c.ageDays + ' 天', c.ageDays > 7 ? 'bad' : ''],
  ];
  for (const [text, cls] of chips) box.appendChild(el('span', 'data-check ' + cls, text));

  // ---- 最近 20 根 K 线 ----
  const bars = $('dataBars');
  bars.innerHTML = '';
  const head = el('div', 'bt-head bt-bars');
  ['日期', '开盘', '最高', '最低', '收盘', '成交量', '涨跌'].forEach((t, i) => {
    head.appendChild(el('span', i === 0 ? '' : 'num', t));
  });
  bars.appendChild(head);
  for (const b of r.bars || []) {
    const row = el('div', 'bt-row bt-bars');
    row.appendChild(el('span', 'mono', b.date));
    row.appendChild(el('span', 'num', b.open === null ? '—' : b.open.toFixed(2)));
    row.appendChild(el('span', 'num', b.high === null ? '—' : b.high.toFixed(2)));
    row.appendChild(el('span', 'num', b.low === null ? '—' : b.low.toFixed(2)));
    row.appendChild(el('span', 'num', b.close === null ? '—' : b.close.toFixed(2)));
    row.appendChild(el('span', 'num', fmtVol(b.volume)));
    row.appendChild(el('span', 'num ' + toneOf(b.ret), b.ret === null ? '—' : pct(b.ret)));
    bars.appendChild(row);
  }

}

/* ================= 防守开关（时变夏普 + MA200） ================= */

const DEFENSE_FALLBACK = {
  defaults: { window: 120, maWin: 200, up: 0.3, dn: -0.3 },
  symbols: ['000300', '510300', '510500', '000905', '399006', '511010'],
  defaultSymbols: ['000300', '510300', '510500'],
};

function defenseMeta() {
  return (state.catalog && state.catalog.defense) || DEFENSE_FALLBACK;
}

function defenseName(id) {
  const s = (state.catalog.symbols || []).find((x) => x.id === id);
  return s ? s.name : id;
}

async function openDefenseTab() {
  if (!state.defenseParams) {
    const meta = defenseMeta();
    state.defenseParams = { ...meta.defaults };
    state.defenseSymbols = meta.defaultSymbols.slice();
    $('dfWindow').value = state.defenseParams.window;
    $('dfMaWin').value = state.defenseParams.maWin;
    $('dfUp').value = state.defenseParams.up;
    $('dfDn').value = state.defenseParams.dn;
    const today = new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    $('dfStart').value = '2006-04-05';
    $('dfEnd').value = iso(today);
  }
  renderDefenseChips();
  await loadDefense();
}

function renderDefenseChips() {
  const box = $('dfChips');
  box.innerHTML = '';
  for (const id of defenseMeta().symbols) {
    const c = el('div', 'chip' + (state.defenseSymbols.includes(id) ? ' on' : ''), defenseName(id));
    c.onclick = async () => {
      const i = state.defenseSymbols.indexOf(id);
      if (i >= 0) {
        if (state.defenseSymbols.length <= 1) { toast('至少保留一个标的'); return; }
        state.defenseSymbols.splice(i, 1);
      } else {
        state.defenseSymbols.push(id);
      }
      renderDefenseChips();
      await loadDefense();
    };
    box.appendChild(c);
  }
}

async function loadDefense(force = false) {
  const p = state.defenseParams || defenseMeta().defaults;
  const q = new URLSearchParams({
    symbols: state.defenseSymbols.join(','),
    window: p.window, maWin: p.maWin, up: p.up, dn: p.dn,
  });
  if (force) q.set('force', '1');
  $('dfPill').textContent = '加载中';
  try {
    const r = await api('/api/defense?' + q.toString());
    renderDefense(r);
  } catch (e) {
    $('dfPill').textContent = '失败';
    $('dfPill').className = 'pill pill-danger';
    $('dfConclusion').textContent = '失败';
    $('dfReason').textContent = e.message;
    toast(e.message, 5000);
  }
}

function renderDefense(r) {
  state.defense = r;
  const hold = r.conclusion === 'hold';
  const unavailable = r.conclusion === 'unavailable';
  $('dfPill').textContent = unavailable ? '数据不足' : (hold ? '持有' : '空仓');
  $('dfPill').className = 'pill ' + (unavailable ? 'pill-danger' : hold ? 'pill-ok' : 'pill-warn');
  $('dfConclusion').textContent = unavailable ? '不可用' : (hold ? '持有' : '空仓');
  $('dfReason').textContent = unavailable
    ? '行情不足以完成计算'
    : (hold ? '双条件同时满足：时变夏普 > 门槛，且收盘在 MA200 上方' : '至少一个条件不满足：时变夏普走弱，或收盘跌破 MA200');

  $('dfAsOf').textContent = r.dataAsOf || '—';
  $('dfSource').textContent = '来源 ' + (r.dataSource || '—');
  $('dfFetched').textContent = '刷新于 ' + new Date().toLocaleTimeString('zh-CN', { hour12: false });
  $('dfRange').textContent = r.dataAsOf ? '数据截至 ' + r.dataAsOf : '';

  const counts = r.counts || { hold: 0, wait: 0, unavailable: 0 };
  const box = $('dfCounts');
  box.innerHTML = '';
  for (const [key, label] of [['hold', '持有'], ['wait', '空仓'], ['unavailable', '不可用']]) {
    const d = el('div');
    d.appendChild(el('div', 'c-val ' + (key === 'hold' ? 'up' : key === 'wait' ? 'muted' : 'warn'), String(counts[key] || 0)));
    d.appendChild(el('div', 'c-key', label));
    box.appendChild(d);
  }

  if (r.latestFlip) {
    const f = r.latestFlip;
    $('dfFlip').textContent = '上次翻仓：' + f.date + ' ' + (f.name || f.symbol)
      + ' → ' + (f.to === 'hold' ? '持有' : '空仓') + ' @ ' + num(f.price, 2);
  } else {
    $('dfFlip').textContent = '暂无翻仓记录';
  }

  const warns = [];
  if (r.seedUsed) warns.push('当前使用内置样例数据（构建时快照），不是实时行情。');
  if (r.stale && !r.seedUsed) warns.push('当前用的是本地缓存，联网刷新失败或已过期。');
  for (const e of r.errors || []) warns.push('抓取提示：' + e);
  const warnBox = $('dfWarnings');
  warnBox.innerHTML = '';
  for (const w of warns) warnBox.appendChild(el('div', 'info-bar warn-bar', w));

  // 明细表
  const table = $('dfTable');
  table.innerHTML = '';
  const head = el('div', 'df-head-row');
  const cols = ['标的', '收盘', 'MA200', '距MA200', 'T夏普', '状态', '上次翻仓', '为什么'];
  cols.forEach((t, i) => head.appendChild(el('span', i >= 1 && i <= 6 ? 'num' : '', t)));
  table.appendChild(head);
  for (const it of r.items || []) {
    const row = el('div', 'df-row');
    row.appendChild(el('span', 'df-name', it.name || it.symbol));
    row.appendChild(el('span', 'num', num(it.close, 2)));
    row.appendChild(el('span', 'num', num(it.ma200, 2)));
    row.appendChild(el('span', 'num', pct(it.maGap, 1)));
    row.appendChild(el('span', 'num', num(it.tsharpe, 2)));
    row.appendChild(el('span', 'df-state' + (it.state === 1 ? ' in' : ''), it.ready ? (it.state === 1 ? '持有' : '空仓') : '不可用'));
    row.appendChild(el('span', 'num', it.lastFlipDate ? it.lastFlipDate.slice(5) : '—'));
    row.appendChild(el('span', 'df-why', it.reason || ''));
    table.appendChild(row);
  }

  const c = r.config || {};
  $('dfParamsHint').textContent = '当前：T夏普 ' + c.window + ' 日 · MA' + c.maWin
    + ' · 开 ' + c.up + ' / 平 ' + c.dn;
}

async function runDefenseBacktest() {
  const btn = $('btnDfRun');
  const p = state.defenseParams || defenseMeta().defaults;
  const symbol = state.defenseSymbols[0] || '000300';
  btn.disabled = true;
  btn.textContent = '回测中…';
  try {
    const r = await api('/api/defense/backtest', {
      method: 'POST',
      body: JSON.stringify({
        symbol,
        window: p.window, maWin: p.maWin, up: p.up, dn: p.dn,
        start: $('dfStart').value || undefined,
        end: $('dfEnd').value || undefined,
        fee: Number($('dfFee').value),
        slip: Number($('dfSlip').value),
      }),
    });
    renderDefenseBacktest(r);
    toast('回测完成');
  } catch (e) {
    toast(e.message, 6000);
  } finally {
    btn.disabled = false;
    btn.textContent = '跑回测';
  }
}

function renderDefenseBacktest(r) {
  $('dfBtSource').textContent = r.dataSource || '—';
  $('dfBtSource').className = 'pill ' + (r.stale ? 'pill-warn' : 'pill-ok');
  const m = r.metrics || {};
  const rows = [
    ['年化', pct(m.cagr), toneOf(m.cagr)],
    ['累计', pct(m.totalReturn), toneOf(m.totalReturn)],
    ['最大回撤', pct(m.maxDrawdown), ''],
    ['夏普', num(m.sharpe), ''],
    ['波动', pct(m.volatility), ''],
    ['持仓占比', pct(m.holdRatio, 1), ''],
    ['换仓次数', String(m.switches), ''],
    ['单边成本', pct(m.costRatio), ''],
    ['基准年化', pct(m.benchCagr), toneOf(m.benchCagr)],
  ];
  const box = $('dfMetrics');
  box.innerHTML = '';
  for (const [k, v, tone] of rows) {
    const d = el('div', 'metric');
    d.appendChild(el('div', 'm-key', k));
    d.appendChild(el('div', 'm-val mono ' + tone, v));
    box.appendChild(d);
  }
  if (state.defenseChart) { state.defenseChart.destroy(); state.defenseChart = null; }
  state.defenseChart = drawEquity($('dfChart'), $('dfTip'), {
    dates: r.dates, equity: r.equity, benchmark: r.benchmark,
  });
  const q = r.quality || {};
  $('dfBtNote').textContent = '「' + (r.name || r.symbol) + '」' + r.from + ' → ' + r.to
    + ' · 日线 ' + (q.barsUsed || '—') + ' 根（预热 ' + (q.warmupBars || '—') + ' 根）'
    + ' · 单边成本 ' + pct((r.fee || 0) + (r.slip || 0)) + ' · 交易 ' + (r.trades || []).length + ' 笔';
}

/* ================= 初始化 ================= */

const VIEWS = { strategy: 'view-strategy', defense: 'view-defense', backtest: 'view-backtest', data: 'view-data', source: 'view-source' };

function switchTab(tab) {
  if (!VIEWS[tab]) tab = 'strategy';
  document.querySelectorAll('.nav-link').forEach((x) => x.classList.toggle('active', x.dataset.tab === tab));
  for (const [k, id] of Object.entries(VIEWS)) $(id).classList.toggle('hidden', k !== tab);
  if (location.hash !== '#' + tab) history.replaceState(null, '', '#' + tab);
  if (tab === 'backtest') openBacktestTab();
  if (tab === 'defense') openDefenseTab();
  if (tab === 'data') openDataTab();
  if (tab === 'source') openSourceTab();
}

async function openBacktestTab() {
  await loadRuns();
  // 没有正在展示的结果时，默认打开最近一次（打开页面就有内容，不用先跑一次）
  if (!state.run && state.runs.length) {
    try {
      const r = state.runs[0];
      const d = await api('/api/runs/' + r.runId);
      const sym = (state.catalog.symbols || []).find((s) => s.id === r.symbol);
      // 表单跟着这次回测的参数走，别让表单和标题对不上
      if (d.run && d.run.config) syncBtParams(d.run.config);
      renderBacktest(d.run, { name: sym ? sym.name : r.symbol });
    } catch (e) { /* 忽略 */ }
  }
}

function bindTabs() {
  document.querySelectorAll('.nav-link').forEach((t) => {
    t.onclick = () => switchTab(t.dataset.tab);
  });
  window.addEventListener('hashchange', () => {
    const t = location.hash.replace('#', '');
    if (VIEWS[t]) switchTab(t);
  });
}

function bindEvents() {
  $('btnRefresh').onclick = async () => {
    $('btnRefresh').textContent = '…';
    const tab = location.hash.replace('#', '') || 'strategy';
    if (tab === 'defense') await loadDefense(true);
    else await loadSignal(true);
    $('btnRefresh').textContent = '⟳';
    toast('已刷新');
  };

  $('btnApplyParams').onclick = async () => {
    state.params = {
      kind: $('kindSelect').value,
      n: Number($('inputN').value),
      m: Number($('inputM').value),
      up: Number($('inputUp').value),
      dn: Number($('inputDn').value),
      trend: $('inputTrend').checked,
      maWin: 20,
    };
    await loadSignal(false);
    toast('参数已应用');
  };

  $('detailToggle').onclick = () => {
    const body = $('detailBody');
    const hidden = body.classList.toggle('hidden');
    $('detailToggle').textContent = hidden ? '展开 ▾' : '收起 ▴';
  };

  $('btnRun').onclick = runBacktest;

  // 防守开关
  $('btnDfApply').onclick = async () => {
    state.defenseParams = {
      window: Number($('dfWindow').value),
      maWin: Number($('dfMaWin').value),
      up: Number($('dfUp').value),
      dn: Number($('dfDn').value),
    };
    await loadDefense();
    toast('防守参数已应用');
  };
  $('btnDfRun').onclick = runDefenseBacktest;

  // 策略下拉 / 参数改动 → 更新摘要
  ['btKind', 'btN', 'btM', 'btUp', 'btDn', 'btTrend'].forEach((id) => {
    const n = $(id);
    if (n) n.addEventListener('change', updateBtSummary);
    if (n) n.addEventListener('input', updateBtSummary);
  });

  // 用策略页当前参数
  $('btnBtFromStrategy').onclick = () => {
    syncBtParams(state.params || state.catalog.defaults);
    toast('已套用策略页参数');
  };

  // 套用该标的的 notebook 预设
  $('btnBtPreset').onclick = () => {
    const id = $('btSymbol').value;
    const sym = (state.catalog.symbols || []).find((x) => x.id === id);
    const p = sym && (sym.preset || sym.alt);
    if (!p) { toast('该标的没有预设参数'); return; }
    syncBtParams(p);
    toast('已套用 ' + (sym.name || id) + ' 的预设');
  };


  $('viewDate').onchange = async () => {
    state.viewDate = $('viewDate').value || '';
    syncUrl();
    await loadSignal(false);
  };

  $('btnToday').onclick = async () => {
    state.viewDate = isoToday();
    $('viewDate').value = state.viewDate;
    syncUrl();
    await loadSignal(false);
    toast('已回到今天');
  };

  const gotoDate = async (date, label) => {
    if (!date) return;
    state.viewDate = date;
    $('viewDate').value = date;
    syncUrl();
    await loadSignal(false);
    toast(label + '：' + date);
  };

  const bindJump = (id, key, label) => {
    const n = $(id);
    if (!n) return;
    n.onclick = () => {
      const sig = state.signals && state.signals[key];
      gotoDate(sig ? sig.date : '', label);
    };
  };
  bindJump('btnLastBuy', 'lastBuy', '已跳到最近买点');
  bindJump('btnLastSell', 'lastSell', '已跳到最近卖点');

  $('btnRunJob').onclick = async () => {
    const btn = $('btnRunJob');
    btn.disabled = true;
    btn.textContent = '运行中…';
    try {
      const r = await api('/api/jobs/run', { method: 'POST', body: JSON.stringify({}) });
      toast('已运行：结论 ' + (ACTION[r.snapshot.conclusion] || r.snapshot.conclusion)
        + (r.changed ? '（发生变化）' : '（无变化）'));
      await loadSignal(false);
      await loadPushStatus();
      await loadJobs();
    } catch (e) {
      toast('运行失败：' + e.message, 6000);
    } finally {
      btn.disabled = false;
      btn.textContent = '立即跑一次';
    }
  };
  $('btnPushPreview').onclick = previewPush;
  $('btnPushTest').onclick = testPush;
  $('btnSrcCopy').onclick = copySource;

  $('btnDataRefresh').onclick = async () => {
    const btn = $('btnDataRefresh');
    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = '拉取中…';
    try {
      const r = await api('/api/data/refresh', {
        method: 'POST',
        body: JSON.stringify({ symbols: state.dataScope || undefined }),
      });
      const failed = (r.results || []).filter((x) => !x.ok).map((x) => x.symbol);
      toast('行情已刷新：' + r.okCount + '/' + r.total + ' 成功'
        + (failed.length ? '（失败：' + failed.join('、') + '）' : ''), 6000);
      await loadOverview();
      if (state.dataSymbol) await loadData(state.dataSymbol);
    } catch (e) {
      toast('刷新失败：' + e.message, 6000);
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  };

  $('btnDataScope').onclick = async () => {
    state.dataScope = state.dataScope ? null : (dataScopeFromUrl() || watchScope());
    await loadOverview();
  };

  // 默认回测区间：近 5 年
  const today = new Date();
  const fiveYearsAgo = new Date(today.getFullYear() - 5, today.getMonth(), today.getDate());
  const iso = (d) => d.toISOString().slice(0, 10);
  $('btStart').value = iso(fiveYearsAgo);
  $('btEnd').value = iso(today);
}

/** 把当前查看日期写进 URL，方便分享/回看 */
function syncUrl() {
  const u = new URL(location.href);
  if (state.viewDate && state.viewDate !== isoToday()) u.searchParams.set('date', state.viewDate);
  else u.searchParams.delete('date');
  const def = (state.catalog && state.catalog.defaultSymbols) || [];
  if (state.symbols.length && state.symbols.join(',') !== def.join(',')) {
    u.searchParams.set('symbols', state.symbols.join(','));
  } else {
    u.searchParams.delete('symbols');
  }
  history.replaceState(null, '', u.pathname + (u.search || '') + (location.hash || ''));
}

/** 策略参数写入回测表单；老记录里的指标版本可能已经下线，退回默认 */
function syncBtParams(p) {
  if (!p) return;
  const kinds = (state.catalog && state.catalog.kinds) || [];
  const known = kinds.some((k) => k.key === p.kind);
  $('btKind').value = known ? p.kind : '标准分RSRS';
  $('btN').value = p.n;
  $('btM').value = p.m;
  $('btUp').value = p.up;
  $('btDn').value = p.dn;
  if ($('btTrend')) $('btTrend').checked = !!p.trend;
  updateBtSummary();
}

/** 表单里的策略摘要 + 指标说明 */
function updateBtSummary() {
  const kind = $('btKind') ? $('btKind').value : '';
  const k = (state.catalog && state.catalog.kinds || []).find((x) => x.key === kind);
  if ($('btKindDesc')) $('btKindDesc').textContent = k ? k.desc : '';
  const trend = $('btTrend') && $('btTrend').checked;
  if ($('btParams')) {
    $('btParams').textContent = '将回测：' + kind + ' · N=' + $('btN').value
      + ' · M=' + $('btM').value + ' · 开仓 ' + $('btUp').value
      + ' / 平仓 ' + $('btDn').value + (trend ? ' · MA20 过滤' : '');
  }
}

function updateKindDesc() { updateBtSummary(); }

function isoToday() {
  const d = new Date();
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

async function boot() {
  bindTabs();
  bindEvents();
  const params = new URL(location.href).searchParams;
  const symParam = params.get('symbols');
  const fromUrl = params.get('date');
  state.viewDate = fromUrl && /^\d{4}-\d{2}-\d{2}$/.test(fromUrl) ? fromUrl : isoToday();
  $('viewDate').value = state.viewDate;
  try {
    await loadCatalog();
    // 必须等 catalog 到位再解析 ?symbols=：之前放在 loadCatalog 前面，
    // 此时 state.catalog 还是 null，读 .symbols 直接 TypeError，整个 boot 中断，
    // 页面就停在「加载中 / 全是 —」的状态（带 ?symbols= 的链接必现）。
    if (symParam) {
      const valid = symParam.split(',').map((x) => x.trim()).filter(Boolean)
        .filter((id) => (state.catalog.symbols || []).some((s) => s.id === id));
      if (valid.length) { state.symbols = valid.slice(0, 12); renderChips(); await saveWatchlist(); }
    }
    await loadSignal(false);
    await loadPushStatus();
    await loadJobs();
    const initialTab = location.hash.replace('#', '');
    if (initialTab && initialTab !== 'strategy' && VIEWS[initialTab]) switchTab(ini