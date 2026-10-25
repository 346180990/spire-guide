/**
 * 定时任务 —— 每个交易日盘前 / 盘后各算一遍
 *
 * 盘前 08:45：用「昨日收盘」的最终数据重跑，作为今天的操作依据
 *              （数据源盘后有时还没更新完整，这次能纠正；force=true 强制刷新）
 * 盘后 18:00：收盘后先拉全部行情，再算「明日」的信号并留档
 *
 * 两次都重算，但只有结论签名变化时才推送，所以一天最多一条消息。
 * 实现上用「每分钟对一次表」，不引入 cron 依赖，对一天两次的精度足够。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG, PATHS } from './config.mjs';
import { dailyJob } from './jobs.mjs';
import { refreshAllBars } from './refresh.mjs';

let timer = null;
let running = false;

const STATE_FILE = () => join(PATHS.data, 'state.json');

function readStateSafe() {
  try {
    const p = STATE_FILE();
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    return {};
  }
}

function writeStateSafe(s) {
  try { writeFileSync(STATE_FILE(), JSON.stringify(s, null, 2), 'utf8'); } catch (e) { /* ignore */ }
}

/** 北京时间的日期与 HH:mm */
function beijingNow() {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short',
  }).formatToParts(new Date());
  const get = (t) => (parts.find((p) => p.type === t) || {}).value || '';
  return {
    date: get('year') + '-' + get('month') + '-' + get('day'),
    hm: get('hour') + ':' + get('minute'),
    weekday: get('weekday'),
  };
}

function isWeekday(weekday) {
  return !/六|日|Sat|Sun/.test(weekday);
}

/** 当前生效的时间点列表 */
export function scheduleSlots() {
  const sc = CONFIG.scheduler || {};
  if (Array.isArray(sc.slots) && sc.slots.length) {
    return sc.slots.map((s) => ({
      at: String(s.at || '18:00'),
      label: s.label || '',
      force: !!s.force,
      onlyOnChange: s.onlyOnChange === undefined ? sc.onlyOnChange !== false : !!s.onlyOnChange,
      /** 盘后把全部 11 个标的的行情拉到最新，再算信号 */
      refreshBars: !!s.refreshBars,
    }));
  }
  if (sc.at) {
    return [{ at: String(sc.at), label: '每日', force: false, onlyOnChange: sc.onlyOnChange !== false, refreshBars: true }];
  }
  return [];
}

/** 下一次要跑的时间（北京时间字符串），给前端展示 */
export function nextRuns(now = new Date()) {
  const slots = scheduleSlots();
  if (!CONFIG.scheduler.enabled || !slots.length) return [];
  const out = [];
  for (const s of slots) {
    const [hh, mm] = s.at.split(':').map(Number);
    for (let addDays = 0; addDays <= 4; addDays++) {
      // 用 UTC 粗算 +8 小时，只用于展示，不参与判定
      const t = new Date(now.getTime() + addDays * 86400000);
      const beijing = new Date(t.getTime() + 8 * 3600000);
      const target = new Date(Date.UTC(
        beijing.getUTCFullYear(), beijing.getUTCMonth(), beijing.getUTCDate(), hh - 8, mm, 0
      ));
      if (target.getTime() <= now.getTime()) continue;
      const wd = new Date(target.getTime() + 8 * 3600000).getUTCDay();
      if (wd === 0 || wd === 6) continue; // 跳过周末
      out.push({ at: s.at, label: s.label, next: target.toISOString() });
      break;
    }
  }
  return out.sort((a, b) => (a.next < b.next ? -1 : 1));
}

/**
 * 今天已到点、还没跑过的时间点（返回最晚那个）
 * 用途：准点触发 + 错过补算，一套逻辑；错过多个时只补一次，避免开机后连着跑几遍。
 */
export function dueSlot(slots, doneMap, now) {
  const done = doneMap || {};
  return (slots || [])
    .filter((s) => s.at <= now.hm && done['slot:' + s.at] !== now.date)
    .sort((a, b) => (a.at < b.at ? 1 : -1))[0] || null;
}

