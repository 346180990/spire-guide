/**
 * 云函数 market-bars：拉日线 OHLCV，供小程序做 RSRS 与回测
 *
 * 为什么需要云函数：小程序 wx.request 只能请求自有备案域名，抓不了行情站。
 *
 * 数据源（双源互为备份，单一源会被限流）：
 *   主：东方财富 push2his（返回 开/收/高/低/量 全套）
 *   备：腾讯 fqkline（day / qfqday）
 *
 * 与旧 market 函数的区别：本函数返回完整 OHLCV 与质量信息，
 * 因为 RSRS 需要 high/low（回归）与 pre_close（收益率）；volume 一并返回，供将来做量价研究。
 *
 * 入参：{ symbols?: string[], count?: number, end?: 'YYYY-MM-DD' }
 * 出参：{ ok, asOf, source, elapsedMs, items: [{ symbol, name, bars, quality }], errors }
 *       bars 元素为紧凑数组 [date, open, high, low, close, volume]
 */

'use strict';

let cloud = null;
try {
  cloud = require('wx-server-sdk');
  if (cloud) cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
} catch (e) {
  // 本地测试环境没有 SDK
}

const https = require('https');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const DEFAULT_COUNT = 1200;
const MAX_COUNT = 3600;

/**
 * 标的白名单。客户端只传 id，具体参数在服务端决定，避免被拼出任意 URL。
 * fqt: 东财复权口径（0 不复权 / 1 前复权）；tencentField: 腾讯数组字段名
 */
const SYMBOLS = {
  '000300': { name: '沪深300', secid: '1.000300', tencent: 'sh000300', tencentField: 'day', fqt: 0, kind: 'index' },
  '000001': { name: '上证综指', secid: '1.000001', tencent: 'sh000001', tencentField: 'day', fqt: 0, kind: 'index' },
  '000016': { name: '上证50', secid: '1.000016', tencent: 'sh000016', tencentField: 'day', fqt: 0, kind: 'index' },
  '000905': { name: '中证500', secid: '1.000905', tencent: 'sh000905', tencentField: 'day', fqt: 0, kind: 'index' },
  '399006': { name: '创业板指', secid: '0.399006', tencent: 'sz399006', tencentField: 'day', fqt: 0, kind: 'index' },
  '000922': { name: '中证红利', secid: '1.000922', tencent: 'sh000922', tencentField: 'day', fqt: 0, kind: 'index' },
  '510300': { name: '沪深300ETF', secid: '1.510300', tencent: 'sh510300', tencentField: 'qfqday', fqt: 1, kind: 'etf' },
  '510500': { name: '中证500ETF', secid: '1.510500', tencent: 'sh510500', tencentField: 'qfqday', fqt: 1, kind: 'etf' },
  '159915': { name: '创业板ETF', secid: '0.159915', tencent: 'sz159915', tencentField: 'qfqday', fqt: 1, kind: 'etf' },
  '511010': { name: '国债ETF', secid: '1.511010', tencent: 'sh511010', tencentField: 'qfqday', fqt: 1, kind: 'etf' },
  '518880': { name: '黄金ETF', secid: '1.518880', tencent: 'sh518880', tencentField: 'qfqday', fqt: 1, kind: 'etf' },
};

const DEFAULT_SYMBOLS = ['000300', '000905', '399006'];

function httpGet(url, timeoutMs, referer) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': UA,
        Accept: '*/*',
        'Accept-Encoding': 'identity',
        Referer: referer || 'https://quote.eastmoney.com/',
      },
      timeout: timeoutMs || 9000,
    }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error('HTTP ' + res.statusCode));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('timeout', () => req.destroy(new Error('超时')));
    req.on('error', reject);
  });
}

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/** OHLC 合法性：高 >= max(开,收)、低 <= min(开,收)，量非负 */
function barValid(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return false;
  if (![d.open, d.high, d.low, d.close].every((x) => isNum(x) && x > 0)) return false;
  if (d.high < Math.max(d.open, d.close) - 1e-9) return false;
  if (d.low > Math.min(d.open, d.close) + 1e-9) return false;
  if (!isNum(d.volume) || d.volume < 0) return false;
  return true;
}

