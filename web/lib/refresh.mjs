/**
 * 全量行情刷新 —— 「每天收盘后把 11 个标的数据都拉一遍」
 *
 * 为什么单独做一层：定时任务里的信号计算只覆盖「关注标的」，
 * 而数据页/回测需要的是全部 11 个标的的最新日线。
 * 收盘后（18:00）先跑一遍这里，把磁盘缓存刷成最新，信号计算再直接读缓存，
 * 这样一次抓取、两边受益。
 *
 * 失败是常态（数据源限流、收盘后延迟、断网），所以按标的记录结果，不整体抛错。
 */

import { loadOne } from './bars.mjs';
import { catalog, getSymbol } from './engine.mjs';

const MAX_SYMBOLS = 12;

/**
 * @param {{symbols?:string[], force?:boolean, concurrency?:number, localOnly?:boolean}} [opts]
 * @returns {Promise<{at:string,total:number,okCount:number,failCount:number,results:Array}>}
 */
export async function refreshAllBars(opts = {}) {
  const all = catalog.listSymbols().map((s) => s.id);
  const ids = (Array.isArray(opts.symbols) && opts.symbols.length
    ? opts.symbols.filter((id) => all.indexOf(id) >= 0)
    : all).slice(0, MAX_SYMBOLS);

  const startedAt = new Date().toISOString();
  const results = new Array(ids.length);
  const force = opts.force !== false;
  const localOnly = !!opts.localOnly;
  const concurrency = Math.max(1, Math.min(4, Number(opts.concurrency) || 3));

  let cursor = 0;
  async function worker() {
    while (cursor < ids.length) {
      const idx = cursor++;
      const id = ids[idx];
      const name = (getSymbol(id) || {}).name || id;
      try {
        const r = await loadOne(id, { count: 3600, force, localOnly });
        results[idx] = {
          symbol: id,
          name: name,
          ok: !r.stale && !r.seedUsed,
          stale: !!r.stale,
          seedUsed: !!r.seedUsed,
          asOf: r.asOf || '',
          source: r.source || '',
          count: (r.bars || []).length,
        };
      } catch (e) {
        results[idx] = { symbol: id, name: name, ok: false, error: e.message };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, () => worker()));

  const okCount = results.filter((r) => r && r.ok).length;
  return {
    at: startedAt,
    total: ids.length,
    okCount: okCount,
    failCount: ids.length - okCount,
    results: results.filter(Boolean),
  };
}
