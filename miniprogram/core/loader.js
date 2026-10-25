/**
 * 页面共用的编排层 —— 把 store / api / signal / backtest 串起来，
 * 让页面只关心「拿数据 → 渲染」，避免每个页面各写一套取数逻辑。
 */

'use strict';

var store = require('./store');
var api = require('./api');
var signal = require('./signal');
var backtest = require('./backtest');
var catalog = require('./catalog');

var STRATEGY_ID = 'rsrs';
var CODE_VERSION = 'rsrs-improved-v1';

function currentConfig() {
  return store.getActiveConfig(STRATEGY_ID);
}

function watchSymbols() {
  return store.getWatchlist().map(function (x) { return x.symbol; });
}

/**
 * 拉数据并生成快照
 * 计算范围以「关注列表」为准：用户在关注页增删标的，信号立即跟着变；
 * 参数版本里保存的 symbols 只作为历史记录，不覆盖关注列表。
 * @param {{force?:boolean, asOfDate?:string, symbols?:string[]}} opts
 */
function refresh(opts) {
  var o = opts || {};
  var cfg = currentConfig();
  var desired = o.symbols && o.symbols.length ? o.symbols : watchSymbols();
  var valid = [];
  for (var vi = 0; vi < desired.length; vi++) {
    if (catalog.getSymbol(desired[vi]) && valid.indexOf(desired[vi]) < 0) valid.push(desired[vi]);
  }
  var symbols = valid.length ? valid : [catalog.DEFAULT_SYMBOL_ID];

  // 算信号只需要 N+M 再多一点余量，不必拉 3600 根
  var params0 = cfg.params;
  var need = 200;
  for (var si = 0; si < symbols.length; si++) {
    var pv = signal.resolveParams(cfg.params, symbols[si]);
    need = Math.max(need, pv.n + pv.m + 240);
  }
  return api.loadDatasets(symbols, { force: !!o.force, mode: "signal", want: Math.min(3600, need) }).then(function (res) {
    var snap = signal.buildSnapshot({
      datasets: res.datasets,
      config: cfg.params,
      asOfDate: o.asOfDate || '',
      latestDate: res.asOf,
      configVersion: cfg.version,
      strategyId: STRATEGY_ID,
      codeVersion: CODE_VERSION,
    });

    // 快照落盘（同一 配置版本 + 日期 不覆盖）
    var safeDates = snap.availableDates && snap.availableDates.length ? snap.availableDates : [];
    var isLatest = !o.asOfDate || o.asOfDate === res.asOf;
    if (snap.signalDate && (isLatest || safeDates.indexOf(o.asOfDate) >= 0)) {
      store.saveSnapshot(snap);
    }

    return {
      config: cfg,
      configVersion: cfg.version,
      datasets: res.datasets,
      asOf: res.asOf,
      source: res.source,
      fetchedAt: res.fetchedAt,
      fromCache: res.fromCache,
      stale: res.stale || snap.status === 'stale',
      errors: res.errors || [],
      snapshot: snap,
      availableDates: safeDates,
      latestDate: res.asOf,
      seedUsed: !!res.seedUsed,
      dataSource: res.source,
      dataMode: res.mode,
    };
  });
}

/**
 * 跑一次回测并保存
 * @param {Object} input { symbol, start, end, execution, capital, fee, slip }
 */
