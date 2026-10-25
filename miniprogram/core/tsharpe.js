/**
 * 防守开关：时变夏普（120 日）+ MA200
 *
 * 规则（T 日收盘算、T+1 才生效）：
 *   1. 120 日滚动夏普 > 0.3 且 收盘 > 200 日均线  → 持有
 *   2. 120 日滚动夏普 < -0.3 或 收盘 < 200 日均线 → 空仓
 *   3. 介于两者之间 → 维持上一状态
 *
 * 夏普口径：日收益均值 / 日收益标准差 × √244（不扣无风险利率，
 * 与研报的「时变夏普」一致；阈值 0.3 是研报的经验值）。
 *
 * 这是纯函数模块，不依赖 wx，Web 与小程序都能直接 require。
 */

'use strict';

var rsrs = require('./rsrs');
var metrics = require('./metrics');

var TD = 244;

var DEFAULTS = {
  window: 120,
  maWin: 200,
  up: 0.3,
  dn: -0.3,
};

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function num(v, d) {
  return isNum(v) ? Number(v).toFixed(d === undefined ? 2 : d) : '—';
}

function pct(v, d) {
  return isNum(v) ? (v * 100).toFixed(d === undefined ? 1 : d) + '%' : '—';
}

/** 参数校验：越界不静默截断 */
function validate(raw) {
  var src = raw || {};
  var out = {};
  var errors = {};

  var window = src.window === undefined || src.window === '' ? DEFAULTS.window : Number(src.window);
  if (!isNum(window) || Math.round(window) !== window || window < 20 || window > 250) {
    errors.window = '夏普窗口需为 20 ~ 250 的整数';
  } else {
    out.window = window;
  }

  var maWin = src.maWin === undefined || src.maWin === '' ? DEFAULTS.maWin : Number(src.maWin);
  if (!isNum(maWin) || Math.round(maWin) !== maWin || maWin < 50 || maWin > 500) {
    errors.maWin = '均线窗口需为 50 ~ 500 的整数';
  } else {
    out.maWin = maWin;
  }

  var up = src.up === undefined || src.up === '' ? DEFAULTS.up : Number(src.up);
  if (!isNum(up) || up < 0 || up > 3) {
    errors.up = '开仓阈值需在 0 ~ 3 之间';
  } else {
    out.up = up;
  }

  var dn = src.dn === undefined || src.dn === '' ? DEFAULTS.dn : Number(src.dn);
  if (!isNum(dn) || dn < -3 || dn > 0) {
    errors.dn = '平仓阈值需在 -3 ~ 0 之间';
  } else {
    out.dn = dn;
  }
  if (!errors.up && !errors.dn && dn >= up) {
    errors.dn = '平仓阈值必须低于开仓阈值';
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors: errors,
    value: {
      window: out.window === undefined ? DEFAULTS.window : out.window,
      maWin: out.maWin === undefined ? DEFAULTS.maWin : out.maWin,
      up: out.up === undefined ? DEFAULTS.up : out.up,
      dn: out.dn === undefined ? DEFAULTS.dn : out.dn,
    },
  };
}

/**
 * 计算夏普与均线序列
 * @param {Array} bars 日线（升序）
 * @param {{window?:number, maWin?:number}} [opts]
 * @returns {{dates:string[], closes:number[], rets:number[], ts:number[], ma:number[], readyFrom:number, window:number, maWin:number}}
 */
function computeSeries(bars, opts) {
  var o = opts || {};
  var window = Math.round(Number(o.window)) || DEFAULTS.window;
  var maWin = Math.round(Number(o.maWin)) || DEFAULTS.maWin;
  var rows = rsrs.normalizeBars(bars || []);
  var len = rows.length;
  var dates = new Array(len);
  var closes = new Array(len);
  var rets = new Array(len).fill(NaN);
  for (var i = 0; i < len; i++) {
    dates[i] = rows[i].date;
    closes[i] = rows[i].close;
  }
  for (var k = 1; k < len; k++) rets[k] = closes[k] / closes[k - 1] - 1;

  var ts = new Array(len).fill(NaN);
  for (var j = window; j < len; j++) {
    var sum = 0;
    var ok = true;
    for (var a = j - window + 1; a <= j; a++) {
      if (!isNum(rets[a])) { ok = false; break; }
      sum += rets[a];
    }
    if (!ok) continue;
    var mean = sum / window;
    var sq = 0;
    for (var b = j - window + 1; b <= j; b++) sq += (rets[b] - mean) * (rets[b] - mean);
    var sd = Math.sqrt(sq / (window - 1));
    if (sd > 1e-12) ts[j] = (mean / sd) * Math.sqrt(TD);
  }

  var ma = rsrs._internal.rollingMean(closes, maWin);
  return {
    dates: dates,
    closes: closes,
    rets: rets,
    ts: ts,
    ma: ma,
    window: window,
    maWin: maWin,
    readyFrom: Math.max(window, maWin - 1),
  };
}

