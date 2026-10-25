/**
 * 行情数据层 —— 磁盘缓存 → 内置种子 → 线上抓取
 *
 * 与小程序端同一套策略：本地优先，线上兜底。区别只是缓存落在磁盘而不是 wx storage。
 *
 * 抓取逻辑直接复用 strategy-miniprogram/cloudfunctions/market-bars/index.js
 * （东财为主、腾讯 1600 根上限 + 按日期分页拼长历史），保证两端数据口径一致。
 */

import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { PATHS, CONFIG, CLOUDFN_DIR } from './config.mjs';

const require = createRequire(import.meta.url);

/* ---------- 复用云函数抓取逻辑（stub 掉 wx-server-sdk） ---------- */
const Module = require('node:module');
const origLoad = Module._load;
let marketBars = null;
function getFetcher() {
  if (marketBars) return marketBars;
  Module._load = function (req, parent, isMain) {
    if (req === 'wx-server-sdk') return { init() {}, DYNAMIC_CURRENT_ENV: 'web' };
    return origLoad.call(this, req, parent, isMain);
  };
  try {
    marketBars = require(join(CLOUDFN_DIR, 'index.js'));
  } finally {
    Module._load = origLoad;
  }
  return marketBars;
}

/* ---------- 内置种子 ---------- */
let seedData = null;
function getSeed() {
  if (seedData !== null) return seedData;
  try {
    seedData = require(join(PATHS.root, '..', 'strategy-miniprogram', 'core', 'seed.js'));
  } catch (e) {
    seedData = [];
  }
  return seedData;
}
function seedFor(symbol) {
  return getSeed().find((s) => s.symbol === symbol) || null;
}

/* ---------- 磁盘缓存 ---------- */
function ensureDirs() {
  for (const d of [PATHS.data, PATHS.bars, PATHS.runs]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }
}

function cachePath(symbol) {
  return join(PATHS.bars, symbol + '.json');
}

export function readCache(symbol) {
  const p = cachePath(symbol);
  if (!existsSync(p)) return null;
  try {
    const j = JSON.parse(readFileSync(p, 'utf8'));
    if (!j || !Array.isArray(j.bars) || !j.bars.length) return null;
    return j;
  } catch (e) {
    return null;
  }
}

function writeCache(symbol, payload) {
  ensureDirs();
  writeFileSync(cachePath(symbol), JSON.stringify(payload), 'utf8');
}

function ageDays(cache) {
  if (!cache || !cache.fetchedAt) return Infinity;
  return (Date.now() - new Date(cache.fetchedAt).getTime()) / 86400000;
}

function toObjects(rows) {
  return (rows || []).map((r) => (
    Array.isArray(r)
      ? { date: String(r[0]), open: Number(r[1]), high: Number(r[2]), low: Number(r[3]), close: Number(r[4]), volume: Number(r[5]) }
      : { date: String(r.date), open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close), volume: Number(r.volume) }
  ));
}

/**
 * 加载一组标的
 * @param {string[]} symbols
 * @param {{count?:number, force?:boolean, localOnly?:boolean, ttlDays?:number}} [opts]
 */
