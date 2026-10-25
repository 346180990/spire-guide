/**
 * 数据获取 —— 本地优先，线上兜底
 *
 * 取数优先级（每个标的分开判断）：
 *   ① 本地缓存：长度够 + 未过期（回测 7 天 / 信号 12 小时）
 *   ② 内置样例：core/seed.js（构建时快照，冷启动/无网/云函数未部署时可用）
 *   ③ 线上抓取：云函数 market-bars（东财为主、腾讯分页为备）
 *
 * 设计要点：
 *   - 回测优先用本地全量历史，避免每次跑参数都联网（「大量回测」场景）
 *   - 无论走哪一级，都要把真实的数据截至日 asOf 带出来给 UI
 *   - 缓存过期不等于不可用：先当占位符用，联网成功后再替换
 *   - 全部失败时返回已有数据并标 stale，绝不假装是最新
 */

'use strict';

var catalog = require('./catalog');
var store = require('./store');

var FN_NAME = 'market-bars';

/** 缓存有效期（小时）：回测对「最新一根」不敏感，放宽到 7 天 */
var TTL_HOURS = { signal: 12, backtest: 168 };
/** 各模式默认需要的日线根数 */
var WANT_BARS = { signal: 900, backtest: 3600 };
var MAX_WANT = 3600;

var seedData = null;
try {
  seedData = require('./seed');
} catch (e) {
  seedData = null; // 没有种子文件也能正常工作
}

function seedFor(symbol) {
  if (!seedData || !seedData.length) return null;
  for (var i = 0; i < seedData.length; i++) {
    if (seedData[i].symbol === symbol) return seedData[i];
  }
  return null;
}

function hasCloud() {
  return typeof wx !== 'undefined' && wx && wx.cloud && typeof wx.cloud.callFunction === 'function';
}

/**
 * 把云函数/网络错误翻译成能照着做的提示
 */
function explainCloudError(e) {
  var raw = (e && (e.errMsg || e.message)) ? (e.errMsg || e.message) : '云函数调用失败';
  var s = String(raw);

  if (s.indexOf('-501000') >= 0 || /FUNCTION_NOT_FOUND|FunctionName parameter could not be found/i.test(s)) {
    return '云函数 ' + FN_NAME + ' 尚未部署。\n'
      + '打开微信开发者工具 → 左侧文件树右键 cloudfunctions/' + FN_NAME + ' → 「上传并部署：云端安装依赖」，'
      + '等待提示部署成功后重新编译。\n原始错误：' + s.slice(0, 120);
  }
  if (/env|环境/i.test(s) && /(not exist|不存在|-50100)/i.test(s)) {
    return '云环境不匹配：请确认 app.js 里的 CLOUD_ENV 与云开发控制台的环境 ID 一致。\n原始错误：' + s.slice(0, 120);
  }
  if (/401|unauthorized|permission|权限/i.test(s)) {
    return '没有调用权限：确认当前微信号是该小程序的开发者，且云函数已部署到同一环境。\n原始错误：' + s.slice(0, 120);
  }
  if (/timeout|超时|ESOCKETTIMEDOUT/i.test(s)) {
    return '云函数执行超时：首次抓取日线较多，请重试；若反复超时，把云函数超时时间调到 20 秒。\n原始错误：' + s.slice(0, 120);
  }
  return raw;
}

/** 调云函数 */
function callCloud(symbols, count) {
  return new Promise(function (resolve, reject) {
    if (!hasCloud()) {
      reject(new Error('云开发未初始化：请确认 app.js 里 wx.cloud.init 的 env 正确，且当前微信号是开发者'));
      return;
    }
    wx.cloud.callFunction({
      name: FN_NAME,
      data: { symbols: symbols, count: count },
    }).then(function (res) {
      var r = res && res.result;
      if (!r || !r.ok) {
        var msg = r && r.errors && r.errors.length ? r.errors.join('；') : '云函数没有返回数据';
        reject(new Error(msg));
        return;
      }
      resolve(r);
    }).catch(function (e) {
      reject(new Error(explainCloudError(e)));
    });
  });
}

/** [date,o,h,l,c,v] → 对象数组 */
function toBarObjects(rows) {
  var out = [];
  for (var i = 0; i < (rows || []).length; i++) {
    var r = rows[i];
    if (Array.isArray(r)) {
      out.push({ date: String(r[0]), open: Number(r[1]), high: Number(r[2]), low: Number(r[3]), close: Number(r[4]), volume: Number(r[5]) });
    } else if (r && typeof r === 'object') {
      out.push({ date: String(r.date), open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close), volume: Number(r.volume) });
    }
  }
  return out;
}

/** 缓存与种子之间，取根数更多的一个作为占位；同长优先缓存（更新） */
function pickPlaceholder(cache, sd) {
  if (cache && sd) {
    return cache.bars.length >= sd.bars.length ? { item: cache, kind: 'cache' } : { item: sd, kind: 'seed' };
  }
  if (cache) return { item: cache, kind: 'cache' };
  if (sd) return { item: sd, kind: 'seed' };
  return null;
}

/**
 * 加载一组标的的日线
 *
 * @param {string[]} symbols
 * @param {Object} [opts]
 * @param {'signal'|'backtest'} [opts.mode] 决定 TTL 与默认根数
 * @param {number} [opts.want] 需要多少根（覆盖默认值）
 * @param {boolean} [opts.force] 强制联网刷新
 * @param {boolean} [opts.localOnly] 只用本地（缓存或种子），完全不联网
 * @returns {Promise<{datasets:Array, asOf:string, source:string, fetchedAt:string,
 *                    fromCache:boolean, seedUsed:boolean, stale:boolean, errors:string[]}>}
 */
