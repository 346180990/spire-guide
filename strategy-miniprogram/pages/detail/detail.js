const loader = require('../../core/loader');
const store = require('../../core/store');
const fmt = require('../../core/format');

Page({
  data: {
    loading: true,
    error: '',
    statusLabel: '加载中',
    statusTone: 'muted',
    dataAsOf: '—',
    computedAt: '—',
    appliesTo: '—',
    conclusion: 'wait',
    conclusionText: '—',
    reason: '',
    stale: false,
    configVersion: '',
    configBrief: '',
    codeVersion: '',
    groups: [],
    counts: {},
    hasAny: false,
  },

  onLoad() {
    this.load();
  },

  onPullDownRefresh() {
    this.load(true).then(() => wx.stopPullDownRefresh());
  },

  load(force) {
    this.setData({ loading: true, error: '' });
    return loader
      .refresh({ force: !!force })
      .then((r) => {
        const snap = r.snapshot;
        const meta = fmt.statusMeta(snap.status);
        const toneMap = { ok: 'ok', warn: 'warn', danger: 'danger', muted: 'muted' };

        const buckets = { buy: [], sell: [], hold: [], wait: [], unavailable: [] };
        (snap.items || []).forEach((it) => {
          const am = fmt.actionMeta(it.action);
          buckets[it.action].push({
            symbol: it.symbol,
            name: it.name,
            action: it.action,
            actionLabel: am.label,
            valueText: Number.isFinite(it.value) ? fmt.fmtNum(it.value, 3) : '—',
            r2Text: Number.isFinite(it.r2) ? fmt.fmtNum(it.r2, 3) : '—',
            up: it.up,
            dn: it.dn,
            reason: it.reason,
            dataAsOf: fmt.fmtDate(it.dataAsOf),
            appliesTo: it.appliesTo,
            tone: am.tone,
          });
        });

        const order = [
          { key: 'buy', title: '买入候选', hint: '按策略触发强度' },
          { key: 'sell', title: '卖出 / 平仓', hint: '跌破平仓阈值' },
          { key: 'hold', title: '持有', hint: '仍在持有区间' },
          { key: 'wait', title: '观望', hint: '未达开仓阈值' },
          { key: 'unavailable', title: '不可计算', hint: '数据不足，非「观望」' },
        ];
        const groups = order
          .filter((g) => buckets[g.key].length)
          .map((g) => ({ key: g.key, title: g.title, hint: g.hint, items: buckets[g.key] }));

        const cfg = r.config;
        this.setData({
          loading: false,
          statusLabel: meta.label,
          statusTone: toneMap[meta.tone] || 'muted',
          dataAsOf: snap.dataAsOf || '—',
          computedAt: fmt.fmtDateTime(snap.computedAt),
          appliesTo: snap.appliesTo,
          conclusion: snap.conclusion,
          conclusionText: fmt.conclusionTitle(snap.conclusion),
          reason: snap.reason,
          stale: snap.status === 'stale',
          configVersion: cfg.version,
          configBrief: `${cfg.params.kind} · N=${cfg.params.n} · M=${cfg.params.m} · 开仓 ${cfg.params.up} / 平仓 ${cfg.params.dn}`,
          codeVersion: snap.codeVersion,
          groups,
          counts: snap.counts,
          hasAny: groups.length > 0,
        });
      })
      .catch((err) => {
        this.setData({
          loading: false,
          error: (err && err.message) || '加载失败',
          statusLabel: '加载失败',
          statusTone: 'danger',
        });
      });
  },

  goReplay() {
    wx.navigateTo({ url: '/pages/replay/replay' });
  },

  goBacktest() {
    wx.switchTab({ url: '/pages/backtest/backtest' });
  },

  goParams() {
    wx.navigateTo({ url: '/pages/params/params' });
  },

  goBacktestRuns() {
    wx.switchTab({ url: '/pages/backtest/backtest' });
  },
});
