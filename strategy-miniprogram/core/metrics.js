/**
 * 回测指标 —— 两套口径并存
 *
 * 1) 标准口径（spec §4.7 要求的对外展示）：
 *      累计收益 / 年化 / 最大回撤 / 夏普 / 年化波动 / 胜率(按次) / 交易次数
 *      / 平均持仓天数 / 换手率 / 成本占比 / 基准对照
 *
 * 2) Notebook 口径（RSRS改进.ipynb 的 report()，21 项，用于与原实现对照）：
 *      注意其「夏普比率」= (年化 - 0.03) / std(净值)，不是标准夏普；
 *      其「平均盈亏比」= 盈利次数 / 亏损次数，也不是金额比。
 *      这里原样保留，仅在 UI 的「与 Notebook 对照」区展示，并在文案里说明。
 */

'use strict';

var TRADING_DAYS = 244; // notebook 用 244
var RF = 0.03;

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function pct(x, d) {
  if (!isNum(x)) return '—';
  var n = typeof d === 'number' ? d : 2;
  return (x * 100).toFixed(n) + '%';
}

/** 样本标准差 ddof=1 */
function stdSample(values) {
  var arr = values.filter(isNum);
  if (arr.length < 2) return NaN;
  var sum = 0;
  for (var i = 0; i < arr.length; i++) sum += arr[i];
  var mean = sum / arr.length;
  var sq = 0;
  for (var j = 0; j < arr.length; j++) {
    var d = arr[j] - mean;
    sq += d * d;
  }
  return Math.sqrt(sq / (arr.length - 1));
}

