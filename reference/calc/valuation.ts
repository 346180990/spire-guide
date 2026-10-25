import type { Holding } from '../types';

export interface ValuationBand {
  /** 上界（百分位） */
  max: number;
  mult: number;
  label: string;
  tone: 'good' | 'ok' | 'warn' | 'bad';
  tip: string;
}

export const VALUATION_BANDS: ValuationBand[] = [
  { max: 10, mult: 2, label: '极度低估', tone: 'good', tip: '2 倍投入' },
  { max: 30, mult: 1.5, label: '低估', tone: 'good', tip: '1.5 倍投入' },
  { max: 70, mult: 1, label: '合理', tone: 'ok', tip: '正常投入' },
  { max: 80, mult: 0.5, label: '偏高', tone: 'warn', tip: '0.5 倍投入' },
  { max: 100, mult: 0, label: '高估', tone: 'bad', tip: '暂停定投，保留持仓' },
];

export function bandFor(percentile: number | null): ValuationBand {
  if (percentile === null || !isFinite(percentile)) {
    return { max: 100, mult: 1, label: '不计估值', tone: 'ok', tip: '按基础金额投入' };
  }
  return VALUATION_BANDS.find((b) => percentile <= b.max) ?? VALUATION_BANDS[VALUATION_BANDS.length - 1];
}

/** 把金额取整成便于下单的数字：≥200 取整到 100，否则取整到 10 */
export function niceAmount(n: number): number {
  if (n <= 0) return 0;
  if (n >= 200) return Math.round(n / 100) * 100;
  return Math.round(n / 10) * 10;
}

export interface MonthRow {
  holding: Holding;
  base: number;
  mult: number;
  band: ValuationBand;
  amount: number;
}

export interface MonthSheet {
  rows: MonthRow[];
  total: number;
  /** 相对基础月投的比例 */
  ratio: number;
  paused: MonthRow[];
  boosted: MonthRow[];
}

/** 按估值分档生成「本月定投清单」 */
export function monthSheet(holdings: Holding[], monthly: number): MonthSheet {
  const rows: MonthRow[] = holdings.map((h) => {
    const base = (monthly * h.weight) / 100;
    const band = bandFor(h.pePercentile);
    return { holding: h, base, mult: band.mult, band, amount: niceAmount(base * band.mult) };
  });
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return {
    rows,
    total,
    ratio: monthly > 0 ? total / monthly : 0,
    paused: rows.filter((r) => r.amount === 0 && r.base > 0),
    boosted: rows.filter((r) => r.mult > 1 && r.amount > 0),
  };
}

/** 本月清单的纯文本，方便一键复制到备忘录 */
export function sheetText(sheet: MonthSheet, holdings: Holding[]): string {
  const d = new Date();
  const head = `${d.getFullYear()}年${d.getMonth() + 1}月 定投清单（合计 ${sheet.total} 元）`;
  const lines = sheet.rows
    .map((r, i) => {
      const mark = r.amount === 0 ? '（暂停）' : '';
      return `${i + 1}. ${r.holding.name} ${r.holding.code} ${r.holding.venue}  ${r.amount}元${mark}`;
    })
    .filter(Boolean);
  void holdings;
  return [head, '', ...lines, '', '规则：分位<10%→2倍 / <30%→1.5倍 / 30-70%→1倍 / 70-80%→0.5倍 / >80%→暂停'].join(
    '\n',
  );
}
