const loader = require('../../core/loader');
const store = require('../../core/store');
const catalog = require('../../core/catalog');
const api = require('../../core/api');
const fmt = require('../../core/format');
const validate = require('../../core/validate');

function minusYears(dateStr, years) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00+08:00');
  if (isNaN(d.getTime())) return dateStr;
  d.setFullYear(d.getFullYear() - years);
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

Page({
  data: {
    symbols: [],
    symbolIndex: 0,
    symbol: '000300',
    symbolName: '沪深300',
    start: '',
    end: '',
    capital: 100000,
    fee: 0.0003,
    slip: 0.0005,
    executionIndex: 0,
    execOptions: ['次日收盘', '次日开盘'],
    errors: {},
    preflight: null,
    checking: false,
    running: false,
    runs: [],
    configBrief: '',
    configVersion: '',
  },

  onShow() {
    const cfg = loader.currentConfig();
    const settings = store.getSettings();
    const symbols = catalog.listSymbols();
    const first = (cfg.symbols && cfg.symbols[0]) || '000300';
    const idx = Math.max(0, symbols.findIndex((s) => s.id === first));

    this.setData({
      symbols,
      symbolIndex: idx,
      symbol: symbols[idx].id,
      symbolName: symbols[idx].name,
      capital: settings.capital,
      fee: settings.fee,
      slip: settings.slip,
      executionIndex: settings.execution === 'next_open' ? 1 : 0,
      configBrief: `${cfg.params.kind} · N=${cfg.params.n} · M=${cfg.params.m} · S=${cfg.params.up}`,
      configVersion: cfg.version,
      runs: this.buildRunList(),
    });
    this.preflight(idx, true);
  },

  buildRunList() {
    return store.getRuns().slice().reverse().map((r) => ({
      runId: r.runId,
      title: (r.symbolName || r.symbol) + ' · ' + r.runId,
      range: fmt.fmtDate(r.start) + ' ~ ' + fmt.fmtDate(r.end),
      brief: (r.params ? r.params.kind : '') + ' N=' + (r.params ? r.params.n : '') + ' M=' + (r.params ? r.params.m : '') + ' · ' + r.configVersion,
      cagrText: fmt.fmtPct(r.metrics && r.metrics.cagr),
      mddText: fmt.fmtPct(r.metrics && r.metrics.maxDrawdown),
      cagrTone: r.metrics && r.metrics.cagr >= 0 ? 'up' : 'down',
      createdText: fmt.fmtDateTime(r.createdAt),
      status: r.status || 'success',
    }));
  },

  onSymbolChange(e) {
    const idx = Number(e.detail.value);
    const s = this.data.symbols[idx];
    this.setData({ symbolIndex: idx, symbol: s.id, symbolName: s.name });
    this.preflight(idx, true);
  },

  onStartChange(e) {
    this.setData({ start: e.detail.value, errors: Object.assign({}, this.data.errors, { start: '' }) });
  },

  onEndChange(e) {
    this.setData({ end: e.detail.value, errors: Object.assign({}, this.data.errors, { end: '' }) });
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    const patch = {};
    patch[field] = Number(e.detail.value);
    this.setData(patch);
  },

  onExecutionChange(e) {
    const idx = Number(e.detail.value);
    const exec = idx === 1 ? 'next_open' : 'next_close';
    store.saveSettings({ execution: exec });
    this.setData({ executionIndex: idx });
  },

  /** 预检：可用数据长度是否够 N+M 预热 */
  preflight(idx, force) {
    const s = this.data.symbols[idx];
    if (!s) return;
    this.setData({ checking: true, preflight: null });
    api
      .loadOne(s.id, { force: !!force })
      .then((res) => {
        const bars = res.dataset.bars;
        const asOf = bars.length ? bars[bars.length - 1].date : '';
        const cfg = loader.currentConfig();
        const need = cfg.params.n + cfg.params.m;
        const enough = bars.length >= need;
        const endDefault = this.data.end || asOf;
        this.setData({
          checking: false,
          end: endDefault,
          start: this.data.start || minusYears(asOf, 5),
          preflight: {
            bars: bars.length,
            first: bars.length ? bars[0].date : '—',
            asOf,
            need,
            enough,
            stale: !!res.stale,
            source: res.source || (res.fromCache ? '本地缓存' : '—'),
            message: enough
              ? '数据足够：可用 ' + bars.length + ' 根，预热需要 ' + need + ' 根'
              : '数据不足：可用 ' + bars.length + ' 根，预热需要 ' + need + ' 根。请缩短窗口或换标的',
          },
        });
      })
      .catch((err) => {
        this.setData({
          checking: false,
          preflight: {
            bars: 0, first: '—', asOf: '—', need: 0, enough: false,
            message: (err && err.message) || '预检失败',
          },
        });
      });
  },

  onRun() {
    const pf = this.data.preflight;
    if (pf && !pf.enough) {
      wx.showToast({ title: '数据不足，无法回测', icon: 'none' });
      return;
    }
    const range = validate.validateRange(this.data.start, this.data.end, pf ? pf.first : '');
    const money = validate.validateMoney({ capital: this.data.capital, fee: this.data.fee, slip: this.data.slip });
    const errors = Object.assign({}, range.errors, money.errors);
    if (Object.keys(errors).length) {
      this.setData({ errors });
      wx.showToast({ title: '请检查参数', icon: 'none' });
      return;
    }

    this.setData({ errors: {}, running: true });
    wx.showLoading({ title: '回测中…', mask: true });

    loader
      .runBacktest({
        symbol: this.data.symbol,
        start: this.data.start,
        end: this.data.end,
        execution: this.data.executionIndex === 1 ? 'next_open' : 'next_close',
        capital: this.data.capital,
        fee: this.data.fee,
        slip: this.data.slip,
      })
      .then((r) => {
        wx.hideLoading();
        this.setData({ running: false, runs: this.buildRunList() });
        if (!r.ok) {
          wx.showModal({ title: '回测失败', content: r.reason || '未知原因', showCancel: false });
          return;
        }
        if (!r.saveOk) {
          wx.showToast({ title: r.saveReason || '结果未能保存', icon: 'none' });
        }
        wx.navigateTo({ url: '/pages/result/result?runId=' + r.runId });
      })
      .catch((err) => {
        wx.hideLoading();
        this.setData({ running: false });
        wx.showModal({ title: '回测失败', content: (err && err.message) || '未知原因', showCancel: false });
      });
  },

  goResult(e) {
    const runId = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/result/result?runId=' + runId });
  },

  goCompare() {
    wx.navigateTo({ url: '/pages/compare/compare' });
  },

  goParams() {
    wx.navigateTo({ url: '/pages/params/params' });
  },
});
