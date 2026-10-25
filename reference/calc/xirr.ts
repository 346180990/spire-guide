export interface Cashflow {
  /** YYYY-MM-DD */
  date: string;
  /** 负数=投入，正数=收回（卖出或当前市值） */
  amount: number;
}

const DAY = 86400000;

function toTime(date: string): number {
  return new Date(date + 'T00:00:00Z').getTime();
}

function npv(flows: Cashflow[], rate: number): number {
  const t0 = toTime(flows[0].date);
  let sum = 0;
  for (const f of flows) {
    const years = (toTime(f.date) - t0) / DAY / 365;
    sum += f.amount / Math.pow(1 + rate, years);
  }
  return sum;
}

/**
 * 计算 XIRR（不规则现金流年化内部收益率）。
 * 二分法，稳定优先；无解返回 null。
 */
export function xirr(flows: Cashflow[]): number | null {
  const list = flows.filter((f) => f.amount !== 0).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (list.length < 2) return null;
  const hasNeg = list.some((f) => f.amount < 0);
  const hasPos = list.some((f) => f.amount > 0);
  if (!hasNeg || !hasPos) return null;

  // 时间跨度太短（<30天）时年化没有意义
  const spanDays = (toTime(list[list.length - 1].date) - toTime(list[0].date)) / DAY;
  if (spanDays < 30) return null;

  let lo = -0.9999;
  let hi = 10;
  let fLo = npv(list, lo);
  let fHi = npv(list, hi);
  if (!isFinite(fLo) || !isFinite(fHi) || fLo * fHi > 0) return null;

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(list, mid);
    if (!isFinite(fMid)) return null;
    if (Math.abs(fMid) < 1e-7) return mid;
    if (fLo * fMid <= 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

export function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
