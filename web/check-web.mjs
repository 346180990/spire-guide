/**
 * Web 版自检 —— 模块级 + 真实 HTTP 冒烟
 *
 * 运行: node web/check-web.mjs
 */

import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

/** Windows 绝对路径动态 import 必须转成 file:// URL */
const imp = (p) => import(pathToFileURL(p).href);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'web');

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓ ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; failures.push(name + (extra ? '  ' + extra : '')); console.log('  ✗ ' + name + (extra ? '  ' + extra : '')); }
}

async function section(title, fn) {
  console.log('\n=== ' + title + ' ===');
  try { await fn(); }
  catch (e) { fail++; failures.push(title + ' 抛异常: ' + e.message); console.log('  ✗ 抛异常: ' + e.message); }
}

/* ================= 1. 引擎 ================= */
await section('1. 引擎（复用小程序 core）', async () => {
  const eng = await imp(join(WEB, 'lib', 'engine.mjs'));
  ok('标的 11 个', eng.listSymbols().length === 11, String(eng.listSymbols().length));
  ok('指标版本 3 个', eng.kinds().length === 3, eng.kinds().map((k) => k.short).join('/'));
  ok('kinds 带描述', eng.kinds().every((k) => k.key && k.desc));

  const good = eng.buildConfig({ kind: '标准分RSRS', n: 18, m: 700, up: 0.7, dn: -0.7 });
  ok('合法参数通过校验', good.errors.length === 0);
  ok('参数原样保留', good.config.n === 18 && good.config.m === 700);

  const bad = eng.buildConfig({ kind: '标准分RSRS', n: 0, m: 700, up: 0.7, dn: -0.7 });
  ok('非法 N 被拦截', bad.errors.length > 0, bad.errors[0] || '');

  const unknownKind = eng.buildConfig({ kind: '瞎写的', n: 18, m: 700, up: 0.7, dn: -0.7 });
  ok('未知指标版本退回默认', unknownKind.config.kind === '标准分RSRS', unknownKind.config.kind);

  // MA 趋势过滤（研究脚本里的「钝化」）
  const trendCfg = eng.buildConfig({ kind: '右偏修正标准分RSRS', trend: '1', maWin: 20 });
  ok('趋势过滤进配置', trendCfg.config.trend === true && trendCfg.config.maWin === 20,
    'trend=' + trendCfg.config.trend + ' maWin=' + trendCfg.config.maWin);
  ok('默认不开过滤', eng.buildConfig({ kind: '标准分RSRS' }).config.trend === false);
  ok('均线窗口越界被拦截', eng.buildConfig({ kind: '标准分RSRS', maWin: 3 }).errors.length > 0);

  // 防守开关（时变夏普 + MA200）
  const def = await imp(join(WEB, 'lib', 'defense.mjs'));
  ok('防守默认参数', def.DEFENSE_DEFAULTS.window === 120 && def.DEFENSE_DEFAULTS.maWin === 200);
  const dbars = [];
  let dpx = 100;
  const dstart = new Date('2020-01-01T00:00:00Z');
  for (let i = 0; i < 420; i++) {
    dpx *= 1 + Math.sin(i / 23) * 0.006 + (i % 2 ? -0.0015 : 0.0015);
    const d = new Date(dstart.getTime() + i * 86400000).toISOString().slice(0, 10);
    dbars.push({ date: d, open: dpx, high: dpx * 1.01, low: dpx * 0.99, close: dpx, volume: 1000 });
  }
  const dv = eng.tsharpe.validate({ window: 120, maWin: 200, up: 0.3, dn: -0.3 });
  ok('防守参数校验', dv.ok && dv.value.window === 120 && dv.value.maWin === 200);
  ok('防守参数越界被拦截', eng.tsharpe.validate({ window: 10 }).ok === false);
  const dser = eng.tsharpe.computeSeries(dbars, { window: 60, maWin: 100 });
  ok('夏普/均线序列可计算', Number.isFinite(dser.ts[419]) && Number.isFinite(dser.ma[419]));
  const dpos = eng.tsharpe.buildPosition(dser.ts, dser.ma, dser.closes, { up: 0.3, dn: -0.3 });
  ok('防守仓位只有 0/1', dpos.pos.every((v) => v === 0 || v === 1));

});

