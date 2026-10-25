/**
 * 任务层 —— 算信号、判断变化、推送、记录
 *
 * 定时任务和「手动点一下」共用同一套逻辑，避免两处口径不一致。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PATHS, CONFIG } from './config.mjs';
import { loadBars } from './bars.mjs';
import { buildConfig, buildSnapshot, getSymbol, rsrs, signal } from './engine.mjs';
import { push, buildSignalMessage } from './push.mjs';

const STATE_FILE = 'state.json';
const LOG_FILE = 'push-log.json';
const JOB_LOG_FILE = 'job-log.json';
const MAX_LOG = 200;
const MAX_JOB_LOG = 400;

function ensureDirs() {
  if (!existsSync(PATHS.data)) mkdirSync(PATHS.data, { recursive: true });
}

/** 当前生效的关注标的：界面选过的优先，其次配置文件 */
export function watchSymbols() {
  const st = readState();
  if (Array.isArray(st.symbols) && st.symbols.length) return st.symbols.slice(0, 12);
  return (CONFIG.symbols || []).slice(0, 12);
}

/** 保存关注标的（让定时推送和界面看到的是同一批标的） */
export function saveWatchSymbols(symbols) {
  const st = readState();
  st.symbols = (symbols || []).slice(0, 12);
  writeState(st);
  return st.symbols;
}

/**
 * 扫出「仓位发生翻转」的日期 —— 这才是真正的买入/卖出信号日
 * 随便挑一天几乎总是持有或观望，所以必须把最近的翻转日显式告诉用户
 */
function recentFlips(datasets, config, viewDate, limit = 40) {
  const out = [];
  for (const ds of datasets) {
    const p = signal.resolveParams(config, ds.symbol);
    if (!p || ds.bars.length < p.n + p.m) continue;
    let series;
    let vals;
    let pos;
    try {
      series = rsrs.computeSeries(ds.bars, { n: p.n, m: p.m });
      vals = rsrs.indicatorSeries(series, p.kind);
      pos = rsrs.buildPosition(vals, p.up, p.dn).pos;
    } catch (e) {
      continue;
    }
    for (let i = 1; i < pos.length; i++) {
      if (pos[i] === pos[i - 1]) continue;
      const d = ds.bars[i].date;
      if (viewDate && d > viewDate) continue;
      out.push({
        date: d,
        action: pos[i] === 1 ? 'buy' : 'sell',
        symbol: ds.symbol,
        name: ds.name || ds.symbol,
        value: Number.isFinite(vals[i]) ? Math.round(vals[i] * 10000) / 10000 : null,
      });
    }
  }
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return out.slice(0, limit);
}

export function readState() {
  ensureDirs();
  const p = join(PATHS.data, STATE_FILE);
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch (e) { return {}; }
}

function writeState(s) {
  ensureDirs();
  writeFileSync(join(PATHS.data, STATE_FILE), JSON.stringify(s, null, 2), 'utf8');
}

export function readPushLog() {
  ensureDirs();
  const p = join(PATHS.data, LOG_FILE);
  if (!existsSync(p)) return [];
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch (e) { return []; }
}

function appendPushLog(entry) {
  ensureDirs();
  const log = readPushLog();
  log.unshift(entry);
  writeFileSync(join(PATHS.data, LOG_FILE), JSON.stringify(log.slice(0, MAX_LOG), null, 2), 'utf8');
}

/**
 * 每日计算流水 —— 盘前 / 盘后各一条，记录「几点算的、数据截至哪天、结论、每个标的的买卖动作」
 * 和 push-log 分开：push-log 只关心推送成败，这里关心「算了什么」。
 */
export function readJobLog() {
  ensureDirs();
  const p = join(PATHS.data, JOB_LOG_FILE);
  if (!existsSync(p)) return [];
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch (e) { return []; }
}

/** 北京时间 'YYYY-MM-DD HH:mm:ss' */
function beijingStamp(iso) {
  const d = iso ? new Date(iso) : new Date();
  const s = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(d);
  return s.replace('T', ' ');
}

function recordJob(entry) {
  ensureDirs();
  const log = readJobLog();
  log.unshift(entry);
  writeFileSync(join(PATHS.data, JOB_LOG_FILE), JSON.stringify(log.slice(0, MAX_JOB_LOG), null, 2), 'utf8');
}

/** 把快照压成流水里要留的最小信息 */
function summarize(snap) {
  return {
    conclusion: snap.conclusion,
    dataAsOf: snap.dataAsOf,
    appliesTo: snap.appliesTo,
    counts: snap.counts,
    items: (snap.items || []).map((it) => ({
      symbol: it.symbol,
      name: it.name,
      action: it.action,
      value: Number.isFinite(it.value) ? Math.round(it.value * 10000) / 10000 : null,
    })),
  };
}

/**
 * 算当前信号（不推送）
 * @param {{symbols?:string[], params?:Object, count?:number, force?:boolean, localOnly?:boolean}} [o]
 */
