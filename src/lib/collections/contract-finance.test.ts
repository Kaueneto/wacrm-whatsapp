import { describe, it, expect } from 'vitest';
import {
  contractFinancialView,
  type ContractFinance,
} from './contract-finance';
import { uauDialablePhone } from './contact-options';
import type { UauInstallment } from '@/lib/uau/finance-types';

const installment: UauInstallment = {
  key: '8:2:E',
  number: '2',
  type: 'E',
  dueDate: '2026-11-01',
  originalDueDate: '2026-11-01',
  paidDate: null,
  amountCents: 53027,
  principalCents: 50000,
  daysOverdue: 26,
  correctionCents: 2027,
  interestCents: 1000,
  lateInterestCents: 200,
  fineCents: 500,
  discountCents: 0,
};
const finance = (positions: UauInstallment[]): ContractFinance => ({
  positions,
  referenceDate: '2026-11-27',
  updatedAt: '2026-11-27T12:00:00Z',
});

describe('portfolio live financial amounts', () => {
  it('separates base, index-adjusted principal and final total from the real UAU example', () => {
    const result = contractFinancialView(
      null,
      finance([
        {
          ...installment,
          principalCents: 49900,
          correctionCents: 22376,
          lateCorrectionCents: 0,
          lateInterestCents: 409,
          fineCents: 1446,
          interestCents: 0,
          amountCents: 74131,
        },
      ])
    );
    expect(result.overduePrincipal).toBe(49900);
    expect(result.overdueIndexedPrincipal).toBe(72276);
    expect(result.overdueAdjusted).toBe(74131);
    expect(
      contractFinancialView(
        null,
        finance([
          {
            ...installment,
            correctionCents: null,
          },
        ])
      ).overdueIndexedPrincipal
    ).toBeNull();
  });
  it('uses calculated UAU totals verbatim instead of adding charge components twice', () => {
    const result = contractFinancialView(null, finance([installment]));
    expect(result.openAdjusted).toBe(53027);
    expect(result.overdueAdjusted).toBe(53027);
    expect(result.overduePrincipal).toBe(50000);
    expect(result.positions[0]).toMatchObject({
      key: 'E_2_8',
      number: 2,
      generalNumber: 8,
    });
  });
  it('splits overdue from today/future using the API reference date', () => {
    const result = contractFinancialView(
      null,
      finance([
        installment,
        {
          ...installment,
          key: '9:3:E',
          number: '3',
          dueDate: '2026-11-27',
          originalDueDate: '2026-11-27',
          amountCents: 20000,
        },
        {
          ...installment,
          key: '10:4:E',
          number: '4',
          dueDate: '2026-12-10',
          originalDueDate: '2026-12-10',
          amountCents: 30000,
        },
      ])
    );
    expect(result.openAdjusted).toBe(103027);
    expect(result.overdueAdjusted).toBe(53027);
    expect(result.futureAdjusted).toBe(50000);
    expect(result.nextDue).toBe('2026-11-27');
  });
  it('keeps unavailable financial data unknown and an empty successful query at zero', () => {
    expect(contractFinancialView(null, null).openAdjusted).toBeNull();
    expect(contractFinancialView(null, finance([])).openAdjusted).toBe(0);
    expect(
      contractFinancialView(
        null,
        finance([{ ...installment, principalCents: null }])
      ).overduePrincipal
    ).toBeNull();
  });
});

describe('UAU phone choices', () => {
  it('preserves international numbers and explicitly adds Brazil for DDD/local numbers', () => {
    expect(uauDialablePhone('(11) 99999-1234')).toBe('5511999991234');
    expect(uauDialablePhone('(11) 3333-1234')).toBe('551133331234');
    expect(uauDialablePhone('+55 11 99999-1234')).toBe('5511999991234');
    expect(uauDialablePhone('5511999991234')).toBe('5511999991234');
    expect(uauDialablePhone('+1 415 555 1234')).toBe('14155551234');
  });
  it('does not guess a missing area code or accept an invalid number', () => {
    expect(uauDialablePhone('99999-1234')).toBeNull();
    expect(uauDialablePhone('')).toBeNull();
    expect(uauDialablePhone('00000000000')).toBeNull();
  });
});
