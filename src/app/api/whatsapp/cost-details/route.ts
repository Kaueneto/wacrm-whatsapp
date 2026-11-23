import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { canEditSettings } from '@/lib/auth/roles'
import { resolveTimeZone, zonedDayKey, zonedDayStart } from '@/lib/ai/usage-days'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { accountCosts, estimateCostBreakdown, type BroadcastDelivery, type WhatsAppCostDetails } from '@/lib/whatsapp/cost-overview'
import { decrypt } from '@/lib/whatsapp/encryption'
import { loadPricingCurrency, loadPricingPhone, loadPricingPoints } from '@/lib/whatsapp/meta-pricing'

function reply(data: WhatsAppCostDetails) {
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function GET(request: Request) {
  try {
    const ctx = await requireRole('supervisor')
    const limit = checkRateLimit(`whatsapp-cost-details:${ctx.accountId}`, RATE_LIMITS.whatsappAdmin)
    if (!limit.success) return rateLimitResponse(limit)
    const params = new URL(request.url).searchParams
    const timeZone = resolveTimeZone(params.get('tz'))
    const previous = Number(params.get('previous') ?? 0)
    if (!Number.isInteger(previous) || previous < 0 || previous > 2) {
      return NextResponse.json({ error: 'Invalid reporting period' }, { status: 400 })
    }
    const now = new Date()
    const [year, monthNumber] = zonedDayKey(now, timeZone).split('-').map(Number)
    const monthKey = (index: number) => new Date(Date.UTC(year, index, 1)).toISOString().slice(0, 10)
    const monthIndex = monthNumber - 1 - previous
    const startKey = monthKey(monthIndex)
    const start = zonedDayStart(startKey, timeZone)
    const end = previous === 0 ? now : zonedDayStart(monthKey(monthIndex + 1), timeZone)
    const admin = canEditSettings(ctx.role)
    const [usage, config] = await Promise.all([
      ctx.supabase.rpc('broadcast_cost_breakdown', {
        p_start: start.toISOString(), p_end: end.toISOString(), p_time_zone: timeZone,
      }),
      supabaseAdmin().from('whatsapp_config').select('waba_id,phone_number_id,access_token')
        .eq('account_id', ctx.accountId).maybeSingle(),
    ])
    const deliveries: BroadcastDelivery[] = usage.error ? [] : usage.data ?? []
    const unpricedBreakdown = usage.error ? null : estimateCostBreakdown([], deliveries, { id: '', number: '' })
    const result: WhatsAppCostDetails = {
      month: startKey.slice(0, 7),
      scope: admin ? 'account' : 'department',
      currency: null,
      official: null,
      breakdown: unpricedBreakdown,
      status: config.error ? 'unavailable' : 'disconnected',
      officialUnavailable: Boolean(config.error),
      breakdownUnavailable: Boolean(usage.error),
    }
    if (!config.data?.waba_id || !config.data.access_token) return reply(result)
    const { waba_id: wabaId, phone_number_id: phoneId, access_token: storedToken } = config.data
    let token: string
    try {
      token = decrypt(storedToken)
    } catch {
      return reply({ ...result, status: 'unavailable' })
    }

    const hasEligibleRows = deliveries.some(row => row.phone_number_id === phoneId && row.category)
    const estimated = async () => {
      if (!hasEligibleRows) return unpricedBreakdown
      const [rates, line] = await Promise.all([
        loadPricingPoints(wabaId, token, start, end, true),
        loadPricingPhone(phoneId, token),
      ])
      return estimateCostBreakdown(rates, deliveries, line)
    }
    const [currency, official, breakdown] = await Promise.allSettled([
      loadPricingCurrency(wabaId, token),
      admin ? loadPricingPoints(wabaId, token, start, end, false) : Promise.resolve([]),
      estimated(),
    ])
    return reply({
      ...result,
      status: currency.status === 'fulfilled' ? 'ready' : 'unavailable',
      currency: currency.status === 'fulfilled' ? currency.value : null,
      official: official.status === 'fulfilled' && official.value.length ? accountCosts(official.value) : null,
      officialUnavailable: official.status === 'rejected',
      breakdown: breakdown.status === 'fulfilled' ? breakdown.value : unpricedBreakdown,
      breakdownUnavailable: Boolean(usage.error || breakdown.status === 'rejected'),
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