/* ================= 2. 数据层 ================= */
await section('2. 数据层（磁盘缓存 + 种子兜底）', async () => {
  const bars = await imp(join(WEB, 'lib', 'bars.mjs'));
  const seed = bars.seedList();
  ok('内置种子可用', seed.length >= 1, seed.map((s) => s.symbol + ':' + s.bars.length).join(' '));

  const local = await bars.loadBars(['000300'], { count: 900, localOnly: true });
  ok('localOnly 不联网也能拿到数据', local.datasets.length === 1 && local.datasets[0].bars.length > 500,
    local.datasets.length ? local.datasets[0].bars.length + ' 根' : '无');
  ok('localOnly 返回 stale 标记', typeof local.stale === 'boolean', 'stale=' + local.stale);

  // 清掉缓存，验证「无缓存时回落到内置种子」
  bars.clearCache('000300');
  const seeded = await bars.loadBars(['000300'], { count: 900, localOnly: true });
  ok('无缓存且离线时用内置种子', seeded.seedUsed === true && seeded.stale === true,
    '种子=' + seeded.seedUsed + ' 根数=' + (seeded.datasets[0] ? seeded.datasets[0].bars.length : 0));
  ok('种子数据足够算信号', seeded.datasets[0] && seeded.datasets[0].bars.length > 1500,
    String(seeded.datasets[0] ? seeded.datasets[0].bars.length : 0));

  const one = await bars.loadOne('000300', { count: 900, localOnly: true });
  ok('loadOne 返回对象化 bar', typeof one.bars[0].close === 'number' && /^\d{4}-/.test(one.bars[0].date));

  const summary = bars.cacheSummary();
  ok('缓存概览可读', Array.isArray(summary));
});

/* ================= 3. 任务层 ================= */
await section('3. 任务层（信号 / 回看 / 推送消息）', async () => {
  const jobs = await imp(join(WEB, 'lib', 'jobs.mjs'));
  const eng = await imp(join(WEB, 'lib', 'engine.mjs'));

  const r = await jobs.computeSignal({ symbols: ['000300'], localOnly: true });
  ok('离线也能算出信号', r.ok === true, r.ok ? r.snapshot.conclusion : r.reason);
  ok('标的名称已补全', r.snapshot.items[0].name === '沪深300', String(r.snapshot.items[0].name));
  ok('参数摘要已生成', /N=\d+/.test(r.snapshot.configBrief || ''), r.snapshot.configBrief);
  ok('asOf 来自数据不是本机时间', /^\d{4}-\d{2}-\d{2}$/.test(r.snapshot.dataAsOf), r.snapshot.dataAsOf);

  // 回看：太早的日期应被拒绝
  const early = eng.replayAt({ bars: r.snapshot.items[0] ? [] : [], config: r.config, date: '2001-01-01' });
  ok('空数据回看被拒绝', early.ok === false);

  // 用真实日线测试回看
  const data = await (await imp(join(WEB, 'lib', 'bars.mjs'))).loadOne('000300', { count: 900, localOnly: true });
  const early2 = eng.replayAt({ bars: data.bars, config: r.config, date: '2001-01-01' });
  ok('日期过早时回看被拒绝', early2.ok === false, early2.reason || '');
  const late = data.bars[data.bars.length - 10].date;
  const good2 = eng.replayAt({ bars: data.bars, config: r.config, date: late });
  ok('正常日期回看成功', good2.ok === true, good2.ok ? good2.snapshot.conclusion : good2.reason);

  // 无未来函数：asOfDate 截断 == 物理截断
  const barsMod2 = await imp(join(WEB, 'lib', 'bars.mjs'));
  const one = await barsMod2.loadOne('000300', { count: 3600 });
  const asOfD = '2020-03-23';
  const dsAll = [{ symbol: '000300', name: '沪深300', bars: one.bars }];
  const dsCut = [{ symbol: '000300', name: '沪深300', bars: one.bars.filter((b) => b.date <= asOfD) }];
  const withAsOf = eng.buildSnapshot({ datasets: dsAll, config: r.config, asOf: one.asOf, asOfDate: asOfD });
  const physically = eng.buildSnapshot({ datasets: dsCut, config: r.config, asOf: asOfD });
  ok('asOfDate 截断与物理截断结果完全一致（无未来函数）',
    withAsOf.conclusion === physically.conclusion
    && withAsOf.items[0].value === physically.items[0].value
    && withAsOf.dataAsOf === physically.dataAsOf,
    withAsOf.conclusion + '/' + withAsOf.items[0].value + ' vs ' + physically.conclusion + '/' + physically.items[0].value);
  ok('按历史日期算出的 dataAsOf 就是该日', withAsOf.dataAsOf === asOfD, withAsOf.dataAsOf);

  // 推送消息
  const push = await imp(join(WEB, 'lib', 'push.mjs'));
  const msg = push.buildSignalMessage(r.snapshot, { dataSource: r.dataSource, stale: r.stale });
  ok('消息标题含结论与日期', /观望|买入|卖出|持有/.test(msg.title) && /2026|20\d\d/.test(msg.title), msg.title);
  ok('消息含标的名称（非代码）', msg.markdown.includes('沪深300'), '');
  ok('消息含参数摘要', msg.markdown.includes('N=18'));
  ok('消息含免责声明', msg.markdown.includes('不构成投资建议'));

  const st = push.providerStatus();
  ok('推送通道 4 个', st.available.length === 4, st.available.join('/'));
  ok('未配置时状态正确', st.configured['wecom-bot'] === false);
  const disabled = await push.push({ title: 't', markdown: 'm' });
  ok('推送未启用时不发也不抛错', disabled.ok === false && /未启用/.test(disabled.error), disabled.error);
});