async function tick() {
  if (running) return;
  const now = beijingNow();
  const slots = scheduleSlots();
  const state = readStateSafe();
  const doneMap = state.lastAutoRun || {};

  // 今天已到点、还没跑过的时点。错过的会自动补算（挑最晚那个，一天只补一次）
  const hit = dueSlot(slots, doneMap, now);
  if (!hit) return;
  const late = now.hm > hit.at;

  // 把今天已过的时点全部标记为已处理，避免接下来每分钟补算一次
  const markDone = () => {
    for (const s of slots) if (s.at <= now.hm) doneMap['slot:' + s.at] = now.date;
    state.lastAutoRun = doneMap;
    writeStateSafe(state);
  };

  if (!isWeekday(now.weekday)) {
    markDone();
    return;
  }

  running = true;
  const startedAt = Date.now();
  try {
    const label = (hit.label || '定时') + (late ? '（补算 ' + hit.at + '）' : '');
    console.log('[scheduler] ' + now.date + ' ' + now.hm + ' ' + label + ' 开始（force=' + hit.force + '）');

    // 收盘后先把 11 个标的的行情拉到最新，再算信号（信号直接读刚刷新的缓存）
    let dataRefresh = null;
    if (hit.refreshBars) {
      try {
        dataRefresh = await refreshAllBars({ force: true });
        const failed = dataRefresh.results.filter((x) => !x.ok).map((x) => x.symbol);
        console.log('[scheduler] 行情刷新 ' + dataRefresh.okCount + '/' + dataRefresh.total + ' 成功'
          + (failed.length ? '（失败：' + failed.join('、') + '）' : ''));
      } catch (e) {
        console.error('[scheduler] 行情刷新失败: ' + e.message);
      }
    }

    const r = await dailyJob({
      force: hit.force,
      onlyOnChange: hit.onlyOnChange,
      label,
      trigger: late ? 'catchup' : 'scheduler',
      dataRefresh: dataRefresh
        ? {
          at: dataRefresh.at,
          total: dataRefresh.total,
          okCount: dataRefresh.okCount,
          failCount: dataRefresh.failCount,
          failed: dataRefresh.results.filter((x) => !x.ok).map((x) => x.symbol),
        }
        : null,
    });
    const took = Date.now() - startedAt;
    console.log('[scheduler] 完成 ' + took + 'ms: 结论=' + (r.snapshot ? r.snapshot.conclusion : '失败')
      + ' 变化=' + r.changed
      + ' 推送=' + (r.pushResult ? (r.pushResult.ok ? '成功' : '失败 ' + r.pushResult.error) : '跳过'));
    markDone();
  } catch (e) {
    console.error('[scheduler] 失败: ' + e.message);
    markDone();
  } finally {
    running = false;
  }
}

export function startScheduler() {
  if (!CONFIG.scheduler.enabled) {
    console.log('[scheduler] 未启用（scheduler.enabled=false）');
    return;
  }
  const slots = scheduleSlots();
  if (!slots.length) {
    console.log('[scheduler] 没有配置时间点');
    return;
  }
  if (timer) return;
  timer = setInterval(() => { tick().catch((e) => console.error('[scheduler] ' + e.message)); }, 60 * 1000);
  timer.unref?.();
  console.log('[scheduler] 已启动：每个工作日 ' + slots.map((s) => s.at + (s.label ? '(' + s.label + ')' : '')).join(' / ')
    + '（北京时间），结论变化才推送');
  const nr = nextRuns()[0];
  if (nr) console.log('[scheduler] 下一次：' + new Date(nr.next).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) + ' ' + (nr.label || ''));
}

export function stopScheduler() {
  if (timer) { clearInterval(timer); timer = null; }
}

/** 手动跑一次（供 /api/jobs/run 用） */
export const runNow = dailyJob;
