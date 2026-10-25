/**
 * 防守开关 —— 时变夏普（120 日）+ MA200
 *
 * 数据层直接复用 lib/bars.mjs 的缓存/抓取，策略计算复用 core/tsharpe.js，
 * 与 RSRS 完全独立（不改 RSRS 的任何行为）。
 */

import { loadBars, loadOne } from './bars.mjs';
import { getSymbol, tsharpe } from './engine.mjs';

export const DEFENSE_DEFAULTS = {
  window: 120,
  maWin: 200,
  up: 0.3,
  dn: -0.3,
};

export const DEFENSE_SYMBOLS = ['000300', '510300', '510500', '000905', '399006', '511010'];
export const DEFENSE_DEFAULT_SYMBOLS = ['000300', '510300', '510500'];

function configVersion(p) {
  return 'defense-' + p.window + '-' + p.maWin + '-' + p.up + '-' + p.dn;
}

/**
 * 算防守开关快照
 * @param {{symbols?:string[], params?:Object, asOfDate?:string, force?:boolean, localOnly?:boolean}} [o]
 */
export async function computeDefense(o = {}) {
  const v = tsharpe.validate({ ...DEFENSE_DEFAULTS, ...(o.params || {}) });
  if (!v.ok) {
    return { ok: false, reason: Object.values(v.errors).join('；'), errors: v.errors, items: [] };
  }
  const ids = (o.symbols && o.symbols.length ? o.symbols : DEFENSE_DEFAULT_SYMBOLS).slice(0, 12);
  const data = await loadBars(ids, {
    count: 1200,
    force: !!o.force,
    localOnly: !!o.localOnly,
  });

  const items = [];
  for (const ds of data.datasets || []) {
    const sym = getSymbol(ds.symbol) || { name: ds.symbol };
    items.push(tsharpe.analyze({
      symbol: ds.symbol,
      name: sym.name || ds.symbol,
      bars: ds.bars,
      params: v.value,
      asOfDate: o.asOfDate || '',
    }));
  }

  const counts = { hold: 0, wait: 0, unavailable: 0 };
  let dataAsOf = '';
  let latest = null;
  for (const it of items) {
    if (!it.ready) counts.unavailable++;
    else if (it.state === 1) counts.hold++;
    else counts.wait++;
    if (it.date && it.date > dataAsOf) dataAsOf = it.date;
    if (it.lastFlipDate && (!latest || it.lastFlipDate > latest.date)) {
      latest = {
        date: it.lastFlipDate,
        price: it.lastFlipPrice,
        to: it.lastFlip ? it.lastFlip.to : '',
        symbol: it.symbol,
        name: it.name,
      };
    }
  }
  const conclusion = !items.length || counts.unavailable === items.length
    ? 'unavailable'
    : (counts.hold > 0 ? 'hold' : 'wait');

  return {
    ok: true,
    items,
    counts,
    conclusion,
    latestFlip: latest,
    config: v.value,
    configVersion: configVersion(v.value),
    dataAsOf,
    dataSource: data.source || '',
    stale: !!data.stale,
    seedUsed: !!data.seedUsed,
    errors: data.errors || [],
  };
}

/**
 * 跑防守开关回测
 * @param {{symbol:string, config?:Object, start?:string, end?:string, fee?:number, slip?:number, force?:boolean}} o
 */
export async function runDefenseBacktest(o = {}) {
  const symbol = o.symbol || '000300';
  const v = tsharpe.validate({ ...DEFENSE_DEFAULTS, ...(o.config || {}) });
  if (!v.ok) return { ok: false, reason: Object.values(v.errors).join('；') };

  const data = await loadOne(symbol, { count: 6000, force: !!o.force });
  const need = v.value.window + v.value.maWin + 60;
  if (!data.bars || data.bars.length < need) {
    return {
      ok: false,
      reason: '行情只有 ' + (data.bars ? data.bars.length : 0) + ' 根，至少需要 ' + need + ' 根',
    };
  }
  const result = tsharpe.runBacktest({
    bars: data.bars,
    config: v.value,
    start: o.start,
    end: o.end || data.asOf,
    cost: { fee: Number(o.fee) || 0, slip: Number(o.slip) || 0 },
  });
  return {
    ok: true,
    ...result,
    symbol,
    name: (getSymbol(symbol) || {}).name || symbol,
    dataSource: data.source || '',
    stale: !!data.stale,
  };
}
