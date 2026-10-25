/**
 * 源码浏览 —— 把「服务端真正在跑的实现」只读地暴露到网页上，方便人工检查
 *
 * 设计约束：
 *   1. 白名单制。页面只能按 id 取下面登记过的文件，URL 里的任何路径都不进 fs，
 *      所以不存在 ../ 穿越；想多看一个文件，就在 FILES 里加一行。
 *   2. 读磁盘上的真实文件，不做拷贝/转译 —— 网页上看到的就是回测正在用的那份，
 *      不会出现「文档里的公式和代码里的公式不一致」。
 *   3. 只读。没有写接口。
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)); // web/lib
const WEB = join(HERE, '..');                          // web
const ROOT = resolve(WEB, '..');                       // 项目根

/**
 * id      前端用的短名，也是 /api/source?id= 的取值
 * group   页面左侧的分组标题
 * title   分组里显示的名字
 * rel     相对项目根的路径（写死）
 * lang    前端高亮用：js / py / md
 */
const FILES = [
  { id: 'rsrs', group: '策略核心', title: 'RSRS 指标', rel: 'strategy-miniprogram/core/rsrs.js', lang: 'js',
    note: 'OLS 回归、M 日标准分、修正标准分（标准分 × R²）两个版本' },
  { id: 'tsharpe', group: '策略核心', title: '防守开关（时变夏普）', rel: 'strategy-miniprogram/core/tsharpe.js', lang: 'js',
    note: '120 日滚动夏普 + MA200 双条件、仓位状态机与回测' },
  { id: 'signal', group: '策略核心', title: '信号与快照', rel: 'strategy-miniprogram/core/signal.js', lang: 'js',
    note: '阈值状态机（开仓/平仓/持有/观望）、持仓天数、按历史日期回看' },
  { id: 'backtest', group: '策略核心', title: '回测引擎', rel: 'strategy-miniprogram/core/backtest.js', lang: 'js',
    note: '次日成交、手续费与滑点、净值与交易配对' },
  { id: 'metrics', group: '策略核心', title: '绩效指标', rel: 'strategy-miniprogram/core/metrics.js', lang: 'js',
    note: '年化、最大回撤、夏普、波动率、换手' },
  { id: 'catalog', group: '策略核心', title: '标的与预设参数', rel: 'strategy-miniprogram/core/catalog.js', lang: 'js',
    note: '11 个指数的 notebook 预设（N/M/阈值），默认值来源' },
  { id: 'validate', group: '策略核心', title: '参数校验', rel: 'strategy-miniprogram/core/validate.js', lang: 'js',
    note: 'N/M 下限、开平仓阈值关系' },
  { id: 'format', group: '策略核心', title: '格式化', rel: 'strategy-miniprogram/core/format.js', lang: 'js',
    note: '结论文案与数值展示口径' },

  { id: 'engine', group: 'Web 层', title: '策略桥接', rel: 'web/lib/engine.mjs', lang: 'js',
    note: 'server 如何调用 core/（唯一一份策略实现）' },
  { id: 'jobs', group: 'Web 层', title: '算信号 / 推送任务', rel: 'web/lib/jobs.mjs', lang: 'js',
    note: '每日任务：拉行情 → 算信号 → 变化才推送' },
  { id: 'server', group: 'Web 层', title: 'HTTP 服务', rel: 'web/server.mjs', lang: 'js',
    note: '静态资源、/api/*、鉴权与端口' },

  { id: 'py', group: '原始参考', title: 'RSRS_code.py', rel: 'reference/rsrs/RSRS_code.py', lang: 'py',
    note: '移植来源（QuantsPlaybook 的 notebook 导出），用来对照公式' },
  { id: 'notes', group: '原始参考', title: 'RSRS_notes.md', rel: 'reference/rsrs/RSRS_notes.md', lang: 'md',
    note: '原报告笔记：指标构建与优化逻辑' },
];

const BY_ID = new Map(FILES.map((f) => [f.id, f]));

const countLines = (text) => (text ? text.split('\n').length : 0);

/** 左侧列表：不含正文，只给元信息（页面打开时先拉这个） */
export function listSources() {
  return FILES.map((f) => {
    const abs = join(ROOT, f.rel);
    const exists = existsSync(abs);
    let bytes = 0;
    let lines = 0;
    let mtime = '';
    if (exists) {
      const st = statSync(abs);
      bytes = st.size;
      mtime = st.mtime.toISOString();
      lines = countLines(readFileSync(abs, 'utf8'));
    }
    return { id: f.id, group: f.group, title: f.title, rel: f.rel, lang: f.lang, note: f.note, exists, bytes, lines, mtime };
  });
}

/** 单个文件：返回行数组（前端按行渲染，带行号） */
export function readSource(id) {
  const f = BY_ID.get(String(id || ''));
  if (!f) return null;

  const abs = resolve(ROOT, f.rel);
  // 双保险：路径必须仍在项目根目录内（虽然 rel 是写死的，这里防止以后有人改成动态路径）
  if (abs !== ROOT && !abs.startsWith(ROOT + sep)) return null;
  if (!existsSync(abs) || !statSync(abs).isFile()) return null;

  const content = readFileSync(abs, 'utf8');
  const text = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  return {
    id: f.id,
    group: f.group,
    title: f.title,
    rel: f.rel,
    lang: f.lang,
    note: f.note,
    bytes: Buffer.byteLength(content),
    mtime: statSync(abs).mtime.toISOString(),
    lineCount: lines.length,
    lines,
    // 给 /api/source?id=…&raw=1 用（原样输出，不做行切分）
    content,
  };
}