export async function computeSignal(o = {}) {
  const symbols = (o.symbols && o.symbols.length ? o.symbols : watchSymbols()) || [];
  const { config, errors } = buildConfig({ ...CONFIG.strategy, ...(o.params || {}) });
  if (errors && errors.length) {
    return { ok: false, reason: '参数不合法：' + errors.join('；'), errors };
  }

  // 验证模式：指定日期时要用更长的历史（该日期之前也要有 N+M 根）
  const viewDate = o.asOfDate ? String(o.asOfDate) : '';
  const want = viewDate ? 3600 : Math.min(3600, config.n + config.m + 240);

  const data = await loadBars(symbols, {
    count: want,
    force: !!o.force,
    localOnly: !!o.localOnly,
  });

  if (!data.datasets.length) {
    return { ok: false, reason: '没有可用的行情数据', errors: data.errors };
  }

  // 验证模式下「实际用到多少根」
  let barsUsed = 0;
  if (viewDate) {
    for (const ds of data.datasets) {
      barsUsed = Math.max(barsUsed, ds.bars.filter((b) => b.date <= viewDate).length);
    }
  }

  // 可用范围，方便前端提示「这个日期没有数据」
  let availableFirst = '';
  let availableLast = '';
  for (const ds of data.datasets) {
    if (!ds.bars.length) continue;
    const f = ds.bars[0].date;
    const l = ds.bars[ds.bars.length - 1].date;
    if (!availableFirst || f < availableFirst) availableFirst = f;
    if (l > availableLast) availableLast = l;
  }
  if (viewDate && availableFirst && viewDate < availableFirst) {
    return {
      ok: false,
      reason: '所选日期 ' + viewDate + ' 早于可用行情起点 ' + availableFirst + '，请换个日期',
      availableFirst,
      availableLast,
    };
  }

  // signal.buildSnapshot 用 ds.name 展示标的名称，这里补上
  const datasets = data.datasets.map((ds) => {
    const sym = getSymbol(ds.symbol);
    return { ...ds, name: (sym && sym.name) || ds.symbol };
  });

  const snap = buildSnapshot({
    datasets,
    asOfDate: viewDate || undefined,
    config,
    asOf: data.asOf,
    configVersion: 'web-' + [config.kind, config.n, config.m, config.up, config.dn].join('-'),
  });

  snap.configBrief = config.kind + ' · N=' + config.n + ' · M=' + config.m + ' · S=' + config.up;

  // 最近的买点/卖点（供界面一键跳转）
  const flips = recentFlips(datasets, config, viewDate);
  const lastBuy = flips.find((f) => f.action === 'buy') || null;
  const lastSell = flips.find((f) => f.action === 'sell') || null;

  return {
    ok: true,
    viewDate,
    signals: {
      lastBuy,
      lastSell,
      recent: flips.slice(0, 12),
    },
    isLatest: !viewDate || viewDate >= availableLast,
    barsUsed,
    availableFirst,
    availableLast,
    snapshot: snap,
    config,
    dataSource: data.source,
    stale: !!data.stale,
    seedUsed: !!data.seedUsed,
    errors: data.errors,
  };
}

/**
 * 每日任务：算信号 →（按配置）推送 → 记录
 * @param {{force?:boolean, always?:boolean}} [o]
 */
export async function dailyJob(o = {}) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const r = await computeSignal({ force: !!o.force });
  if (!r.ok) {
    appendPushLog({ at: startedAt, ok: false, stage: 'compute', error: r.reason });
    recordJob({
      at: startedAt,
      beijing: beijingStamp(startedAt),
      date: beijingStamp(startedAt).slice(0, 10),
      hm: beijingStamp(startedAt).slice(11, 16),
      label: o.label || '',
      trigger: o.trigger || 'manual',
      ok: false,
      error: r.reason,
      dataRefresh: o.dataRefresh || null,
      ms: Date.now() - t0,
    });
    return { ok: false, stage: 'compute', reason: r.reason };
  }

  const state = readState();
  const snap = r.snapshot;
  const signature = snap.conclusion + '|' + snap.items.map((i) => i.symbol + ':' + i.action).sort().join(',');
  const changed = state.lastSignature !== signature;
  state.lastSignature = signature;
  state.lastConclusion = snap.conclusion;
  state.lastDataAsOf = snap.dataAsOf;
  state.lastRunAt = startedAt;

  let pushResult = null;
  const onlyOnChange = o.onlyOnChange === undefined
    ? CONFIG.scheduler.onlyOnChange !== false
    : !!o.onlyOnChange;
  const needPush = CONFIG.push.enabled && (o.always || !onlyOnChange || changed);

  if (needPush) {
    const msg = buildSignalMessage(snap, { dataSource: r.dataSource, stale: r.stale });
    pushResult = await push({ title: msg.title, markdown: msg.markdown });
    state.lastPushAt = startedAt;
    state.lastPushOk = !!pushResult.ok;
    appendPushLog({
      at: startedAt,
      ok: !!pushResult.ok,
      stage: 'push',
      provider: pushResult.provider,
      error: pushResult.error || '',
      conclusion: snap.conclusion,
      dataAsOf: snap.dataAsOf,
      title: msg.title,
      label: o.label || '',
    });
  } else {
    appendPushLog({
      at: startedAt,
      ok: true,
      stage: 'compute',
      skippedPush: true,
      reason: !CONFIG.push.enabled ? '推送未启用' : '结论未变化',
      conclusion: snap.conclusion,
      dataAsOf: snap.dataAsOf,
      label: o.label || '',
    });
  }

  writeState(state);

  recordJob({
    at: startedAt,
    beijing: beijingStamp(startedAt),
    date: beijingStamp(startedAt).slice(0, 10),
    hm: beijingStamp(startedAt).slice(11, 16),
    label: o.label || '',
    trigger: o.trigger || 'manual',
    ok: true,
    ...summarize(snap),
    changed,
    config: {
      kind: r.config.kind, n: r.config.n, m: r.config.m, up: r.config.up, dn: r.config.dn,
    },
    pushed: !!(needPush && pushResult),
    pushOk: pushResult ? !!pushResult.ok : null,
    pushError: pushResult && pushResult.error ? pushResult.error : '',
    dataRefresh: o.dataRefresh || null,
    source: r.dataSource || '',
    stale: !!r.stale,
    ms: Date.now() - t0,
  });

  return {
    ok: true,
    snapshot: snap,
    changed,
    label: o.label || '',
    pushResult,
    dataSource: r.dataSource,
    stale: r.stale,
    seedUsed: r.seedUsed,
  };
}
