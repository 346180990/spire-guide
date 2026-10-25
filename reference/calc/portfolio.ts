import type { AssetClass, Holding, Tx } from '../types';

export interface HoldingStat {
  holding: Holding;
  invested: number;
  sold: number;
  marketValue: number;
  /** 净投入 */
  netInvested: number;
  /** (市值 + 已卖出 - 投入) / 投入 */
  gainPct: number;
  gain: number;
  sharePct: number;
}

export function holdingStats(holdings: Holding[], txs: Tx[]): HoldingStat[] {
  const stats: HoldingStat[] = holdings.map((h) => {
    let invested = 0;
    let sold = 0;
    for (const t of txs) {
      if (t.holdingId !== h.id) continue;
      if (t.kind === 'buy') invested += t.amount;
      else sold += t.amount;
    }
    const netInvested = invested - sold;
    const gain = h.marketValue + sold - invested;
    return {
      holding: h,
      invested,
      sold,
      marketValue: h.marketValue,
      netInvested,
      gain,
      gainPct: invested > 0 ? gain / invested : 0,
      sharePct: 0,
    };
  });

  const totalValue = stats.reduce((s, x) => s + x.marketValue, 0);
  const totalNet = stats.reduce((s, x) => s + Math.max(0, x.netInvested), 0);
  const denom = totalValue > 0 ? totalValue : totalNet;
  for (const s of stats) {
    const base = totalValue > 0 ? s.marketValue : Math.max(0, s.netInvested);
    s.sharePct = denom > 0 ? (base / denom) * 100 : 0;
  }
  return stats;
}

export function sumByClass(stats: HoldingStat[]): Record<AssetClass, number> {
  const out: Record<AssetClass, number> = { equity: 0, bond: 0, gold: 0, fof: 0 };
  const total = stats.reduce((s, x) => s + x.marketValue, 0);
  for (const s of stats) out[s.holding.cls] += s.marketValue;
  if (total <= 0) {
    for (const k of Object.keys(out) as AssetClass[]) out[k] = 0;
    return out;
  }
  for (const k of Object.keys(out) as AssetClass[]) out[k] = (out[k] / total) * 100;
  return out;
}

/** 年龄段目标权益仓位（%） */
export function targetEquityPct(age: number): number {
  if (age < 45) return 90;
  if (age < 50) return 75;
  if (age < 55) return 55;
  return 35;
}

export interface RebalanceResult {
  age: number;
  targetEquity: number;
  currentEquity: number;
  /** 当前 - 目标，正数=权益超配 */
  deviation: number;
  needRebalance: boolean;
  action: string;
  /** 需要从权益挪出的金额（正=卖出权益），0 表示无需操作 */
  moveAmount: number;
  totalValue: number;
  hasPosition: boolean;
}

export function rebalanceCheck(age: number, stats: HoldingStat[]): RebalanceResult {
  const targetEquity = targetEquityPct(age);
  const totalValue = stats.reduce((s, x) => s + x.marketValue, 0);
  const equityValue = stats
    .filter((s) => s.holding.cls === 'equity')
    .reduce((s, x) => s + x.marketValue, 0);
  const hasPosition = totalValue > 0;
  const currentEquity = hasPosition ? (equityValue / totalValue) * 100 : 0;
  const deviation = currentEquity - targetEquity;
  const needRebalance = hasPosition && Math.abs(deviation) > 5;
  const gapValue = (Math.abs(deviation) / 100) * totalValue;

  let action: string;
  if (!hasPosition) action = '先录入持仓市值，才能判断再平衡';
  else if (!needRebalance) action = `偏离 ${deviation.toFixed(1)} 个百分点，在 ±5% 容忍带内，不用动`;
  else if (deviation > 0) action = `权益超配 ${deviation.toFixed(1)} 个百分点，卖出约 ${Math.round(gapValue)} 元权益买入固收`;
  else action = `权益低配 ${Math.abs(deviation).toFixed(1)} 个百分点，卖出约 ${Math.round(gapValue)} 元固收买入权益`;

  return {
    age,
    targetEquity,
    currentEquity,
    deviation,
    needRebalance,
    action,
    moveAmount: needRebalance ? Math.round(gapValue) : 0,
    totalValue,
    hasPosition,
  };
}
