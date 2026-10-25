/**
 * 【存档】六个 RSRS 指标的完整实现（归档于 2026-10-25）
 *
 * 线上只保留「标准分RSRS」「修正标准分RSRS」两个（见 strategy-miniprogram/core/rsrs.js）。
 * 这里留档的是被删掉的四个：RSRS（原始斜率）、右偏修正标准分RSRS、钝化RSRS、成交额加权钝化RSRS，
 * 以及只服务于钝化的 q（收益波动分位）与 WLS（成交额加权回归）机制。
 *
 * 归档依据：同参数下 5 个指数 × 18 组参数 × 2 个区间 = 1080 个回测单元，
 * 四个版本的平均超额年化都低于保留的两个（明细见根 README）。
 *
 * 不参与构建、不被 require。想看公式或需要复活某个指标时，从这里挪回 core/ 即可。
 */

/**
 * RSRS 指标计算 —— 严格移植自
 *   D:\MyProject\QuantsPlaybook\C-择时类\RSRS择时指标\py\RSRS改进.ipynb
 *   （cell 3 的 RSRS.get_RSRS / _regression / _cal_ols / _cal_wls / _cal_ret_quantile）
 *
 * 六个指标（notebook 原文命名）：
 *   RSRS                = β_OLS
 *   标准分RSRS           = (β - roll_mean_M(β)) / roll_std_M(β)
 *   修正标准分RSRS       = 标准分 × R²
 *   右偏修正标准分RSRS   = 修正标准分 × β
 *   钝化RSRS             = 标准分 × R^(2 × q)          ← notebook 的改良点
 *   成交额加权钝化RSRS   = z(β_wls) × R²_wls^(2 × q)
 *
 * q = quantile(std(ret), M)：
 *   ret_std  = ret 在最近 N 日的总体标准差（ddof=0，首值起算）
 *   q        = ret_std 在最近 M 日窗口中的分位排名（pandas rank(pct=True)，average 处理并列）
 *
 * 口径说明（与原实现的两处差异，均已在下方注释标明）：
 *   1. cell 1 的公式写 R^(4q)，cell 3 的代码是 R^(2*q)。以代码为准。
 *   2. notebook 的回归窗口是 [i-N, i)（不含当日），收益用 ret.shift(-1)；
 *      两者相抵后等价于「用截至 T 的数据算信号，赚 T+1 的收益」。本实现采用自然对齐：
 *      窗口含当日 T、收益取 T+1，结论与 notebook 等价。
 *
 * 本模块为纯函数，不引用 wx，可在 Node 中直接 require 做测试。
 */

'use strict';

/** 六种指标的规范名（与 notebook 完全一致，UI 直接用它做 key） */
const KINDS = [
  'RSRS',
  '标准分RSRS',
  '修正标准分RSRS',
  '右偏修正标准分RSRS',
  '钝化RSRS',
  '成交额加权钝化RSRS',
];

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
 * WLS：权重 w = volume / Σvolume（notebook `_get_vol_weights`）
 * β 与加权中心化 R²，对应 statsmodels WLS.fit() 的 params[1] / rsquared。
 * 成交量为 0 或缺失时退回 OLS。
 */
function wlsWindow(highs, lows, volumes, start, end) {
  const n = end - start;
  if (n < 2) return { beta: NaN, r2: NaN };
  let sumW = 0;
  for (let i = start; i < end; i++) {
    const v = volumes[i];
    if (isNum(v) && v > 0) sumW += v;
  }
  if (!(sumW > 0)) return olsWindow(highs, lows, start, end);

  let wsum = 0, wx = 0, wy = 0;
  for (let i = start; i < end; i++) {
    const v = volumes[i];
    const w = isNum(v) && v > 0 ? v / sumW : 0;
    wsum += w; wx += w * lows[i]; wy += w * highs[i];
  }
  const mx = wx / wsum;
  const my = wy / wsum;

  let cov = 0, varX = 0;
  for (let i = start; i < end; i++) {
    const v = volumes[i];
    const w = isNum(v) && v > 0 ? v / sumW : 0;
    const dx = lows[i] - mx;
    cov += w * dx * (highs[i] - my);
    varX += w * dx * dx;
  }
  if (varX <= 1e-12) return { beta: NaN, r2: NaN };
  const beta = cov / varX;

  let ssRes = 0, ssTot = 0;
  for (let i = start; i < end; i++) {
    const v = volumes[i];
    const w = isNum(v) && v > 0 ? v / sumW : 0;
    const fit = my + beta * (lows[i] - mx);
    const e = highs[i] - fit;
    ssRes += w * e * e;
    const d = highs[i] - my;
    ssTot += w * d * d;
  }
  const r2 = ssTot > 1e-12 ? 1 - ssRes / ssTot : NaN;
  return { beta: beta, r2: r2 };
}

/** 总体标准差（ddof=0），对应 np.nanstd */
function stdPop(values) {
  const arr = [];
  for (let i = 0; i < values.length; i++) {
    if (isNum(values[i])) arr.push(values[i]);
  }
  if (arr.length === 0) return NaN;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  const mean = sum / arr.length;
  let sq = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - mean;
    sq += d * d;
  }
  return Math.sqrt(sq / arr.length);
}

/**
 * pandas `x.rank(pct=True)[-1]` 的等价实现：
 * average 排名（并列取平均名次），再除以窗口内有效值个数。
 */
