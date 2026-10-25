/**
 * 策略助手 Web 服务
 *
 * 零依赖（只用 Node 内置模块），一个进程同时提供：
 *   - 静态前端（public/）
 *   - 策略计算 API（复用 strategy-miniprogram/core）
 *   - 行情代理与磁盘缓存（浏览器无法直接抓东财/腾讯，必须经服务端）
 *   - 微信推送与每日定时任务
 *
 * 启动：node web/server.mjs
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';
import { CONFIG, PATHS } from './lib/config.mjs';
import { loadBars, loadOne, cacheSummary, clearCache } from './lib/bars.mjs';
import { buildConfig, buildSnapshot, runBacktest, replayAt, listSymbols, kinds, getSymbol } from './lib/engine.mjs';
import { saveRun, listRuns, getRun, deleteRun } from './lib/runs.mjs';
import { push, pushTest, providerStatus, buildSignalMessage } from './lib/push.mjs';
import { computeSignal, dailyJob, readState, readPushLog, watchSymbols, saveWatchSymbols, readJobLog } from './lib/jobs.mjs';
import { computeDefense, runDefenseBacktest, DEFENSE_DEFAULTS, DEFENSE_SYMBOLS, DEFENSE_DEFAULT_SYMBOLS } from './lib/defense.mjs';
import { listSources, readSource } from './lib/source.mjs';
import { inspectSymbol, dataSymbols, inspectOverview } from './lib/inspect.mjs';
import { refreshAllBars } from './lib/refresh.mjs';
import { startScheduler, runNow, nextRuns, scheduleSlots } from './lib/scheduler.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendText(res, code, text, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(text) });
  res.end(text);
}

function readBody(req, limit = 1 << 20) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) { resolve({}); return; }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(new Error('请求体不是合法 JSON')); }
    });
    req.on('error', reject);
  });
}

/** 是不是本机访问（本机免令牌） */
function isLocal(req) {
  const ip = (req.socket.remoteAddress || '').replace('::ffff:', '');
  return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
}

