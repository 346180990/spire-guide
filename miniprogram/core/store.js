/**
 * 本地存储 —— 本模块是唯一引用 wx 的模块，其余 core/* 均可离线测试
 *
 * 设计要点（spec §4.4 / §4.8）：
 *   - 参数保存即生成新版本，旧版本不被覆盖；历史快照与回测各自带参数快照
 *   - 运行记录不可变；超出上限按时间淘汰最旧
 *   - 快照按 (策略|配置版本|信号日期) 唯一，默认不覆盖
 *   - 所有写入失败都要能返回原因，不允许抛到页面
 */

'use strict';

var catalog = require('./catalog');

var PREFIX = 'sa_v1_';
var KEYS = {
  settings: PREFIX + 'settings',
  watchlist: PREFIX + 'watchlist',
  configs: PREFIX + 'configs',
  activeCfg: PREFIX + 'active_cfg',
  snapshots: PREFIX + 'snapshots',
  runs: PREFIX + 'runs',
  bars: PREFIX + 'bars_',
};

var MAX_RUNS = 30;
var MAX_SNAPSHOTS = 200;
var MAX_CONFIGS = 20;
var MAX_WATCHLIST = 50;
var MAX_BARS = 3600;

function storage() {
  if (typeof wx !== 'undefined' && wx && typeof wx.getStorageSync === 'function') return wx;
  return null;
}

function read(key, fallback) {
  var s = storage();
  if (!s) return fallback;
  try {
    var v = s.getStorageSync(key);
    return v === '' || v === undefined || v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

/**
 * 写入；失败时若为容量问题则淘汰旧数据重试一次
 * @returns {{ok:boolean, reason?:string}}
 */
function write(key, value, retry) {
  var s = storage();
  if (!s) return { ok: false, reason: '当前环境不支持本地存储' };
  try {
    s.setStorageSync(key, value);
    return { ok: true };
  } catch (e) {
    if (!retry) {
      // 容量告急：先砍运行记录与快照
      pruneRuns(6);
      pruneSnapshots(60);
      return write(key, value, true);
    }
    return { ok: false, reason: (e && e.message) || '写入失败（可能超出存储上限）' };
  }
}

function remove(key) {
  var s = storage();
  if (!s) return { ok: false };
  try {
    s.removeStorageSync(key);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e && e.message) || '删除失败' };
  }
}

/* ------------------------------ settings ------------------------------ */

function defaultSettings() {
  return {
    redUp: true,
    execution: 'next_close',
    capital: 100000,
    fee: 0.0003,
    slip: 0.0005,
    dataDays: 1600,
  };
}

function getSettings() {
  var raw = read(KEYS.settings, null);
  var base = defaultSettings();
  if (!raw || typeof raw !== 'object') return base;
  return {
    redUp: raw.redUp !== false,
    execution: raw.execution === 'next_open' ? 'next_open' : 'next_close',
    capital: isPos(raw.capital) ? Number(raw.capital) : base.capital,
    fee: isNonNeg(raw.fee) ? Number(raw.fee) : base.fee,
    slip: isNonNeg(raw.slip) ? Number(raw.slip) : base.slip,
    dataDays: isPos(raw.dataDays) ? Math.min(MAX_BARS, Math.max(300, Number(raw.dataDays))) : base.dataDays,
  };
}

function saveSettings(patch) {
  var next = getSettings();
  if (patch) {
    for (var k in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, k)) next[k] = patch[k];
    }
  }
  return write(KEYS.settings, next);
}

function isPos(v) {
  var n = Number(v);
  return Number.isFinite(n) && n > 0;
}

function isNonNeg(v) {
  var n = Number(v);
  return Number.isFinite(n) && n >= 0;
}

/* ------------------------------ watchlist ----------------------------- */

function getWatchlist() {
  var raw = read(KEYS.watchlist, null);
  if (!Array.isArray(raw) || !raw.length) {
    return [{ symbol: catalog.DEFAULT_SYMBOL_ID, group: '默认' }];
  }
  var out = [];
  for (var i = 0; i < raw.length; i++) {
    var it = raw[i];
    if (!it || !catalog.getSymbol(it.symbol)) continue;
    if (out.some(function (x) { return x.symbol === it.symbol; })) continue;
    out.push({ symbol: it.symbol, group: String(it.group || '默认') });
  }
  return out.length ? out.slice(0, MAX_WATCHLIST) : [{ symbol: catalog.DEFAULT_SYMBOL_ID, group: '默认' }];
}

