/**
 * RSRS 指标计算 —— 移植自
 *   D:\MyProject\QuantsPlaybook\C-择时类\RSRS择时指标\py\RSRS改进.ipynb
 *   （cell 3 的 RSRS.get_RSRS / _regression / _cal_ols）
 *
 * 保留三个版本（notebook 原本有六个，其余三个的完整实现存档在
 * reference/rsrs/rsrs-6kinds.archive.js）：
 *
 *   标准分RSRS         = (β - roll_mean_M(β)) / roll_std_M(β)
 *   修正标准分RSRS     = 标准分 × R²
 *   右偏修正标准分RSRS = 修正标准分 × β
 *
 * 为什么是这三个：同参数下跑 5 个指数 × 18 组参数 × 2 个区间，共 1080 个单元，
 * 标准分（+1.71%）与修正（+1.60%）的平均超额最高；右偏的收益更高但回撤也更大，
 * 配合下面的 MA 趋势过滤能把回撤压到三分之一（见 README）。
 *
 * 另外提供「MA 趋势过滤」——研究脚本里那套「钝化」：
 *   信号为持仓 且 MA20 上倾（T-1 > T-3）才真的持仓，历史不足时一律空仓。
 * 注意：它和 notebook 的钝化（标准分 × R^(2q)）不是一回事，两个「钝化」别混。
 *
 * 口径说明（与原实现的一处差异）：
 *   notebook 的回归窗口是 [i-N, i)（不含当日），收益用 ret.shift(-1)；
 *   两者相抵后等价于「用截至 T 的数据算信号，赚 T+1 的收益」。本实现采用自然对齐：
 *   窗口含当日 T、收益取 T+1，结论与 notebook 等价。
 *
 * 本模块为纯函数，不引用 wx，可在 Node 中直接 require 做测试。
 */

'use strict';

/** 三种指标的规范名（notebook 原文命名，UI 直接用它做 key） */
const KINDS = ['标准分RSRS', '修正标准分RSRS', '右偏修正标准分RSRS'];

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/** bars 元素可以是 {date,open,high,low,close,volume} 或 [date,open,high,low,close,volume] */
function normalizeBars(bars) {
  const out = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (Array.isArray(b)) {
      out.push({
        date: String(b[0]),
        open: Number(b[1]),
        high: Number(b[2]),
        low: Number(b[3]),
        close: Number(b[4]),
        volume: Number(b[5]),
      });
    } else if (b && typeof b === 'object') {
      out.push({
        date: String(b.date),
        open: Number(b.open),
        high: Number(b.high),
        low: Number(b.low),
        close: Number(b.close),
        volume: Number(b.volume),
      });
    }
  }
  return out;
}

/**
 * OLS：high = a + b·low，返回 { beta, r2 }
 * R² 用 corr(x,y)² 的闭式解，与 notebook 的 np.corrcoef(x, y)[1,0]**2 等价。
 */
function olsWindow(highs, lows, start, end) {
  const n = end - start;
  if (n < 2) return { beta: NaN, r2: NaN };
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = start; i < end; i++) {
    const x = lows[i];
    const y = highs[i];
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
  }
  const num = n * sxy - sx * sy;
  const denX = n * sxx - sx * sx;
  const denY = n * syy - sy * sy;
  if (denX <= 1e-12 || denY <= 1e-12) return { beta: NaN, r2: NaN };
  return { beta: num / denX, r2: (num * num) / (denX * denY) };
}

/**
 * 计算两个指标所需的序列。
 *
 * @param {Array} bars - 日线，升序；字段 date/open/high/low/close/volume
 * @param {{n:number, m:number, align?:string}} opts - 回归窗口 N、标准化窗口 M、
 *        对齐方式 `notebook`（默认，回归窗口 [i-N, i) 不含当日，与原实现逐位对齐）
 *        或 `natural`（窗口含当日，信号更新一点但与 notebook 数值不同）
 * @returns {Object} beta/r2/z/revise 与 series 映射（长度与 bars 一致，前若干项为 NaN）
 */
function computeSeries(bars, opts) {
  const n = Math.round(Number(opts && opts.n));
  const m = Math.round(Number(opts && opts.m));
  // notebook 的 _regression 里窗口是 price_df[low][i-N:i]，即不含第 i 根；
  // 这里如实复刻这种错位。
  const align = opts && opts.align === 'natural' ? 'natural' : 'notebook';
  if (!(n >= 2) || !(m >= 2)) {
    throw new Error('RSRS 参数非法：N 与 M 都必须 >= 2');
  }

  const rows = normalizeBars(bars);
  const len = rows.length;
  const dates = new Array(len);
  const highs = new Array(len);
  const lows = new Array(len);
  const closes = new Array(len);
  for (let i = 0; i < len; i++) {
    dates[i] = rows[i].date;
    highs[i] = rows[i].high;
    lows[i] = rows[i].low;
    closes[i] = rows[i].close;
  }

  // ---- β_OLS / R²_OLS ----
  const beta = new Array(len).fill(NaN);
  const r2 = new Array(len).fill(NaN);
  for (let i = 0; i < len; i++) {
    const end = align === 'notebook' ? i : i + 1; // notebook: [i-N, i)，不含当日
    const start = end - n;
    if (start < 0) continue;
    const ols = olsWindow(highs, lows, start, end);
    beta[i] = ols.beta;
    r2[i] = ols.r2;
  }

  // ---- 标准分 / 修正标准分 / 右偏修正标准分 ----
  const z = rollingZ(beta, m);
  const revise = new Array(len).fill(NaN);
  const positive = new Array(len).fill(NaN);
  for (let i = 0; i < len; i++) {
    if (isNum(z[i]) && isNum(r2[i])) {
      revise[i] = z[i] * r2[i];
      if (isNum(beta[i])) positive[i] = revise[i] * beta[i];
    }
  }

  return {
    n: n,
    m: m,
    len: len,
    dates: dates,
    closes: closes,
    beta: beta,
    r2: r2,
    z: z,
    revise: revise,
    positive: positive,
    readyFrom: firstReady([z, r2]),
    series: {
      '标准分RSRS': z,
      '修正标准分RSRS': revise,
      '右偏修正标准分RSRS': positive,
    },
  };
}