function tokenFromCookie(req) {
  const raw = req.headers.cookie || '';
  const m = raw.match(/(?:^|;\s*)sa_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

function checkAuth(req, url) {
  if (!CONFIG.accessToken) return true;
  if (isLocal(req)) return true;
  const t = url.searchParams.get('token') || req.headers['x-sa-token'] || tokenFromCookie(req);
  return t === CONFIG.accessToken;
}

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = normalize(join(PATHS.public, p));
  if (!file.startsWith(PATHS.public)) { sendText(res, 403, 'Forbidden'); return; }
  if (!existsSync(file) || !statSync(file).isFile()) {
    // SPA 兜底：未知路径返回首页
    const index = join(PATHS.public, 'index.html');
    if (existsSync(index)) {
      const buf = readFileSync(index);
      const spaCookie = CONFIG.accessToken && url.searchParams.get('token') === CONFIG.accessToken
        ? { 'Set-Cookie': 'sa_token=' + encodeURIComponent(CONFIG.accessToken) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000' }
        : {};
      res.writeHead(200, { ...spaCookie, 'Content-Type': MIME['.html'], 'Content-Length': buf.length });
      res.end(buf);
      return;
    }
    sendText(res, 404, 'Not Found');
    return;
  }
  const buf = readFileSync(file);
  const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
  // 开发阶段直接禁缓存：改了 css/js 刷新就生效，避免看到旧布局
  const cookie = CONFIG.accessToken && url.searchParams.get('token') === CONFIG.accessToken
    ? { 'Set-Cookie': 'sa_token=' + encodeURIComponent(CONFIG.accessToken) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000' }
    : {};
  res.writeHead(200, {
    ...cookie,
    'Content-Type': type,
    'Content-Length': buf.length,
    'Cache-Control': 'no-store, must-revalidate',
    'Pragma': 'no-cache',
  });
  res.end(buf);
}

function parseParams(url) {
  const q = url.searchParams;
  const p = {};
  for (const k of ['kind', 'n', 'm', 'up', 'dn', 'trend', 'maWin', 'window', 'symbol', 'start', 'end', 'fee', 'slip', 'capital', 'execution', 'date', 'count', 'asOf']) {
    const v = q.get(k);
    if (v !== null && v !== '') p[k] = v;
  }
  const sym = q.get('symbols');
  if (sym) p.symbols = sym.split(',').map((s) => s.trim()).filter(Boolean);
  return p;
}

async function handleAPI(req, res, url) {
  const path = url.pathname;

  /* ---------- 基础信息 ---------- */
  if (path === '/api/health') {
    return sendJSON(res, 200, {
      ok: true,
      now: new Date().toISOString(),
      node: process.version,
      config: {
        host: CONFIG.host,
        port: CONFIG.port,
        authRequired: !!CONFIG.accessToken,
        barsTtlDays: CONFIG.barsTtlDays,
        scheduler: CONFIG.scheduler,
        strategy: CONFIG.strategy,
        symbols: CONFIG.symbols,
      },
      push: providerStatus(),
      schedule: {
        enabled: CONFIG.scheduler.enabled,
        slots: scheduleSlots(),
        nextRuns: nextRuns(),
      },
      cache: cacheSummary(),
      state: readState(),
      watchlist: watchSymbols(),
      recentPush: readPushLog().slice(0, 5),
    });
  }

  if (path === '/api/catalog') {
    return sendJSON(res, 200, {
      ok: true,
      symbols: listSymbols(),
      kinds: kinds(),
      defaults: CONFIG.strategy,
      defense: {
        defaults: DEFENSE_DEFAULTS,
        symbols: DEFENSE_SYMBOLS,
        defaultSymbols: DEFENSE_DEFAULT_SYMBOLS,
      },
      // 用「已保存的关注标的」作为初始选中项，界面与定时推送保持一致
      defaultSymbols: watchSymbols(),
      ttlDays: CONFIG.barsTtlDays,
    });
  }

  /* ---------- 源码（只读，白名单）---------- */
  if (path === '/api/source') {
    const id = url.searchParams.get('id');
    if (!id) return sendJSON(res, 200, { ok: true, files: listSources() });

    const src = readSource(id);
    if (!src) return sendJSON(res, 404, { ok: false, error: '没有登记这个文件：' + id });

    // ?raw=1 直接吐原文，方便在浏览器里当纯文本看 / 存下来对比
    if (url.searchParams.get('raw') === '1') {
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': Buffer.byteLength(src.content),
        'Cache-Control': 'no-store',
      });
      res.end(src.content);
      return;
    }

    // 正文用行数组下发：前端要按行挂行号，也省得再切一次
    const { content, ...meta } = src;
    return sendJSON(res, 200, { ok: true, ...meta });
  }

  /* ---------- 数据体检（只读）---------- */
  if (path === '/api/data/symbols') {
    return sendJSON(res, 200, { ok: true, symbols: dataSymbols() });
  }
  if (path === '/api/data/refresh' && req.method === 'POST') {
    const body = await readBody(req);
    const r = await refreshAllBars({ symbols: body.symbols, force: body.force !== false });
    return sendJSON(res, 200, { ok: true, ...r });
  }
  if (path === '/api/data/overview') {
    const p = parseParams(url);
    const rows = await inspectOverview(p.symbols, {
      force: url.searchParams.get('force') === '1',
      localOnly: url.searchParams.get('localOnly') === '1',
    });
    return sendJSON(res, 200, { ok: true, rows });
  }
  if (path === '/api/data') {
    const p = parseParams(url);
    const r = await inspectSymbol(p.symbol || '000300', {
      count: p.count ? Number(p.count) : undefined,
      force: url.searchParams.get('force') === '1',
      localOnly: url.searchParams.get('localOnly') === '1',
    });
    return sendJSON(res, r.ok ? 200 : 400, r);
  }

  /* ---------- 信号 ---------- */
  if (path === '/api/signal') {
    const p = parseParams(url);
    const r = await computeSignal({
      symbols: p.symbols,
      params: p,
      asOfDate: p.date || p.asOf || '',
      force: url.searchParams.get('force') === '1',
      localOnly: url.searchParams.get('localOnly') === '1',
    });
    if (!r.ok) {
      return sendJSON(res, 400, {
        ok: false,
        error: r.reason,
        errors: r.errors,
        availableFirst: r.availableFirst,
        availableLast: r.availableLast,
      });
    }
    return sendJSON(res, 200, {
      ok: true,
      viewDate: r.viewDate,
      isLatest: r.isLatest,
      barsUsed: r.barsUsed,
      availableFirst: r.availableFirst,
      availableLast: r.availableLast,
      snapshot: r.snapshot,
      signals: r.signals,
      config: r.config,
      dataSource: r.dataSource,
      stale: r.stale,
      seedUsed: r.seedUsed,
      errors: r.errors,
    });
  }

  /* ---------- 防守开关（时变夏普 + MA200） ---------- */
  if (path === '/api/defense') {
    const p = parseParams(url);
    const r = await computeDefense({
      symbols: p.symbols,
      params: { window: p.window, maWin: p.maWin, up: p.up, dn: p.dn },
      asOfDate: p.date || p.asOf || '',
      force: url.searchParams.get('force') === '1',
      localOnly: url.searchParams.get('localOnly') === '1',
    });
    if (!r.ok) return sendJSON(res, 400, { ok: false, error: r.reason, errors: r.errors });
    return sendJSON(res, 200, r);
  }

  if (path === '/api/defense/backtest' && req.method === 'POST') {
    const body = await readBody(req);
    const r = await runDefenseBacktest({
      symbol: body.symbol,
      config: { window: body.window, maWin: body.maWin, up: body.up, dn: body.dn },
      start: body.start,
      end: body.end,
      fee: body.fee,
      slip: body.slip,
      force: !!body.force,
    });
    if (!r.ok) return sendJSON(res, 400, { ok: false, error: r.reason });
    return sendJSON(res, 200, r);
  }

  /* ---------- 行情 ---------- */
  if (path === '/api/bars') {
    const p = parseParams(url);
    const symbol = p.symbol || (CONFIG.symbols[0]);
    const count = Number(p.count) || 1200;
    const r = await loadOne(symbol, {
      count,
      force: url.searchParams.get('force') === '1',
      localOnly: url.searchParams.get('localOnly') === '1',
    });
    const sym = getSymbol(symbol) || { name: symbol };
    return sendJSON(res, 200, {
      ok: true,
      symbol,
      name: sym.name,
      asOf: r.asOf,
      source: r.source,
      stale: r.stale,
      bars: r.bars,
    });
  }

  /* ---------- 回测 ---------- */
  if (path === '/api/backtest' && req.method === 'POST') {
    const body = await readBody(req);
    const symbol = body.symbol || (CONFIG.symbols[0]);
    const { config, errors } = buildConfig({ ...CONFIG.strategy, ...body });
    if (errors && errors.length) return sendJSON(res, 400, { ok: false, error: '参数不合法：' + errors.join('；') });

    const warmup = config.n + config.m;
    const data = await loadOne(symbol, { count: 6000, force: !!body.force });
    if (data.bars.length < warmup + 60) {
      return sendJSON(res, 400, {
        ok: false,
        error: '行情只有 ' + data.bars.length + ' 根，至少需要 ' + (warmup + 60) + ' 根（N+M=' + warmup + ' 用于预热）',
      });
    }

    const start = body.start || '2015-01-01';
    const result = runBacktest({
      bars: data.bars,
      config,
      start,
      end: body.end || data.asOf,
      fee: body.fee,
      slip: body.slip,
      capital: body.capital,
      execution: body.execution,
    });

    let dataNote = '';
    const gap = (new Date(result.from) - new Date(start)) / 86400000;
    if (Number.isFinite(gap) && gap > 15) {
      dataNote = '实际区间从 ' + result.from + ' 开始：行情取到 ' + data.bars.length + ' 根，'
        + '其中 N+M=' + warmup + ' 根用于预热' + (data.stale ? '（当前为本地/样例数据，非实时）' : '');
    }

    const run = saveRun({
      symbol,
      config,
      result,
      dataSource: data.source,
      requestedStart: start,
      dataNote,
    });

    return sendJSON(res, 200, { ok: true, run, dataSource: data.source, stale: data.stale, dataNote });
  }

  if (path === '/api/runs') {
    return sendJSON(res, 200, { ok: true, runs: listRuns() });
  }

  const mRun = path.match(/^\/api\/runs\/([\w-]+)$/);
  if (mRun) {
    if (req.method === 'DELETE') {
      return sendJSON(res, 200, { ok: deleteRun(mRun[1]) });
    }
    const run = getRun(mRun[1]);
    if (!run) return sendJSON(res, 404, { ok: false, error: '记录不存在' });
    return sendJSON(res, 200, { ok: true, run });
  }

  /* ---------- 历史回看 ---------- */
  if (path === '/api/replay') {
    const p = parseParams(url);
    const symbol = p.symbol || (CONFIG.symbols[0]);
    const date = p.date;
    if (!date) return sendJSON(res, 400, { ok: false, error: '缺少 date 参数' });
    const { config } = buildConfig({ ...CONFIG.strategy, ...p });
    const data = await loadOne(symbol, { count: 6000 });
    const r = replayAt({ bars: data.bars, config, date });
    if (!r.ok) return sendJSON(res, 400, { ok: false, error: r.reason });
    return sendJSON(res, 200, { ok: true, snapshot: r.snapshot, barsUsed: r.barsUsed, dataSource: data.source });
  }

  /* ---------- 推送 ---------- */
  if (path === '/api/push/status') {
    return sendJSON(res, 200, { ok: true, ...providerStatus(), log: readPushLog().slice(0, 20), state: readState() });
  }

  if (path === '/api/push/test' && req.method === 'POST') {
    const body = await readBody(req);
    const r = await pushTest(body.provider);
    return sendJSON(res, r.ok ? 200 : 400, r);
  }

  if (path === '/api/push/preview') {
    const p = parseParams(url);
    const r = await computeSignal({ symbols: p.symbols, params: p });
    if (!r.ok) return sendJSON(res, 400, { ok: false, error: r.reason });
    const msg = buildSignalMessage(r.snapshot, { dataSource: r.dataSource, stale: r.stale });
    return sendJSON(res, 200, { ok: true, ...msg, dataSource: r.dataSource });
  }

  if (path === '/api/push/send' && req.method === 'POST') {
    const body = await readBody(req);
    const r = await computeSignal({ symbols: body.symbols, params: body, force: !!body.force });
    if (!r.ok) return sendJSON(res, 400, { ok: false, error: r.reason });
    const msg = buildSignalMessage(r.snapshot, { dataSource: r.dataSource, stale: r.stale });
    const out = await push({ title: msg.title, markdown: msg.markdown, provider: body.provider });
    return sendJSON(res, out.ok ? 200 : 400, out);
  }

  /* ---------- 关注标的 ---------- */
  if (path === '/api/watchlist') {
    if (req.method === 'POST') {
      const body = await readBody(req);
      const list = (body.symbols || []).filter((id) => !!getSymbol(id)).slice(0, 12);
      if (!list.length) return sendJSON(res, 400, { ok: false, error: '至少选一个已收录的标的' });
      return sendJSON(res, 200, { ok: true, symbols: saveWatchSymbols(list) });
    }
    return sendJSON(res, 200, { ok: true, symbols: watchSymbols() });
  }

  /* ---------- 任务 ---------- */
  if (path === '/api/jobs/run' && req.method === 'POST') {
    const body = await readBody(req);
    // 手动跑一次 = 盘后任务：先拉行情，再算信号（传 refreshBars:false 可跳过）
    let dataRefresh = null;
    if (body.refreshBars !== false) {
      const rf = await refreshAllBars({ symbols: body.symbols, force: true });
      dataRefresh = {
        at: rf.at,
        total: rf.total,
        okCount: rf.okCount,
        failCount: rf.failCount,
        failed: rf.results.filter((x) => !x.ok).map((x) => x.symbol),
      };
    }
    const r = await runNow({
      force: !!body.force,
      always: !!body.always,
      onlyOnChange: body.onlyOnChange,
      label: body.label || '手动',
      dataRefresh: dataRefresh,
    });
    return sendJSON(res, r.ok ? 200 : 400, { ...r, dataRefresh });
  }

  // 每日计算流水：盘前 / 盘后各一条，含时间、数据截至、结论、每个标的的买卖动作
  if (path === '/api/jobs/log') {
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 20));
    return sendJSON(res, 200, {
      ok: true,
      enabled: CONFIG.scheduler.enabled,
      slots: scheduleSlots(),
      nextRuns: nextRuns(),
      log: readJobLog().slice(0, limit),
    });
  }

  /* ---------- 缓存 ---------- */
  if (path === '/api/cache') {
    if (req.method === 'DELETE') {
      const p = parseParams(url);
      const removed = clearCache(p.symbol);
      return sendJSON(res, 200, { ok: true, removed });
    }
    return sendJSON(res, 200, { ok: true, cache: cacheSummary(), ttlDays: CONFIG.barsTtlDays });
  }

  return sendJSON(res, 404, { ok: false, error: '未知接口: ' + path });
}