function saveWatchlist(list) {
  var out = [];
  var seen = {};
  (list || []).forEach(function (it) {
    if (!it || !catalog.getSymbol(it.symbol) || seen[it.symbol]) return;
    seen[it.symbol] = true;
    out.push({ symbol: it.symbol, group: String(it.group || '默认') });
  });
  if (out.length > MAX_WATCHLIST) out = out.slice(0, MAX_WATCHLIST);
  return write(KEYS.watchlist, out);
}

function addWatch(symbol, group) {
  if (!catalog.getSymbol(symbol)) return { ok: false, reason: '未收录的标的' };
  var list = getWatchlist();
  if (list.some(function (x) { return x.symbol === symbol; })) return { ok: true, existed: true };
  list.push({ symbol: symbol, group: String(group || '默认') });
  return saveWatchlist(list);
}

function removeWatch(symbol) {
  var list = getWatchlist().filter(function (x) { return x.symbol !== symbol; });
  if (!list.length) list = [{ symbol: catalog.DEFAULT_SYMBOL_ID, group: '默认' }];
  return saveWatchlist(list);
}

/* ------------------------------ 参数版本 ------------------------------ */

function getConfigs(strategyId) {
  var all = read(KEYS.configs, null) || {};
  var list = all[strategyId];
  if (!Array.isArray(list) || !list.length) {
    var first = makeVersion(strategyId, catalog.DEFAULT_CONFIG, [catalog.DEFAULT_SYMBOL_ID], '内置默认参数（notebook 沪深300）', 1);
    all[strategyId] = [first];
    write(KEYS.configs, all);
    setActiveConfig(strategyId, first.version);
    return [first];
  }
  return list;
}

function makeVersion(strategyId, params, symbols, note, seq) {
  return {
    strategyId: strategyId,
    version: 'cfg-' + String(seq).padStart(3, '0'),
    params: {
      kind: params.kind,
      n: params.n,
      m: params.m,
      up: params.up,
      dn: params.dn,
      overrides: params.overrides || {},
    },
    symbols: (symbols || []).slice(),
    note: note || '',
    createdAt: new Date().toISOString(),
  };
}

