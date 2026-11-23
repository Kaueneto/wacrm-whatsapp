import { describe, expect, it } from 'vitest'
import { accountCosts, estimateCostBreakdown, estimateDepartmentCosts, type BroadcastDelivery, type PricingPoint } from './cost-overview'

const marketing: PricingPoint = { start: 1, cost: 2, volume: 10, phone: '55110000', category: 'MARKETING' }

describe('WhatsApp costs', () => {
  it('keeps the account total and combines daily reporting points', () => {
    expect(accountCosts([
      { ...marketing, start: 2 },
      marketing,
      { ...marketing, cost: 1 },
    ])).toEqual({ amount: 5, daily: [{ start: 1, cost: 3 }, { start: 2, cost: 2 }] })
  })

  it('weights rates by Meta volume and counts only matching deliveries', () => {
    const points = [
      marketing,
      { ...marketing, cost: 6, volume: 30 },
      { ...marketing, cost: 900, phone: 'other' },
      { ...marketing, category: 'UTILITY', cost: 0 },
    ]
    const estimate = estimateDepartmentCosts(points, [
      { phone_number_id: 'line', category: 'MARKETING', delivered: 5 },
      { phone_number_id: 'line', category: 'UTILITY', delivered: 2 },
      { phone_number_id: 'line', category: 'AUTHENTICATION', delivered: 7 },
      { phone_number_id: 'previous-line', category: 'MARKETING', delivered: 12 },
    ], { id: 'line', number: '55110000' })
    expect(estimate).toEqual({ amount: 1, estimatedDeliveries: 7, totalDeliveries: 26 })
  })

  it('distinguishes an unavailable rate from a real zero cost', () => {
    const deliveries = [{ phone_number_id: 'line', category: 'MARKETING', delivered: 3 }]
    const line = { id: 'line', number: '55110000' }
    expect(estimateDepartmentCosts([{ ...marketing, volume: null }], deliveries, line).estimatedDeliveries).toBe(0)
    expect(estimateDepartmentCosts([{ ...marketing, cost: 0 }], deliveries, line)).toEqual({
      amount: 0, estimatedDeliveries: 3, totalDeliveries: 3,
    })
  })

  it('ranks priced campaigns and departments while keeping unpriced deliveries in coverage', () => {
    const base: BroadcastDelivery = {
      day: '2026-11-10', department_id: 'finance', department_name: 'Financeiro',
      campaign_id: 'billing', campaign_name: 'Cobrança', phone_number_id: 'line',
      template_name: 'retomar', template_language: 'pt_BR', source: 'broadcast',
      category: 'MARKETING', delivered: 5,
    }
    const result = estimateCostBreakdown([marketing], [
      base,
      { ...base, day: '2026-11-12', source: 'direct', campaign_id: null, delivered: 10 },
      { ...base, campaign_id: 'reminder', department_id: 'sales', delivered: 5 },
      { ...base, campaign_id: null, department_id: null, category: 'UTILITY', delivered: 70 },
    ], { id: 'line', number: '55110000' })
    expect(result).toMatchObject({
      amount: 4, estimatedDeliveries: 20, totalDeliveries: 90,
      days: [{ day: '2026-11-10', amount: 2, totalDeliveries: 80 }, { day: '2026-11-12', amount: 2 }],
      departments: [{ id: 'finance', amount: 3 }, { id: 'sales', amount: 1 }, { id: null, estimatedDeliveries: 0 }],
      campaigns: [{ id: 'billing', amount: 1 }, { id: 'reminder', amount: 1 }, { id: null, estimatedDeliveries: 0 }],
      templates: [{ name: 'retomar · pt_BR', amount: 4, estimatedDeliveries: 20, totalDeliveries: 90 }],
    })
  })
})
