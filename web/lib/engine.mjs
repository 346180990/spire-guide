/**
 * 引擎桥接 —— 复用小程序端的策略核心（唯一实现，不复制逻辑）
 *
 * strategy-miniprogram/core 里的 rsrs/metrics/backtest/signal/catalog/validate/format
 * 都是纯 JS（不碰 wx），所以服务端可以 require 进来直接用。
 * 只有 store.js / api.js / loader.js 依赖 wx，Web 端用 lib/bars.mjs 的磁盘缓存替代。
 */

import { createRequire } from 'node:module';
import { ENGINE_DIR } from './config.mjs';

const require = createRequire(import.meta.url);
const dir = ENGINE_DIR.replace(/\\/g, '/');
const p = (f) => require(dir + '/' + f);

export const rsrs = p('rsrs.js');
export const metrics = p('metrics.js');
export const backtest = p('backtest.js');
export const signal = p('signal.js');
export const catalog = p('catalog.js');
export const tsharpe = p('tsharpe.js');
export const validate = p('validate.js');
export const format = p('format.js');

/** 可用的指标版本（数组，元素形如 {key, short, desc}） */
export function kinds() {
  return catalog.KINDS.map((k) => ({ key: k.key, short: k.short, desc: k.desc }));
}

/** 标的清单（带 notebook 预设） */
export function listSymbols() {
  return catalog.listSymbols();
}

export function getSymbol(id) {
  return catalog.getSymbol(id);
}

/** 该指标的默认参数 */
export function defaultParamsFor(kind) {
  const k = catalog.KINDS.find((x) => x.key === kind) || catalog.KINDS[0];
  return { kind: k.key, n: 18, m: 700, up: 0.7, dn: -0.7 };
}

/**
 * 合并「默认值 + 用户覆盖」，并用 validateConfig 校验
 * @returns {{config:Object, errors:string[], warnings:string[]}}
 */
export function buildConfig(input) {
  const o = input || {};
  const known = catalog.KINDS.some((k) => k.key === o.kind);
  const cfg = {
    kind: known ? o.kind : '标准分RSRS',
    n: o.n === undefined || o.n === '' ? 18 : Number(o.n),
    m: o.m === undefined || o.m === '' ? 700 : Number(o.m),
    up: o.up === undefined || o.up === '' ? 0.7 : Number(o.up),
    dn: o.dn === undefined || o.dn === '' ? -0.7 : Number(o.dn),
    trend: o.trend === true || o.trend === 1 || o.trend === '1' || o.trend === 'true',
    maWin: o.maWin === undefined || o.maWin === '' ? 20 : Number(o.maWin),
    overrides: {},
  };
  const v = validate.validateConfig(cfg);
  const errors = Object.keys(v.errors || {}).map((k) => v.errors[k]);
  return {
    config: v.value || cfg,
    errors,
    warnings: v.warnings || [],
  };
}

/**
 * 算信号
 * @param {Object} o
 * @param {Array} o.datasets     行情（每项 {symbol, name, bars}）
 * @param {Object} o.config      策略参数
 * @param {string} [o.asOf]      全库最新交易日（用于判定数据是否过期）
 * @param {string} [o.asOfDate]  验证模式：只用该日及之前的数据
 */
export function buildSnapshot({ datasets, config, asOf, asOfDate, configVersion }) {
  return signal.buildSnapshot({
    datasets,
    config,
    // 验证模式下由 asOfDate 决定截断点；此时不该被判成「数据过期」
    asOfDate: asOfDate || undefined,
    latestDate: asOfDate || asOf,
    configVersion: configVersion || 'web',
    strategyId: 'rsrs',
    codeVersion: 'rsrs-improved-v1',
  });
}

/** 跑回测 */
export function runBacktest({ bars, config, start, end, fee, slip, capital, execution }) {
  return backtest.run({
    bars,
    config,
    start,
    end,
    cost: { fee: Number(fee) || 0, slip: Number(slip) || 0 },
    capital: Number(capital) || 100000,
    execution: execution === 'next_open' ? 'next_open' : 'next_close',
  });
}

/** 按历史某日重算信号（只用该日及之前的数据，杜绝未来函数） */
export function replayAt({ bars, config, date }) {
  const upto = [];
  for (let i = 0; i < bars.length; i++) {
    if (bars[i].date <= date) upto.push(bars[i]);
    else break;
  }
  if (!upto.length) return { ok: false, reason: '该日期之前没有行情数据' };

  const need = config.n + config.m;
  if (upto.length < need + 1) {
    return { ok: false, reason: '该日期前只有 ' + upto.length + ' 根日线，不足以完成 N+M=' + need + ' 根的预热' };
  }

  const snap = signal.buildSnapshot({
    datasets: [{ symbol: 'replay', name: '回看', bars: upto }],
    config,
    latestDate: date,
    configVersion: 'web',
    strategyId: 'rsrs',
    codeVersion: 'rsrs-improved-v1',
  });
  return { ok: true, snapshot: snap, barsUsed: upto.length };
}
