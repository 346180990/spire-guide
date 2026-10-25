export type Venue = '场内' | '场外' | '养老金';
export type AssetClass = 'equity' | 'bond' | 'gold' | 'fof';

export interface Holding {
  id: string;
  name: string;
  code: string;
  venue: Venue;
  cls: AssetClass;
  /** 目标占比，% */
  weight: number;
  /** 当前 PE 历史百分位 0-100，null 表示不采用估值分档（按 1 倍投） */
  pePercentile: number | null;
  /** 当前市值（手动维护，用于收益与再平衡计算） */
  marketValue: number;
}

export interface Tx {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  holdingId: string;
  kind: 'buy' | 'sell';
  amount: number;
}

export interface Plan {
  currentAge: number;
  retireAge: number;
  /** 基础月投总额，元 */
  monthly: number;
  /** 每年定投金额递增 % */
  stepUpPct: number;
  /** 预期年化收益 % */
  annualReturnPct: number;
  /** 现有可投入本金 */
  existing: number;
  /** 通胀 % */
  inflationPct: number;
  /** 个税边际税率 %，用于养老金节税估算 */
  taxRatePct: number;
}

export interface DB {
  version: number;
  plan: Plan;
  holdings: Holding[];
  txs: Tx[];
}

export const CLASS_LABEL: Record<AssetClass, string> = {
  equity: '权益',
  bond: '固收',
  gold: '黄金',
  fof: '养老FOF',
};
