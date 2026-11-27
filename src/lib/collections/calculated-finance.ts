import type { CollectionSnapshot, CollectionSummary } from './portfolio-types';
import type { UauInstallment } from '@/lib/uau/finance-types';

/** Keep reconciliation on base amounts. Calculated amounts are a separate,
 * dated position from the ERP, never an input to receipt matching. */
export function withCalculatedFinance(
  snapshot: CollectionSnapshot,
  installments: UauInstallment[],
  updatedAt = new Date().toISOString()
): CollectionSnapshot {
  const stored = new Map(snapshot.positions.map((p) => [p.key, p]));
  const seen = new Set<string>();
  let overduePrincipalCents = 0,
    openPrincipalCents = 0,
    overdueTotalCents = 0,
    openTotalCents = 0;
  for (const item of installments) {
    const key = `${item.type}_${item.number}_${item.key.split(':')[0]}`;
    const position = stored.get(key);
    if (
      !position ||
      seen.has(key) ||
      position.due !== item.originalDueDate ||
      position.cents !== item.principalCents
    ) {
      throw new Error(
        'As parcelas da API e da conciliação divergem. Repita a sincronização.'
      );
    }
    seen.add(key);
    if (item.correctionCents == null) {
      throw new Error(
        'O UAU não informou o reajuste por índices de uma parcela.'
      );
    }
    // vlrCorrecaoEmb repeats an embedded correction: do not add it again.
    // ValorReaj is already the final amount, including applicable charges.
    const principal = position.cents + item.correctionCents;
    openPrincipalCents += principal;
    openTotalCents += item.amountCents;
    if (position.due < snapshot.referenceDate && position.cents > 0) {
      overduePrincipalCents += principal;
      overdueTotalCents += item.amountCents;
    }
  }
  if (seen.size !== stored.size) {
    throw new Error(
      'A API não retornou todas as parcelas da conciliação. Repita a sincronização.'
    );
  }
  return {
    ...snapshot,
    calculated: {
      referenceDate: snapshot.referenceDate,
      updatedAt,
      overduePrincipalCents,
      openPrincipalCents,
      overdueTotalCents,
      openTotalCents,
    },
  };
}

/** A legacy/mixed portfolio must never present a partial calculated total. */
export function calculatedPortfolioTotals(rows: CollectionSummary[]) {
  if (
    new Set(rows.map((row) => row.referenceDate)).size > 1 ||
    rows.some(
      (row) =>
        !row.calculated || row.calculated.referenceDate !== row.referenceDate
    )
  )
    return null;
  return rows.reduce(
    (total, row) => ({
      overduePrincipalCents:
        total.overduePrincipalCents +
        (row.state === 'overdue' ? row.calculated!.overduePrincipalCents : 0),
      overdueTotalCents:
        total.overdueTotalCents +
        (row.state === 'overdue' ? row.calculated!.overdueTotalCents : 0),
      openTotalCents: total.openTotalCents + row.calculated!.openTotalCents,
    }),
    { overduePrincipalCents: 0, overdueTotalCents: 0, openTotalCents: 0 }
  );
}
