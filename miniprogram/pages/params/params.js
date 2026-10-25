const loader = require('../../core/loader');
const store = require('../../core/store');
const catalog = require('../../core/catalog');
const validate = require('../../core/validate');

Page({
  data: {
    kinds: catalog.KINDS,
    kindIndex: 0,
    form: { kind: '标准分RSRS', n: 18, m: 700, up: 0.7, dn: -0.7 },
    errors: {},
    warnings: [],
    prevVersion: '',
    prevBrief: '',
    symbols: [],
    symbolNames: [],
    allSymbols: catalog.listSymbols(),
    execution: 'next_close',
    executionIndex: 0,
    execOptions: ['次日收盘成交', '次日开盘成交'],
    dirty: false,
    saving: false,
  },

  onLoad() {
    const cfg = loader.currentConfig();
    const p = cfg.params;
    // 计算范围以关注列表为准（见 core/loader.js 的说明）
    const scope = loader.watchSymbols();
    const idx = Math.max(0, catalog.KINDS.findIndex((k) => k.key === p.kind));
    const settings = store.getSettings();
    this.setData({
      kindIndex: idx,
      form: { kind: p.kind, n: p.n, m: p.m, up: p.up, dn: p.dn, trend: !!p.trend, maWin: p.maWin || 20 },
      prevVersion: cfg.version,
      prevBrief: `${p.kind} · N=${p.n} · M=${p.m} · S=${p.up}`,
      symbols: scope,
      symbolNames: scope.map((id) => {
        const s = catalog.getSymbol(id);
        return s ? s.name : id;
      }),
      execution: settings.execution,
      executionIndex: settings.execution === 'next_open' ? 1 : 0,
    });
  },

  onKindChange(e) {
    const idx = Number(e.detail.value);
    this.setData({
      kindIndex: idx,
      'form.kind': this.data.kinds[idx].key,
      dirty: true,
    });
  },

  onNumInput(e) {
    const field = e.currentTarget.dataset.field;
    const raw = e.detail.value;
    const patch = {};
    patch['form.' + field] = raw === '' ? '' : Number(raw);
    patch.dirty = true;
    this.setData(patch);
  },

  onExecutionChange(e) {
    const idx = Number(e.detail.value);
    const exec = idx === 1 ? 'next_open' : 'next_close';
    store.saveSettings({ execution: exec });
    this.setData({ executionIndex: idx, execution: exec });
  },

  onTrendChange(e) {
    this.setData({ 'form.trend': !!e.detail.value, dirty: true });
  },

  applyPreset() {
    const first = (this.data.symbols || [])[0] || '000300';
    const preset = catalog.presetFor(first);
    const sym = catalog.getSymbol(first);
    const idx = Math.max(0, catalog.KINDS.findIndex((k) => k.key === preset.kind));
    this.setData({
      kindIndex: idx,
      form: { kind: preset.kind, n: preset.n, m: preset.m, up: preset.up, dn: preset.dn || -preset.up },
      dirty: true,
      warnings: sym && sym.presetSource === 'notebook'
        ? ['已套用 ' + sym.name + ' 在 RSRS改进.ipynb 中的预设参数']
        : ['该标的未在 notebook 中测试过，套用的是沪深300 的预设'],
    });
  },

  /** 点击标的切换关注状态（原「关注」页已删除，这里内联） */
  onToggleSymbol(e) {
    const id = e.currentTarget.dataset.id;
    const list = (this.data.symbols || []).slice();
    const i = list.indexOf(id);
    if (i >= 0) {
      if (list.length <= 1) {
        wx.showToast({ title: '至少保留一个标的', icon: 'none' });
        return;
      }
      list.splice(i, 1);
    } else {
      if (list.length >= 12) {
        wx.showToast({ title: '最多 12 个标的', icon: 'none' });
        return;
      }
      list.push(id);
    }
    store.saveWatchlist(list.map((x) => ({ symbol: x, group: '默认' })));
    this.setData({ symbols: list, symbolNames: this.nameOf(list) });
  },

  nameOf(ids) {
    return (ids || []).map((id) => {
      const s = catalog.getSymbol(id);
      return s ? s.name : id;
    });
  },

  onSave() {
    const f = this.data.form;
    const v = validate.validateConfig({
      kind: f.kind,
      n: Number(f.n),
      m: Number(f.m),
      up: Number(f.up),
      dn: Number(f.dn),
      trend: !!f.trend,
      maWin: Number(f.maWin) || 20,
    });
    if (!v.ok) {
      this.setData({ errors: v.errors, warnings: v.warnings || [] });
      wx.showToast({ title: '请先修正参数', icon: 'none' });
      return;
    }

    const prev = loader.currentConfig();
    const diff = loader.diffParams(prev, v.value);
    const saved = store.saveConfig(
      loader.STRATEGY_ID,
      {
        kind: v.value.kind, n: v.value.n, m: v.value.m, up: v.value.up, dn: v.value.dn,
        trend: v.value.trend, maWin: v.value.maWin,
        overrides: (prev.params && prev.params.overrides) || {},
      },
      this.data.symbols,
      diff.length ? '修改：' + diff.map((d) => d.label + ' ' + d.from + '→' + d.to).join('，') : '无实质修改',
    );

    if (!saved.ok) {
      wx.showToast({ title: saved.reason || '保存失败', icon: 'none' });
      return;
    }

    const lines = diff.map((d) => d.label + '：' + d.from + ' → ' + d.to).join('\n');
    this.setData({ errors: {}, dirty: false, prevVersion: saved.version.version });
    wx.showModal({
      title: '已保存为 ' + saved.version.version,
      content: (lines ? lines + '\n\n' : '') + '当前最新信号仍对应旧参数版本，需重新运行才会生成新信号。',
      showCancel: false,
      confirmText: '知道了',
      success: () => wx.navigateBack(),
    });
  },
});