/** 主源：东方财富，fields2 顺序 = 日期,开,收,高,低,量 */
async function fetchEastmoney(meta, count, end) {
  const url = 'https://push2his.eastmoney.com/api/qt/stock/kline/get'
    + '?secid=' + meta.secid
    + '&fields1=f1,f2,f3'
    + '&fields2=f51,f52,f53,f54,f55,f56'
    + '&klt=101&fqt=' + meta.fqt
    + '&beg=20050101&end=' + (end || '20500101');
  // 不再传 lmt：大 lmt 容易触发服务端断连；全量拉回来后再截取尾部 count 根
  let text;
  try {
    text = await httpGet(url, 15000);
  } catch (e) {
    // 东财偶发 socket hang up，退避后重试一次
    await new Promise((r) => setTimeout(r, 600));
    text = await httpGet(url, 15000);
  }
  const json = JSON.parse(text);
  const klines = json && json.data && json.data.klines;
  if (!Array.isArray(klines) || !klines.length) throw new Error('东财无数据');
  const out = [];
  for (let i = 0; i < klines.length; i++) {
    const p = String(klines[i]).split(',');
    if (p.length < 6) continue;
    const d = {
      date: p[0],
      open: Number(p[1]),
      close: Number(p[2]),
      high: Number(p[3]),
      low: Number(p[4]),
      volume: Number(p[5]),
    };
    if (barValid(d)) out.push([d.date, d.open, d.high, d.low, d.close, d.volume]);
  }
  if (!out.length) throw new Error('东财数据全部不合法');
  return { bars: out.slice(-count), source: '东方财富' };
}

/**
 * 腾讯行情端点。
 *
 * 2026-10 起，旧的 /appstock/app/fqkline/get 对脚本请求返回 501（一个 JS 挑战页），
 * 但下面两个端点仍返回同结构 JSON：
 *   - proxy.finance.qq.com/.../newfqkline/get  支持前复权（ETF 必须）
 *   - web.ifzq.gtimg.cn/appstock/app/kline/kline  只有不复权的 day（指数可用）
 * 两者都支持 param=symbol,day,start,end,count,fq 的翻页写法。
 */
const TENCENT_ENDPOINTS = [
  { base: 'https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get', fq: true },
  { base: 'https://web.ifzq.gtimg.cn/appstock/app/kline/kline', fq: false },
];

function tencentUrl(ep, meta, end, page) {
  const param = meta.tencent + ',day,,' + (end || '') + ',' + page + (ep.fq ? ',qfq' : '');
  return ep.base + '?param=' + param;
}

/** 依次尝试腾讯端点，返回原始行数组；全部失败才抛错 */
async function fetchTencentRows(meta, end, page) {
  let lastErr = null;
  for (const ep of TENCENT_ENDPOINTS) {
    // 不复权端点不能给 ETF 用：分红除权会造成价格跳空
    if (!ep.fq && meta.kind !== 'index') continue;
    try {
      const text = await httpGet(tencentUrl(ep, meta, end, page), 15000, 'https://gu.qq.com/');
      const json = JSON.parse(text);
      const node = json && json.data && json.data[meta.tencent];
      const rows = (node && (node[meta.tencentField] || node.qfqday || node.day)) || [];
      if (rows.length) return rows;
      lastErr = new Error('腾讯无数据');
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('腾讯无数据');
}

/** 备源：腾讯，数组顺序 = 日期,开,收,高,低,量
 *  注意：腾讯这个接口 count 硬上限约 1600，超过会返回 param error（无数据） */
async function fetchTencent(meta, count) {
  const ask = Math.min(count, 1600);
  const rows = await fetchTencentRows(meta, '', ask);
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r) || r.length < 5) continue;
    const d = {
      date: String(r[0]),
      open: Number(r[1]),
      close: Number(r[2]),
      high: Number(r[3]),
      low: Number(r[4]),
      volume: Number(r[5] || 0),
    };
    if (meta.kind === 'etf' && !(d.volume > 0)) d.volume = 0;
    if (barValid(d)) out.push([d.date, d.open, d.high, d.low, d.close, d.volume]);
  }
  if (!out.length) throw new Error('腾讯数据全部不合法');
  return { bars: out.slice(-count), source: '腾讯' };
}

/** 'YYYY-MM-DD' 减一天 */
function prevDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
}

