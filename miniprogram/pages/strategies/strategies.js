const loader = require('../../core/loader');
const store = require('../../core/store');
const catalog = require('../../core/catalog');
const fmt = require('../../core/format');

Page({
  data: {
    loading: true,
    error: '',
    statusLabel: '加载中',
    statusTone: 'muted',
    dataAsOfText: '—',
    refreshedAt: '—',
    source: '—',
    stale: false,
    conclusionTitle: '—',
    conclusionSub: '',
    conclusionTone: 'muted',
    appliesTo: '—',
    counts: { buy: 0, sell: 0, hold: 0, wait: 0, unavailable: 0 },
    configVersion: '—',
    configBrief: '',
    symbolCount: 0,
    warnings: [],
  },

  onShow() {
    this.load(false);
  },

  onPullDownRefresh() {
    this.load(true).then(() => wx.stopPullDownRefresh());
  },

  load(force) {
    this.setData({ loading: true, error: '' });
    return loader
      .refresh({ force })
      .then((r) => {
        const snap = r.snapshot;
        const meta = fmt.statusMeta(snap.status);
        const toneMap = { ok: 'ok', warn: 'warn', danger: 'danger', muted: 'muted' };
        const conclusionToneMap = {
          buy: 'up',
          sell: 'down',
          hold: 'info',
          wait: 'muted',
          unavailable: 'danger',
        };
        const warnings = [];
        if (snap.status === 'stale') warnings.push('行情不是最新交易日，结果已标记为「数据延迟」');
        if (snap.status === 'insufficient') warnings.push('数据不足以完成计算，请检查关注标的或缩短窗口');
        (r.errors || []).forEach((e) => warnings.push(e));

        const cfg = r.config;
        this.setData({
          loading: false,
          stale: !!r.stale,
          statusLabel: meta.label,
          statusTone: toneMap[meta.tone] || 'muted',
          dataAsOfText: snap.dataAsOf || '—',
          refreshedAt: fmt.fmtDateTime(r.fetchedAt),
          source: r.source || (r.fromCache ? '本地缓存' : '—'),
          conclusionTitle: fmt.conclusionTitle(snap.conclusion),
          conclusionSub: snap.reason,
          conclusionTone: conclusionToneMap[snap.conclusion] || 'muted',
          appliesTo: snap.appliesTo,
          counts: snap.counts,
          configVersion: cfg.version,
          configBrief: `${cfg.params.kind} · N=${cfg.params.n} · M=${cfg.params.m} · S=${cfg.params.up}`,
          symbolCount: (cfg.symbols || []).length,
          warnings,
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

  goDetail() {
    wx.navigateTo({ url: '/pages/detail/detail' });
  },



});