function meanOf(values) {
  var arr = values.filter(isNum);
  if (!arr.length) return NaN;
  var s = 0;
  for (var i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

/** 净值序列的最大回撤（正数，如 0.4297 表示 42.97%） */
function maxDrawdown(equity) {
  var peak = -Infinity;
  var mdd = 0;
  for (var i = 0; i < equity.length; i++) {
    var v = equity[i];
    if (!isNum(v)) continue;
    if (v > peak) peak = v;
    if (peak > 0) {
      var dd = v / peak - 1;
      if (dd < mdd) mdd = dd;
    }
  }
  return -mdd;
}

/**
 * 标准口径指标
 * @param {number[]} rets 每期策略收益（已乘持仓）
 * @param {number[]} equity 净值序列（首项 1）
 * @param {number[]} pos 持仓序列
 * @param {number} switchCount 换仓次数
 * @param {number} costTotal 累计成本（占净值比例之和的近似）
 * @param {number[]} benchEquity 基准净值
 */
function standard(rets, equity, pos, switchCount, costTotal, benchEquity) {
  var valid = rets.filter(isNum);
  var n = valid.length;
  var last = equity[equity.length - 1];
  var total = isNum(last) ? last - 1 : NaN;
  var cagr = isNum(last) && last > 0 ? Math.pow(last, TRADING_DAYS / n) - 1 : NaN;
  var sd = stdSample(valid);
  var mu = meanOf(valid);
  var vol = isNum(sd) ? sd * Math.sqrt(TRADING_DAYS) : NaN;
  var sharpe = isNum(sd) && sd > 0 ? ((mu - RF / TRADING_DAYS) / sd) * Math.sqrt(TRADING_DAYS) : NaN;
  var holdDays = 0;
  for (var i = 0; i < pos.length; i++) if (pos[i] === 1) holdDays++;
  var turnovers = switchCount / Math.max(1, n / TRADING_DAYS); // 年均换仓次数

  var benchTotal = NaN;
  var benchCagr = NaN;
  var benchMdd = NaN;
  if (benchEquity && benchEquity.length) {
    // 基准序列的首项可能不是 1（backtest 里 slice 掉了初始值），
    // 必须用「末值 / 首值」才得到这段区间的真实累计，而不是拿末值当累计。
    var b0 = benchEquity[0];
    var bl = b0 > 0 ? benchEquity[benchEquity.length - 1] / b0 : NaN;
    benchTotal = isNum(bl) ? bl - 1 : NaN;
    // 年化统一用策略的有效期数 n，和策略自己保持同一时间口径
    benchCagr = isNum(bl) && bl > 0 ? Math.pow(bl, TRADING_DAYS / Math.max(1, n)) - 1 : NaN;
    benchMdd = maxDrawdown(benchEquity);
  }

  return {
    totalReturn: total,
    cagr: cagr,
    maxDrawdown: maxDrawdown(equity),
    sharpe: sharpe,
    volatility: vol,
    holdDays: holdDays,
    days: n,
    holdRatio: n ? holdDays / n : NaN,
    switches: switchCount,
    turnoverPerYear: turnovers,
    costRatio: isNum(costTotal) ? costTotal : 0,
    benchTotal: benchTotal,
    benchCagr: benchCagr,
    benchMaxDrawdown: benchMdd,
    excessCagr: isNum(cagr) && isNum(benchCagr) ? cagr - benchCagr : NaN,
  };
}

/**
 * Notebook 口径指标（`_cal_risk_indicator` 的逐行等价实现）
 * @param {number[]} rets 策略日收益（已乘持仓）
 * @param {number[]} pos 持仓 0/1
 * @param {number[]} equity 净值
 * @param {number[]} buyIdx 买入下标
 * @param {number[]} sellIdx 卖出下标
 */
function notebook(rets, pos, equity, buyIdx, sellIdx) {
  var first = equity[0];
  var last = equity[equity.length - 1];
  var n = equity.length;
  var annual = first > 0 && last > 0 ? Math.pow(last / first, TRADING_DAYS / n) - 1 : NaN;
  var cumRet = last - 1;
  var mdd = maxDrawdown(equity);
  var sdEquity = stdSample(equity);
  var nbSharpe = isNum(sdEquity) && sdEquity > 0 ? (annual - RF) / sdEquity : NaN;

  var tradeCount = buyIdx.length;
  var holdDays = 0;
  for (var i = 0; i < pos.length; i++) if (pos[i] === 1) holdDays++;
  var meanHold = tradeCount ? holdDays / tradeCount : NaN;

  var winDays = 0;
  var loseDays = 0;
  var sumWin = 0;
  var sumLose = 0;
  for (var j = 0; j < rets.length; j++) {
    var r = rets[j];
    if (!isNum(r)) continue;
    if (r > 0) { winDays++; sumWin += r; }
    else if (r < 0) { loseDays++; sumLose += r; }
  }
  var winRateDay = holdDays ? winDays / holdDays : NaN;
  var avgWinDay = winDays ? sumWin / winDays : NaN;
  var avgLoseDay = loseDays ? sumLose / loseDays : NaN;
  var ratioDay = loseDays ? winDays / loseDays : NaN;

  // 按次：把连续持仓段合并成一笔
  var runs = [];
  var i0 = 0;
  while (i0 < pos.length) {
    if (pos[i0] !== 1) { i0++; continue; }
    var start = i0;
    var sum = 0;
    while (i0 < pos.length && pos[i0] === 1) {
      if (isNum(rets[i0])) sum += rets[i0];
      i0++;
    }
    runs.push({ start: start, end: i0 - 1, ret: sum });
  }

  var winCount = 0;
  var loseCount = 0;
  var sumWinRun = 0;
  var sumLoseRun = 0;
  var maxWinRun = -Infinity;
  var maxLoseRun = Infinity;
  for (var k = 0; k < runs.length; k++) {
    var rr = runs[k].ret;
    if (rr > 0) { winCount++; sumWinRun += rr; }
    else if (rr < 0) { loseCount++; sumLoseRun += rr; }
    if (rr > maxWinRun) maxWinRun = rr;
    if (rr < maxLoseRun) maxLoseRun = rr;
  }
  var runCount = runs.length;
  var winRateTrade = runCount ? winCount / runCount : NaN;
  var avgWinTrade = runCount ? sumWinRun / runCount : NaN;
  var avgLoseTrade = runCount ? sumLoseRun / runCount : NaN;
  var ratioTrade = loseCount ? winCount / loseCount : NaN;

  return {
    '年华收益率': pct(annual),
    '累计收益率': pct(cumRet),
    '夏普比率': isNum(nbSharpe) ? nbSharpe.toFixed(6) : '—',
    '最大回撤': pct(mdd),
    '持仓总天数': holdDays,
    '交易次数': tradeCount,
    '平均持仓天数': isNum(meanHold) ? meanHold.toFixed(4) : '—',
    '获利天数': winDays,
    '亏损天数': loseDays,
    '胜率(按天)': pct(winRateDay),
    '平均盈利率(按天)': pct(avgWinDay),
    '平均亏损率(按天)': pct(avgLoseDay),
    '平均盈亏比(按天)': isNum(ratioDay) ? ratioDay.toFixed(5) : '—',
    '盈利次数': winCount,
    '亏损次数': loseCount,
    '单次最大盈利': pct(runCount ? maxWinRun : NaN),
    '单次最大亏损': pct(runCount ? maxLoseRun : NaN),
    '胜率(按此)': pct(winRateTrade),
    '平均盈利率(按次)': pct(avgWinTrade),
    '平均亏损率(按次)': pct(avgLoseTrade),
    '平均盈亏比(按次)': isNum(ratioTrade) ? ratioTrade.toFixed(5) : '—',
    _runs: runs,
    _annual: annual,
    _mdd: mdd,
  };
}

module.exports = {
  TRADING_DAYS: TRADING_DAYS,
  RF: RF,
  standard: standard,
  notebook: notebook,
  maxDrawdown: maxDrawdown,
  stdSample: stdSample,
  meanOf: meanOf,
  pct: pct,
  isNum: isNum,
};
