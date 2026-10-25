/**
 * 数据体检 —— 把「策略实际吃到的行情 + 派生出来的指标」摊开给人看
 *
 * 用途：怀疑数据有问题时，不用翻文件、不用跑脚本，网页上点一个标的就能看到：
 *   - 数据从哪来、截至哪天、多少根、缓存是什么时候抓的
 *   - 最近 N 根 K 线（开高低收量）
 *   - 同时刻的指标值（标准分 / 修正 / 右偏）和仓位
 *   - 自动体检：日期是否升序、有没有重复、价格是否非法、有没有异常跳空
 *
 * 只读，不改任何缓存。
 */

import { loadOne } from './bars.mjs';
import { getSymbol, catalog, rsrs } from './engine.mjs';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function ymd(d) {
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function daysBetween(a, b) {
  const t0 = new Date(a + 'T00:00:00Z').getTime();
  const t1 = new Date(b + 'T00:00:00Z').getTime();
  return Math.round((t1 - t0) / 86400000);
}

/** 支持的标的清单（页面左侧列表用） */
export function dataSymbols() {
  return catalog.listSymbols().map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    preset: s.preset,
    presetSource: s.presetSource,
  }));
}

/**
 * 多标的对比（数据库表视角）：一行一个标的，取最新一根
 * @param {string[]} [ids] 不传就全部 11 个
 * @param {{force?:boolean, localOnly?:boolean}} [opts]
 */
export async function inspectOverview(ids, opts = {}) {
  const all = catalog.listSymbols().map((s) => s.id);
  const list = (Array.isArray(ids) && ids.length ? ids.filter((id) => all.indexOf(id) >= 0) : all).slice(0, 12);
  const rows = [];
  for (const id of list) {
    const sym = getSymbol(id) || {};
    const r = await inspectSymbol(id, { count: 900, force: !!opts.force, localOnly: !!opts.localOnly });
    if (!r.ok) {
      rows.push({ ok: false, symbol: id, name: sym.name || id, error: r.error });
      continue;
    }
    const lastBar = r.bars[r.bars.length - 1] || {};
    const lastInd = r.indicators[r.indicators.length - 1] || {};
    rows.push({
      ok: true,
      symbol: r.symbol,
      name: r.name,
      date: r.last,
      close: lastBar.close,
      ret: lastBar.ret,
      z: lastInd.z === undefined ? null : lastInd.z,
      revise: lastInd.revise === undefined ? null : lastInd.revise,
      positive: lastInd.positive === undefined ? null : lastInd.positive,
      pos: lastInd.pos === undefined ? null : lastInd.pos,
      count: r.count,
      need: r.need,
      warmupOk: r.warmupOk,
      source: r.source,
      stale: r.stale,
      ageDays: r.checks.ageDays,
    });
  }
  return rows;
}

/**
 * 体检单个标的
 * @param {string} id 标的代码
 * @param {{count?:number, force?:boolean, localOnly?:boolean}} [opts]
 */
export async function inspectSymbol(id, opts = {}) {
  const sym = getSymbol(id);
  if (!sym) return { ok: false, error: '未收录的标的：' + id };

  const preset = sym.preset || catalog.DEFAULT_CONFIG;
  const need = preset.n + preset.m;
  // 至少要够算指标（N+M 根），不然「指标与仓位」没法看
  const want = Math.max(200, Math.min(3600, opts.force ? 3600 : Math.max(Number(opts.count) || 900, need + 250)));
  let data;
  try {
    data = await loadOne(id, { count: want, force: !!opts.force, localOnly: !!opts.localOnly });
  } catch (e) {
    return { ok: false, error: '拉行情失败：' + e.message };
  }

  const bars = (data.bars || []).slice();
  if (!bars.length) return { ok: false, error: '没有可用行情（缓存为空且无法联网）' };

  // ---- 体检 ----
  let sorted = true;
  let duplicates = 0;
  let badPrices = 0;
  let bigJumps = 0;
  let maxGapDays = 0;
  let maxGapAt = '';
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (!isNum(b.close) || b.close <= 0 || !isNum(b.high) || !isNum(b.low) || b.high < b.low) badPrices++;
    if (i === 0) continue;
    const prev = bars[i - 1];
    if (b.date === prev.date) duplicates++;
    if (b.date < prev.date) sorted = false;
    const gap = daysBetween(prev.date, b.date);
    if (gap > maxGapDays) { maxGapDays = gap; maxGapAt = b.date; }
    if (isNum(b.close) && isNum(prev.close) && prev.close > 0) {
      const r = Math.abs(b.close / prev.close - 1);
      if (r > 0.2) bigJumps++;
    }
  }
  const last = bars[bars.length - 1];
  const first = bars[0];
  const ageDays = daysBetween(last.date, ymd(new Date()));

  // ---- 派生数据：用该标的的预设参数算指标与仓位 ----
  const n = preset.n, m = preset.m;
  let series = null;
  let kind = preset.kind;
  if (bars.length >= n + m) {
    try {
      series = rsrs.computeSeries(bars, { n: n, m: m });
      const values = rsrs.indicatorSeries(series, kind);
      const positioned = rsrs.buildPosition(values, preset.up, preset.dn);
      series._values = values;
      series._pos = positioned.pos;
    } catch (e) {
      series = null;
    }
  }

  const K = 20; // 最近多少根 K 线
  const recentBars = bars.slice(-K).map((b, i, arr) => {
    const idx = bars.length - arr.length + i;
    const prev = idx > 0 ? bars[idx - 1] : null;
    return {
      date: b.date,
      open: isNum(b.open) ? b.open : null,
      high: isNum(b.high) ? b.high : null,
      low: isNum(b.low) ? b.low : null,
      close: isNum(b.close) ? b.close : null,
      volume: isNum(b.volume) ? b.volume : null,
      ret: prev && isNum(prev.close) && prev.close > 0 ? b.close / prev.close - 1 : null,
    };
  });

  const recentInd = [];
  if (series) {
    for (let i = Math.max(0, bars.length - 10); i < bars.length; i++) {
      recentInd.push({
        date: bars[i].date,
        z: isNum(series.z[i]) ? series.z[i] : null,
        revise: isNum(series.revise[i]) ? series.revise[i] : null,
        positive: isNum(series.positive[i]) ? series.positive[i] : null,
        pos: series._pos ? series._pos[i] : null,
      });
    }
  }

  return {
    ok: true,
    symbol: id,
    name: sym.name || id,
    kind: sym.kind || '',
    asOf: data.asOf || last.date,
    source: data.source || '',
    fetchedAt: data.fetchedAt || '',
    stale: !!data.stale,
    seedUsed: !!data.seedUsed,
    count: bars.length,
    first: first.date,
    last: last.date,
    need: need,
    warmupOk: bars.length >= need,
    preset: { kind: kind, n: n, m: m, up: preset.up, dn: preset.dn },
    checks: {
      sorted: sorted,
      duplicates: duplicates,
      badPrices: badPrices,
      bigJumps: bigJumps,
      maxGapDays: maxGapDays,
      maxGapAt: maxGapAt,
      ageDays: ageDays,
    },
    bars: recentBars,
    indicators: recentInd,
  };
}
