import type { CollectionSnapshot, OpenPosition } from './portfolio-types';
import type { UauInstallment } from '@/lib/uau/finance-types';

export interface ContractFinance {
  positions: UauInstallment[];
  referenceDate: string;
  updatedAt: string;
}

/** The API's calculated amount already contains its adjustments. Never add
 * the component columns to amountCents again. Keep absent components unknown. */
export function contractFinancialView(
  snapshot: CollectionSnapshot | null,
  finance: ContractFinance | null
) {
  const stored = new Map(snapshot?.positions.map((p) => [p.key, p]) ?? []);
  const positions: (OpenPosition & { financial?: UauInstallment })[] = finance
    ? finance.positions.map((item) => {
        const general = item.key.split(':')[0];
        const key = `${item.type}_${item.number}_${general}`;
        const previous = stored.get(key);
        return {
          key,
          typeCode: item.type,
          typeName: item.description ?? previous?.typeName,
          number: Number(item.number),
          generalNumber: Number(general),
          due: item.originalDueDate ?? item.dueDate!,
          extension:
            item.extensionDate !== undefined
              ? item.extensionDate
              : (previous?.extension ?? null),
          cents: item.principalCents ?? 0,
          status: previous?.status ?? null,
          financial: item,
        };
      })
    : (snapshot?.positions ?? []);
  const reference = finance?.referenceDate ?? snapshot?.referenceDate ?? '';
  const overdue = positions.filter(
    (p) =>
      p.due < reference &&
      (p.financial ? p.financial.amountCents > 0 : p.cents > 0)
  );
  const future = positions.filter((p) => p.due >= reference);
  const sum = (rows: typeof positions, key: keyof UauInstallment) => {
    if (!finance) return null;
    const values = rows.map((p) => p.financial?.[key]);
    return values.every((v) => typeof v === 'number')
      ? (values as number[]).reduce((a, b) => a + b, 0)
      : null;
  };
  const indexedPrincipal = (rows: typeof positions) => {
    const base = sum(rows, 'principalCents');
    const correction = sum(rows, 'correctionCents');
    return base == null || correction == null ? null : base + correction;
  };
  return {
    positions,
    reference,
    overdue,
    future,
    overduePrincipal: finance
      ? sum(overdue, 'principalCents')
      : (snapshot?.overdueCents ?? null),
    openPrincipal: finance
      ? sum(positions, 'principalCents')
      : (snapshot?.openCents ?? null),
    overdueAdjusted: sum(overdue, 'amountCents'),
    overdueIndexedPrincipal: indexedPrincipal(overdue),
    openIndexedPrincipal: indexedPrincipal(positions),
    openAdjusted: sum(positions, 'amountCents'),
    futureAdjusted: sum(future, 'amountCents'),
    nextDue:
      future
        .filter((p) => (p.financial?.amountCents ?? p.cents) > 0)
        .map((p) => p.due)
        .sort()[0] ?? null,
  };
}
