export interface UauCustomer {
  id: number;
  name: string;
  email: string | null;
}
export interface UauPhone {
  number: string;
  complement?: string | null;
  type: number | null;
  primary: boolean;
}
export interface UauContract {
  key: string;
  company: number;
  project: string;
  sale: number;
  status: number | null;
  units: string[];
  unitDetails?: { description: string; identifier: string }[];
}
export interface UauInstallment {
  key: string;
  number: string;
  type: string;
  dueDate: string | null;
  paidDate: string | null;
  amountCents: number;
  daysOverdue: number;
  description?: string | null;
  originalDueDate?: string | null;
  extensionDate?: string | null;
  principalCents?: number | null;
  adjustmentIndex?: string | null;
  correctionCents?: number | null;
  lateCorrectionCents?: number | null;
  interestCents?: number | null;
  lateInterestCents?: number | null;
  fineCents?: number | null;
  discountCents?: number | null;
}
export interface UauFinance {
  linked: true;
  customer: UauCustomer;
  documentMasked: string;
  document?: string;
  phones: UauPhone[] | null;
  contracts: UauContract[];
  selectedKey: string | null;
  open: UauInstallment[] | null;
  received: UauInstallment[] | null;
  attendances: UauAttendance[] | null;
  warnings: ('phones' | 'open' | 'received' | 'attendances')[];
  updatedAt: string;
  cacheStatus?: 'hit' | 'miss' | 'refreshed';
}

export interface UauAttendance {
  id: number;
  categoryCode: string;
  category: string;
  description: string;
  createdAt: string;
  closedAt: string | null;
  statusCode: number | null;
  createdBy?: string | null;
  responsible?: string | null;
  createdByName?: string | null;
  responsibleName?: string | null;
}
export interface UauContactLink {
  contact_id: string;
  account_id: string;
  document_encrypted: string;
  person_id: number;
  person_name: string;
  connection_revision: string;
}
