/**
 * 回测引擎 —— 与 RSRS改进.ipynb 的经济含义一致
 *
 * 信号 T 日盘后生成（使用截至 T 的数据），收益从 T+1 开始计：
 *   execution = 'next_close'（默认，等价于 notebook 的 ret.shift(-1)）
 *       第 t 日收益 = pos[t-1] × (close[t]/close[t-1] - 1)
 *   execution = 'next_open'
 *       第 t 日按开盘成交：建仓日 close[t]/open[t]-1、持仓日 close-to-close、平仓日 open[t]/close[t-1]-1
 *
 * 成本：每次换仓扣 (fee + slip)；费率/滑点按单边计。
 */

'use strict';

var rsrs = require('./rsrs');
var metrics = require('./metrics');

var isNum = metrics.isNum;

/** 二分查找第一个 date >= target 的下标 */
function lowerBound(dates, target) {
  var lo = 0;
  var hi = dates.length;
  while (lo < hi) {
    var mid = (lo + hi) >> 1;
    if (dates[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** 最后一个 date <= target 的下标，找不到返回 -1 */
function upperBound(dates, target) {
  var lo = 0;
  var hi = dates.length;
  while (lo < hi) {
    var mid = (lo + hi) >> 1;
    if (dates[mid] <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/**
 * @param {Object} input
 * @param {Array} input.bars 日线（升序，含 volume）
 * @param {Object} input.config { kind, n, m, up, dn }
 * @param {string} input.start 'YYYY-MM-DD'
 * @param {string} input.end 'YYYY-MM-DD'
 * @param {{fee:number, slip:number}} [input.cost]
 * @param {string} [input.execution] 'next_close' | 'next_open'
 */
function run(input) {
  var bars = rsrs.normalizeBars(input.bars || []);
  var config = input.config || {};
  var kind = config.kind || '标准分RSRS';
  var n = Math.round(Number(config.n));
  var m = Math.round(Number(config.m));
  var up = Number(config.up);
  var dn = isNum(Number(config.dn)) ? Number(config.dn) : -up;
  var fee = input.cost && isNum(input.cost.fee) ? input.cost.fee : 0;
  var slip = input.cost && isNum(input.cost.slip) ? input.cost.slip : 0;
  var execution = input.execution === 'next_open' ? 'next_open' : 'next_close';

  if (!bars.length) throw new Error('没有行情数据');
  if (!(n >= 2) || !(m >= 2)) throw new Error('N / M 非法');
  if (!isNum(up)) throw new Error('开仓阈值非法');
  if (dn > up) throw new Error('平仓阈值不能高于开仓阈值');

  var series = rsrs.computeSeries(bars, { n: n, m: m, align: input.align });
  var values = rsrs.indicatorSeries(series, kind);
  var positioned = rsrs.buildPosition(values, up, dn);
  var pos = positioned.pos;

  // MA 趋势过滤（研究脚本里的「钝化」）：信号为持仓且均线上倾才真的持仓
  var trend = !!config.trend;
  var maWin = Math.round(Number(config.maWin)) || 20;
  if (trend) {
    pos = rsrs.applyTrendFilter(pos, series.closes, maWin);
    var trendBuys = [];
    var trendSells = [];
    for (var q = 1; q < pos.length; q++) {
      if (pos[q] === 1 && pos[q - 1] === 0) trendBuys.push(q);
      else if (pos[q] === 0 && pos[q - 1] === 1) trendSells.push(q);
    }
    positioned = { pos: pos, buys: trendBuys, sells: trendSells };
  }

  var dates = series.dates;
  var from = lowerBound(dates, input.start || dates[series.readyFrom]);
  var to = upperBound(dates, input.end || dates[dates.length - 1]);
  if (from < series.readyFrom) from = series.readyFrom + 1;
  if (to <= from) {
    throw new Error(
      '区间内有效交易日不足：该标的可用 ' + dates.length + ' 根（' + dates[0] + ' 起），' +
      'N+M=' + (n + m) + ' 根需要用于预热，请把开始日期推到 ' + (dates[from] || dates[0]) + ' 之后');
  }

  var cost = fee + slip;
  var rets = [];
  var stratRets = [];
  var equity = [1];
  var benchEquity = [1];
  var switches = 0;
  var costTotal = 0;
  var trades = [];

  var runStart = -1;
  var runSum = 0;

  for (var t = from; t <= to; t++) {
    var closeT = bars[t].close;
    var closePrev = bars[t - 1].close;
    var openT = bars[t].open;
    var pToday = pos[t - 1];
    var pPrev = t - 2 >= 0 ? pos[t - 2] : 0;

    var r = 0;
    if (execution === 'next_open') {
      if (pToday === 1 && pPrev === 0) r = closeT / openT - 1;
      else if (pToday === 1 && pPrev === 1) r = closeT / closePrev - 1;
      else if (pToday === 0 && pPrev === 1) r = openT / closePrev - 1;
      else r = 0;
    } else {
      r = pToday === 1 ? closeT / closePrev - 1 : 0;
    }

    var switched = pToday !== pPrev;
    if (switched) {
      switches++;
      costTotal += cost;
      r -= cost;
    }

    rets.push(closeT / closePrev - 1);
    stratRets.push(r);
    equity.push(equity[equity.length - 1] * (1 + r));
    benchEquity.push(benchEquity[benchEquity.length - 1] * (closeT / closePrev));

    // 交易明细：按持仓段合并
    if (pToday === 1 && runStart < 0) runStart = t;
    if (pToday === 1) runSum = runSum * 1 + 0; // 占位，实际用净值比
    if (pToday === 0 && runStart >= 0) {
      trades.push(buildTrade(bars, runStart, t - 1, values, execution));
      runStart = -1;
    }
  }
  if (runStart >= 0) {
    trades.push(buildTrade(bars, runStart, to, values, execution));
  }

  // 净值序列对齐（去掉首项 1 的对齐差异）
  var eq = equity.slice(1);
  var bench = benchEquity.slice(1);
  var drawdown = [];
  var peak = -Infinity;
  for (var i = 0; i < eq.length; i++) {
    if (eq[i] > peak) peak = eq[i];
    drawdown.push(eq[i] / peak - 1);
  }

  var posInRange = pos.slice(from, to + 1).map(function (v) { return v; });
  var buyIdx = positioned.buys.filter(function (i) { return i >= from && i <= to; });
  var sellIdx = positioned.sells.filter(function (i) { return i >= from && i <= to; });

  var std = metrics.standard(stratRets, eq, posInRange, switches, costTotal, bench);
  var nb = metrics.notebook(stratRets, posInRange, eq, buyIdx, sellIdx);

  // 质量检查
  var gaps = 0;
  for (var g = from; g <= to; g++) {
    var b = bars[g];
    if (!isNum(b.close) || b.close <= 0) gaps++;
  }

  return {
    kind: kind,
    n: n,
    m: m,
    up: up,
    dn: dn,
    trend: trend,
    maWin: trend ? maWin : 0,
    execution: execution,
    fee: fee,
    slip: slip,
    from: dates[from],
    to: dates[to],
    dates: dates.slice(from, to + 1),
    equity: eq,
    benchmark: bench,
    drawdown: drawdown,
    positions: posInRange,
    trades: trades,
    metrics: std,
    nbMetrics: nb,
    quality: {
      barsUsed: to - from + 1,
      missingBars: gaps,
      warmupBars: series.readyFrom + 1,
      costEnabled: cost > 0,
      costTotal: costTotal,
      noLookAhead: true,
    },
    seriesCache: {
      kind: kind,
      readyFrom: series.readyFrom,
      values: values.slice(from, to + 1),
    },
  };
}

/** 单笔交易：从建仓日到平仓日 */
function buildTrade(bars, entryIdx, exitIdx, values, execution) {
  var entryPrice = execution === 'next_open' ? bars[entryIdx].open : bars[entryIdx].close;
  var exitPrice = execution === 'next_open' ? bars[exitIdx + 1] ? bars[exitIdx + 1].open : bars[exitIdx].close : bars[exitIdx].close;
  if (execution === 'next_open' && !bars[exitIdx + 1]) exitPrice = bars[exitIdx].close;
  return {
    entryIdx: entryIdx,
    exitIdx: exitIdx,
    entryDate: bars[entryIdx].date,
    exitDate: bars[exitIdx].date,
    entryPrice: entryPrice,
    exitPrice: exitPrice,
    ret: entryPrice > 0 ? exitPrice / entryPrice - 1 : NaN,
    holdDays: exitIdx - entryIdx + 1,
    signalAtEntry: values[entryIdx - 1],
  };
}

module.exports = {
  run: run,
  lowerBound: lowerBound,
  upperBound: upperBound,
};
