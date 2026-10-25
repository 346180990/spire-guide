/**
 * 微信推送 —— 四种通道，统一接口
 *
 *   wecom-bot   企业微信群机器人（最简单：群里加个机器人，拿 webhook 就行）
 *   wecom-app   企业微信应用消息（可推到个人微信：开通「微信插件」后关注即可）
 *   serverchan  Server酱（个人微信服务号推送，免费额度 5 条/天）
 *   pushplus    PushPlus（个人微信，免费额度较宽）
 *
 * 设计：每个 provider 都是 async push({title, markdown}) => {ok, provider, detail}
 * 失败不抛异常，返回 ok:false，让定时任务继续跑。
 */

import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { URL } from 'node:url';
import { CONFIG } from './config.mjs';

/** 极简 JSON POST，返回 {status, body} */
function postJSON(urlStr, payload, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlStr); } catch (e) { reject(new Error('webhook 地址不合法')); return; }
    const body = Buffer.from(JSON.stringify(payload), 'utf8');
    const isHttps = u.protocol === 'https:';
    const req = (isHttps ? httpsRequest : httpRequest)({
      method: 'POST',
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length },
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('timeout', () => req.destroy(new Error('请求超时')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function getJSON(urlStr, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const isHttps = u.protocol === 'https:';
    const req = (isHttps ? httpsRequest : httpRequest)({
      method: 'GET',
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('返回不是 JSON: ' + data.slice(0, 120))); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('请求超时')));
    req.on('error', reject);
    req.end();
  });
}

/* ========== 通道实现 ========== */

/** 企业微信群机器人 */
async function pushWecomBot({ markdown }) {
  const c = CONFIG.push.wecomBot || {};
  if (!c.webhook) throw new Error('未配置 push.wecomBot.webhook');
  // 机器人 markdown 上限 4096 字节，超出会被截断，这里先砍到安全值
  const content = Buffer.byteLength(markdown, 'utf8') > 4000
    ? markdown.slice(0, 1200) + '\n\n…（内容过长已截断，完整结果请看网页）'
    : markdown;
  const r = await postJSON(c.webhook, { msgtype: 'markdown', markdown: { content } });
  const j = safeJSON(r.body);
  if (!j || j.errcode !== 0) throw new Error('企业微信返回 ' + r.status + ' ' + (r.body || '').slice(0, 160));
  return { provider: 'wecom-bot', detail: '已发送到群机器人' };
}

