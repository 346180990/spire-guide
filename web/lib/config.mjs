/**
 * 配置加载 —— 优先环境变量，其次 web/config.json
 *
 * 配置文件不进版本库（含 webhook key 等敏感信息）。
 * 参考 config.example.json 复制一份改。
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULTS = {
  host: '127.0.0.1',
  port: 8090,
  /** 非本机访问时需要的令牌；留空表示不校验（仅建议本机用） */
  accessToken: '',
  /** 行情缓存天数（回测对最新一根不敏感） */
  barsTtlDays: 7,
  /** 默认策略参数（改这里影响所有页面默认值） */
  strategy: {
    kind: '标准分RSRS',
    n: 18,
    m: 700,
    up: 0.7,
    dn: -0.7,
    /** MA 趋势过滤（研究脚本里的「钝化」），默认关闭 */
    trend: false,
    maWin: 20,
  },
  /** 默认关注标的 */
  symbols: ['000300', '000905', '399006'],
  /**
   * 定时任务（北京时间，一次可以配多个时间点）
   *
   * 为什么要两个：
   *   盘前 08:45 —— 用「昨日收盘」的最终数据重跑一遍，作为今天的操作依据；
   *                 数据源有时盘后还没更新完整，盘前这次能纠正。
   *   盘后 18:00 —— 先把全部标的的行情拉到最新（refreshBars），再算「明日」信号并留档。
   *
   * 两次都会重算；只有结论发生变化时才推送（onlyOnChange），
   * 所以正常情况下一天最多一条消息，数据被修正时才会补发。
   */
  scheduler: {
    enabled: true,
    slots: [
      { at: '08:45', label: '盘前', force: true, onlyOnChange: true, refreshBars: false },
      { at: '18:00', label: '盘后', force: false, onlyOnChange: true, refreshBars: true },
    ],
    /** 兼容旧配置：只配了单个 at 时当作唯一时间点 */
    at: '',
    /** 全局兜底：slot 没写 onlyOnChange 时用它 */
    onlyOnChange: true,
  },
  push: {
    /** 关闭后不推送 */
    enabled: false,
    /** wecom-bot | wecom-app | serverchan | pushplus */
    provider: 'wecom-bot',
    wecomBot: { webhook: '' },
    wecomApp: { corpid: '', corpsecret: '', agentid: '', touser: '@all' },
    serverchan: { sendkey: '' },
    pushplus: { token: '', topic: '' },
  },
};

function deepMerge(base, over) {
  if (!over || typeof over !== 'object') return base;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const k of Object.keys(over)) {
    const v = over[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function loadFileConfig() {
  const p = process.env.SA_CONFIG || join(ROOT, 'config.json');
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    console.error('[config] 解析 ' + p + ' 失败: ' + e.message);
    return {};
  }
}

function fromEnv(cfg) {
  const e = process.env;
  const set = (path, val) => {
    if (!val) return;
    const parts = path.split('.');
    let cur = cfg;
    for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]] = cur[parts[i]] || {};
    cur[parts[parts.length - 1]] = val;
  };
  set('host', e.SA_HOST);
  set('port', e.SA_PORT ? Number(e.SA_PORT) : '');
  set('accessToken', e.SA_TOKEN);
  set('push.enabled', e.SA_PUSH_ENABLED === '1' ? true : e.SA_PUSH_ENABLED === '0' ? false : '');
  set('push.provider', e.SA_PUSH_PROVIDER);
  set('push.wecomBot.webhook', e.SA_WECOM_BOT_WEBHOOK);
  set('push.wecomApp.corpid', e.SA_WECOM_CORPID);
  set('push.wecomApp.corpsecret', e.SA_WECOM_SECRET);
  set('push.wecomApp.agentid', e.SA_WECOM_AGENTID);
  set('push.wecomApp.touser', e.SA_WECOM_TOUSER);
  set('push.serverchan.sendkey', e.SA_SC_SENDKEY);
  set('push.pushplus.token', e.SA_PUSHPLUS_TOKEN);
  set('scheduler.enabled', e.SA_SCHED_ENABLED === '1' ? true : e.SA_SCHED_ENABLED === '0' ? false : '');
  if (e.SA_SCHEDULE) {
    // 手写时间点时保持与默认配置相同的语义：第一个点（盘前）不重拉行情，
    // 后面的点（盘后）先 refreshBars 再算信号；否则线上会一直用旧缓存算。
    cfg.scheduler.slots = String(e.SA_SCHEDULE).split(',').map((x) => x.trim()).filter(Boolean).map((at, i, arr) => ({
      at,
      label: i === 0 ? '盘前' : (i === arr.length - 1 ? '盘后' : '第' + (i + 1) + '次'),
      force: i === 0,
      onlyOnChange: true,
      refreshBars: i > 0,
    }));
  }
  return cfg;
}

export const CONFIG = fromEnv(deepMerge(DEFAULTS, loadFileConfig()));

export const PATHS = {
  root: ROOT,
  web: join(ROOT, '..'),
  public: join(ROOT, 'public'),
  data: join(ROOT, 'data'),
  bars: join(ROOT, 'data', 'bars'),
  runs: join(ROOT, 'data', 'runs'),
};

/** 小程序端的核心引擎目录（唯一策略实现） */
export const ENGINE_DIR = join(ROOT, '..', 'strategy-miniprogram', 'core');
export const CLOUDFN_DIR = join(ROOT, '..', 'strategy-miniprogram', 'cloudfunctions', 'market-bars');
