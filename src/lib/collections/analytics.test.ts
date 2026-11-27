import { describe, expect, it } from 'vitest';
import { portfolioAnalytics } from './analytics';
import { portfolioExamples } from './demo';
import type { FinancialState, PortfolioCard } from './portfolio-types';

function card(
  id: string,
  state: FinancialState,
  overdueCents: number,
  delay: number,
  company = '900',
  work = '00001'
): PortfolioCard {
  const base = portfolioExamples[0];
  return {
    ...base,
    id,
    company,
    work,
    principalCents: overdueCents,
    delay,
    operation:
      state === 'overdue' ? 'contact' : state === 'excluded' ? 'review' : state,
    snapshot: {
      key: id,
      company,
      work,
      sale: 1,
      customer: 'Fixture',
      project: 'Fixture',
      unit: 'Fixture',
      referenceDate: '2026-11-27',
      state,
      delay,
      overdueCents,
      openCents: overdueCents + 10000,
      overdueCount: 1,
      cancellationDate: null,
      stageId: null,
      ruleName: 'Padrão',
      reason: null,
    },
  };
}

describe('collection portfolio analytics', () => {
  it('keeps blocked and uncertain debt out of operational overdue charts', () => {
    const result = portfolioAnalytics([
      card('a', 'overdue', 10000, 20),
      card('b', 'review', 20000, 90),
      card('c', 'cancelled', 30000, 90),
      card('d', 'paid', 0, 0),
      card('e', 'excluded', 40000, 100),
    ]);
    expect(result.overdueCents).toBe(10000);
    expect(result.overdueContracts).toBe(1);
    expect(result.reviewCents).toBe(20000);
    expect(result.review).toBe(1);
    expect(result.cancelled).toBe(1);
    expect(result.contracts).toBe(4);
    expect(
      result.aging.reduce((sum, bucket) => sum + bucket.amountCents, 0)
    ).toBe(10000);
    expect(result.projects[0].openCents).toBe(100000);
  });
  it('places every exact delay boundary in one bucket', () => {
    const result = portfolioAnalytics(
      [1, 19, 20, 29, 30, 44, 45, 54, 55, 89, 90, 200].map((delay, index) =>
        card(String(index), 'overdue', 100, delay)
      )
    );
    expect(result.aging.map((bucket) => bucket.contracts)).toEqual([
      2, 2, 2, 2, 2, 2,
    ]);
    expect(result.lateContracts).toBe(4);
    expect(result.lateCents).toBe(400);
  });
  it('separates matching work codes belonging to different companies and computes concentration', () => {
    const result = portfolioAnalytics([
      card('a', 'overdue', 100, 20, '1', 'SAME'),
      card('b', 'overdue', 300, 60, '2', 'SAME'),
      card('c', 'overdue', 100, 90, '2', 'OTHER'),
    ]);
    expect(result.projects.map((project) => project.key)).toEqual([
      '2|SAME',
      '1|SAME',
      '2|OTHER',
    ]);
    expect(result.projects[0].share).toBe(0.6);
    expect(result.companies).toEqual([
      { key: '2', amountCents: 400, contracts: 2 },
      { key: '1', amountCents: 100, contracts: 1 },
    ]);
    expect(
      result.projects.reduce((sum, project) => sum + project.overdueCents, 0)
    ).toBe(result.overdueCents);
  });
  it('analyzes only the supplied filtered recorte and identifies mixed financial references', () => {
    const first = card('a', 'overdue', 100, 20);
    const second = card('b', 'overdue', 300, 60);
    second.snapshot!.referenceDate = '2026-11-26';
    expect(portfolioAnalytics([first]).overdueCents).toBe(100);
    expect(portfolioAnalytics([first, second]).references).toEqual([
      '2026-11-26',
      '2026-11-27',
    ]);
  });
  it('handles empty and fully regularized recortes without invalid percentages', () => {
    expect(portfolioAnalytics([])).toMatchObject({
      contracts: 0,
      overdueCents: 0,
      projects: [],
    });
    const result = portfolioAnalytics([card('a', 'current', 0, 0)]);
    expect(result.projects[0].share).toBe(0);
    expect(result.overdueContracts).toBe(0);
  });
  it('supports fictional demo contracts without inventing future balances', () => {
    const result = portfolioAnalytics([
      {
        ...portfolioExamples[0],
        principalCents: 12345,
        operation: 'negotiation',
        delay: 30,
      },
    ]);
    expect(result.overdueCents).toBe(12345);
    expect(result.openCents).toBe(12345);
    expect(result.states).toEqual([
      { state: 'overdue', label: 'Em atraso', count: 1 },
    ]);
  });
});
