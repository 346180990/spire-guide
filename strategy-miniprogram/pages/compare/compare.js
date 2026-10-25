const store = require('../../core/store');
const fmt = require('../../core/format');

const METRIC_DEFS = [
  { key: 'cagr', label: '年化收益', pct: true },
  { key: 'totalReturn', label: '累计收益', pct: true },
  { key: 'maxDrawdown', label: '最大回撤', pct: true, lowerBetter: true },
  { key: 'sharpe', label: '夏普比率', pct: false },
  { key: 'volatility', label: '年化波动', pct: true, lowerBetter: true },
  { key: 'switches', label: '换仓次数', pct: false, raw: true },
  { key: 'costRatio', label: '成本占比', pct: true, lowerBetter: true },
];

Page({
  data: {
    runs: [],
    baseIndex: 0,
    curIndex: 0,
    baseLabel: '—',
    curLabel: '—',
    ready: false,
    rows: [],
    changes: [],
    series: [],
    labels: [],
    warning: '',
  },

  onShow() {
    const runs = store.getRuns();
    if (runs.length < 2) {
      this.setData({ runs: [], ready: false });
      return;
    }
    const list = runs.map((r) => ({
      runId: r.runId,
      label:
        (r.symbolName || r.symbol) +
        ' · ' +
        r.configVersion +
        ' · ' +
        fmt.fmtDate(r.start) +
        '~' +
        fmt.fmtDate(r.end) +
        ' · ' +
        r.runId,
      raw: r,
    }));
    this.setData({
      runs: list,
      baseIndex: 0,
      curIndex: list.length - 1,
      baseLabel: list[0].label,
      curLabel: list[list.length - 1].label,
    });
    this.compute(list[0].raw, list[list.length - 1].raw);
  },

  onBaseChange(e) {
    const idx = Number(e.detail.value);
    this.setData({ baseIndex: idx, baseLabel: this.data.runs[idx].label });
    this.compute(this.data.runs[idx].raw, this.data.runs[this.data.curIndex].raw);
  },

  onCurChange(e) {
    const idx = Number(e.detail.value);
    this.setData({ curIndex: idx, curLabel: this.data.runs[idx].label });
    this.compute(this.data.runs[this.data.baseIndex].raw, this.data.runs[idx].raw);
  },

  compute(base, cur) {
    if (!base || !cur) return;
    const bm = base.metrics || {};
    const cm = cur.metrics || {};

    const rows = METRIC_DEFS.map((d) => {
      const bv = bm[d.key];
      const cv = cm[d.key];
      let diffText = '—';
      let tone = '';
      if (typeof bv === 'number' && typeof cv === 'number') {
        const delta = cv - bv;
        diffText = d.pct ? fmt.fmtPct(delta) : (delta > 0 ? '+' : '') + delta.toFixed(2);
        const better = d.lowerBetter ? delta < 0 : delta > 0;
        tone = Math.abs(delta) < 1e-9 ? '' : better ? 'down' : 'up';
      }
      return {
        label: d.label,
        base: d.pct ? fmt.fmtPct(bv) : (d.raw ? String(bv == null ? '—' : bv) : fmt.fmtNum(bv, 2)),
        cur: d.pct ? fmt.fmtPct(cv) : (d.raw ? String(cv == null ? '—' : cv) : fmt.fmtNum(cv, 2)),
        diff: diffText,
        tone,
      };
    });

    const changes = [];
    const bp = base.params || {};
    const cp = cur.params || {};
    ['kind', 'n', 'm', 'up', 'dn'].forEach((k) => {
      if (String(bp[k]) !== String(cp[k])) {
        changes.push({ label: '参数 ' + k, from: String(bp[k]), to: String(cp[k]) });
      }
    });
    if (base.codeVersion !== cur.codeVersion) {
      changes.push({ label: '代码版本', from: base.codeVersion, to: cur.codeVersion });
    }
    if (base.start !== cur.start || base.end !== cur.end) {
      changes.push({
        label: '数据区间',
        from: fmt.fmtDate(base.start) + '~' + fmt.fmtDate(base.end),
        to: fmt.fmtDate(cur.start) + '~' + fmt.fmtDate(cur.end),
      });
    }
    if ((base.execution || '') !== (cur.execution || '')) {
      changes.push({ label: '成交假设', from: base.execution, to: cur.execution });
    }
    if (JSON.stringify(base.cost) !== JSON.stringify(cur.cost)) {
      changes.push({
        label: '交易成本',
        from: fmt.fmtPct(base.cost && base.cost.fee, 3) + '/' + fmt.fmtPct(base.cost && base.cost.slip, 3),
        to: fmt.fmtPct(cur.cost && cur.cost.fee, 3) + '/' + fmt.fmtPct(cur.cost && cur.cost.slip, 3),
      });
    }
    if ((base.symbol || '') !== (cur.symbol || '')) {
      changes.push({ label: '标的', from: base.symbol, to: cur.symbol });
    }

    const warning =
      base.symbol !== cur.symbol
        ? '两次回测标的不同，指标差异不能用于判断策略优劣。'
        : base.start !== cur.start || base.end !== cur.end
        ? '两次回测区间不同，差异中包含区间效应，不能全部归因于参数优化。'
        : '';

    const labels = base.dates || [];
    const series = [
      { name: '基准运行', data: base.equity || [], color: '#B8C4D6', width: 1.4 },
      { name: '本次运行', data: cur.equity || [], color: '#246BFE' },
    ];

    this.setData({ ready: true, rows, changes, series, labels, warning });
  },
});