/**
 * 腾讯分页抓取：该接口单次上限约 1600 根，用 end 参数往前翻页拼出长历史。
 * 目的：东财被限流时，仍然凑够 M=700 预热 + 多年回测所需的数据。
 */
async function fetchTencentPaged(meta, count) {
  const PAGE = 1500;
  const byDate = {};
  let end = '';
  for (let guard = 0; guard < 8 && Object.keys(byDate).length < count; guard++) {
    let rows;
    try {
      rows = await fetchTencentRows(meta, end, PAGE);
    } catch (e) {
      break;
    }
    let added = 0;
    let earliest = '';
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!Array.isArray(r) || r.length < 5) continue;
      const d = {
        date: String(r[0]),
        open: Number(r[1]),
        close: Number(r[2]),
        high: Number(r[3]),
        low: Number(r[4]),
        volume: Number(r[5] || 0),
      };
      if (!barValid(d)) continue;
      if (!earliest || d.date < earliest) earliest = d.date;
      if (!byDate[d.date]) {
        byDate[d.date] = [d.date, d.open, d.high, d.low, d.close, d.volume];
        added++;
      }
    }
    if (!added || !earliest) break;
    end = prevDay(earliest);
  }
  const out = Object.keys(byDate).sort().map((k) => byDate[k]);
  if (!out.length) throw new Error('腾讯分页无数据');
  return { bars: out.slice(-count), source: '腾讯(分页)' };
}

async function fetchBars(symbolId, count, end) {
  const meta = SYMBOLS[symbolId];
  if (!meta) throw new Error('未收录的标的：' + symbolId);
  const errors = [];
  try {
    const got = await fetchEastmoney(meta, count, end);
    if (got.bars.length >= 60) return { meta, ...got };
    errors.push('东财仅 ' + got.bars.length + ' 根');
  } catch (e) {
    errors.push('东财：' + e.message);
  }
  try {
    // 东财不可用（限流）时，用腾讯分页拼长历史
    const got = count > 1600 ? await fetchTencentPaged(meta, count) : await fetchTencent(meta, count);
    if (got.bars.length >= 60) return { meta, ...got, note: errors.join('；') };
  } catch (e) {
    errors.push('腾讯：' + e.message);
  }
  throw new Error(errors.join('；') || '两个数据源都失败');
}

async function main(event) {
  const started = Date.now();
  const input = event || {};
  const count = Math.max(120, Math.min(MAX_COUNT, Math.round(Number(input.count) || DEFAULT_COUNT)));
  let ids = Array.isArray(input.symbols) && input.symbols.length ? input.symbols : DEFAULT_SYMBOLS;
  ids = ids.slice(0, 6);

  const items = [];
  const errors = [];
  const sources = [];

  // 并发抓取：串行时多个标的容易超过云函数默认超时（微信云函数默认 3 秒）
  const settled = await Promise.all(ids.map(async (raw) => {
    const id = String(raw);
    try {
      const got = await fetchBars(id, count, input.end);
      const bars = got.bars;
      let zeroVol = 0;
      for (let k = 0; k < bars.length; k++) if (!(bars[k][5] > 0)) zeroVol++;
      return {
        source: got.source,
        item: {
          symbol: id,
          name: got.meta.name,
          kind: got.meta.kind,
          bars: bars,
          quality: {
            bars: bars.length,
            firstDate: bars[0][0],
            lastDate: bars[bars.length - 1][0],
            zeroVolumeBars: zeroVol,
            source: got.source,
            fallbackNote: got.note || '',
            complete: bars.length >= count * 0.9,
          },
        },
      };
    } catch (e) {
      return { error: id + '：' + e.message };
    }
  }));

  for (let i = 0; i < settled.length; i++) {
    const one = settled[i];
    if (one.item) {
      items.push(one.item);
      if (sources.indexOf(one.source) < 0) sources.push(one.source);
    } else if (one.error) {
      errors.push(one.error);
    }
  }

  let asOf = '';
  for (let i = 0; i < items.length; i++) {
    const d = items[i].quality.lastDate;
    if (d > asOf) asOf = d;
  }

  return {
    ok: items.length > 0,
    asOf: asOf,
    updatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    count: count,
    source: sources.join(' / '),
    items: items,
    errors: errors,
  };
}

exports.main = main;
