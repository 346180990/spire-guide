/**
 * 参数校验 —— 所有越界都在字段级报错，不允许静默截断（spec §4.4）
 */

'use strict';

var catalog = require('./catalog');

var LIMITS = {
  n: { min: 5, max: 250, label: '回归窗口 N' },
  m: { min: 20, max: 1500, label: '标准化窗口 M' },
  up: { min: 0.05, max: 5, label: '开仓阈值' },
  dn: { min: -5, max: -0.05, label: '平仓阈值' },
};

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * @param {Object} raw 待校验配置
 * @returns {{ok:boolean, errors:Object, value:Object, warnings:string[]}}
 */
function validateConfig(raw) {
  var errors = {};
  var warnings = [];
  var src = raw || {};

  var kind = src.kind;
  if (!catalog.kindMeta(kind)) {
    errors.kind = '未知的指标版本';
    kind = catalog.DEFAULT_CONFIG.kind;
  }

  function intField(key) {
    var v = Number(src[key]);
    var lim = LIMITS[key];
    if (!isNum(v) || Math.round(v) !== v) {
      errors[key] = lim.label + '必须是整数';
      return catalog.DEFAULT_CONFIG[key];
    }
    if (v < lim.min || v > lim.max) {
      errors[key] = lim.label + '需在 ' + lim.min + ' ~ ' + lim.max + ' 之间';
      return v;
    }
    return v;
  }

  var n = intField('n');
  var m = intField('m');

  var up = Number(src.up);
  if (!isNum(up)) {
    errors.up = '开仓阈值必须是数字';
    up = catalog.DEFAULT_CONFIG.up;
  } else if (up < LIMITS.up.min || up > LIMITS.up.max) {
    errors.up = '开仓阈值需在 ' + LIMITS.up.min + ' ~ ' + LIMITS.up.max + ' 之间';
  }

  var dnRaw = src.dn;
  var dn = Number(dnRaw);
  if (!isNum(dn)) {
    errors.dn = '平仓阈值必须是数字';
    dn = -up;
  } else if (dn < LIMITS.dn.min || dn > LIMITS.dn.max) {
    errors.dn = '平仓阈值需在 ' + LIMITS.dn.min + ' ~ ' + LIMITS.dn.max + ' 之间';
  }

  if (isNum(up) && isNum(dn) && dn >= up) {
    errors.dn = '平仓阈值必须低于开仓阈值，否则信号无法成立';
  }

  // MA 趋势过滤：开关 + 均线窗口
  var trend = src.trend === true || src.trend === 1 || src.trend === '1' || src.trend === 'true';
  var maWin = (src.maWin === undefined || src.maWin === '') ? 20 : Number(src.maWin);
  if (!isNum(maWin) || Math.round(maWin) !== maWin || maWin < 5 || maWin > 120) {
    errors.maWin = '均线窗口需在 5 ~ 120 之间';
    maWin = 20;
  }

  // 数据量提醒：M 越大，需要的预热越长
  if (!errors.m && m > 900) {
    warnings.push('标准化窗口 M=' + m + ' 需要约 ' + (m + n) + ' 个交易日预热，约 ' + Math.ceil((m + n) / 244) + ' 年');
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors: errors,
    warnings: warnings,
    value: { kind: kind, n: n, m: m, up: up, dn: dn, trend: trend, maWin: maWin },
  };
}

/** 校验关注标的集合 */
function validateSymbols(ids) {
  var errors = {};
  if (!Array.isArray(ids) || ids.length === 0) {
    errors.symbols = '至少选择一个标的';
    return { ok: false, errors: errors, value: [] };
  }
  var out = [];
  var unknown = [];
  for (var i = 0; i < ids.length; i++) {
    var s = catalog.getSymbol(ids[i]);
    if (!s) unknown.push(ids[i]);
    else if (out.indexOf(s.id) < 0) out.push(s.id);
  }
  if (unknown.length) errors.symbols = '未收录的标的：' + unknown.join('、');
  if (out.length > 12) errors.symbols = '一次最多 12 个标的';
  return { ok: Object.keys(errors).length === 0, errors: errors, value: out };
}

/** 校验回测区间 */
function validateRange(start, end, earliestDate) {
  var errors = {};
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) errors.start = '开始日期格式应为 YYYY-MM-DD';
  if (!end || !/^\d{4}-\d{2}-\d{2}$/.test(end)) errors.end = '结束日期格式应为 YYYY-MM-DD';
  if (!errors.start && !errors.end) {
    if (start > end) errors.end = '结束日期不能早于开始日期';
    if (earliestDate && start < earliestDate) {
      errors.start = '开始日期早于可用数据起点 ' + earliestDate;
    }
  }
  return { ok: Object.keys(errors).length === 0, errors: errors };
}

/** 校验资金/费率等 */
function validateMoney(input) {
  var errors = {};
  var capital = Number(input && input.capital);
  if (!isNum(capital) || capital <= 0 || capital > 1e10) errors.capital = '初始资金必须是正数';
  var fee = Number(input && input.fee);
  if (!isNum(fee) || fee < 0 || fee > 0.02) errors.fee = '手续费需在 0 ~ 2% 之间';
  var slip = Number(input && input.slip);
  if (!isNum(slip) || slip < 0 || slip > 0.02) errors.slip = '滑点需在 0 ~ 2% 之间';
  return { ok: Object.keys(errors).length === 0, errors: errors };
}

module.exports = {
  LIMITS: LIMITS,
  validateConfig: validateConfig,
  validateSymbols: validateSymbols,
  validateRange: validateRange,
  validateMoney: validateMoney,
};
