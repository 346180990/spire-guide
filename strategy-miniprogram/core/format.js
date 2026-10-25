/**
 * 展示格式化 —— 三个时间、涨跌色、状态标签
 */

'use strict';

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 百分比，默认 2 位；null/NaN 显示破折号，绝不显示 0 */
function fmtPct(v, digits) {
  if (!isNum(v)) return '—';
  var d = typeof digits === 'number' ? digits : 2;
  var s = (v * 100).toFixed(d);
  return (v > 0 ? '+' : '') + s + '%';
}

/** 不带正负号的百分比（用于阈值、分位等） */
function fmtPctPlain(v, digits) {
  if (!isNum(v)) return '—';
  var d = typeof digits === 'number' ? digits : 2;
  return (v * 100).toFixed(d) + '%';
}

function fmtNum(v, digits) {
  if (!isNum(v)) return '—';
  var d = typeof digits === 'number' ? digits : 2;
  return v.toFixed(d);
}

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

/** 'YYYY-MM-DD' → 'MM-DD' */
function fmtDate(dateStr) {
  if (!dateStr) return '—';
  var s = String(dateStr);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(5, 10);
  return s;
}

/** ISO / 时间戳 → 'MM-DD HH:mm' */
function fmtDateTime(iso) {
  if (!iso) return '—';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

var ACTION_META = {
  buy: { label: '买入', tone: 'up' },
  sell: { label: '卖出', tone: 'down' },
  hold: { label: '持有', tone: 'info' },
  wait: { label: '观望', tone: 'muted' },
  unavailable: { label: '不可用', tone: 'danger' },
};

var STATUS_META = {
  ok: { label: '数据正常', tone: 'ok' },
  stale: { label: '数据延迟', tone: 'warn' },
  insufficient: { label: '数据不足', tone: 'warn' },
  failed: { label: '运行失败', tone: 'danger' },
  ok_old: { label: '历史信号', tone: 'muted' },
};

/**
 * 涨跌方向 → 样式类名
 * settings.redUp === true 时红涨绿跌（默认），false 时绿涨红跌
 */
function toneClass(direction, settings) {
  var redUp = !settings || settings.redUp !== false;
  if (direction === 'up') return redUp ? 'up' : 'down';
  if (direction === 'down') return redUp ? 'down' : 'up';
  return '';
}

/** 数值正负 → 样式类名 */
function valueTone(v, settings) {
  if (!isNum(v) || v === 0) return '';
  return toneClass(v > 0 ? 'up' : 'down', settings);
}

function actionMeta(action) {
  return ACTION_META[action] || ACTION_META.unavailable;
}

function statusMeta(status) {
  return STATUS_META[status] || STATUS_META.failed;
}

/** 结论 → 大标题文案（结论优先展示，spec §5） */
function conclusionTitle(conclusion) {
  var m = {
    buy: '买入信号',
    sell: '卖出信号',
    hold: '继续持有',
    wait: '观望',
    unavailable: '数据不可用',
  };
  return m[conclusion] || '未知';
}

module.exports = {
  fmtPct: fmtPct,
  fmtPctPlain: fmtPctPlain,
  fmtNum: fmtNum,
  fmtDate: fmtDate,
  fmtDateTime: fmtDateTime,
  toneClass: toneClass,
  valueTone: valueTone,
  actionMeta: actionMeta,
  statusMeta: statusMeta,
  conclusionTitle: conclusionTitle,
  ACTION_META: ACTION_META,
  STATUS_META: STATUS_META,
};