function runBacktest(input) {
  var cfg = currentConfig();
  var settings = store.getSettings();
  var symbol = input.symbol || (cfg.symbols && cfg.symbols[0]) || catalog.DEFAULT_SYMBOL_ID;
  var params = signal.resolveParams(cfg.params, symbol);
  var execution = input.execution || settings.execution || 'next_close';
  var cost = {
    fee: typeof input.fee === 'number' ? input.fee : settings.fee,
    slip: typeof input.slip === 'number' ? input.slip : settings.slip,
  };

  return api.loadOne(symbol, { mode: "backtest", want: 3600 }).then(function (res) {
    var bars = res.dataset.bars;
    var result;
    try {
      result = backtest.run({
        bars: bars,
        config: params,
        start: input.start,
        end: input.end,
        cost: cost,
        execution: execution,
        align: 'notebook',
      });
    } catch (e) {
      return {
        ok: false,
        reason: (e && e.message) || '回测失败',
        dataAsOf: res.asOf,
      };
    }

    // 用户要求的起点 vs 实际能用的起点（数据长度不够时会被预热吃掉）
    var requestedStart = input.start;
    var dataNote = '';
    // 只有「明显晚于」用户要求的起点才算被数据长度截断；
    // 差几天通常是节假日（如 1 月 1 日 → 首个交易日 1 月 2 日），不该报警
    var gapDays = 0;
    if (requestedStart) {
      var t0 = new Date(requestedStart + 'T00:00:00Z').getTime();
      var t1 = new Date(result.from + 'T00:00:00Z').getTime();
      if (Number.isFinite(t0) && Number.isFinite(t1)) gapDays = Math.round((t1 - t0) / 86400000);
    }
    if (gapDays > 15) {
      dataNote = '实际区间从 ' + result.from + ' 开始：'
        + '行情只取到 ' + res.dataset.bars.length + ' 根，'
        + '而 N+M=' + (params.n + params.m) + ' 根需要用于预热'
        + (res.stale ? '（当前用的是本地缓存，抓取失败）' : '');
    }

    var run = {
      runId: 'run-' + Date.now().toString(36),
      createdAt: new Date().toISOString(),
      strategyId: STRATEGY_ID,
      configVersion: cfg.version,
      codeVersion: CODE_VERSION,
      params: params,
      symbols: [symbol],
      symbol: symbol,
      symbolName: (catalog.getSymbol(symbol) || {}).name || symbol,
      start: result.from,
      end: result.to,
      execution: execution,
      cost: cost,
      capital: typeof input.capital === 'number' ? input.capital : settings.capital,
      metrics: result.metrics,
      dataSource: res.source || "",
      dataSeed: !!res.seedUsed,
      nbMetrics: stripInternal(result.nbMetrics),
      quality: result.quality,
      // 曲线与交易明细必须一起落盘，否则结果页与对比页拿不到数据
      dates: result.dates,
      equity: result.equity,
      benchmark: result.benchmark,
      drawdown: result.drawdown,
      trades: result.trades,
      dataNote: dataNote,
      dataBars: result.quality.barsUsed,
      status: 'success',
      log: '区间 ' + result.from + ' ~ ' + result.to + '，' + result.quality.barsUsed + ' 根日线，预热 ' + result.quality.warmupBars + ' 根',
    };
    var saved = store.saveRun(run);

    return {
      ok: true,
      run: run,
      runId: saved.runId,
      saveOk: saved.ok,
      saveReason: saved.reason,
      result: result,
      dataNote: dataNote,
      dataAsOf: res.asOf,
      stale: res.stale,
      fromCache: res.fromCache,
    };
  });
}

/** nbMetrics 去掉下划线开头的内部字段，避免落盘 */
function stripInternal(nb) {
  var out = {};
  Object.keys(nb || {}).forEach(function (k) {
    if (k.charAt(0) === '_') return;
    out[k] = nb[k];
  });
  return out;
}

/** 参数改动 vs 当前版本的差异描述 */
function diffParams(prev, next) {
  if (!prev) return [];
  var out = [];
  var keys = [
    ['kind', '指标版本'],
    ['n', '回归窗口 N'],
    ['m', '标准化窗口 M'],
    ['up', '开仓阈值'],
    ['dn', '平仓阈值'],
    ['trend', 'MA 趋势过滤'],
    ['maWin', '均线窗口'],
  ];
  keys.forEach(function (p) {
    var a = prev.params ? prev.params[p[0]] : undefined;
    var b = next[p[0]];
    if (String(a) !== String(b)) {
      out.push({ label: p[1], from: a === undefined ? '—' : String(a), to: String(b) });
    }
  });
  return out;
}

module.exports = {
  STRATEGY_ID: STRATEGY_ID,
  CODE_VERSION: CODE_VERSION,
  currentConfig: currentConfig,
  watchSymbols: watchSymbols,
  refresh: refresh,
  runBacktest: runBacktest,
  diffParams: diffParams,
};