/**
 * 进程级兜底：异常写进 data/server.log，且不让一次异常把定时任务带走
 * （Node 15+ 默认 unhandledRejection 会直接退出，这里显式接住）
 */
function logServerError(prefix, e) {
  const line = '[' + new Date().toISOString() + '] ' + prefix + ': '
    + ((e && (e.stack || e.message)) || String(e));
  try {
    if (!existsSync(PATHS.data)) mkdirSync(PATHS.data, { recursive: true });
    appendFileSync(join(PATHS.data, 'server.log'), line + '\n');
  } catch (err) { /* 日志写不进去就算了，不能因此再抛 */ }
  console.error(line);
}
process.on('uncaughtException', (e) => logServerError('uncaughtException', e));
process.on('unhandledRejection', (e) => logServerError('unhandledRejection', e));

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  try {
    if (url.pathname.startsWith('/api/')) {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,x-sa-token', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS' });
        res.end();
        return;
      }
      if (!checkAuth(req, url)) {
        return sendJSON(res, 401, { ok: false, error: '需要访问令牌：在地址后加 ?token=…' });
      }
      await handleAPI(req, res, url);
      return;
    }
    serveStatic(req, res, url);
  } catch (e) {
    if (!res.headersSent) sendJSON(res, 500, { ok: false, error: e.message });
    else res.end();
  }
});

function lanAddresses() {
  const out = [];
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const ni of nets[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

server.listen(CONFIG.port, CONFIG.host, () => {
  console.log('');
  console.log('  策略助手 Web 服务已启动');
  console.log('  本机:   http://127.0.0.1:' + CONFIG.port);
  for (const ip of lanAddresses()) console.log('  局域网: http://' + ip + ':' + CONFIG.port);
  if (CONFIG.accessToken) console.log('  令牌:   非本机访问需追加 ?token=' + CONFIG.accessToken);
  console.log('  推送:   ' + (CONFIG.push.enabled ? CONFIG.push.provider : '未启用'));
  console.log('');
  startScheduler();
});

const shutdown = () => {
  console.log('\n[server] 关闭中…');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
