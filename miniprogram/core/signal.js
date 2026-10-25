/**
 * 信号快照 —— 「用截至 D 的数据，D 日盘后能看到什么」
 *
 * 硬约束（spec §4.3 / §6）：
 *   1. 计算只使用 bars 中 date <= asOfDate 的部分，绝不读取其后数据；
 *   2. 结论文字由规则与指标数值生成，不写死；
 *   3. 数据不足时 conclusion = 'unavailable'，绝不退化为「观望」；
 *   4. 三个时间必须齐全：dataAsOf / computedAt / appliesTo。
 *
 * 默认 align='notebook'，与 RSRS改进.ipynb 的实现逐位一致（见 core/rsrs.js）。
 */

'use strict';

var rsrs = require('./rsrs');
var catalog = require('./catalog');

var isNum = function (v) { return typeof v === 'number' && Number.isFinite(v); };

function num(v, digits) {
  if (!isNum(v)) return '—';
  var d = typeof digits === 'number' ? digits : 2;
  return v.toFixed(d);
}

/** 合并全局配置与该标的的覆盖参数 */
function resolveParams(config, symbolId) {
  var base = config || {};
  var ov = (base.overrides && base.overrides[symbolId]) || {};
  var trend = ov.trend === undefined ? !!base.trend : !!ov.trend;
  var maWin = Number(ov.maWin === undefined ? base.maWin : ov.maWin);
  return {
    kind: ov.kind || base.kind || catalog.DEFAULT_CONFIG.kind,
    n: isNum(Number(ov.n)) ? Number(ov.n) : Number(base.n),
    m: isNum(Number(ov.m)) ? Number(ov.m) : Number(base.m),
    up: isNum(Number(ov.up)) ? Number(ov.up) : Number(base.up),
    dn: isNum(Number(ov.dn)) ? Number(ov.dn) : Number(base.dn),
    trend: trend,
    maWin: isNum(maWin) && maWin >= 2 ? Math.round(maWin) : 20,
  };
}

/** 保留 4 位小数，规避浮点尾差（0.30000000000000004） */
function r4(x) {
  if (!isNum(x)) return NaN;
  return Math.round(x * 10000) / 10000;
}