function rankPctLast(window) {
  const vals = [];
  for (let i = 0; i < window.length; i++) {
    if (isNum(window[i])) vals.push(window[i]);
  }
  if (vals.length === 0) return NaN;
  const x = window[window.length - 1];
  if (!isNum(x)) return NaN;
  let less = 0;
  let equal = 0;
  for (let i = 0; i < vals.length; i++) {
    if (vals[i] < x) less++;
    else if (vals[i] === x) equal++;
  }
  const rank = less + (equal + 1) / 2;
  return rank / vals.length;
}

/**
 * 计算全套序列。
 *
 * @param {Array} bars - 日线，升序；字段 date/open/high/low/close/volume
 * @param {{n:number, m:number, align?:string}} opts - 回归窗口 N、标准化窗口 M、
 *        对齐方式 `notebook`（默认，回归窗口 [i-N, i) 不含当日，与原实现逐位对齐）
 *        或 `natural`（窗口含当日，信号更新一点但与 notebook 数值不同）
 * @returns {Object} 各序列（长度与 bars 一致，前若干项为 NaN）
 */
function computeSeries(bars, opts) {
  const n = Math.round(Number(opts && opts.n));
  const m = Math.round(Number(opts && opts.m));
  // notebook 的 _regression 里窗口是 price_df[low][i-N:i]，即不含第 i 根；
  // 而 _cal_ret_quantile 的 ret 序列是含第 i 根的。这里如实复刻这种错位。
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
  const volumes = new Array(len);
  const rets = new Array(len);
  for (let i = 0; i < len; i++) {
    dates[i] = rows[i].date;
    highs[i] = rows[i].high;
    lows[i] = rows[i].low;
    closes[i] = rows[i].close;
    volumes[i] = rows[i].volume;
    const prev = i > 0 ? closes[i - 1] : NaN;
    rets[i] = isNum(prev) && prev > 0 ? closes[i] / prev - 1 : NaN;
  }

  // ---- β_OLS / R²_OLS / β_WLS / R²_WLS ----
  const beta = new Array(len).fill(NaN);
  const r2 = new Array(len).fill(NaN);
  const betaWls = new Array(len).fill(NaN);
  const r2Wls = new Array(len).fill(NaN);
  for (let i = 0; i < len; i++) {
    const end = align === 'notebook' ? i : i + 1; // notebook: [i-N, i)，不含当日
    const start = end - n;
    if (start < 0) continue;
    const ols = olsWindow(highs, lows, start, end);
    beta[i] = ols.beta;
    r2[i] = ols.r2;
    const wls = wlsWindow(highs, lows, volumes, start, end);
    betaWls[i] = wls.beta;
    r2Wls[i] = wls.r2;
  }

  // ---- ret_std = rolling(N, min_periods=1).nanstd ----
  const retStd = new Array(len).fill(NaN);
  for (let i = 0; i < len; i++) {
    const start = Math.max(0, i - n + 1);
    retStd[i] = stdPop(rets.slice(start, i + 1));
  }

  // ---- q = rolling(M).apply(rank(pct)[-1]) ----
  const q = new Array(len).fill(NaN);
  for (let i = 0; i < len; i++) {
    if (i + 1 < m) continue;
    q[i] = rankPctLast(retStd.slice(i - m + 1, i + 1));
  }

  // ---- 标准分（先 OLS 版，再 WLS 版）----
  const z = rollingZ(beta, m);
  const zWls = rollingZ(betaWls, m);

  // ---- 六个指标 ----
  const revise = new Array(len).fill(NaN);
  const positive = new Array(len).fill(NaN);
  const damped = new Array(len).fill(NaN);
  const dampedWls = new Array(len).fill(NaN);
  for (let i = 0; i < len; i++) {
    if (isNum(z[i]) && isNum(r2[i])) {
      revise[i] = z[i] * r2[i];
      positive[i] = isNum(beta[i]) ? revise[i] * beta[i] : NaN;
    }
    if (isNum(z[i]) && isNum(r2[i]) && isNum(q[i])) {
      // notebook: singal_df['钝化RSRS'] = 标准分RSRS * params[1]**(2 * ret_quantile)
      damped[i] = z[i] * Math.pow(Math.max(r2[i], 0), 2 * q[i]);
    }
    if (isNum(zWls[i]) && isNum(r2Wls[i]) && isNum(q[i])) {
      // notebook: passiv_z * passiv_df['rsquare']**(2 * ret_quantile)
      dampedWls[i] = zWls[i] * Math.pow(Math.max(r2Wls[i], 0), 2 * q[i]);
    }
  }

  return {
    n: n,
    m: m,
    len: len,
    dates: dates,
    closes: closes,
    rets: rets,
    retStd: retStd,
    q: q,
    beta: beta,
    r2: r2,
    betaWls: betaWls,
    r2Wls: r2Wls,
    z: z,
    zWls: zWls,
    revise: revise,
    positive: positive,
    damped: damped,
    dampedWls: dampedWls,
    readyFrom: firstReady([z, q]),
    series: {
      'RSRS': beta,
      '标准分RSRS': z,
      '修正标准分RSRS': revise,
      '右偏修正标准分RSRS': positive,
      '钝化RSRS': damped,
      '成交额加权钝化RSRS': dampedWls,
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
  indicatorSeries: indicatorSeries,
  // 以下导出供测试使用
  _internal: {
    olsWindow: olsWindow,
    wlsWindow: wlsWindow,
    stdPop: stdPop,
    rankPctLast: rankPctLast,
    rollingZ: rollingZ,
  },
};
