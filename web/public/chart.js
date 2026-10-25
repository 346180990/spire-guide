/**
 * 净值曲线 —— 带十字准星与悬浮提示
 *
 * 鼠标/手指移动时：
 *   - 画一条竖直准线，并在两条曲线上标出对应的点
 *   - 右上角浮出气泡：日期、策略净值、买入持有净值、各自相对起点的涨跌幅
 *
 * 归一化：两条线都以起点为 100 画，便于直接比较斜率；
 * 气泡里同时给出真实金额（元）和百分比，避免「100 到底是啥」的困惑。
 */

const PAD = { l: 46, r: 12, t: 14, b: 22 };
const COLORS = {
  strategy: '#246BFE',
  bench: '#c3ccdb',
  grid: '#eef1f6',
  axis: '#9aa6b8',
  cross: '#9db0cc',
};

const FONT = '11px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
const FONT_BOLD = 'bold 12px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';

/** 净值保留 4 位（回测里 equity 是从 1.0000 开始的净值，不是金额） */
function nav(v) {
  if (!Number.isFinite(v)) return '—';
  return v.toFixed(4);
}

function pctFrom(base, v) {
  if (!Number.isFinite(base) || !base) return '—';
  const p = (v / base - 1) * 100;
  return (p >= 0 ? '+' : '') + p.toFixed(2) + '%';
}

/**
 * 画图并绑定悬浮交互
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement|null} tipEl 气泡容器（绝对定位在 canvas 上方）
 * @param {{dates:string[], equity:number[], benchmark:number[]}} data
 * @returns {{redraw:Function, destroy:Function}}
 */
