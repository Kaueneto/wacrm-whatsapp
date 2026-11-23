export interface PricingPoint {
  start: number
  cost: number
  volume: number | null
  phone: string | null
  category: string | null
}

export interface DepartmentDelivery {
  phone_number_id: string | null
  category: string | null
  delivered: number
}

export interface BroadcastDelivery extends DepartmentDelivery {
  day: string
  department_id: string | null
  department_name: string | null
  campaign_id: string | null
  campaign_name: string | null
  template_name: string | null
  template_language: string | null
  source: 'broadcast' | 'direct'
}

export interface CostSubtotal {
  amount: number
  estimatedDeliveries: number
  totalDeliveries: number
}

export type CostRanking = CostSubtotal & { id: string | null; name: string | null }
export type CostBreakdown = CostSubtotal & {
  days: (CostSubtotal & { day: string })[]
  departments: CostRanking[]
  campaigns: CostRanking[]
  templates: CostRanking[]
}

export interface WhatsAppCostDetails {
  month: string
  scope: 'account' | 'department'
  currency: string | null
  official: ReturnType<typeof accountCosts> | null
  breakdown: CostBreakdown | null
  status: 'ready' | 'disconnected' | 'unavailable'
  officialUnavailable: boolean
  breakdownUnavailable: boolean
}

export type WhatsAppCostOverview =
  | { status: 'empty' | 'unavailable' | 'disconnected' | 'noRate'; month: string }
  | { status: 'ready'; month: string; currency: string; amount: number; updatedAt: string } & (
    | { scope: 'account'; daily: { start: number; cost: number }[] }
    | { scope: 'department'; estimatedDeliveries: number; totalDeliveries: number }
  )

export function accountCosts(points: PricingPoint[]) {
  const daily = new Map<number, number>()
  for (const point of points) {
    daily.set(point.start, (daily.get(point.start) ?? 0) + point.cost)
  }
  return {
    amount: points.reduce((sum, point) => sum + point.cost, 0),
    daily: Array.from(daily, ([start, cost]) => ({ start, cost })).sort((a, b) => a.start - b.start),
  }
}

function costRates(points: PricingPoint[], phoneNumber: string) {
  const rates = new Map<string, { cost: number; volume: number }>()
  for (const point of points) {
    if (point.phone !== phoneNumber || !point.category || point.volume == null) continue
    const current = rates.get(point.category) ?? { cost: 0, volume: 0 }
    rates.set(point.category, {
      cost: current.cost + point.cost,
      volume: current.volume + point.volume,
    })
  }
  return rates
}

const emptySubtotal = (): CostSubtotal => ({ amount: 0, estimatedDeliveries: 0, totalDeliveries: 0 })

function addDelivery(total: CostSubtotal, delivery: DepartmentDelivery, unitCost: number | null) {
  total.totalDeliveries += delivery.delivered
  if (unitCost !== null) {
    total.amount += delivery.delivered * unitCost
    total.estimatedDeliveries += delivery.delivered
  }
}

function pricingByDelivery(points: PricingPoint[], line: { id: string; number: string }) {
  const rates = costRates(points, line.number)
  return (delivery: DepartmentDelivery) => {
    const rate = delivery.category && delivery.phone_number_id === line.id ? rates.get(delivery.category) : null
    return rate && rate.volume > 0 ? rate.cost / rate.volume : null
  }
}

export function estimateDepartmentCosts(
  points: PricingPoint[],
  deliveries: DepartmentDelivery[],
  line: { id: string; number: string },
) {
  const price = pricingByDelivery(points, line)
  const total = emptySubtotal()
  for (const delivery of deliveries) addDelivery(total, delivery, price(delivery))
  return total
}

export function estimateCostBreakdown(
  points: PricingPoint[],
  deliveries: BroadcastDelivery[],
  line: { id: string; number: string },
): CostBreakdown {
  const price = pricingByDelivery(points, line)
  const total = emptySubtotal()
  const days = new Map<string, CostSubtotal>()
  const departments = new Map<string | null, CostRanking>()
  const campaigns = new Map<string | null, CostRanking>()
  const templates = new Map<string | null, CostRanking>()

  for (const delivery of deliveries) {
    const unitCost = price(delivery)
    addDelivery(total, delivery, unitCost)
    const day = days.get(delivery.day) ?? emptySubtotal()
    addDelivery(day, delivery, unitCost)
    days.set(delivery.day, day)

    const department = departments.get(delivery.department_id) ??
      { ...emptySubtotal(), id: delivery.department_id, name: delivery.department_name }
    addDelivery(department, delivery, unitCost)
    departments.set(department.id, department)

    if (delivery.source === 'broadcast') {
      const campaign = campaigns.get(delivery.campaign_id) ??
        { ...emptySubtotal(), id: delivery.campaign_id, name: delivery.campaign_name }
      addDelivery(campaign, delivery, unitCost)
      campaigns.set(campaign.id, campaign)
    }

    const templateName = delivery.template_name
    const language = delivery.template_language
    const templateId = templateName ? JSON.stringify([templateName, language]) : null
    const template = templates.get(templateId) ?? {
      ...emptySubtotal(),
      id: templateId,
      name: templateName && language ? `${templateName} · ${language}` : templateName,
    }
    addDelivery(template, delivery, unitCost)
    templates.set(template.id, template)
  }
  const ranked = (entries: Map<string | null, CostRanking>) => [...entries.values()]
    .sort((a, b) => b.amount - a.amount || b.estimatedDeliveries - a.estimatedDeliveries || b.totalDeliveries - a.totalDeliveries)
  return {
    ...total,
    days: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([day, subtotal]) => ({ day, ...subtotal })),
    departments: ranked(departments),
    campaigns: ranked(campaigns),
    templates: ranked(templates),
  }
}
