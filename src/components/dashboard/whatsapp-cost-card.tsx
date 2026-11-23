'use client'

import motion from '@/components/ui/surface-motion.module.css'

import { useEffect, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { Wallet } from 'lucide-react'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { browserTimeZone } from '@/lib/dashboard/overview'
import type { WhatsAppCostOverview } from '@/lib/whatsapp/cost-overview'
import { Skeleton } from './skeleton'

export function WhatsAppCostCard({ scope }: { scope: 'account' | 'department' }) {
  const t = useTranslations('Dashboard.cost')
  const format = useFormatter()
  const [result, setResult] = useState<WhatsAppCostOverview | 'error' | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const query = new URLSearchParams({ tz: browserTimeZone() })
    async function load() {
      try {
        const response = await fetch(`/api/whatsapp/cost-overview?${query}`, { signal: controller.signal })
        if (!response.ok) throw new Error('Cost overview is unavailable')
        const data: WhatsAppCostOverview = await response.json()
        if (!controller.signal.aborted) {
          setResult(data.status === 'ready' && data.scope !== scope ? 'error' : data)
        }
      } catch {
        if (!controller.signal.aborted) setResult('error')
      }
    }
    void load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 300_000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [scope])

  return (
    <Card className={`${motion.surface} gap-3`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="size-4 text-muted-foreground" aria-hidden />
          {t(scope === 'account' ? 'accountTitle' : 'departmentTitle')}
        </CardTitle>
        <CardDescription>
          {result && result !== 'error'
            ? format.dateTime(new Date(`${result.month}-01T12:00:00Z`), { month: 'long', year: 'numeric', timeZone: 'UTC' })
            : t('month')}
        </CardDescription>
        <CardAction>
          <Link href="/dashboard/costs" className={buttonVariants({ size: 'sm', variant: 'outline' })}>
            {t('details')}
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent aria-busy={result === null}>
        {result === null ? <Skeleton className="h-12 w-36" /> : result === 'error' ? (
          <p className="text-sm text-muted-foreground">{t('unavailable')}</p>
        ) : result.status !== 'ready' ? (
          <p className="text-sm text-muted-foreground">
            {t(result.status === 'empty' ? (scope === 'account' ? 'emptyAccount' : 'emptyDepartment') : result.status)}
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-2xl font-semibold tracking-tight tabular-nums">
              {format.number(result.amount, { style: 'currency', currency: result.currency, maximumFractionDigits: 4 })}
            </p>
            {result.scope === 'account' ? (
              <p className="text-xs text-muted-foreground">{t('accountNote')}</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">{t('departmentNote')}</p>
                <p className="text-xs text-muted-foreground">{t('coverage', {
                  included: result.estimatedDeliveries, total: result.totalDeliveries,
                })}</p>
              </>
            )}
            <p className="text-xs text-muted-foreground">{t('updated', {
              time: format.dateTime(new Date(result.updatedAt), { hour: 'numeric', minute: '2-digit' }),
            })}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
