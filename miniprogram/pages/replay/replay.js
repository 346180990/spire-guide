const loader = require('../../core/loader');
const fmt = require('../../core/format');

Page({
  data: {
    loading: true,
    error: '',
    latestDate: '',
    pickDate: '',
    startBound: '',
    endBound: '',
    actualDate: '',
    adjusted: false,
    notice: '',
    statusLabel: '—',
    statusTone: 'muted',
    conclusionText: '—',
    reason: '',
    dataAsOf: '—',
    computedAt: '—',
    appliesTo: '—',
    items: [],
    hasItems: false,
  },

  onLoad() {
    this.loadLatest();
  },

  loadLatest() {
    this.setData({ loading: true, error: '' });
    loader
      .refresh({})
      .then((r) => {
        const dates = r.availableDates || [];
        const latest = dates.length ? dates[dates.length - 1] : '';
        this._dates = dates;
        this._datasetsReady = true;
        this.setData({
          loading: false,
          latestDate: latest,
          pickDate: latest,
          startBound: dates.length ? dates[0] : '',
          endBound: latest,
        });
        this.applyDate(latest, false);
      })
      .catch((err) => {
        this.setData({ loading: false, error: (err && err.message) || '加载失败' });
      });
  },

  onDateChange(e) {
    this.applyDate(e.detail.value, true);
  },

  /** 把任意日期吸附到「该日或之前最近的交易日」，并显式提示 */
  applyDate(pick, fromUser) {
    const dates = this._dates || [];
    if (!dates.length) return;
    let actual = '';
    for (let i = dates.length - 1; i >= 0; i--) {
      if (dates[i] <= pick) {
        actual = dates[i];
        break;
      }
    }
    if (!actual) {
      this.setData({ notice: '所选日期早于可用数据起点，请重新选择', adjusted: true });
      return;
    }
    const adjusted = actual !== pick;
    this.setData({
      loading: true,
      pickDate: pick,
      actualDate: actual,
      adjusted,
      notice: adjusted ? `所选 ${pick} 不是交易日，已按最近交易日 ${actual} 回看` : '',
    });

    loader
      .refresh({ asOfDate: actual })
      .then((r) => {
        const snap = r.snapshot;
        const meta = fmt.statusMeta(snap.status);
        const toneMap = { ok: 'ok', warn: 'warn', danger: 'danger', muted: 'muted' };
        const items = (snap.items || []).map((it) => {
          const am = fmt.actionMeta(it.action);
          return {
            symbol: it.symbol,
            name: it.name,
            actionLabel: am.label,
            tone: am.tone,
            valueText: Number.isFinite(it.value) ? fmt.fmtNum(it.value, 3) : '—',
            reason: it.reason,
            dataAsOf: fmt.fmtDate(it.dataAsOf),
            appliesTo: it.appliesTo,
          };
        });
        this.setData({
          loading: false,
          statusLabel: meta.label,
          statusTone: toneMap[meta.tone] || 'muted',
          conclusionText: fmt.conclusionTitle(snap.conclusion),
          reason: snap.reason,
          dataAsOf: snap.dataAsOf || '—',
          computedAt: fmt.fmtDateTime(snap.computedAt),
          appliesTo: snap.appliesTo,
          items,
          hasItems: items.length > 0,
        });
      })
      .catch((err) => {
        this.setData({ loading: false, error: (err && err.message) || '回看失败' });
      });
  },

  onPrevDay() {
    const dates = this._dates || [];
    const cur = this.data.actualDate;
    const idx = dates.indexOf(cur);
    if (idx > 0) this.applyDate(dates[idx - 1], true);
  },

  onNextDay() {
    const dates = this._dates || [];
    const cur = this.data.actualDate;
    const idx = dates.indexOf(cur);
    if (idx >= 0 && idx < dates.length - 1) this.applyDate(dates[idx + 1], true);
  },

  onBackLatest() {
    if (this.data.latestDate) this.applyDate(this.data.latestDate, true);
  },
});