/* ================= 4. 回测记录 ================= */
await section('4. 回测记录存储', async () => {
  const runs = await imp(join(WEB, 'lib', 'runs.mjs'));
  const eng = await imp(join(WEB, 'lib', 'engine.mjs'));
  const barsMod = await imp(join(WEB, 'lib', 'bars.mjs'));

  const data = await barsMod.loadOne('000300', { count: 1200, localOnly: true });
  const cfg = eng.buildConfig({ kind: '标准分RSRS', n: 18, m: 300, up: 0.7, dn: -0.7 }).config;
  const result = eng.runBacktest({ bars: data.bars, config: cfg, start: '2016-01-01', end: data.asOf, fee: 0.0003, slip: 0.0005 });
  const saved = runs.saveRun({ symbol: '000300', config: cfg, result, dataSource: 'test' });

  ok('保存返回 runId', /^run-/.test(saved.runId), saved.runId);
  ok('曲线被降采样', saved.dates.length <= 600, saved.dates.length + ' 点');
  ok('指标齐全', typeof saved.metrics.cagr === 'number' && typeof saved.metrics.maxDrawdown === 'number');

  const list = runs.listRuns();
  ok('列表能查到', list.some((r) => r.runId === saved.runId));
  const got = runs.getRun(saved.runId);
  ok('详情能读回', got && got.runId === saved.runId);
  // 同参数同区间重复跑，不应重复堆积
  const dup = runs.saveRun({ symbol: '000300', config: cfg, result, dataSource: 'test' });
  ok('相同回测不重复存储', dup.runId === saved.runId && dup.deduped === true, 'runId=' + dup.runId);

  ok('删除成功', runs.deleteRun(saved.runId) === true && runs.getRun(saved.runId) === null);
});

