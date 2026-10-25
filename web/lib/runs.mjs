/**
 * 回测记录存储 —— 落盘为 JSON，便于版本对比和历史查看
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { PATHS } from './config.mjs';

const MAX_RUNS = 50;
const CURVE_POINTS = 600;

function ensureDir() {
  if (!existsSync(PATHS.runs)) mkdirSync(PATHS.runs, { recursive: true });
}

/** 曲线降采样，保留形状的同时压体积 */
function downsample(arr, points) {
  if (!Array.isArray(arr) || arr.length <= points) return arr || [];
  const step = arr.length / points;
  const out = [];
  for (let i = 0; i < points; i++) out.push(arr[Math.min(arr.length - 1, Math.round(i * step))]);
  out[out.length - 1] = arr[arr.length - 1];
  return out;
}

/** 同标的 + 同参数 + 同区间的回测视为同一次，避免重复堆积 */
function signatureOf({ symbol, config, start, end }) {
  return JSON.stringify({ symbol, config, start, end });
}

function findExisting(sig) {
  ensureDir();
  for (const f of readdirSync(PATHS.runs)) {
    if (!f.endsWith('.json')) continue;
    try {
      const j = JSON.parse(readFileSync(join(PATHS.runs, f), 'utf8'));
      if (signatureOf({ symbol: j.symbol, config: j.config, start: j.start, end: j.end }) === sig) return j;
    } catch (e) { /* 跳过坏文件 */ }
  }
  return null;
}

export function saveRun({ symbol, config, result, dataSource, requestedStart, dataNote }) {
  ensureDir();

  const sig = signatureOf({ symbol, config, start: result.from, end: result.to });
  const existing = findExisting(sig);
  // 同参数重跑：复用 runId（列表不膨胀），但内容必须用本次计算结果覆盖，
  // 否则引擎/口径修正后，接口会一直返回修复前的旧数字。
  const reuseId = existing ? existing.runId : null;
  const runId = reuseId || ('run-' + Date.now().toString(36) + '-' + createHash('md5')
    .update(symbol + '|' + JSON.stringify(config) + '|' + requestedStart)
    .digest('hex').slice(0, 6));

  const run = {
    runId,
    createdAt: new Date().toISOString(),
    strategy: 'rsrs',
    symbol,
    config,
    start: result.from,
    end: result.to,
    requestedStart: requestedStart || '',
    dataNote: dataNote || '',
    dataSource: dataSource || '',
    quality: result.quality,
    metrics: result.metrics,
    trades: result.trades || [],
    dates: downsample(result.dates, CURVE_POINTS),
    equity: downsample(result.equity, CURVE_POINTS),
    benchmark: downsample(result.benchmark, CURVE_POINTS),
    drawdown: downsample(result.drawdown, CURVE_POINTS),
    curvePoints: CURVE_POINTS,
  };

  writeFileSync(join(PATHS.runs, runId + '.json'), JSON.stringify(run), 'utf8');

  // 超出上限删最旧的
  const files = readdirSync(PATHS.runs).filter((f) => f.endsWith('.json')).sort();
  while (files.length > MAX_RUNS) {
    const f = files.shift();
    try { unlinkSync(join(PATHS.runs, f)); } catch (e) { /* ignore */ }
  }
  return { ...run, deduped: !!reuseId };
}

export function listRuns() {
  ensureDir();
  const out = [];
  for (const f of readdirSync(PATHS.runs)) {
    if (!f.endsWith('.json')) continue;
    try {
      const j = JSON.parse(readFileSync(join(PATHS.runs, f), 'utf8'));
      out.push({
        runId: j.runId,
        createdAt: j.createdAt,
        symbol: j.symbol,
        start: j.start,
        end: j.end,
        config: j.config,
        dataSource: j.dataSource,
        metrics: {
          cagr: j.metrics.cagr,
          totalReturn: j.metrics.totalReturn,
          maxDrawdown: j.metrics.maxDrawdown,
          sharpe: j.metrics.sharpe,
          switches: j.metrics.switches,
        },
      });
    } catch (e) { /* 跳过坏文件 */ }
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getRun(id) {
  const p = join(PATHS.runs, String(id).replace(/[^a-zA-Z0-9-]/g, '') + '.json');
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch (e) { return null; }
}

export function deleteRun(id) {
  const p = join(PATHS.runs, String(id).replace(/[^a-zA-Z0-9-]/g, '') + '.json');
  if (existsSync(p)) { unlinkSync(p); return true; }
  return false;
}