export async function loadBars(symbols, opts = {}) {
  ensureDirs();
  const count = Math.max(200, Math.min(6000, Number(opts.count) || 1200));
  const ttl = opts.ttlDays !== undefined ? opts.ttlDays : CONFIG.barsTtlDays;
  const ids = (symbols || []).slice(0, 12);
  const datasets = [];
  const needFetch = [];
  const errors = [];
  const sources = [];
  let asOf = '';
  let stale = false;
  let seedUsed = false;
  let fromCache = false;

  for (const id of ids) {
    const cache = readCache(id);
    const seed = seedFor(id);
    const longEnough = !!cache && cache.bars.length >= count * 0.95;
    const fresh = longEnough && ageDays(cache) <= ttl;

    if (fresh && !opts.force) {
      datasets.push({ symbol: id, bars: toObjects(cache.bars), fromCache: true });
      fromCache = true;
      if (cache.asOf > asOf) asOf = cache.asOf;
      if (!sources.includes(cache.source || '磁盘缓存')) sources.push(cache.source || '磁盘缓存');
      continue;
    }

    // 占位：缓存与种子取根数多的那个
    let picked = null;
    if (cache && seed) picked = cache.bars.length >= seed.bars.length ? { item: cache, kind: 'cache' } : { item: seed, kind: 'seed' };
    else if (cache) picked = { item: cache, kind: 'cache' };
    else if (seed) picked = { item: seed, kind: 'seed' };

    if (picked) {
      datasets.push({
        symbol: id,
        bars: toObjects(picked.item.bars),
        fromCache: picked.kind === 'cache',
        seed: picked.kind === 'seed',
        stale: true,
      });
      if (picked.kind === 'seed') seedUsed = true; else fromCache = true;
      stale = true;
      if (picked.item.asOf > asOf) asOf = picked.item.asOf;
      const label = picked.kind === 'seed' ? '内置样例' : (picked.item.source || '磁盘缓存');
      if (!sources.includes(label)) sources.push(label);
    }
    if (!opts.localOnly) needFetch.push(id);
  }

  if (opts.localOnly || !needFetch.length) {
    return { datasets, asOf, source: sources.join(' / '), stale, seedUsed, fromCache, errors };
  }

  try {
    const res = await getFetcher().main({ symbols: needFetch, count });
    const fetched = {};
    for (const it of res.items || []) {
      fetched[it.symbol] = it;
      writeCache(it.symbol, {
        fetchedAt: res.updatedAt || new Date().toISOString(),
        asOf: it.quality ? it.quality.lastDate : '',
        source: it.quality ? it.quality.source : res.source,
        count,
        bars: it.bars || [],
      });
    }
    for (const e of res.errors || []) errors.push(e);

    const merged = [];
    let mergedAsOf = '';
    let anySeed = false;
    let anyStale = false;
    let anyCache = false;
    for (const id of ids) {
      const it = fetched[id];
      if (it) {
        merged.push({ symbol: id, bars: toObjects(it.bars), fromCache: false, quality: it.quality });
        const last = it.quality ? it.quality.lastDate : '';
        if (last > mergedAsOf) mergedAsOf = last;
        continue;
      }
      const ph = datasets.find((d) => d.symbol === id);
      if (ph) {
        merged.push(ph);
        if (ph.seed) anySeed = true;
        if (ph.stale) anyStale = true;
        if (ph.fromCache) anyCache = true;
      }
    }

    return {
      datasets: merged,
      asOf: mergedAsOf || asOf,
      source: res.source || sources.join(' / '),
      stale: anyStale,
      seedUsed: anySeed,
      fromCache: anyCache,
      errors,
    };
  } catch (e) {
    errors.push(e.message);
    return { datasets, asOf, source: sources.join(' / '), stale: true, seedUsed, fromCache, errors };
  }
}

/** 单标的 */
export async function loadOne(symbol, opts = {}) {
  const r = await loadBars([symbol], opts);
  if (!r.datasets.length) throw new Error('没有 ' + symbol + ' 的行情数据');
  return { ...r, dataset: r.datasets[0], bars: r.datasets[0].bars };
}

/** 缓存概览（给 /api/health 和前端显示） */
export function cacheSummary() {
  ensureDirs();
  const out = [];
  for (const f of readdirSync(PATHS.bars)) {
    if (!f.endsWith('.json')) continue;
    const p = join(PATHS.bars, f);
    try {
      const j = JSON.parse(readFileSync(p, 'utf8'));
      out.push({
        symbol: f.replace(/\.json$/, ''),
        bars: (j.bars || []).length,
        asOf: j.asOf || '',
        source: j.source || '',
        fetchedAt: j.fetchedAt || '',
        ageDays: Number(ageDays(j).toFixed(2)),
        kb: Math.round(statSync(p).size / 1024),
      });
    } catch (e) { /* 跳过坏文件 */ }
  }
  return out.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export function clearCache(symbol) {
  ensureDirs();
  if (symbol) {
    const p = cachePath(symbol);
    if (existsSync(p)) unlinkSync(p);
    return [symbol];
  }
  const removed = [];
  for (const f of readdirSync(PATHS.bars)) {
    if (f.endsWith('.json')) { unlinkSync(join(PATHS.bars, f)); removed.push(f.replace(/\.json$/, '')); }
  }
  return removed;
}

export { getSeed as seedList };
