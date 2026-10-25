// 把 strategy-miniprogram 的代码同步到 IDE 已知的项目目录 miniprogram/
//
// 为什么需要这个：微信开发者工具只自动打开「最近的项目」，CLI 在这台机器上
// 无法 spawn 启动器（中文文件名 ENOENT），所以新目录进不了 IDE。
// 而 miniprogram/ 是 IDE 已经导入过的项目，把代码同步进去即可直接编译运行。
//
// 约束：strategy-miniprogram/ 仍是唯一源码目录，miniprogram/ 是它的镜像。
// 改代码请改 strategy-miniprogram/，然后跑本脚本。
//
// 运行: node scripts/sync-to-ide.mjs

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'strategy-miniprogram');
const DST = join(ROOT, 'miniprogram');

// 只同步运行需要的文件，README 不同步
const DIRS = ['core', 'components', 'pages'];
const FILES = ['app.js', 'app.json', 'app.wxss', 'sitemap.json'];
// 云函数按名字增量同步，旧项目里已有的 market 函数保留
const FN_DIRS = ['market-bars'];

function log(m) { console.log('  ' + m); }

if (!existsSync(SRC)) {
  console.error('源目录不存在: ' + SRC);
  process.exit(1);
}

log('源: ' + SRC);
log('目标: ' + DST);

// 1. 清空并复制页面/组件/core（避免旧页面残留）
for (const d of DIRS) {
  const s = join(SRC, d);
  const t = join(DST, d);
  if (!existsSync(s)) continue;
  rmSync(t, { recursive: true, force: true });
  cpSync(s, t, { recursive: true });
  log('已同步 ' + d + '/');
}

// 2. 复制根文件
for (const f of FILES) {
  const s = join(SRC, f);
  if (!existsSync(s)) continue;
  cpSync(s, join(DST, f));
  log('已同步 ' + f);
}

// 3. 云函数
for (const fn of FN_DIRS) {
  const s = join(SRC, 'cloudfunctions', fn);
  if (!existsSync(s)) continue;
  const t = join(DST, 'cloudfunctions', fn);
  rmSync(t, { recursive: true, force: true });
  mkdirSync(dirname(t), { recursive: true });
  cpSync(s, t, { recursive: true });
  log('已同步 cloudfunctions/' + fn);
}

// 4. 更新 project.config.json 的描述与项目名（保留 appid / cloudfunctionRoot 等）
const cfgPath = join(DST, 'project.config.json');
if (existsSync(cfgPath)) {
  try {
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    cfg.description = '策略助手 —— RSRS 择时信号 / 历史回看 / 回测';
    cfg.projectname = 'strategy-assistant';
    if (!cfg.cloudfunctionRoot) cfg.cloudfunctionRoot = 'cloudfunctions/';
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
    log('已更新 project.config.json（appid=' + cfg.appid + '）');
  } catch (e) {
    console.warn('  project.config.json 更新失败: ' + e.message);
  }
}

// 5. 自检：app.json 的页面都存在
const appJson = JSON.parse(readFileSync(join(DST, 'app.json'), 'utf8'));
let missing = [];
for (const p of appJson.pages || []) {
  for (const ext of ['js', 'json', 'wxml', 'wxss']) {
    if (!existsSync(join(DST, p + '.' + ext))) missing.push(p + '.' + ext);
  }
}
if (missing.length) {
  console.error('\n✗ 缺少文件: ' + missing.join(', '));
  process.exit(1);
}
log('页面自检通过（' + appJson.pages.length + ' 个页面四件套齐全）');

// 6. 统计
function count(dir) {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) n += count(p);
    else n++;
  }
  return n;
}
console.log('\n完成：目标目录 ' + count(DST) + ' 个文件');
console.log('提醒：源码请改 strategy-miniprogram/，改完重跑本脚本同步到 IDE。');