function nextSeq(list) {
  var max = 0;
  for (var i = 0; i < list.length; i++) {
    var m = /^cfg-(\d+)$/.exec(list[i].version || '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

/** 新增一个参数版本（永不覆盖旧版本） */
function saveConfig(strategyId, params, symbols, note) {
  var all = read(KEYS.configs, null) || {};
  var list = getConfigs(strategyId).slice();
  var version = makeVersion(strategyId, params, symbols, note, nextSeq(list));
  list.push(version);
  if (list.length > MAX_CONFIGS) list = list.slice(list.length - MAX_CONFIGS);
  all[strategyId] = list;
  var r = write(KEYS.configs, all);
  if (r.ok) setActiveConfig(strategyId, version.version);
  return { ok: r.ok, reason: r.reason, version: version };
}

function getActiveConfigVersion(strategyId) {
  var all = read(KEYS.activeCfg, null) || {};
  return all[strategyId] || '';
}

function setActiveConfig(strategyId, version) {
  var all = read(KEYS.activeCfg, null) || {};
  all[strategyId] = version;
  return write(KEYS.activeCfg, all);
}

function getActiveConfig(strategyId) {
  var list = getConfigs(strategyId);
  var v = getActiveConfigVersion(strategyId);
  for (var i = 0; i < list.length; i++) {
    if (list[i].version === v) return list[i];
  }
  return list[list.length - 1];
}

function getConfigByVersion(strategyId, version) {
  var list = getConfigs(strategyId);
  for (var i = 0; i < list.length; i++) {
    if (list[i].version === version) return list[i];
  }
  return null;
}

/* ------------------------------ 信号快照 ------------------------------ */

function snapshotKey(strategyId, configVersion, signalDate) {
  return strategyId + '|' + configVersion + '|' + signalDate;
}

function getSnapshots() {
  return read(KEYS.snapshots, null) || {};
}

/**
 * 保存快照；默认不覆盖已有快照（历史不可变）
 * @returns {{ok:boolean, existed?:boolean, reason?:string}}
 */
function saveSnapshot(snapshot, opts) {
  if (!snapshot || !snapshot.signalDate) return { ok: false, reason: '快照缺少信号日期' };
  var all = getSnapshots();
  var key = snapshotKey(snapshot.strategyId, snapshot.configVersion, snapshot.signalDate);
  var overwrite = !!(opts && opts.overwrite);
  if (all[key] && !overwrite) return { ok: true, existed: true, key: key };
  all[key] = snapshot;
  var keys = Object.keys(all);
  if (keys.length > MAX_SNAPSHOTS) {
    keys.sort(function (a, b) {
      var ta = all[a].computedAt || '';
      var tb = all[b].computedAt || '';
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });
    for (var i = 0; i < keys.length - MAX_SNAPSHOTS; i++) delete all[keys[i]];
  }
  var r = write(KEYS.snapshots, all);
  return { ok: r.ok, reason: r.reason, key: key };
}

function getSnapshot(strategyId, configVersion, signalDate) {
  var all = getSnapshots();
  return all[snapshotKey(strategyId, configVersion, signalDate)] || null;
}

function listSnapshotsFor(strategyId) {
  var all = getSnapshots();
  var out = [];
  Object.keys(all).forEach(function (k) {
    if (all[k] && all[k].strategyId === strategyId) out.push(all[k]);
  });
  out.sort(function (a, b) {
    return (a.signalDate || '') < (b.signalDate || '') ? 1 : -1;
  });
  return out;
}

function pruneSnapshots(keep) {
  var all = getSnapshots();
  var keys = Object.keys(all);
  var limit = typeof keep === 'number' ? keep : MAX_SNAPSHOTS;
  if (keys.length <= limit) return { ok: true };
  keys.sort(function (a, b) {
    return (all[a].computedAt || '') < (all[b].computedAt || '') ? -1 : 1;
  });
  for (var i = 0; i < keys.length - limit; i++) delete all[keys[i]];
  return write(KEYS.snapshots, all);
}

/* ------------------------------ 回测运行 ------------------------------ */

function getRuns() {
  var raw = read(KEYS.runs, null);
  return Array.isArray(raw) ? raw : [];
}

/** 降采样，控制单条运行的体积 */
function downsample(arr, maxPoints) {
  if (!Array.isArray(arr) || arr.length <= maxPoints) return arr || [];
  var out = [];
  var step = arr.length / maxPoints;
  for (var i = 0; i < maxPoints; i++) {
    out.push(arr[Math.min(arr.length - 1, Math.floor(i * step))]);
  }
  return out;
}

/**
 * 保存一次回测（不可变；超过上限淘汰最旧）
 * @param {Object} run
 * @returns {{ok:boolean, runId?:string, reason?:string}}
 */
function saveRun(run) {
  if (!run || !run.metrics) return { ok: false, reason: '回测结果不完整' };
  var runs = getRuns().slice();
  var runId = run.runId || ('run-' + Date.now().toString(36));
  var compact = {
    runId: runId,
    createdAt: run.createdAt || new Date().toISOString(),
    strategyId: run.strategyId || 'rsrs',
    configVersion: run.configVersion || '',
    codeVersion: run.codeVersion || 'rsrs-improved-v1',
    params: run.params || {},
    paramsBySymbol: run.paramsBySymbol || {},
    symbols: run.symbols || [],
    symbol: run.symbol || '',
    symbolName: run.symbolName || '',
    start: run.start,
    end: run.end,
    execution: run.execution || 'next_close',
    cost: run.cost || { fee: 0, slip: 0 },
    metrics: run.metrics,
    nbMetrics: run.nbMetrics || {},
    quality: run.quality || {},
    status: run.status || 'success',
    log: run.log || '',
    dates: downsample(run.dates, 400),
    equity: downsample(run.equity, 400),
    benchmark: downsample(run.benchmark, 400),
    drawdown: downsample(run.drawdown, 400),
    trades: (run.trades || []).slice(0, 200),
  };
  runs.push(compact);
  if (runs.length > MAX_RUNS) runs = runs.slice(runs.length - MAX_RUNS);
  var r = write(KEYS.runs, runs);
  return { ok: r.ok, reason: r.reason, runId: runId };
}

function getRun(runId) {
  var runs = getRuns();
  for (var i = 0; i < runs.length; i++) {
    if (runs[i].runId === runId) return runs[i];
  }
  return null;
}

function pruneRuns(keep) {
  var runs = getRuns();
  var limit = typeof keep === 'number' ? keep : MAX_RUNS;
  if (runs.length <= limit) return { ok: true };
  return write(KEYS.runs, runs.slice(runs.length - limit));
}

function deleteRun(runId) {
  var runs = getRuns().filter(function (r) { return r.runId !== runId; });
  return write(KEYS.runs, runs);
}

/* ------------------------------ 行情缓存 ------------------------------ */

function barsKey(symbol) {
  return KEYS.bars + symbol;
}

function getBarsCache(symbol) {
  var raw = read(barsKey(symbol), null);
  if (!raw || !Array.isArray(raw.bars) || !raw.bars.length) return null;
  return raw;
}

function saveBarsCache(symbol, payload) {
  var bars = Array.isArray(payload.bars) ? payload.bars.slice(-MAX_BARS) : [];
  return write(barsKey(symbol), {
    fetchedAt: payload.fetchedAt || new Date().toISOString(),
    asOf: payload.asOf || '',
    source: payload.source || '',
    bars: bars,
  });
}

/** 缓存是否新鲜（默认 12 小时内） */
function isCacheFresh(cache, hours) {
  if (!cache || !cache.fetchedAt) return false;
  var t = new Date(cache.fetchedAt).getTime();
  if (!Number.isFinite(t)) return false;
  var h = typeof hours === 'number' ? hours : 12;
  return Date.now() - t < h * 3600 * 1000;
}

/* ------------------------------ 清理 ------------------------------ */

function clearAll() {
  var s = storage();
  if (!s) return { ok: false };
  try {
    var info = s.getStorageInfoSync ? s.getStorageInfoSync() : { keys: [] };
    (info.keys || []).forEach(function (k) {
      if (k.indexOf(PREFIX) === 0) s.removeStorageSync(k);
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e && e.message) || '清理失败' };
  }
}

function usage() {
  var s = storage();
  if (!s || !s.getStorageInfoSync) return { keys: 0, sizeKB: 0, limitKB: 10240 };
  try {
    var info = s.getStorageInfoSync();
    var keys = (info.keys || []).filter(function (k) { return k.indexOf(PREFIX) === 0; });
    return { keys: keys.length, sizeKB: info.currentSize || 0, limitKB: info.limitSize || 10240 };
  } catch (e) {
    return { keys: 0, sizeKB: 0, limitKB: 10240 };
  }
}

module.exports = {
  KEYS: KEYS,
  MAX_RUNS: MAX_RUNS,
  MAX_SNAPSHOTS: MAX_SNAPSHOTS,
  MAX_CONFIGS: MAX_CONFIGS,
  defaultSettings: defaultSettings,
  getSettings: getSettings,
  saveSettings: saveSettings,
  getWatchlist: getWatchlist,
  saveWatchlist: saveWatchlist,
  addWatch: addWatch,
  removeWatch: removeWatch,
  getConfigs: getConfigs,
  saveConfig: saveConfig,
  getActiveConfig: getActiveConfig,
  getActiveConfigVersion: getActiveConfigVersion,
  setActiveConfig: setActiveConfig,
  getConfigByVersion: getConfigByVersion,
  saveSnapshot: saveSnapshot,
  getSnapshot: getSnapshot,
  listSnapshotsFor: listSnapshotsFor,
  pruneSnapshots: pruneSnapshots,
  getRuns: getRuns,
  saveRun: saveRun,
  getRun: getRun,
  pruneRuns: pruneRuns,
  deleteRun: deleteRun,
  getBarsCache: getBarsCache,
  saveBarsCache: saveBarsCache,
  isCacheFresh: isCacheFresh,
  clearAll: clearAll,
  usage: usage,
  snapshotKey: snapshotKey,
};
