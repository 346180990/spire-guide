/**
 * 折线图 —— canvas 2d，支持 1~2 条序列（策略 vs 基准，或净值 vs 回撤）
 *
 * 用法：
 *   <line-chart series="{{[{name:'策略',data:equity,color:'#246BFE'}]}}"
 *               labels="{{dates}}" height="{{420}}" format="pct" />
 *
 * data 为 null/NaN 的点会被跳过（预热期）。
 */

Component({
  properties: {
    series: { type: Array, value: [] },
    labels: { type: Array, value: [] },
    height: { type: Number, value: 420 },
    format: { type: String, value: 'pct' }, // pct | num
    baseline: { type: Boolean, value: true }, // 是否画出 0 基线
  },

  data: {
    empty: true,
    placeholder: '暂无数据',
  },

  lifetimes: {
    ready() {
      this.initCanvas();
    },
  },

  observers: {
    'series, labels'() {
      if (this._ctx) this.draw();
    },
  },

  methods: {
    initCanvas() {
      const query = wx.createSelectorQuery().in(this);
      query.select('#chart').fields({ node: true, size: true }).exec((res) => {
        const item = res && res[0];
        if (!item || !item.node) return;
        const canvas = item.node;
        const dpr = (wx.getSystemInfoSync && wx.getSystemInfoSync().pixelRatio) || 2;
        const w = item.width || 320;
        const h = item.height || this.data.height;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        this._ctx = ctx;
        this._w = w;
        this._h = h;
        this.draw();
      });
    },

    draw() {
      const ctx = this._ctx;
      if (!ctx) return;
      const w = this._w;
      const h = this._h;
      const ser = (this.data.series || []).filter((s) => s && Array.isArray(s.data) && s.data.length);
      ctx.clearRect(0, 0, w, h);

      if (!ser.length) {
        this.setData({ empty: true });
        return;
      }
      this.setData({ empty: false });

      const padL = 44;
      const padR = 10;
      const padT = 12;
      const padB = 24;
      const iw = Math.max(10, w - padL - padR);
      const ih = Math.max(10, h - padT - padB);

      let min = Infinity;
      let max = -Infinity;
      ser.forEach((s) => {
        s.data.forEach((v) => {
          if (typeof v === 'number' && Number.isFinite(v)) {
            if (v < min) min = v;
            if (v > max) max = v;
          }
        });
      });
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        this.setData({ empty: true });
        return;
      }
      if (this.data.baseline) {
        min = Math.min(min, 0);
        max = Math.max(max, 0);
      }
      if (max - min < 1e-9) {
        max += 0.01;
        min -= 0.01;
      }
      const span = max - min;
      min -= span * 0.06;
      max += span * 0.06;

      const n = Math.max.apply(null, ser.map((s) => s.data.length));
      const xOf = (i) => padL + (n <= 1 ? 0 : (i / (n - 1)) * iw);
      const yOf = (v) => padT + ih - ((v - min) / (max - min)) * ih;

      // 网格 + Y 轴刻度
      const fmt = this.data.format === 'num' ? (v) => v.toFixed(2) : (v) => (v * 100).toFixed(0) + '%';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let g = 0; g <= 4; g++) {
        const v = min + ((max - min) * g) / 4;
        const y = yOf(v);
        ctx.strokeStyle = '#EDF1F7';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(padL + iw, y);
        ctx.stroke();
        ctx.fillStyle = '#94A1B5';
        ctx.fillText(fmt(v), padL - 6, y);
      }

      // 0 基线
      if (this.data.baseline && min < 0 && max > 0) {
        const y0 = yOf(0);
        ctx.strokeStyle = '#D6DEEB';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padL, y0);
        ctx.lineTo(padL + iw, y0);
        ctx.stroke();
      }

      // X 轴日期
      const labels = this.data.labels || [];
      if (labels.length) {
        ctx.fillStyle = '#94A1B5';
        ctx.textBaseline = 'top';
        const ticks = 4;
        for (let t = 0; t <= ticks; t++) {
          const idx = Math.round(((labels.length - 1) * t) / ticks);
          const lab = String(labels[idx] || '');
          const short = lab.length >= 10 ? lab.slice(2, 7) : lab;
          ctx.textAlign = t === 0 ? 'left' : t === ticks ? 'right' : 'center';
          ctx.fillText(short, xOf(idx), padT + ih + 6);
        }
      }

      // 折线
      ser.forEach((s) => {
        ctx.strokeStyle = s.color || '#246BFE';
        ctx.lineWidth = s.width || 1.8;
        ctx.beginPath();
        let started = false;
        s.data.forEach((v, i) => {
          if (typeof v !== 'number' || !Number.isFinite(v)) {
            started = false;
            return;
          }
          const x = xOf(i);
          const y = yOf(v);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();
      });
    },
  },
});
