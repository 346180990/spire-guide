/**
 * 云函数 market：抓行情 → 算客观信号 → 返回给小程序
 *
 * 为什么需要云函数：小程序 wx.request 只能请求自有备案域名，抓不了行情站。
 * 云函数跑在服务端，出网不受这个限制。
 *
 * 数据源（双源互为备份 —— 单一数据源会被限流打死，实测东财 push2his 被限流过）：
 *   主：腾讯 web.ifzq.gtimg.cn（A股/ETF 用 qfqday 前复权，美股指数用 day）
 *   备：东方财富 push2his
 *
 * 只做「取数 + 算客观信号」，不做推荐 —— 推荐规则在小程序本地 core/recommend.js。
 */

let cloud = null;
try {
  cloud = require('wx-server-sdk');
  if (cloud) cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
} catch (e) {
  // 本地测试环境没有 SDK，忽略
}

const https = require('https');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

/**
 * 标的清单
 *  symbol：腾讯代码；secid/fqt：东财备用参数
 *  signal：该标的用什么口径判断（见 core/recommend.js）
 */
const TARGETS = [
  {
    key: 'a', name: '沪深300', role: 'A股权益',
    symbol: 'sh000300', tencentField: 'day',
    secid: '1.000300', fqt: 0,
  },
  {
    key: 'us', name: '标普500', role: '美股权益',
    symbol: 'us.INX', tencentField: 'day',
    secid: '100.SPX', fqt: 0,
  },
  {
    key: 'bond', name: '国债ETF', role: '固收',
    symbol: 'sh511010', tencentField: 'qfqday',
    secid: '1.511010', fqt: 1,
  },
  {
    key: 'gold', name: '黄金ETF', role: '黄金',
    symbol: 'sh518880', tencentField: 'qfqday',
    secid: '1.518880', fqt: 1,
  },
];

function httpGet(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': UA,
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
        'Referer': 'https://gu.qq.com/',
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

/** 主源：腾讯 */
async function fetchTencent(symbol, field) {
  const url = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get'
    + '?param=' + symbol + ',day,,,500,qfq';
  const text = await httpGet(url);
  const json = JSON.parse(text);
  const node = json && json.data && json.data[symbol];
  if (!node) return [];
  const rows = node[field] || node.qfqday || node.day || [];
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r) || r.length < 3) continue;
    const close = Number(r[2]);
    if (Number.isFinite(close) && close > 0) out.push({ date: r[0], close: close });
  }
  return out;
}

/** 备源：东方财富 */
async function fetchEastmoney(secid, fqt) {
  const url = 'https://push2his.eastmoney.com/api/qt/stock/kline/get'
    + '?secid=' + secid + '&fields1=f1,f2,f3,f4&fields2=f51,f53'
    + '&klt=101&fqt=' + fqt + '&beg=20180101&end=20500101';
  const text = await httpGet(url);
  const json = JSON.parse(text);
  const klines = json && json.data && json.data.klines;
  if (!Array.isArray(klines) || klines.length === 0) return [];
  const out = [];
  for (let i = 0; i < klines.length; i++) {
    const parts = String(klines[i]).split(',');
    const close = Number(parts[1]);
    if (Number.isFinite(close) && close > 0) out.push({ date: parts[0], close: close });
  }
  return out;
}

async function fetchDaily(t) {
  // 先腾讯，失败或数据不足再东财
  try {
    const d = await fetchTencent(t.symbol, t.tencentField);
    if (d.length >= 60) return { daily: d, source: '腾讯' };
  } catch (e) {
    // 继续尝试备用源
  }
  const d2 = await fetchEastmoney(t.secid, t.fqt);
  if (d2.length >= 60) return { daily: d2, source: '东方财富' };
  throw new Error('两个数据源都没拿到足够数据');
}

function stdev(arr) {
  if (arr.length < 2) return 0;
  let m = 0;
  for (let i = 0; i < arr.length; i++) m += arr[i];
  m /= arr.length;
  let v = 0;
  for (let i = 0; i < arr.length; i++) v += (arr[i] - m) * (arr[i] - m);
  return Math.sqrt(v / (arr.length - 1));
}

function r1(n) { return Math.round(n * 10) / 10; }

/** 从日线算客观信号 */
function computeSignal(daily) {
  const n = daily.length;
  if (n < 30) return null;
  const last = daily[n - 1].close;

  const maWin = Math.min(200, n);
  let sum = 0;
  for (let i = n - maWin; i < n; i++) sum += daily[i].close;
  const ma200 = sum / maWin;

  const ret1y = (last / daily[Math.max(0, n - 250)].close - 1) * 100;
  const ret3m = (last / daily[Math.max(0, n - 60)].close - 1) * 100;

  const win = Math.min(750, n);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = n - win; i < n; i++) {
    if (daily[i].close < lo) lo = daily[i].close;
    if (daily[i].close > hi) hi = daily[i].close;
  }
  const rangePos = hi > lo ? ((last - lo) / (hi - lo)) * 100 : 50;
  const ddFromPeak = (last / hi - 1) * 100;

  const rets = [];
  const from = Math.max(1, n - 250);
  for (let i = from; i < n; i++) rets.push(daily[i].close / daily[i - 1].close - 1);
  const vol1y = stdev(rets) * Math.sqrt(250) * 100;

  return {
    last: Math.round(last * 100) / 100,
    ma200: Math.round(ma200 * 100) / 100,
    maGapPct: r1((last / ma200 - 1) * 100),
    ret1y: r1(ret1y),
    ret3m: r1(ret3m),
    rangePos: Math.round(rangePos),
    ddFromPeak: r1(ddFromPeak),
    vol1y: r1(vol1y),
    asOf: daily[n - 1].date,
    bars: n,
  };
}

/** 一句话市场状态 */
function marketState(items) {
  const parts = [];
  const a = items.find((x) => x.key === 'a');
  const us = items.find((x) => x.key === 'us');
  const bond = items.find((x) => x.key === 'bond');
  if (a) {
    const p = a.signal.rangePos;
    if (p <= 30) parts.push('A股在近三年偏低位置（' + p + '%）');
    else if (p >= 70) parts.push('A股在近三年偏高位置（' + p + '%）');
    else parts.push('A股在近三年区间中部（' + p + '%）');
  }
  if (us) {
    parts.push(us.signal.maGapPct >= 0
      ? '美股在年线上方 ' + us.signal.maGapPct + '%'
      : '美股跌破年线 ' + Math.abs(us.signal.maGapPct) + '%');
  }
  if (bond) {
    parts.push('债市近一年 ' + (bond.signal.ret1y >= 0 ? '+' : '') + bond.signal.ret1y + '%');
  }
  return parts.join('；');
}

async function main() {
  const started = Date.now();
  const items = [];
  const errors = [];
  const sources = [];

  for (let i = 0; i < TARGETS.length; i++) {
    const t = TARGETS[i];
    try {
      const got = await fetchDaily(t);
      const signal = computeSignal(got.daily);
      if (!signal) {
        errors.push(t.name + '：数据不足');
        continue;
      }
      sources.push(got.source);
      items.push({ key: t.key, name: t.name, role: t.role, signal: signal });
    } catch (e) {
      errors.push(t.name + '：' + e.message);
    }
  }

  // 数据源去重展示
  const uniqSources = [];
  for (let i = 0; i < sources.length; i++) {
    if (uniqSources.indexOf(sources[i]) < 0) uniqSources.push(sources[i]);
  }

  return {
    ok: items.length > 0,
    updatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    items: items,
    state: marketState(items),
    source: uniqSources.join(' / '),
    errors: errors,
  };
}

exports.main = main;