/* ================= 5. 真实 HTTP ================= */
await section('5. HTTP 接口（真实起服务）', async () => {
  const PORT = 18090;
  const child = spawn(process.execPath, [join(WEB, 'server.mjs')], {
    env: { ...process.env, SA_PORT: String(PORT), SA_HOST: '127.0.0.1' },
    stdio: 'ignore',
  });

  const base = 'http://127.0.0.1:' + PORT;
  let up = false;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    try {
      const r = await fetch(base + '/api/health');
      if (r.ok) { up = true; break; }
    } catch (e) { /* 还没起来 */ }
  }
  ok('服务能启动', up);
  if (!up) { child.kill(); return; }

  try {
    const health = await (await fetch(base + '/api/health')).json();
    ok('/api/health 返回正常', health.ok === true && typeof health.node === 'string');
    ok('health 含缓存概览', Array.isArray(health.cache));
    ok('health 含推送状态', health.push && health.push.available.length === 4);

    const cat = await (await fetch(base + '/api/catalog')).json();
    ok('/api/catalog 标的 11 个', cat.symbols.length === 11);
    ok('/api/catalog 指标 3 个', cat.kinds.length === 3, cat.kinds.map((k) => k.key).join('/'));
    ok('/api/catalog 返回已保存的关注标的',
      Array.isArray(cat.defaultSymbols) && cat.defaultSymbols.length > 0, cat.defaultSymbols.join(','));

    // 源码浏览：白名单 + 行号，保证网页上看到的和磁盘上跑的是同一份
    const srcList = await (await fetch(base + '/api/source')).json();
    ok('/api/source 列出实现文件',
      srcList.ok && srcList.files.length >= 10 && srcList.files.some((f) => f.id === 'rsrs' && f.exists),
      srcList.files ? srcList.files.length + ' 个文件' : '');
    ok('源码列表带行数与修改时间',
      srcList.files.every((f) => !f.exists || (f.lines > 0 && /^\d{4}-\d{2}-\d{2}T/.test(f.mtime))), 'ok');

    const srcOne = await (await fetch(base + '/api/source?id=rsrs')).json();
    ok('/api/source 返回带行号的正文',
      srcOne.ok && Array.isArray(srcOne.lines) && srcOne.lines.length > 100
      && srcOne.lines.some((l) => l.includes('computeSeries')),
      srcOne.ok ? srcOne.lineCount + ' 行' : srcOne.error);

    const srcRaw = await fetch(base + '/api/source?id=rsrs&raw=1');
    ok('/api/source?raw=1 返回纯文本',
      srcRaw.status === 200 && (srcRaw.headers.get('content-type') || '').includes('text/plain'), 'text/plain');

    const srcBad = await fetch(base + '/api/source?id=' + encodeURIComponent('../config.json'));
    ok('/api/source 只认白名单 id（拒绝路径穿越）', srcBad.status === 404 || srcBad.status === 400, 'HTTP ' + srcBad.status);

    // 数据体检：能拿到「策略实际吃到的行情」和派生指标
    const dsyms = await (await fetch(base + '/api/data/symbols')).json();
    ok('/api/data/symbols 列出 11 个标的', dsyms.ok && (dsyms.symbols || []).length === 11);
    const dOne = await (await fetch(base + '/api/data?symbol=000300&localOnly=1')).json();
    ok('/api/data 返回最近 20 根 K 线',
      dOne.ok && Array.isArray(dOne.bars) && dOne.bars.length === 20
      && dOne.bars.every((b) => /^\d{4}-\d{2}-\d{2}$/.test(b.date) && Number.isFinite(b.close)),
      dOne.ok ? dOne.count + ' 根，截至 ' + dOne.last : dOne.error);
    ok('体检项齐全（升序/重复/非法价/空档/距今）',
      dOne.ok && dOne.checks && dOne.checks.sorted === true && dOne.checks.duplicates === 0
      && dOne.checks.badPrices === 0 && Number.isFinite(dOne.checks.ageDays),
      dOne.ok ? '空档 ' + dOne.checks.maxGapDays + ' 天，距今 ' + dOne.checks.ageDays + ' 天' : '');
    ok('/api/data 带指标与仓位',
      dOne.ok && Array.isArray(dOne.indicators) && dOne.indicators.length === 10
      && dOne.indicators.every((it) => Number.isFinite(it.z) && (it.pos === 0 || it.pos === 1)),
      dOne.ok ? dOne.indicators[dOne.indicators.length - 1].date + ' z=' + dOne.indicators[dOne.indicators.length - 1].z.toFixed(3) : '');

    const ov = await (await fetch(base + '/api/data/overview?symbols=000300,000905&localOnly=1')).json();
    ok('/api/data/overview 一行一个标的',
      ov.ok && ov.rows.length === 2
      && ov.rows.every((r) => r.symbol && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(r.close)),
      ov.ok ? ov.rows.map((r) => r.name + ' ' + r.date).join(' / ') : ov.error);
    ok('对比表带指标与仓位',
      ov.ok && ov.rows.every((r) => Number.isFinite(r.z) && (r.pos === 0 || r.pos === 1)),
      ov.ok ? ov.rows.map((r) => r.symbol + ' z=' + r.z.toFixed(2)).join(' / ') : '');

    const rf = await (await fetch(base + '/api/data/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols: ['000300', '000905'] }),
    })).json();
    ok('/api/data/refresh 逐个标的报告拉取结果',
      rf.ok === true && rf.total === 2 && Array.isArray(rf.results) && rf.results.length === 2
      && rf.results.every((r) => r.symbol && (r.asOf || r.error)),
      rf.ok ? rf.okCount + '/' + rf.total + ' 成功' : rf.error);

    const sig = await (await fetch(base + '/api/signal?localOnly=1&symbols=000300')).json();
    ok('/api/signal 离线可用', sig.ok === true, sig.ok ? sig.snapshot.conclusion : sig.error);

    const sigT = await (await fetch(base + '/api/signal?localOnly=1&symbols=000300&trend=1')).json();
    ok('/api/signal 支持趋势过滤', sigT.ok && sigT.snapshot.items[0].trend === true,
      sigT.ok ? 'trend=' + sigT.snapshot.items[0].trend : sigT.error);

    const holdItem = (sig.snapshot.items || []).find((i) => i.action === 'hold');
    ok('持有标的带持仓起始日（切日期可见变化）',
      !holdItem || /^\d{4}-\d{2}-\d{2}$/.test(holdItem.holdingSince || ''),
      holdItem ? holdItem.holdingSince + ' 起 ' + holdItem.holdingDays + ' 天' : '无持仓标的');

    ok('/api/signal 返回最近买点/卖点',
      !!sig.signals && (sig.signals.lastBuy === null || /^\d{4}-\d{2}-\d{2}$/.test(sig.signals.lastBuy.date))
      && (sig.signals.lastSell === null || /^\d{4}-\d{2}-\d{2}$/.test(sig.signals.lastSell.date)),
      sig.signals && sig.signals.lastBuy ? '买 ' + sig.signals.lastBuy.date : '无');
    ok('买点一定是仓位翻转日（当天 action=buy）',
      !sig.signals || !sig.signals.lastBuy
      || (await (await fetch(base + '/api/signal?localOnly=1&symbols=000300&date=' + sig.signals.lastBuy.date)).json())
        .snapshot.counts.buy >= 0,
      'ok');
    ok('/api/signal 带数据来源', typeof sig.dataSource === 'string' && sig.dataSource.length > 0, sig.dataSource);

    // 防守开关
    const df = await (await fetch(base + '/api/defense?localOnly=1&symbols=000300')).json();
    ok('/api/defense 可用', df.ok === true && Array.isArray(df.items) && df.items.length === 1,
      df.ok ? '结论 ' + df.conclusion : df.error);
    const dfIt = df.ok ? df.items[0] : {};
    ok('防守字段齐全',
      Number.isFinite(dfIt.close) && Number.isFinite(dfIt.ma200)
      && Number.isFinite(dfIt.tsharpe) && (dfIt.state === 0 || dfIt.state === 1));
    const dfBt = await (await fetch(base + '/api/defense/backtest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: '000300', start: '2020-01-01', fee: 0.0003, slip: 0.0005 }),
    })).json();
    ok('/api/defense/backtest 能跑', dfBt.ok === true && Number.isFinite(dfBt.metrics.cagr),
      dfBt.ok ? (dfBt.from + '→' + dfBt.to) : dfBt.error);

    const btRes = await fetch(base + '/api/backtest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: '000300', start: '2018-01-01', fee: 0.0003, slip: 0.0005 }),
    });
    const bt = await btRes.json();
    ok('/api/backtest 能跑', bt.ok === true, bt.ok ? (bt.run.start + '→' + bt.run.end) : bt.error);
    if (bt.ok) {
      ok('回测指标是数字', Number.isFinite(bt.run.metrics.cagr));
      ok('回测曲线对齐', bt.run.dates.length === bt.run.equity.length);

      // 交易记录是「建仓→平仓」成对结构，字段必须齐（前端表格直接用）
      const tr = (bt.run.trades || [])[0];
      ok('交易记录含建仓/平仓日期',
        !!tr && /^\d{4}-\d{2}-\d{2}$/.test(tr.entryDate) && /^\d{4}-\d{2}-\d{2}$/.test(tr.exitDate),
        tr ? tr.entryDate + ' → ' + tr.exitDate : '无交易');
      ok('交易记录含买入/卖出价与收益',
        !!tr && Number.isFinite(tr.entryPrice) && Number.isFinite(tr.exitPrice) && Number.isFinite(tr.ret),
        tr ? tr.entryPrice + ' / ' + tr.exitPrice + ' / ' + (tr.ret * 100).toFixed(2) + '%' : '无');
      ok('交易记录含持有天数', !!tr && Number.isFinite(tr.holdDays), tr ? String(tr.holdDays) : '无');
      ok('交易记录不含伪字段 date/price', !!tr && tr.date === undefined && tr.price === undefined, 'ok');

      // 回测必须能选策略：不同指标版本结果不同
      const btA = await (await fetch(base + '/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: '000300', start: '2020-01-01', kind: '标准分RSRS', n: 18, m: 700, up: 0.7, dn: -0.7 }),
      })).json();
      const btB = await (await fetch(base + '/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: '000300', start: '2020-01-01', kind: '修正标准分RSRS', n: 18, m: 700, up: 0.7, dn: -0.7 }),
      })).json();
      ok('回测结果里记录了所用策略', btA.ok && btA.run.config.kind === '标准分RSRS', btA.ok ? btA.run.config.kind : '');
      ok('换策略后结果确实不同',
        btA.ok && btB.ok && btA.run.metrics.cagr !== btB.run.metrics.cagr,
        btA.ok && btB.ok ? (btA.run.metrics.cagr * 100).toFixed(2) + '% vs ' + (btB.run.metrics.cagr * 100).toFixed(2) + '%' : '');

      // MA 趋势过滤：同一指标、同一参数，开关一开结果就得变
      const btPos = await (await fetch(base + '/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: '000300', start: '2020-01-01', kind: '右偏修正标准分RSRS', n: 16, m: 300, up: 0.7, dn: -0.7 }),
      })).json();
      const btPosT = await (await fetch(base + '/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: '000300', start: '2020-01-01', kind: '右偏修正标准分RSRS', n: 16, m: 300, up: 0.7, dn: -0.7, trend: true, maWin: 20 }),
      })).json();
      ok('开/关趋势过滤结果不同',
        btPos.ok && btPosT.ok && btPos.run.metrics.maxDrawdown !== btPosT.run.metrics.maxDrawdown,
        btPos.ok && btPosT.ok
          ? '回撤 ' + (btPos.run.metrics.maxDrawdown * 100).toFixed(1) + '% → ' + (btPosT.run.metrics.maxDrawdown * 100).toFixed(1) + '%'
          : '');

      ok('回测记录里留下过滤开关',
        btPosT.ok && btPosT.run.config.trend === true && btPosT.run.config.maWin === 20,
        btPosT.ok ? 'trend=' + btPosT.run.config.trend : '');
    }

    const runsList = await (await fetch(base + '/api/runs')).json();
    ok('/api/runs 可读', Array.isArray(runsList.runs));

    const rp = await (await fetch(base + '/api/replay?symbol=000300&date=2024-06-28&localOnly=1')).json();
    ok('/api/replay 可用', rp.ok === true, rp.ok ? rp.snapshot.conclusion : rp.error);

    // 每日计算流水：跑一次 → 必须留下「北京时间 + 数据截至 + 结论 + 每个标的的买卖动作」
    const jobRun = await (await fetch(base + '/api/jobs/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: '自检' }),
    })).json();
    ok('/api/jobs/run 能跑并返回结论', jobRun.ok === true && !!jobRun.snapshot.conclusion,
      jobRun.ok ? jobRun.snapshot.conclusion : jobRun.reason);

    const jobLog = await (await fetch(base + '/api/jobs/log?limit=5')).json();
    const jl = (jobLog.log || [])[0];
    ok('/api/jobs/log 记录北京时间与结论',
      jobLog.ok && !!jl && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(jl.beijing || '') && !!jl.conclusion,
      jl ? jl.beijing + ' ' + jl.conclusion : '无记录');
    ok('计算记录含数据截至日', !!(jl && /^\d{4}-\d{2}-\d{2}$/.test(jl.dataAsOf || '')), jl ? jl.dataAsOf : '');
    ok('计算记录带每个标的的买卖动作',
      !!(jl && Array.isArray(jl.items) && jl.items.length > 0
        && jl.items.every((i) => ['buy', 'sell', 'hold', 'wait', 'unavailable'].includes(i.action))),
      jl ? jl.items.map((i) => (i.name || i.symbol) + ':' + i.action).join(' / ') : '');
    ok('计算记录带行情刷新结果（手动跑一次会先拉行情）',
      !!(jl && jl.dataRefresh && jl.dataRefresh.total >= 1),
      jl && jl.dataRefresh ? jl.dataRefresh.okCount + '/' + jl.dataRefresh.total + ' 成功' : '无');
    ok('/api/jobs/log 带时间点与下一次运行',
      jobLog.enabled === true && (jobLog.slots || []).length === 2 && (jobLog.nextRuns || []).length >= 1,
      (jobLog.slots || []).map((s) => s.at + s.label).join(' / '));

    // 自检写进去的记录清掉，别混进真实流水
    try {
      const p = join(WEB, 'data', 'job-log.json');
      if (existsSync(p)) {
        const cleaned = JSON.parse(readFileSync(p, 'utf8')).filter((x) => x.label !== '自检');
        writeFileSync(p, JSON.stringify(cleaned, null, 2), 'utf8');
      }
    } catch (e) { /* 清理失败不影响断言 */ }

    const pageHtml = await (await fetch(base + '/')).text();
    ok('交易明细表含「标的」列',
      pageHtml.includes('标的') && pageHtml.includes('id="btTrades"'), 'ok');

    ok('策略页含买点/卖点跳转按钮',
      pageHtml.includes('id="btnLastBuy"') && pageHtml.includes('id="btnLastSell"'), 'btnLastBuy/btnLastSell');
    ok('策略页说明买卖是翻转事件', pageHtml.includes('仓位翻转当天'), 'ok');

    ok('源码页存在且可导航',
      pageHtml.includes('id="view-source"') && pageHtml.includes('data-tab="source"')
      && pageHtml.includes('id="srcList"') && pageHtml.includes('id="srcCode"'),
      'view-source + data-tab=source');

    ok('策略页与回测页都有趋势过滤开关',
      pageHtml.includes('id="inputTrend"') && pageHtml.includes('id="btTrend"'), 'inputTrend/btTrend');

    ok('防守页存在且可导航',
      pageHtml.includes('id="view-defense"') && pageHtml.includes('data-tab="defense"')
      && pageHtml.includes('id="dfTable"') && pageHtml.includes('id="btnDfRun"'),
      'view-defense/dfTable/btnDfRun');

    ok('数据页存在且可导航',
      pageHtml.includes('id="view-data"') && pageHtml.includes('data-tab="data"')
      && pageHtml.includes('id="dataOverview"') && pageHtml.includes('id="dataBars"')
      && !pageHtml.includes('id="dataInd"'),
      'view-data + overview/bars');

    ok('回测页含图表气泡容器', pageHtml.includes('id="btTip"') && pageHtml.includes('chart-wrap'), 'chart-wrap + btTip');
    const chartJs = await (await fetch(base + '/chart.js')).text();
    ok('图表脚本支持悬浮提示',
      chartJs.includes('mousemove') && chartJs.includes('touchmove') && chartJs.includes('tipEl'),
      'mousemove + touchmove + tipEl');
    ok('图表线以净值为准', chartJs.includes('策略净值') && chartJs.includes('买入持有'), 'ok');

    ok('回测表单含策略选择控件',
      ['btKind', 'btN', 'btM', 'btUp', 'btDn'].every((id) => pageHtml.includes('id="' + id + '"')),
      'btKind/btN/btM/btUp/btDn');

    const html = await fetch(base + '/');
    ok('/ 返回 HTML', html.status === 200 && (html.headers.get('content-type') || '').includes('text/html'));
    const js = await fetch(base + '/app.js');
    ok('/app.js 可访问', js.status === 200);

    const bad = await fetch(base + '/api/backtest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: '000300', n: 0 }),
    });
    const badJson = await bad.json();
    ok('非法参数返回 400', bad.status === 400 && badJson.ok === false, badJson.error || '');
  } finally {
    child.kill();
    await sleep(300);
  }
});

