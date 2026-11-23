import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { canEditSettings } from '@/lib/auth/roles'
import { resolveTimeZone, zonedDayKey, zonedDayStart } from '@/lib/ai/usage-days'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { accountCosts, estimateDepartmentCosts, type DepartmentDelivery, type WhatsAppCostOverview } from '@/lib/whatsapp/cost-overview'
import { decrypt } from '@/lib/whatsapp/encryption'
import { loadPricingCurrency, loadPricingPhone, loadPricingPoints } from '@/lib/whatsapp/meta-pricing'

function reply(data: WhatsAppCostOverview) {
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function GET(request: Request) {
  try {
    const ctx = await requireRole('supervisor')
    const limit = checkRateLimit(`whatsapp-cost:${ctx.accountId}`, RATE_LIMITS.whatsappAdmin)
    if (!limit.success) return rateLimitResponse(limit)
    const timeZone = resolveTimeZone(new URL(request.url).searchParams.get('tz'))
    const end = new Date()
    const month = zonedDayKey(end, timeZone).slice(0, 7)
    const start = zonedDayStart(`${month}-01`, timeZone)
    const isAdmin = canEditSettings(ctx.role)

    try {
      let deliveries: DepartmentDelivery[] = []
      if (!isAdmin) {
        const usage = await ctx.supabase.rpc('broadcast_cost_breakdown', {
          p_start: start.toISOString(), p_end: end.toISOString(), p_time_zone: timeZone,
        })
        if (usage.error) throw new Error('Department delivery query failed')
        deliveries = usage.data
        if (!deliveries.length) return reply({ status: 'empty', month })
      }

      // Keep the credential on the server. The supervisor's only inputs
      // to the estimate come from an authenticated, scoped aggregation.
      const { data: config, error } = await supabaseAdmin().from('whatsapp_config')
        .select('waba_id,phone_number_id,access_token')
        .eq('account_id', ctx.accountId)
        .maybeSingle()
      if (error) throw new Error('WhatsApp configuration lookup failed')
      if (!config?.waba_id || !config.access_token) return reply({ status: 'disconnected', month })
      if (!isAdmin && !deliveries.some(d => d.phone_number_id === config.phone_number_id && d.category)) {
        return reply({ status: 'noRate', month })
      }

      const token = decrypt(config.access_token)
      const [currency, points, line] = await Promise.all([
        loadPricingCurrency(config.waba_id, token),
        loadPricingPoints(config.waba_id, token, start, end, !isAdmin),
        isAdmin ? null : loadPricingPhone(config.phone_number_id, token),
      ])
      const common = { status: 'ready' as const, month, currency, updatedAt: end.toISOString() }
      if (isAdmin) {
        return points.length
          ? reply({ ...common, scope: 'account', ...accountCosts(points) })
          : reply({ status: 'empty', month })
      }
      if (!line) return reply({ status: 'noRate', month })
      const estimate = estimateDepartmentCosts(points, deliveries, line)
      return estimate.estimatedDeliveries
        ? reply({ ...common, scope: 'department', ...estimate })
        : reply({ status: 'noRate', month })
    } catch {
      return reply({ status: 'unavailable', month })
    }
  } catch (error) {
    return toErrorResponse(error)
  }
}