/** 企业微信应用消息（可送达个人微信） */
async function pushWecomApp({ markdown }) {
  const c = CONFIG.push.wecomApp || {};
  if (!c.corpid || !c.corpsecret || !c.agentid) throw new Error('未配置 push.wecomApp 的 corpid/corpsecret/agentid');
  const tok = await getJSON('https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=' + encodeURIComponent(c.corpid)
    + '&corpsecret=' + encodeURIComponent(c.corpsecret));
  if (!tok.access_token) throw new Error('获取 access_token 失败: ' + JSON.stringify(tok).slice(0, 160));
  const r = await postJSON('https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=' + tok.access_token, {
    touser: c.touser || '@all',
    msgtype: 'text',
    agentid: Number(c.agentid),
    text: { content: markdown.replace(/[#*`>]/g, '') },
    safe: 0,
  });
  const j = safeJSON(r.body);
  if (!j || j.errcode !== 0) throw new Error('企业微信应用消息返回 ' + r.status + ' ' + (r.body || '').slice(0, 160));
  return { provider: 'wecom-app', detail: '已发送到 ' + (c.touser || '@all') };
}

/** Server酱 */
async function pushServerChan({ title, markdown }) {
  const c = CONFIG.push.serverchan || {};
  if (!c.sendkey) throw new Error('未配置 push.serverchan.sendkey');
  const url = 'https://sctapi.ftqq.com/' + encodeURIComponent(c.sendkey) + '.send';
  const r = await postJSON(url, { title, desp: markdown });
  const j = safeJSON(r.body);
  if (!j || (j.code !== 0 && j.errno !== 0)) throw new Error('Server酱返回 ' + r.status + ' ' + (r.body || '').slice(0, 160));
  return { provider: 'serverchan', detail: '已发送（注意免费额度 5 条/天）' };
}

/** PushPlus */
async function pushPlusPlus({ title, markdown }) {
  const c = CONFIG.push.pushplus || {};
  if (!c.token) throw new Error('未配置 push.pushplus.token');
  const r = await postJSON('https://www.pushplus.plus/send', {
    token: c.token,
    title,
    content: markdown,
    template: 'markdown',
    topic: c.topic || undefined,
  });
  const j = safeJSON(r.body);
  if (!j || j.code !== 200) throw new Error('PushPlus 返回 ' + r.status + ' ' + (r.body || '').slice(0, 160));
  return { provider: 'pushplus', detail: '已发送' };
}

function safeJSON(s) {
  try { return JSON.parse(s); } catch (e) { return null; }
}

const PROVIDERS = {
  'wecom-bot': pushWecomBot,
  'wecom-app': pushWecomApp,
  serverchan: pushServerChan,
  pushplus: pushPlusPlus,
};

/** 统一入口 */
export async function push({ title, markdown, provider }) {
  const name = provider || CONFIG.push.provider;
  const fn = PROVIDERS[name];
  if (!fn) return { ok: false, provider: name, error: '未知通道: ' + name };
  if (!CONFIG.push.enabled && !provider) {
    return { ok: false, provider: name, error: '推送未启用（config.push.enabled=false）' };
  }
  try {
    const r = await fn({ title, markdown });
    return { ok: true, ...r, at: new Date().toISOString() };
  } catch (e) {
    return { ok: false, provider: name, error: e.message, at: new Date().toISOString() };
  }
}

/* ========== 消息组装 ========== */

const ACTION_TEXT = { buy: '🟢 买入', sell: '🔴 卖出', hold: '⚪ 持有', wait: '⚫ 观望', unavailable: '⚠️ 不可用' };

/**
 * 把信号快照写成一条微信消息
 * @param {Object} snap signal.buildSnapshot 的返回值
 * @param {Object} extra {dataSource, stale}
 */
export function buildSignalMessage(snap, extra = {}) {
  const lines = [];
  const headline = ACTION_TEXT[snap.conclusion] || snap.conclusion;
  const title = 'RSRS 择时：' + headline.replace(/[^\u4e00-\u9fa5]/g, '').trim() + ' · ' + snap.dataAsOf;

  lines.push('**' + headline + '**');
  lines.push('');
  lines.push('> 数据截至 ' + snap.dataAsOf + '，' + (snap.appliesTo || '下一交易日') + '生效');
  if (extra.dataSource) lines.push('> 行情来源 ' + extra.dataSource + (extra.stale ? '（非实时）' : ''));
  lines.push('');
  lines.push('**理由**：' + snap.reason);
  lines.push('');

  const items = snap.items || [];
  if (items.length) {
    lines.push('**标的明细**');
    for (const it of items) {
      const act = ACTION_TEXT[it.action] || it.action;
      const val = it.value === null || it.value === undefined ? '—' : Number(it.value).toFixed(4);
      lines.push('- ' + (it.name || it.symbol) + '：' + act + '　指标 ' + val
        + (it.r2 !== null && it.r2 !== undefined ? '　R²=' + Number(it.r2).toFixed(2) : ''));
      // 每个标的都要能解释「为什么」，否则等于没说
      if (it.reason) lines.push('  ' + it.reason);
    }
  }

  lines.push('');
  lines.push('参数：' + (snap.configBrief || ''));
  lines.push('');
  lines.push('_模拟信号，不构成投资建议_');

  return { title, markdown: lines.join('\n') };
}

/** 通道自检：只发一条测试消息 */
export async function pushTest(provider) {
  const name = provider || CONFIG.push.provider;
  const r = await push({
    title: '策略助手 · 推送测试',
    markdown: '**推送通道测试**\n\n如果你在微信里看到这条，说明通道可用。\n\n时间：' + new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
    provider: name,
  });
  return r;
}

export function providerStatus() {
  const c = CONFIG.push;
  return {
    enabled: c.enabled,
    provider: c.provider,
    available: Object.keys(PROVIDERS),
    configured: {
      'wecom-bot': !!c.wecomBot?.webhook,
      'wecom-app': !!(c.wecomApp?.corpid && c.wecomApp?.corpsecret && c.wecomApp?.agentid),
      serverchan: !!c.serverchan?.sendkey,
      pushplus: !!c.pushplus?.token,
    },
  };
}
