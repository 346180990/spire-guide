import type { Plan } from '../types';

export interface YearPoint {
  /** 第几年（0 = 现在） */
  year: number;
  age: number;
  /** 累计投入（含现有本金） */
  invested: number;
  /** 账户市值 */
  value: number;
}

export interface Projection {
  months: number;
  years: number;
  points: YearPoint[];
  totalInvested: number;
  finalValue: number;
  /** 按通胀折算后的购买力 */
  finalReal: number;
  gain: number;
  /** 收益 / 累计投入 */
  gainMultiple: number;
}

/**
 * 月度定投推演。
 * 约定：已有本金在月初增值，当月定投额在月末投入、当月不再增值。
 */
export function project(plan: Plan, annualReturnPct = plan.annualReturnPct): Projection {
  const years = Math.max(0, plan.retireAge - plan.currentAge);
  const months = Math.round(years * 12);
  const rm = Math.pow(1 + annualReturnPct / 100, 1 / 12) - 1;

  let value = Math.max(0, plan.existing);
  let invested = Math.max(0, plan.existing);
  const points: YearPoint[] = [
    { year: 0, age: plan.currentAge, invested: round2(invested), value: round2(value) },
  ];

  for (let m = 1; m <= months; m++) {
    const yearIndex = Math.floor((m - 1) / 12); // 第几年开始
    const contrib = Math.max(0, plan.monthly) * Math.pow(1 + plan.stepUpPct / 100, yearIndex);
    value = value * (1 + rm) + contrib;
    invested += contrib;
    if (m % 12 === 0) {
      points.push({
        year: m / 12,
        age: plan.currentAge + m / 12,
        invested: round2(invested),
        value: round2(value),
      });
    }
  }

  const finalReal =
    Math.pow(1 + plan.inflationPct / 100, years) === 0
      ? value
      : value / Math.pow(1 + plan.inflationPct / 100, years);

  return {
    months,
    years,
    points,
    totalInvested: round2(invested),
    finalValue: round2(value),
    finalReal: round2(finalReal),
    gain: round2(value - invested),
    gainMultiple: invested > 0 ? (value - invested) / invested : 0,
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 中文金额缩写：12345 → 1.23万 */
export function money(n: number, digits = 0): string {
  const abs = Math.abs(n);
  if (abs >= 1e8) return (n / 1e8).toFixed(2) + '亿';
  if (abs >= 1e4) return (n / 1e4).toFixed(abs >= 1e6 ? 0 : 2) + '万';
  return n.toFixed(digits);
}

export function yuan(n: number): string {
  return Math.round(n).toLocaleString('zh-CN');
}
