export type FinancialState =
  'overdue' | 'current' | 'paid' | 'cancelled' | 'review' | 'excluded';
export interface OpenPosition {
  key: string;
  typeCode?: string;
  typeName?: string | null;
  number?: number;
  generalNumber?: number;
  due: string;
  extension: string | null;
  cents: number;
  status: number | null;
}
export interface ReceiptPosition {
  key: string;
  installmentKey: string;
  date: string;
  status: number;
  principalCents: number;
}
export interface CollectionSnapshot {
  calculated?: {
    referenceDate: string;
    updatedAt: string;
    overduePrincipalCents: number;
    openPrincipalCents: number;
    overdueTotalCents: number;
    openTotalCents: number;
  } | null;
  customerId?: number | null;
  key: string;
  company: string;
  work: string;
  sale: number;
  customer: string;
  project: string;
  unit: string;
  referenceDate: string;
  state: FinancialState;
  delay: number;
  overdueCents: number;
  openCents: number;
  overdueCount: number;
  positions: OpenPosition[];
  receipts: ReceiptPosition[];
  maintenance: { key: string; type: number; date: string }[];
  cancellationDate: string | null;
  cancellations: { status: number | null; date: string | null }[];
  stageId: string | null;
  ruleName: string;
  reason: string | null;
}
export interface CollectionEvent {
  key: string;
  kind: string;
  detail: Record<string, unknown>;
}
export interface PortfolioCard {
  id: string;
  customer: string;
  company: string;
  project: string;
  work: string;
  sale: number;
  unit: string;
  delay: number;
  principalCents: number;
  confirmedPrincipalCents: number;
  installments: number;
  operation:
    | 'contact'
    | 'negotiation'
    | 'promise'
    | 'legal'
    | 'paid'
    | 'current'
    | 'cancelled'
    | 'review';
  agent: string | null;
  snapshot?: CollectionSummary;
}
export type CollectionSummary = Omit<
  CollectionSnapshot,
  'positions' | 'receipts' | 'maintenance' | 'cancellations'
>;
