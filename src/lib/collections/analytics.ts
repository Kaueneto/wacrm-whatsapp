import type { FinancialState, PortfolioCard } from './portfolio-types';

export const agingRanges = [
  { label: '1–19 dias', from: 1, to: 19 },
  { label: '20–29 dias', from: 20, to: 29 },
  { label: '30–44 dias', from: 30, to: 44 },
  { label: '45–54 dias', from: 45, to: 54 },
  { label: '55–89 dias', from: 55, to: 89 },
  { label: '90+ dias', from: 90, to: Infinity },
];
export const financialLabels: Record<FinancialState, string> = {
  overdue: 'Em atraso',
  current: 'Sem atraso atual',
  paid: 'Pagamento conciliado',
  review: 'Em conferência',
  cancelled: 'Cancelamento / distrato',
  excluded: 'Fora do escopo',
};
export interface ProjectAnalysis {
  key: string;
  company: string;
  work: string;
  project: string;
  contracts: number;
  overdueContracts: number;
  overdueCents: number;
  openCents: number;
  review: number;
  cancelled: number;
  lateCents: number;
  maxDelay: number;
  share: number;
}

/** One contract per imported snapshot; uncertain/blocked debt stays out of operational overdue totals. */
export function portfolioAnalytics(rows: PortfolioCard[]) {
  const projects = new Map<string, ProjectAnalysis>();
  const states = new Map<FinancialState, number>();
  const aging = agingRanges.map((range) => ({
    ...range,
    amountCents: 0,
    contracts: 0,
  }));
  const references = new Set<string>();
  let overdueCents = 0,
    overdueContracts = 0,
    lateCents = 0,
    lateContracts = 0,
    openCents = 0,
    reviewCents = 0;
  for (const row of rows) {
    const state: FinancialState =
      row.snapshot?.state ??
      (['contact', 'negotiation', 'promise', 'legal'].includes(row.operation)
        ? 'overdue'
        : (row.operation as FinancialState));
    if (state === 'excluded') continue;
    states.set(state, (states.get(state) ?? 0) + 1);
    if (row.snapshot?.referenceDate) references.add(row.snapshot.referenceDate);
    const open =
      row.snapshot?.openCents ?? (state === 'paid' ? 0 : row.principalCents);
    openCents += open;
    const key = `${row.company}|${row.work}`;
    const project = projects.get(key) ?? {
      key,
      company: row.company,
      work: row.work,
      project: row.project,
      contracts: 0,
      overdueContracts: 0,
      overdueCents: 0,
      openCents: 0,
      review: 0,
      cancelled: 0,
      lateCents: 0,
      maxDelay: 0,
      share: 0,
    };
    project.contracts++;
    project.openCents += open;
    if (state === 'review') {
      project.review++;
      reviewCents += row.principalCents;
    }
    if (state === 'cancelled') project.cancelled++;
    if (state === 'overdue') {
      overdueCents += row.principalCents;
      overdueContracts++;
      project.overdueCents += row.principalCents;
      project.overdueContracts++;
      project.maxDelay = Math.max(project.maxDelay, row.delay);
      const range = aging.find(
        (bucket) => row.delay >= bucket.from && row.delay <= bucket.to
      );
      if (range) {
        range.amountCents += row.principalCents;
        range.contracts++;
      }
      if (row.delay >= 55) {
        lateCents += row.principalCents;
        lateContracts++;
        project.lateCents += row.principalCents;
      }
    }
    projects.set(key, project);
  }
  const byProject = [...projects.values()]
    .map((project) => ({
      ...project,
      share: overdueCents > 0 ? project.overdueCents / overdueCents : 0,
    }))
    .sort(
      (a, b) => b.overdueCents - a.overdueCents || a.key.localeCompare(b.key)
    );
  const companies = new Map<
    string,
    { key: string; amountCents: number; contracts: number }
  >();
  for (const project of byProject) {
    const company = companies.get(project.company) ?? {
      key: project.company,
      amountCents: 0,
      contracts: 0,
    };
    company.amountCents += project.overdueCents;
    company.contracts += project.overdueContracts;
    companies.set(project.company, company);
  }
  return {
    projects: byProject,
    companies: [...companies.values()].sort(
      (a, b) => b.amountCents - a.amountCents
    ),
    states: [...states].map(([state, count]) => ({
      state,
      label: financialLabels[state],
      count,
    })),
    aging,
    overdueCents,
    overdueContracts,
    lateCents,
    lateContracts,
    openCents,
    reviewCents,
    review: states.get('review') ?? 0,
    cancelled: states.get('cancelled') ?? 0,
    references: [...references].sort(),
    contracts: [...states.values()].reduce((sum, count) => sum + count, 0),
  };
}
