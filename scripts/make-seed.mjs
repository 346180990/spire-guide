// 生成内置种子行情：把沪深300 的长历史打进小程序包
// 目的：① 首次打开就有数据，不依赖云函数是否部署；② 无网也能算信号
// 用法: node scripts/make-seed.mjs
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// 桩掉 wx-server-sdk，直接复用云函数的抓取逻辑（含腾讯分页）
const Module = require('node:module');
const origLoad = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === 'wx-server-sdk') return { init() {}, DYNAMIC_CURRENT_ENV: 'seed' };
  return origLoad.apply(this, arguments);
};

const fn = require(join(ROOT, 'strategy-miniprogram', 'cloudfunctions', 'market-bars', 'index.js'));

const SEED_SYMBOLS = [
  { id: '000300', name: '沪深300' },
  { id: '000905', name: '中证500' },
];
const COUNT = 3600;

(async () => {
  const parts = [];
  for (const s of SEED_SYMBOLS) {
    const r = await fn.main({ symbols: [s.id], count: COUNT });
    if (!r.ok || !r.items.length) {
      console.error('✗ ' + s.name + ' 抓取失败: ' + JSON.stringify(r.errors));
      process.exit(1);
    }
    const it = r.items[0];
    parts.push({
      symbol: s.id,
      name: it.name,
      asOf: it.quality.lastDate,
      source: it.quality.source,
      bars: it.bars,
    });
    console.log('✓ ' + s.name + ' ' + it.bars.length + ' 根  ' + it.bars[0][0] + ' → ' + it.quality.lastDate);
  }

  const body = `/**
 * 内置样例行情 —— 由 scripts/make-seed.mjs 生成，请勿手改
 *
 * 用途：冷启动 / 云函数不可用 / 无网时，仍能算出信号并标明数据截至日。
 * 注意：这是构建时的快照，不代表实时行情；UI 必须显示 asOf 并标注「内置样例」。
 * 生成时间：${new Date().toISOString()}
 */

'use strict';

module.exports = ${JSON.stringify(parts)};
`;
  const out = join(ROOT, 'strategy-miniprogram', 'core', 'seed.js');
  writeFileSync(out, body, 'utf8');
  const kb = (body.length / 1024).toFixed(0);
  console.log('\n写入 core/seed.js  (' + kb + ' KB，' + parts.length + ' 个标的)');
})().catch((e) => {
  console.error('失败:', e.message);
  process.exit(1);
});