/** 滚动标准分：(v - mean_M) / std_M，样本标准差（pandas rolling().std() 默认 ddof=1） */
function rollingZ(values, m) {
  const out = new Array(values.length).fill(NaN);
  for (let i = 0; i < values.length; i++) {
    if (i + 1 < m) continue;
    const win = values.slice(i - m + 1, i + 1);
    let cnt = 0;
    let sum = 0;
    for (let k = 0; k < win.length; k++) {
      if (isNum(win[k])) { sum += win[k]; cnt++; }
    }
    if (cnt < m) continue; // pandas rolling 默认要求窗口内全部有效
    const mean = sum / cnt;
    let sq = 0;
    for (let k = 0; k < win.length; k++) sq += (win[k] - mean) * (win[k] - mean);
    const sd = Math.sqrt(sq / (cnt - 1));
    if (!(sd > 1e-12)) continue;
    out[i] = (win[win.length - 1] - mean) / sd;
  }
  return out;
}

/** 简单移动平均，前 win-1 个是 NaN */
function rollingMean(values, win) {
  const w = Math.round(Number(win));
  const out = new Array(values.length).fill(NaN);
  if (!(w >= 2)) return out;
  let sum = 0;
  let cnt = 0;
  for (let i = 0; i < values.length; i++) {
    if (isNum(values[i])) { sum += values[i]; cnt++; }
    if (i >= w && isNum(values[i - w])) { sum -= values[i - w]; cnt--; }
    if (i + 1 >= w && cnt === w) out[i] = sum / w;
  }
  return out;
}

/**
 * MA 趋势过滤（研究脚本里的「钝化」）
 *
 * 规则：只有「信号为持仓」且「均线上倾（T-1 > T-3）」时才真的持仓；
 * 历史不够（i < 3 或均线还没算出来）时一律空仓。
 * 与 scripts/rsrs-yearly.mjs 的 smoothSignal 逐位一致。
 *
 * 注意时序：这里用的是第 i 根之前的信息（ma[i-1] / ma[i-3]），
 * 回测/信号再按「用 T-1 的仓位赚 T 的收益」执行，所以不存在未来函数。
 *
 * @param {Array<number>} pos    0/1 仓位序列
 * @param {Array<number>} closes 收盘价
 * @param {number} win           均线窗口，默认 20
 */
function applyTrendFilter(pos, closes, win) {
  const w = Math.round(Number(win)) || 20;
  const ma = rollingMean(closes, w);
  const out = new Array(pos.length).fill(0);
  for (let i = 0; i < pos.length; i++) {
    if (i < 3) continue;
    if (!isNum(ma[i - 1]) || !isNum(ma[i - 3])) continue;
    out[i] = pos[i] === 1 && ma[i - 1] > ma[i - 3] ? 1 : 0;
  }
  return out;
}

/** 多个序列中最晚出现的首个有效下标 */
function firstReady(list) {
  let idx = 0;
  for (let s = 0; s < list.length; s++) {
    const arr = list[s];
    let first = -1;
    for (let i = 0; i < arr.length; i++) {
      if (isNum(arr[i])) { first = i; break; }
    }
    if (first < 0) return -1;
    if (first > idx) idx = first;
  }
  return idx;
}

/**
 * 阈值状态机（notebook `_mark_flag`）
 *   空仓 且 v > up       → 买
 *   持仓 且 v > dn       → 继续持有
 *   持仓 且 v <= dn      → 卖
 *   其余                 → 空仓
 * 与 notebook 的唯一差异：首根有效信号用 up 判定，而 notebook 写死 0.7。
 */
function buildPosition(values, up, dn) {
  const pos = new Array(values.length).fill(0);
  const buys = [];
  const sells = [];
  let holding = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!isNum(v)) { pos[i] = 0; continue; }
    if (!holding && v > up) {
      holding = 1;
      buys.push(i);
    } else if (holding && v > dn) {
      holding = 1;
    } else if (holding && v <= dn) {
      holding = 0;
      sells.push(i);
    }
    pos[i] = holding;
  }
  return { pos: pos, buys: buys, sells: sells };
}

/** 取某个指标序列 */
function indicatorSeries(series, kind) {
  const s = series && series.series ? series.series[kind] : null;
  if (!s) throw new Error('未知的 RSRS 指标：' + kind);
  return s;
}

module.exports = {
  KINDS: KINDS,
  normalizeBars: normalizeBars,
  computeSeries: computeSeries,
  buildPosition: buildPosition,
  applyTrendFilter: applyTrendFilter,
  indicatorSeries: indicatorSeries,
  // 以下导出供测试使用
  _internal: {
    olsWindow: olsWindow,
    rollingZ: rollingZ,
    rollingMean: rollingMean,
  },
};
