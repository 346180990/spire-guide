const store = require('../../core/store');
const fmt = require('../../core/format');

Page({
  data: {
    loading: true,
    error: '',
    run: null,
    metrics: [],
    trades: [],
    quality: [],
    equitySeries: [],
    ddSeries: [],
    labels: [],
    hasChart: false,
  },

  onLoad(query) {
    const runId = query && query.runId;
    if (!runId) {
      this.setData({ loading: false, error: '缺少回测 ID' });
      return;
    }
    const run = store.getRun(runId);
    if (!run) {
      this.setData({ loading: false, error: '找不到该回测记录（可能已被清理）' });
      return;
    }
    this.render(run);
  },

  render(run) {
    const m = run.metrics || {};
    const metrics = [
      { label: '累计收益', value: fmt.fmtPct(m.totalReturn) },
      { label: '年化收益', value: fmt.fmtPct(m.cagr) },
      { label: '最大回撤', value: fmt.fmtPct(m.maxDrawdown) },
      { label: '夏普比率', value: fmt.fmtNum(m.sharpe, 2) },
      { label: '年化波动', value: fmt.fmtPct(m.volatility) },
      { label: '持仓占比', value: fmt.fmtPct(m.holdRatio) },
      { label: '换仓次数', value: String(m.switches == null ? '—' : m.switches) },
      { label: '年均换仓', value: fmt.fmtNum(m.turnoverPerYear, 2) },
      { label: '成本占比', value: fmt.fmtPct(m.costRatio) },
      { label: '基准年化', value: fmt.fmtPct(m.benchCagr) },
      { label: '超额年化', value: fmt.fmtPct(m.excessCagr) },
      { label: '基准回撤', value: fmt.fmtPct(m.benchMaxDrawdown) },
    ];

    const trades = (run.trades || []).map((t) => ({
      entryDate: fmt.fmtDate(t.entryDate),
      exitDate: fmt.fmtDate(t.exitDate),
      retText: fmt.fmtPct(t.ret),
      tone: t.ret >= 0 ? 'up' : 'down',
      holdDays: t.holdDays,
    }));

    const q = run.quality || {};
    const quality = [
      { label: '使用日线根数', value: String(q.barsUsed || '—'), ok: true },
      { label: '预热根数', value: String(q.warmupBars || '—'), ok: true },
      { label: '缺失行情', value: String(q.missingBars || 0), ok: !q.missingBars },
      { label: '交易成本', value: q.costEnabled ? '已计入 ' + fmt.fmtPct(q.costTotal) : '未计入', ok: true },
      { label: '未来数据检查', value: q.noLookAhead ? '通过（仅用截至信号日的数据）' : '未通过', ok: !!q.noLookAhead },
    ];

    const hasChart = (run.equity || []).length > 1;

    this.setData({
      loading: false,
      run: {
        runId: run.runId,
        symbolName: run.symbolName || run.symbol,
        symbol: run.symbol,
        range: fmt.fmtDate(run.start) + ' ~ ' + fmt.fmtDate(run.end),
        codeVersion: run.codeVersion,
        configVersion: run.configVersion,
        execution: run.execution === 'next_open' ? '次日开盘成交' : '次日收盘成交',
        costText: '手续费 ' + fmt.fmtPct(run.cost && run.cost.fee, 3) + ' / 滑点 ' + fmt.fmtPct(run.cost && run.cost.slip, 3),
        params: run.params,
        createdText: fmt.fmtDateTime(run.createdAt),
        dataNote: run.dataNote || '',
        log: run.log || '',
      },
      metrics,
      trades,
      quality,
      labels: run.dates || [],
      equitySeries: hasChart
        ? [
            { name: '策略', data: run.equity, color: '#246BFE' },
            { name: '基准', data: run.benchmark, color: '#B8C4D6', width: 1.2 },
          ]
        : [],
      ddSeries: (run.drawdown || []).length > 1
        ? [{ name: '回撤', data: run.drawdown, color: '#E65353' }]
        : [],
      hasChart,
    });
  },

  goCompare() {
    wx.navigateTo({ url: '/pages/compare/compare' });
  },

  goBack() {
    wx.navigateBack();
  },
});