function loadDatasets(symbols, opts) {
  var o = opts || {};
  var mode = o.mode === 'backtest' ? 'backtest' : 'signal';
  var want = Math.max(200, Math.min(MAX_WANT, o.want || WANT_BARS[mode]));
  var ttl = TTL_HOURS[mode];
  var localOnly = !!o.localOnly;
  var ids = (symbols || []).slice(0, 12);

  var datasets = [];
  var errors = [];
  var needFetch = [];
  var asOf = '';
  var fromCache = false;
  var seedUsed = false;
  var stale = false;
  var sources = [];

  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    var sym = catalog.getSymbol(id);
    if (!sym) { errors.push('未收录的标的：' + id); continue; }

    var cache = store.getBarsCache(id);
    var sd = seedFor(id);
    var cacheLongEnough = !!cache && cache.bars.length >= want * 0.95;
    var cacheFresh = cacheLongEnough && store.isCacheFresh(cache, ttl);

    if (!o.force && cacheFresh) {
      datasets.push({
        symbol: id,
        name: sym.name,
        bars: toBarObjects(cache.bars),
        fromCache: true,
        fetchedAt: cache.fetchedAt,
        quality: { source: cache.source },
      });
      fromCache = true;
      if (cache.asOf > asOf) asOf = cache.asOf;
      var csrc = cache.source || '本地缓存';
      if (sources.indexOf(csrc) < 0) sources.push(csrc);
      continue;
    }

    // 本地不满足：先用「缓存/种子」占位，同时记为待联网
    var picked = pickPlaceholder(cache, sd);
    if (picked) {
      var src = picked.kind === 'seed' ? '内置样例' : (picked.item.source || '本地缓存');
      datasets.push({
        symbol: id,
        name: sym.name,
        bars: toBarObjects(picked.item.bars),
        fromCache: picked.kind === 'cache',
        seed: picked.kind === 'seed',
        stale: true,
        fetchedAt: picked.item.fetchedAt || '',
      });
      if (picked.kind === 'seed') seedUsed = true; else fromCache = true;
      stale = true;
      if (picked.item.asOf > asOf) asOf = picked.item.asOf;
      if (sources.indexOf(src) < 0) sources.push(src);
    }
    if (!localOnly) needFetch.push(id);
  }

  var baseResult = {
    datasets: datasets,
    asOf: asOf,
    source: sources.join(' / '),
    fetchedAt: new Date().toISOString(),
    fromCache: fromCache,
    seedUsed: seedUsed,
    stale: stale,
    errors: errors,
    mode: mode,
    want: want,
    localOnly: localOnly,
  };

  if (localOnly || !needFetch.length) {
    return Promise.resolve(baseResult);
  }

  return callCloud(needFetch, want).then(function (res) {
    var fetched = {};
    (res.items || []).forEach(function (it) {
      fetched[it.symbol] = it;
      store.saveBarsCache(it.symbol, {
        fetchedAt: res.updatedAt || new Date().toISOString(),
        asOf: it.quality ? it.quality.lastDate : '',
        source: it.quality ? it.quality.source : res.source,
        bars: it.bars || [],
      });
    });

    // 用云端结果替换占位，保持入参顺序
    var merged = [];
    var mergedAsOf = '';
    ids.forEach(function (id) {
      var sym = catalog.getSymbol(id);
      if (!sym) return;
      if (fetched[id]) {
        var it = fetched[id];
        var bars = toBarObjects(it.bars);
        merged.push({ symbol: id, name: it.name || sym.name, bars: bars, fromCache: false, quality: it.quality });
        var last = it.quality ? it.quality.lastDate : (bars.length ? bars[bars.length - 1].date : '');
        if (last > mergedAsOf) mergedAsOf = last;
        return;
      }
      for (var k = 0; k < baseResult.datasets.length; k++) {
        if (baseResult.datasets[k].symbol === id) {
          merged.push(baseResult.datasets[k]);
          break;
        }
      }
    });

    (res.errors || []).forEach(function (e) { errors.push(e); });

    // 合并后重新统计来源状态，避免沿用占位符的旧标记
    var anySeed = false;
    var anyStale = false;
    var anyCache = false;
    for (var q = 0; q < merged.length; q++) {
      if (merged[q].seed) anySeed = true;
      if (merged[q].stale) anyStale = true;
      if (merged[q].fromCache) anyCache = true;
    }

    return {
      datasets: merged,
      asOf: mergedAsOf || baseResult.asOf,
      source: res.source || baseResult.source,
      fetchedAt: res.updatedAt || new Date().toISOString(),
      fromCache: anyCache,
      seedUsed: anySeed,
      stale: anyStale,
      errors: errors,
      mode: mode,
      want: want,
      localOnly: false,
    };
  }).catch(function (err) {
    errors.push(err.message);
    if (baseResult.datasets.length) {
      return Object.assign({}, baseResult, { stale: true, errors: errors });
    }
    throw err;
  });
}

/** 只取单标的（回测常用） */
function loadOne(symbol, opts) {
  return loadDatasets([symbol], opts).then(function (r) {
    if (!r.datasets.length) throw new Error('没有拿到 ' + symbol + ' 的行情');
    return Object.assign({}, r, { dataset: r.datasets[0] });
  });
}

module.exports = {
  FN_NAME: FN_NAME,
  TTL_HOURS: TTL_HOURS,
  WANT_BARS: WANT_BARS,
  callCloud: callCloud,
  loadDatasets: loadDatasets,
  loadOne: loadOne,
  toBarObjects: toBarObjects,
  explainCloudError: explainCloudError,
  seedFor: seedFor,
};