/** 找最后一个 date <= target 的下标；target 为空取最后一根 */
function indexAt(bars, target) {
  if (!bars.length) return -1;
  if (!target) return bars.length - 1;
  var lo = 0;
  var hi = bars.length;
  while (lo < hi) {
    var mid = (lo + hi) >> 1;
    if (String(bars[mid].date || bars[mid][0]) <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/**
 * 分析单个标的
 * @param {Object} input { symbol, name, bars, params, asOfDate }
 */
function analyzeSymbol(input) {
  var bars = rsrs.normalizeBars(input.bars || []);
  var p = input.params;
  var idx = indexAt(bars, input.asOfDate);
  var need = p.n + p.m;
  var item = {
    symbol: input.symbol,
    name: input.name || input.symbol,
    kind: p.kind,
    n: p.n,
    m: p.m,
    up: p.up,
    dn: p.dn,
    trend: !!p.trend,
    maWin: p.trend ? p.maWin : 0,
    action: 'unavailable',
    value: NaN,
    r2: NaN,
    beta: NaN,
    z: NaN,
    holdingBefore: 0,
    bars: bars.length,
    needBars: need,
    dataAsOf: idx >= 0 ? String(bars[idx].date) : '',
    appliesTo: '',
    ready: false,
    reason: '',
  };

  if (idx < 0 || bars.length === 0) {
    item.reason = '没有可用的行情数据';
    return item;
  }
  item.dataAsOf = String(bars[idx].date);

  // 只截取到 asOfDate，物理上排除未来数据
  var slice = bars.slice(0, idx + 1);
  if (slice.length < need) {
    item.reason = '可用行情 ' + slice.length + ' 根，' + p.kind + ' 需要至少 ' + need + ' 根（N=' + p.n + ' + M=' + p.m + '）';
    return item;
  }

  var series;
  try {
    series = rsrs.computeSeries(slice, { n: p.n, m: p.m });
  } catch (e) {
    item.reason = '指标计算失败：' + e.message;
    return item;
  }
  var values = rsrs.indicatorSeries(series, p.kind);
  var v = values[values.length - 1];
  if (!isNum(v)) {
    item.reason = '可用行情不足以完成 ' + p.kind + ' 计算（预热 ' + series.readyFrom + ' 根）';
    return item;
  }

  var raw = rsrs.buildPosition(values, p.up, p.dn);
  var trend = !!p.trend;
  var maWin = Math.round(Number(p.maWin)) || 20;
  var posSeries = trend ? rsrs.applyTrendFilter(raw.pos, series.closes, maWin) : raw.pos;
  var posToday = posSeries[posSeries.length - 1];
  var posPrev = posSeries.length >= 2 ? posSeries[posSeries.length - 2] : 0;
  var holding = posPrev === 1;

  // 连续持仓交易日数（含今天），用于解释「持有」
  var holdingDays = 0;
  if (posToday === 1) {
    for (var hd = posSeries.length - 1; hd >= 0 && posSeries[hd] === 1; hd--) holdingDays++;
  }

  item.value = v;
  item.r2 = series.r2[series.r2.length - 1];
  item.beta = series.beta[series.beta.length - 1];
  item.z = series.z[series.z.length - 1];
  item.trend = trend;
  item.maWin = trend ? maWin : 0;
  item.filterBlocked = trend && raw.pos[raw.pos.length - 1] === 1 && posToday === 0;
  item.holdingBefore = holding;
  item.holdingDays = holdingDays;
  // 这段持仓的起点（切日期时会明显变化，光看天数差一天看不出来）
  item.holdingSince = holdingDays > 0 && slice.length >= holdingDays
    ? String(slice[slice.length - holdingDays].date)
    : '';
  item.up = p.up;
  item.dn = p.dn;
  item.gapToUp = isNum(v) ? r4(v - p.up) : NaN;
  item.gapToDn = isNum(v) ? r4(v - p.dn) : NaN;
  item.ready = true;
  item.appliesTo = idx + 1 < bars.length ? String(bars[idx + 1].date) : '下一交易日';

  // 结论与理由：完全由规则与数值生成（每条都能对上具体阈值）
  var val = num(v, 4);
  var overUp = r4(v - p.up);
  var overDn = r4(v - p.dn);
  var trendText = trend ? '，且 MA' + maWin + ' 上倾' : '';
  var trendHold = trend ? '（MA' + maWin + ' 仍上倾）' : '';

  if (posToday === 1 && posPrev === 0) {
    item.action = 'buy';
    item.reason = '指标 ' + val + ' 高于开仓线 ' + p.up + '（高出 ' + overUp + '）' + trendText
      + '，上一交易日为空仓 → 开仓买入';
  } else if (posToday === 0 && posPrev === 1) {
    item.action = 'sell';
    if (trend && raw.pos[raw.pos.length - 1] === 1) {
      item.reason = '指标 ' + val + ' 仍高于平仓线 ' + p.dn + '，但 MA' + maWin + ' 转为下行（T-1 ≤ T-3）→ 过滤平仓';
    } else {
      item.reason = '指标 ' + val + ' 低于平仓线 ' + p.dn + '（低 ' + r4(-overDn)
        + '），上一交易日持仓 → 平仓卖出';
    }
  } else if (posToday === 1) {
    item.action = 'hold';
    if (v > p.up) {
      item.reason = '指标 ' + val + ' 高于开仓线 ' + p.up
        + '，但上一交易日已在持仓中 → 继续持有' + trendHold
        + (holdingDays > 1 ? '（' + sinceText(item) + '已连续持有 ' + holdingDays + ' 个交易日）' : '');
    } else {
      item.reason = '指标 ' + val + ' 高于平仓线 ' + p.dn + '（高出 ' + overDn
        + '），未触发平仓' + trendHold + ' → 继续持有'
        + (holdingDays > 1 ? '（' + sinceText(item) + '已连续持有 ' + holdingDays + ' 个交易日）' : '');
    }
  } else if (trend && raw.pos[raw.pos.length - 1] === 1 && v > p.up) {
    item.action = 'wait';
    item.reason = '指标 ' + val + ' 高于开仓线 ' + p.up + '（高出 ' + overUp
      + '），但 MA' + maWin + ' 未上倾（T-1 ≤ T-3）→ 过滤为不入场';
  } else {
    item.action = 'wait';
    item.reason = '指标 ' + val + ' 低于开仓线 ' + p.up + '（还差 ' + r4(p.up - v)
      + '），未触发开仓 → 维持空仓';
  }
  return item;
}

/** 持仓起点文案，例如「自 2026-04-28 起，」 */
function sinceText(item) {
  return item.holdingSince ? '自 ' + item.holdingSince + ' 起，' : '';
}

/** 最多列几个标的名字，避免理由过长 */
var MAX_NAMES = 6;

function nameList(list) {
  var out = [];
  for (var i = 0; i < list.length && i < MAX_NAMES; i++) out.push(list[i]);
  if (list.length > MAX_NAMES) out.push('等 ' + list.length + ' 个');
  return out.join('、');
}

/**
 * 汇总理由：不只说「几个持有」，而是说清每个标的为什么是这个结论
 * 形如：2 个维持持有（指标未跌破平仓线 -0.7）：上证50 -0.3147、中证红利 0.3423；3 个观望（未达开仓线 0.7）：…
 */
function buildSummaryReason(items, counts, conclusion) {
  if (conclusion === 'unavailable') {
    return '数据不足，无法计算信号（' + counts.unavailable + '/' + items.length + ' 个标的不可用）';
  }

  var buckets = { buy: [], sell: [], hold: [], wait: [] };
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (buckets[it.action]) {
      buckets[it.action].push((it.name || it.symbol) + ' ' + (isNum(it.value) ? num(it.value, 4) : '—'));
    }
  }

  var parts = [];
  if (buckets.buy.length) {
    parts.push(buckets.buy.length + ' 个触发买入（指标上穿开仓线）：' + nameList(buckets.buy));
  }
  if (buckets.sell.length) {
    parts.push(buckets.sell.length + ' 个触发卖出（指标跌破平仓线）：' + nameList(buckets.sell));
  }
  if (buckets.hold.length) {
    var dns = [];
    for (var h = 0; h < items.length; h++) {
      if (items[h].action === 'hold') dns.push(items[h].dn);
    }
    var dnText = dns.length ? '（指标未跌破平仓线 ' + dns[0] + '）' : '';
    parts.push(buckets.hold.length + ' 个维持持有' + dnText + '：' + nameList(buckets.hold));
  }
  if (buckets.wait.length) {
    var ups = [];
    for (var w = 0; w < items.length; w++) {
      if (items[w].action === 'wait') ups.push(items[w].up);
    }
    var upText = ups.length ? '（指标未达开仓线 ' + ups[0] + '）' : '';
    parts.push(buckets.wait.length + ' 个观望' + upText + '：' + nameList(buckets.wait));
  }
  if (counts.unavailable) {
    parts.push(counts.unavailable + ' 个数据不足');
  }

  var head = { buy: '今天应当买入', sell: '今天应当卖出', hold: '维持持有', wait: '今天空仓观望' }[conclusion] || '';
  return (head ? head + '。' : '') + parts.join('；');
}

/**
 * 汇总多标的快照
 * @param {Object} input
 * @param {Array} input.datasets [{ symbol, name, bars }]
 * @param {Object} input.config
 * @param {string} [input.asOfDate]
 * @param {string} [input.latestDate] 全库最新交易日，用于判定过期
 * @param {string} [input.codeVersion]
 * @param {string} [input.configVersion]
 */
function buildSnapshot(input) {
  var datasets = input.datasets || [];
  var paramsBySymbol = {};
  var items = [];
  for (var i = 0; i < datasets.length; i++) {
    var ds = datasets[i];
    var p = resolveParams(input.config, ds.symbol);
    paramsBySymbol[ds.symbol] = p;
    items.push(analyzeSymbol({
      symbol: ds.symbol,
      name: ds.name,
      bars: ds.bars,
      params: p,
      asOfDate: input.asOfDate,
    }));
  }

  var counts = { buy: 0, sell: 0, hold: 0, wait: 0, unavailable: 0 };
  var dataAsOf = '';
  for (var k = 0; k < items.length; k++) {
    counts[items[k].action]++;
    if (items[k].dataAsOf > dataAsOf) dataAsOf = items[k].dataAsOf;
  }

  var readyCount = items.length - counts.unavailable;
  var status = 'ok';
  if (items.length === 0) status = 'failed';
  else if (readyCount === 0) status = 'insufficient';
  else if (input.latestDate && dataAsOf && dataAsOf < input.latestDate) status = 'stale';

  var conclusion = 'unavailable';
  if (counts.buy > 0) conclusion = 'buy';
  else if (counts.sell > 0) conclusion = 'sell';
  else if (counts.hold > 0) conclusion = 'hold';
  else if (counts.wait > 0) conclusion = 'wait';

  var reason = buildSummaryReason(items, counts, conclusion);

  var appliesTo = '';
  for (var j = 0; j < items.length; j++) {
    if (items[j].appliesTo && items[j].appliesTo !== '下一交易日') {
      appliesTo = items[j].appliesTo;
      break;
    }
  }
  if (!appliesTo) appliesTo = '下一交易日';

  // 去重后的交易日历（用于历史回看的选择器）：取第一个标的的日期序列
  var dates = [];
  if (datasets.length && datasets[0].bars && datasets[0].bars.length) {
    for (var d = 0; d < datasets[0].bars.length; d++) {
      var bar = datasets[0].bars[d];
      dates.push(String(bar.date || bar[0]));
    }
  }

  return {
    strategyId: input.strategyId || 'rsrs',
    strategyName: input.strategyName || 'RSRS 择时',
    codeVersion: input.codeVersion || 'rsrs-improved-v1',
    configVersion: input.configVersion || '',
    signalDate: dataAsOf,
    dataAsOf: dataAsOf,
    computedAt: new Date().toISOString(),
    appliesTo: appliesTo,
    status: status,
    conclusion: conclusion,
    reason: reason,
    counts: counts,
    items: items,
    paramsBySymbol: paramsBySymbol,
    availableDates: dates,
    disclaimer: '模拟信号，不会自动下单',
  };
}

module.exports = {
  resolveParams: resolveParams,
  analyzeSymbol: analyzeSymbol,
  buildSnapshot: buildSnapshot,
  indexAt: indexAt,
};