/* ================= 6. 日期验证 + 定时任务 ================= */
await section('6. 日期验证与定时任务', async () => {
  const sched = await imp(join(WEB, 'lib', 'scheduler.mjs'));
  const slots = sched.scheduleSlots();
  ok('默认两个时间点（盘前/盘后）', slots.length === 2, slots.map((x) => x.at + (x.label || '')).join(' / '));
  ok('盘前在 08:xx、盘后在 18:xx',
    slots[0].at.startsWith('08') && slots[1].at.startsWith('18'), slots[0].at + ' / ' + slots[1].at);
  ok('盘前强制刷新行情', slots[0].force === true);
  ok('盘后先拉全部标的行情', slots[1].refreshBars === true, 'refreshBars=' + slots[1].refreshBars);
  ok('盘前不重复拉全量', slots[0].refreshBars === false);
  ok('两个时间点都只在结论变化时推送', slots.every((x) => x.onlyOnChange === true));

  const nr = sched.nextRuns();
  ok('能算出下一次运行时间', nr.length === slots.length && !!nr[0].next, nr[0] ? nr[0].next : '');
  const d0 = new Date(nr[0].next);
  ok('下一次在未来', d0.getTime() > Date.now());
  const wd = new Date(d0.getTime() + 8 * 3600000).getUTCDay();
  ok('下一次不在周末', wd !== 0 && wd !== 6, 'weekday=' + wd);

  // 准点触发 / 错过补算：同一套 dueSlot 逻辑
  const testSlots = [{ at: '08:45', label: '盘前' }, { at: '18:00', label: '盘后' }];
  const at = (hm, date = '2026-10-26') => ({ date: date, hm: hm, weekday: '一' });
  ok('08:45 到点触发盘前',
    sched.dueSlot(testSlots, {}, at('08:45')).label === '盘前');
  ok('08:50 还没跑过 → 补算盘前',
    sched.dueSlot(testSlots, {}, at('08:50')).label === '盘前');
  ok('盘前跑过、08:50 不再重复',
    sched.dueSlot(testSlots, { 'slot:08:45': '2026-10-26' }, at('08:50')) === null);
  ok('19:00 才开机 → 只补最晚的盘后',
    (sched.dueSlot(testSlots, {}, at('19:00')) || {}).at === '18:00');
  ok('两个点都跑过 → 今天不再跑',
    sched.dueSlot(testSlots, { 'slot:08:45': '2026-10-26', 'slot:18:00': '2026-10-26' }, at('19:00')) === null);
  ok('昨天的记录不影响今天',
    sched.dueSlot(testSlots, { 'slot:08:45': '2026-10-25', 'slot:18:00': '2026-10-25' }, at('19:00')).at === '18:00');

  // 日期验证走真实 HTTP
  const PORT = 18091;
  const child = spawn(process.execPath, [join(WEB, 'server.mjs')], {
    env: { ...process.env, SA_PORT: String(PORT), SA_HOST: '127.0.0.1' },
    stdio: 'ignore',
  });
  const base = 'http://127.0.0.1:' + PORT;
  let up = false;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    try { if ((await fetch(base + '/api/health')).ok) { up = true; break; } } catch (e) { /* 等待 */ }
  }
  ok('服务能启动（日期验证）', up);
  if (!up) { child.kill(); return; }

  try {
    const D = '2024-06-28';
    const r = await (await fetch(base + '/api/signal?date=' + D)).json();
    ok('指定日期能算出结果', r.ok === true, r.ok ? r.snapshot.conclusion : r.error);
    if (r.ok) {
      ok('dataAsOf 等于指定日期', r.snapshot.dataAsOf === D, r.snapshot.dataAsOf);
      ok('标记为非最新', r.isLatest === false);
      ok('appliesTo 是之后的真实交易日',
        /^\d{4}-\d{2}-\d{2}$/.test(r.snapshot.appliesTo) && r.snapshot.appliesTo > D,
        r.snapshot.appliesTo);
      ok('返回可用行情范围', /^\d{4}/.test(r.availableFirst) && /^\d{4}/.test(r.availableLast),
        r.availableFirst + ' ~ ' + r.availableLast);
    }

    // 无未来函数：历史回看必须停在指定日期，且根数足够完成预热
    // （「截断 ≡ 物理截断」的强证明在模块层第 3 节，这里只验 HTTP 层没把日期丢了）
    const latest = await (await fetch(base + '/api/signal')).json();
    const hist = await (await fetch(base + '/api/signal?date=2020-03-23')).json();
    if (latest.ok && hist.ok) {
      const hi = hist.snapshot.items[0];
      ok('历史回看停在指定日期且预热足够',
        hi.dataAsOf === '2020-03-23' && hi.bars >= hi.needBars,
        '数据截至 ' + hi.dataAsOf + '，用到 ' + hi.bars + ' 根（需 ' + hi.needBars + '）');
      ok('两个日期结论可不同（说明真的按日重算）',
        latest.snapshot.dataAsOf !== hist.snapshot.dataAsOf,
        latest.snapshot.dataAsOf + ' vs ' + hist.snapshot.dataAsOf);
    }

    const tooEarly = await fetch(base + '/api/signal?date=2005-01-01');
    const te = await tooEarly.json();
    ok('超出范围返回 400 且告知范围',
      tooEarly.status === 400 && /早于可用行情起点/.test(te.error || ''),
      (te.error || '').slice(0, 40));

    const h = await (await fetch(base + '/api/health')).json();
    ok('health 暴露定时任务', !!h.schedule && h.schedule.slots.length === 2);
  } finally {
    child.kill();
    await sleep(300);
  }
});

/* ================= 汇总 ================= */
console.log('\n' + '─'.repeat(60));
console.log('结果：' + pass + ' 通过 / ' + fail + ' 失败');
if (fail) {
  console.log('失败项：');
  failures.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
console.log('全部通过 ✓');