/**
 * 状态机：双条件持有，任一破坏离场，中间维持
 * @returns {{pos:number[], entered:boolean[], exited:boolean[]}}
 */
function buildPosition(ts, ma, closes, opts) {
  var o = opts || {};
  var up = isNum(Number(o.up)) ? Number(o.up) : DEFAULTS.up;
  var dn = isNum(Number(o.dn)) ? Number(o.dn) : DEFAULTS.dn;
  var len = ts.length;
  var pos = new Array(len).fill(0);
  var entered = new Array(len).fill(false);
  var exited = new Array(len).fill(false);
  var hold = 0;
  for (var i = 0; i < len; i++) {
    if (!isNum(ts[i]) || !isNum(ma[i]) || !isNum(closes[i])) {
      hold = 0;
      pos[i] = 0;
      continue;
    }
    var next;
    if (ts[i] > up && closes[i] > ma[i]) next = 1;
    else if (ts[i] < dn || closes[i] < ma[i]) next = 0;
    else next = hold;
    if (next === 1 && hold === 0) entered[i] = true;
    if (next === 0 && hold === 1) exited[i] = true;
    hold = next;
    pos[i] = hold;
  }
  return { pos: pos, entered: entered, exited: exited };
}

/** 最后一个 date <= target 的下标 */
function indexAt(dates, target) {
  if (!dates.length) return -1;
  if (!target) return dates.length - 1;
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
 * 单标的快照：截至 asOfDate 的状态、上次翻仓、理由
 */
function analyze(input) {
  var bars = input.bars || [];
  var p = input.params || {};
  var series = computeSeries(bars, p);
  var idx = indexAt(series.dates, input.asOfDate);
  var item = {
    symbol: input.symbol,
    name: input.name || input.symbol,
    date: '',
    close: NaN,
    ma200: NaN,
    maGap: NaN,
    tsharpe: NaN,
    state: 0,
    action: 'unavailable',
    lastFlip: null,
    lastFlipDate: '',
    lastFlipPrice: NaN,
    bars: bars.length,
    needBars: Math.max(series.window + 1, series.maWin),
    ready: false,
    reason: '',
  };
  if (idx < 0 || !bars.length) {
    item.reason = '没有可用的行情数据';
    return item;
  }
  item.date = series.dates[idx];
  if (idx + 1 < series.needBars) {
    item.reason = '可用行情 ' + (idx + 1) + ' 根，需要至少 ' + series.needBars + ' 根（夏普 ' + series.window + ' + 均线 ' + series.maWin + '）';
    return item;
  }
  if (!isNum(series.ts[idx]) || !isNum(series.ma[idx])) {
    item.reason = '指标尚未预热完成';
    return item;
  }

  var built = buildPosition(series.ts, series.ma, series.closes, p);
  var pos = built.pos;

  // 上次翻仓（含方向、价格）
  for (var i = idx; i >= 1; i--) {
    if (pos[i] !== pos[i - 1]) {
      item.lastFlip = {
        date: series.dates[i],
        price: series.closes[i],
        to: pos[i] === 1 ? 'hold' : 'wait',
      };
      break;
    }
  }
  if (item.lastFlip) {
    item.lastFlipDate = item.lastFlip.date;
    item.lastFlipPrice = item.lastFlip.price;
  }

  item.close = series.closes[idx];
  item.ma200 = series.ma[idx];
  item.maGap = item.close / item.ma200 - 1;
  item.tsharpe = series.ts[idx];
  item.state = pos[idx];
  item.ready = true;
  var prev = idx >= 1 ? pos[idx - 1] : 0;
  if (pos[idx] === 1 && prev === 0) item.action = 'buy';
  else if (pos[idx] === 0 && prev === 1) item.action = 'sell';
  else item.action = pos[idx] === 1 ? 'hold' : 'wait';

  var tsText = num(item.tsharpe, 2);
  var gapText = pct(item.maGap, 1);
  if (item.action === 'buy') {
    item.reason = '时变夏普 ' + tsText + ' > ' + p.up + '，且收盘高于 MA' + series.maWin + ' ' + gapText
      + ' → 开仓持有';
  } else if (item.action === 'sell') {
    item.reason = '时变夏普 ' + tsText + ' 或收盘相对 MA' + series.maWin + ' ' + gapText
      + ' 不再满足双条件 → 平仓空仓';
  } else if (pos[idx] === 1) {
    item.reason = '时变夏普 ' + tsText + ' > ' + p.up + '，收盘高于 MA' + series.maWin + ' ' + gapText
      + ' → 继续持有';
  } else {
    if (item.tsharpe < p.dn) {
      item.reason = '时变夏普 ' + tsText + ' < ' + p.dn + ' → 空仓';
    } else if (item.close < item.ma200) {
      item.reason = '收盘低于 MA' + series.maWin + ' ' + gapText + ' → 空仓';
    } else {
      item.reason = '时变夏普 ' + tsText + ' 在 ' + p.dn + ' ~ ' + p.up
        + ' 之间，且收盘高于 MA' + series.maWin + ' → 维持空仓';
    }
  }
  return item;
}

/**
 * 回测：T 日信号、T+1 收益，成本按单边 fee+slip
 */
function runBacktest(input) {
  var bars = input.bars || [];
  var p = validate(input.config || {}).value;
  var fee = input.cost && isNum(input.cost.fee) ? input.cost.fee : 0;
  var slip = input.cost && isNum(input.cost.slip) ? input.cost.slip : 0;
  var cost = fee + slip;
  if (!bars.length) throw new Error('没有行情数据');

  var series = computeSeries(bars, p);
  var built = buildPosition(series.ts, series.ma, series.closes, p);
  var pos = built.pos;
  var dates = series.dates;

  var from = 0;
  var target = input.start || dates[series.readyFrom];
  while (from < dates.length && dates[from] < target) from++;
  var to = dates.length - 1;
  if (input.end) {
    to = dates.length - 1;
    while (to >= 0 && dates[to] > input.end) to--;
  }
  if (from < series.readyFrom + 1) from = series.readyFrom + 1;
  if (to <= from) throw new Error('区间内有效交易日不足（预热需要 ' + (series.readyFrom + 1) + ' 根）');

  var eq = [1];
  var bench = [1];
  var rets = [];
  var switches = 0;
  var costTotal = 0;
  var prev = pos[from - 1];
  var trades = [];
  var runStart = -1;

  for (var t = from; t <= to; t++) {
    var pToday = pos[t - 1];
    var r = (series.closes[t] / series.closes[t - 1] - 1) * pToday;
    var dp = Math.abs(pToday - prev);
    if (dp > 1e-9) {
      switches++;
      costTotal += cost * dp;
      r -= cost * dp;
    }
    prev = pToday;
    rets.push(r);
    eq.push(eq[eq.length - 1] * (1 + r));
    bench.push(bench[bench.length - 1] * (series.closes[t] / series.closes[t - 1]));
    if (pToday === 1 && runStart < 0) runStart = t;
    if (pToday === 0 && runStart >= 0) {
      trades.push(buildTrade(series, runStart, t - 1));
      runStart = -1;
    }
  }
  if (runStart >= 0) trades.push(buildTrade(series, runStart, to));

  var eqOut = eq.slice(1);
  var benchOut = bench.slice(1);
  var posOut = pos.slice(from, to + 1);
  var std = metrics.standard(rets, eqOut, posOut, switches, costTotal, benchOut);

  return {
    window: p.window,
    maWin: p.maWin,
    up: p.up,
    dn: p.dn,
    fee: fee,
    slip: slip,
    from: dates[from],
    to: dates[to],
    dates: dates.slice(from, to + 1),
    equity: eqOut,
    benchmark: benchOut,
    positions: posOut,
    trades: trades,
    metrics: std,
    quality: {
      barsUsed: to - from + 1,
      warmupBars: series.readyFrom + 1,
      costEnabled: cost > 0,
      costTotal: costTotal,
      noLookAhead: true,
    },
  };
}

function buildTrade(series, entryIdx, exitIdx) {
  var entryPrice = series.closes[entryIdx];
  var exitPrice = series.closes[exitIdx];
  return {
    entryIdx: entryIdx,
    exitIdx: exitIdx,
    entryDate: series.dates[entryIdx],
    exitDate: series.dates[exitIdx],
    entryPrice: entryPrice,
    exitPrice: exitPrice,
    ret: entryPrice > 0 ? exitPrice / entryPrice - 1 : NaN,
    holdDays: exitIdx - entryIdx + 1,
    signalAtEntry: series.ts[entryIdx - 1],
  };
}

module.exports = {
  DEFAULTS: DEFAULTS,
  validate: validate,
  computeSeries: computeSeries,
  buildPosition: buildPosition,
  analyze: analyze,
  runBacktest: runBacktest,
  indexAt: indexAt,
};
