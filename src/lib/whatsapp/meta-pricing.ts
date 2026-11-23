import type { PricingPoint } from './cost-overview'

// This version was validated against the connected account's pricing endpoint.
const META_PRICING_BASE = 'https://graph.facebook.com/v25.0'

async function graph(path: string, token: string, params: URLSearchParams) {
  if (!/^\/\d+(?:\/pricing_analytics)?$/.test(path)) throw new Error('Invalid Meta identifier')
  const response = await fetch(`${META_PRICING_BASE}${path}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error(`Meta pricing request failed (${response.status})`)
  return response.json()
}

export async function loadPricingCurrency(wabaId: string, token: string): Promise<string> {
  const { currency } = await graph(`/${wabaId}`, token, new URLSearchParams({ fields: 'currency' }))
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) throw new Error('Meta currency unavailable')
  return currency
}

export async function loadPricingPhone(phoneId: string, token: string) {
  const result = await graph(`/${phoneId}`, token, new URLSearchParams({ fields: 'display_phone_number' }))
  const number = typeof result.display_phone_number === 'string' && result.display_phone_number.replace(/\D/g, '')
  if (!number) throw new Error('Meta phone number unavailable')
  return { id: phoneId, number }
}

export async function loadPricingPoints(
  wabaId: string, token: string, start: Date, end: Date, breakdown: boolean,
): Promise<PricingPoint[]> {
  const params = new URLSearchParams({
    start: String(Math.floor(start.getTime() / 1000)),
    end: String(Math.ceil(end.getTime() / 1000)),
    granularity: 'DAILY',
    metric_types: JSON.stringify(['COST', 'VOLUME']),
  })
  if (breakdown) params.set('dimensions', JSON.stringify(['PHONE', 'PRICING_CATEGORY']))
  const points: PricingPoint[] = []
  const seen = new Set<string>()
  for (let page = 0; page < 10; page++) {
    const payload = await graph(`/${wabaId}/pricing_analytics`, token, params)
    if (!Array.isArray(payload.data)) throw new Error('Invalid Meta pricing response')
    for (const group of payload.data) {
      for (const point of group.data_points ?? []) {
        if (!Number.isFinite(point.start) || !Number.isFinite(point.cost)) continue
        points.push({
          start: point.start,
          cost: point.cost,
          volume: Number.isFinite(point.volume) && point.volume >= 0 ? point.volume : null,
          phone: typeof point.phone_number === 'string' ? point.phone_number.replace(/\D/g, '') : null,
          category: typeof point.pricing_category === 'string' ? point.pricing_category : null,
        })
      }
    }
    if (!payload.paging?.next) return points
    const cursor = payload.paging?.cursors?.after
    if (typeof cursor !== 'string' || !cursor || seen.has(cursor)) break
    seen.add(cursor)
    params.set('after', cursor)
  }
  throw new Error('Meta pricing response could not be read completely')
}