export function drawEquity(canvas, tipEl, data) {
  const ctx = canvas.getContext('2d');
  const dates = data.dates || [];
  const equity = data.equity || [];
  const benchmark = data.benchmark || [];
  const n = Math.min(dates.length, equity.length);

  // 计算几何并绘制一帧
  function render(hoverIdx) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 600;
    const cssH = canvas.clientHeight || 300;

    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    if (n < 2) {
      ctx.fillStyle = COLORS.axis;
      ctx.font = FONT;
      ctx.fillText('数据不足，无法绘图', PAD.l, cssH / 2);
      return null;
    }

    const w = cssW - PAD.l - PAD.r;
    const h = cssH - PAD.t - PAD.b;

    const base = equity[0] || 1;
    const bBase = benchmark && benchmark.length === equity.length ? (benchmark[0] || 1) : null;
    const s1 = equity.slice(0, n).map((v) => (v / base) * 100);
    const s2 = bBase !== null && benchmark.length === equity.length
      ? benchmark.slice(0, n).map((v) => (v / bBase) * 100)
      : null;

    let min = Infinity;
    let max = -Infinity;
    for (const v of s1) { if (v < min) min = v; if (v > max) max = v; }
    if (s2) for (const v of s2) { if (v < min) min = v; if (v > max) max = v; }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    if (max - min < 1e-6) max = min + 1;
    const padY = (max - min) * 0.1;
    min -= padY;
    max += padY;

    const x = (i) => PAD.l + (i / (n - 1)) * w;
    const y = (v) => PAD.t + h - ((v - min) / (max - min)) * h;

    // 网格与 Y 轴
    ctx.strokeStyle = COLORS.grid;
    ctx.fillStyle = COLORS.axis;
    ctx.font = FONT;
    ctx.lineWidth = 1;
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const v = min + ((max - min) * i) / ticks;
      const yy = y(v);
      ctx.beginPath();
      ctx.moveTo(PAD.l, yy);
      ctx.lineTo(PAD.l + w, yy);
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(v.toFixed(0), PAD.l - 8, yy);
    }

    // 100 基准虚线
    if (min < 100 && max > 100) {
      ctx.strokeStyle = '#dfe5ef';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(PAD.l, y(100));
      ctx.lineTo(PAD.l + w, y(100));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const line = (arr, color, width) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        if (i === 0) ctx.moveTo(x(i), y(arr[i]));
        else ctx.lineTo(x(i), y(arr[i]));
      }
      ctx.stroke();
    };

    if (s2) line(s2, COLORS.bench, 1.5);
    line(s1, COLORS.strategy, 2);

    // X 轴首尾日期
    ctx.fillStyle = COLORS.axis;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(dates[0] || '', PAD.l, PAD.t + h + 5);
    ctx.textAlign = 'right';
    ctx.fillText(dates[n - 1] || '', PAD.l + w, PAD.t + h + 5);

    // 末端数值
    const last = s1[n - 1];
    ctx.font = FONT_BOLD;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = last >= 100 ? '#E65353' : '#11966D';
    ctx.fillText(last.toFixed(1), PAD.l + w, y(last) - 5);

    // 十字准星
    if (hoverIdx !== null && hoverIdx >= 0 && hoverIdx < n) {
      const cx = x(hoverIdx);

      ctx.strokeStyle = COLORS.cross;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(cx, PAD.t);
      ctx.lineTo(cx, PAD.t + h);
      ctx.stroke();
      ctx.setLineDash([]);

      if (s2) {
        ctx.fillStyle = COLORS.bench;
        ctx.beginPath();
        ctx.arc(cx, y(s2[hoverIdx]), 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = COLORS.strategy;
      ctx.beginPath();
      ctx.arc(cx, y(s1[hoverIdx]), 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    return { x, w, cssW, cssH, base, bBase, s1, s2 };
  }

  /** 气泡内容 */
  function fillTip(idx) {
    if (!tipEl) return;
    const d = dates[idx];
    const eq = equity[idx];
    const bm = benchmark.length === equity.length ? benchmark[idx] : null;
    const rows = [];
    rows.push(
      '<div class="tip-date">' + d + '</div>'
      + '<div class="tip-row"><i class="dot dot-strategy"></i>策略净值　<b>' + nav(eq) + '</b>'
      + '　<span class="' + (eq >= equity[0] ? 'up' : 'down') + '">' + pctFrom(equity[0], eq) + '</span></div>'
    );
    if (Number.isFinite(bm)) {
      rows.push(
        '<div class="tip-row"><i class="dot dot-bench"></i>买入持有　<b>' + nav(bm) + '</b>'
        + '　<span class="' + (bm >= benchmark[0] ? 'up' : 'down') + '">' + pctFrom(benchmark[0], bm) + '</span></div>'
      );
    }
    tipEl.innerHTML = rows.join('');
    tipEl.classList.remove('hidden');
  }

  let geo = render(null);
  let raf = 0;
  let pending = null;

  function onMove(ev) {
    if (!geo) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
    const mx = clientX - rect.left;
    const ratio = (mx - PAD.l) / geo.w;
    let idx = Math.round(ratio * (n - 1));
    if (idx < 0) idx = 0;
    if (idx > n - 1) idx = n - 1;

    pending = idx;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      geo = render(pending) || geo;
      fillTip(pending);

      // 气泡定位：跟随准星，靠近右边界时翻到左边
      if (tipEl) {
        const cx = geo.x(pending);
        const tw = tipEl.offsetWidth || 180;
        const left = cx + 12 + tw > geo.cssW ? cx - tw - 12 : cx + 12;
        tipEl.style.left = Math.max(4, left) + 'px';
        tipEl.style.top = PAD.t + 4 + 'px';
      }
    });
  }

  function onLeave() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    pending = null;
    geo = render(null) || geo;
    if (tipEl) tipEl.classList.add('hidden');
  }

  const onResize = () => { geo = render(pending) || geo; };

  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseleave', onLeave);
  canvas.addEventListener('touchstart', onMove, { passive: true });
  canvas.addEventListener('touchmove', onMove, { passive: true });
  canvas.addEventListener('touchend', onLeave);
  window.addEventListener('resize', onResize);

  return {
    redraw: () => { geo = render(pending) || geo; },
    destroy() {
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
      canvas.removeEventListener('touchstart', onMove);
      canvas.removeEventListener('touchmove', onMove);
      canvas.removeEventListener('touchend', onLeave);
      window.removeEventListener('resize', onResize);
      if (raf) cancelAnimationFrame(raf);
    },
  };
}
