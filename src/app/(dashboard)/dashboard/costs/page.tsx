'use client'

import motion from '@/components/ui/surface-motion.module.css'

import { useEffect, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { AiUsageCard } from '@/components/agents/ai-usage'
import { Skeleton } from '@/components/dashboard/skeleton'
import { BarChart } from '@/components/tremor/bar-chart'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageNavigation } from '@/components/ui/page-navigation'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/hooks/use-auth'
import { zonedDayKey } from '@/lib/ai/usage-days'
import { browserTimeZone } from '@/lib/dashboard/overview'
import type { CostRanking, WhatsAppCostDetails } from '@/lib/whatsapp/cost-overview'

const periods = ['0', '1', '2'] as const

export default function CostDetailsPage() {
  const { accountId, accountRole, profileLoading, canEditSettings } = useAuth()
  if (profileLoading || !accountId || (!canEditSettings && accountRole !== 'supervisor')) return null
  return <CostDetails key={`${accountId}:${accountRole}`} admin={canEditSettings} />
}

function CostDetails({ admin }: { admin: boolean }) {
  const t = useTranslations('Dashboard.cost')
  const navigation = useTranslations('Sidebar')
  const format = useFormatter()
  const [period, setPeriod] = useState<(typeof periods)[number]>('0')
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<WhatsAppCostDetails | 'failed' | null>(null)
  const [timeZone] = useState(browserTimeZone)

  useEffect(() => {
    const controller = new AbortController()
    const query = new URLSearchParams({ tz: timeZone, previous: period })
    async function load() {
      try {
        const response = await fetch(`/api/whatsapp/cost-details?${query}`, { signal: controller.signal })
        if (!response.ok) throw new Error('Cost details are unavailable')
        const data: WhatsAppCostDetails = await response.json()
        if (!controller.signal.aborted) setResult(data.scope === (admin ? 'account' : 'department') ? data : 'failed')
      } catch {
        if (!controller.signal.aborted) setResult('failed')
      }
    }
    void load()
    return () => controller.abort()
  }, [admin, attempt, period, timeZone])

  const title = t('reportTitle')
  const dashboard = navigation('dashboard')
  const data = result && result !== 'failed' ? result : null
  const money = (amount: number) => data?.currency
    ? format.number(amount, { style: 'currency', currency: data.currency, maximumFractionDigits: 4 })
    : '—'
  const estimate = data?.breakdown
  const officialLabel = t('officialAmount')
  const estimateLabel = t('estimatedAmount')
  const chart = new Map<string, Record<string, number | null>>()
  if (data?.currency) {
    for (const point of data.official?.daily ?? []) {
      const day = zonedDayKey(new Date(point.start * 1000), timeZone)
      chart.set(day, { [officialLabel]: (chart.get(day)?.[officialLabel] ?? 0) + point.cost })
    }
    for (const day of estimate?.days ?? []) {
      if (day.estimatedDeliveries) chart.set(day.day, { ...chart.get(day.day), [estimateLabel]: day.amount })
    }
  }
  const firstDate = data ? Date.parse(`${data.month}-01T00:00:00Z`) : 0
  const lastDate = chart.size ? Date.parse(`${[...chart.keys()].sort().at(-1)}T00:00:00Z`) : 0
  const points = []
  for (let date = firstDate; chart.size && date <= lastDate && points.length < 31; date += 86_400_000) {
    const day = new Date(date)
    points.push({
      label: format.dateTime(day, { day: 'numeric', month: 'short', timeZone: 'UTC' }),
      [officialLabel]: null,
      [estimateLabel]: null,
      ...chart.get(day.toISOString().slice(0, 10)),
    })
  }
  const hasOfficial = Boolean(data?.official && data.currency)
  const hasEstimate = Boolean(estimate?.estimatedDeliveries && data?.currency)

  return (
    <div className="space-y-5">
      <PageNavigation backHref="/dashboard" backLabel={t('backToDashboard')} items={[{ label: dashboard, href: '/dashboard' }, { label: title }]} />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t(admin ? 'accountNote' : 'departmentNote')}</p>
        </div>
        <Tabs value={period} onValueChange={(value) => {
          const next = periods.find(item => item === value)
          if (!next || next === period) return
          setResult(null)
          setPeriod(next)
        }}>
          <TabsList aria-label={t('periodLabel')}>
            {periods.map(value => <TabsTrigger key={value} value={value}>{t(`period.${value}`)}</TabsTrigger>)}
          </TabsList>
        </Tabs>
      </header>
      {result === null ? (
        <Skeleton className="h-64 w-full" />
      ) : result === 'failed' ? (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <p>{t('unavailable')}</p>
          <Button size="sm" variant="outline" onClick={() => { setResult(null); setAttempt(value => value + 1) }}>
            {t('retry')}
          </Button>
        </div>
      ) : data && (
        <>
          <div className={admin ? 'grid gap-3 md:grid-cols-2' : 'grid gap-3'}>
            {admin && (
              <CostTotal title={officialLabel} amount={hasOfficial && data.official ? money(data.official.amount) : '—'}>
                {t(data.status === 'disconnected' ? 'disconnected' : data.officialUnavailable || data.status === 'unavailable' ? 'unavailable' : hasOfficial ? 'officialNote' : 'emptyAccount')}
              </CostTotal>
            )}
            <CostTotal title={estimateLabel} amount={hasEstimate && estimate ? money(estimate.amount) : '—'}>
              {data.breakdownUnavailable ? t('unavailable') : estimate?.totalDeliveries ? t('coverage', {
                included: estimate.estimatedDeliveries, total: estimate.totalDeliveries,
              }) : t('noTemplateDeliveries')}
            </CostTotal>
          </div>
          <Card className={motion.surface}>
            <CardHeader>
              <CardTitle>{t('dailyTrend')}</CardTitle>
              <CardDescription>{format.dateTime(new Date(`${data.month}-01T12:00:00Z`), {
                month: 'long', year: 'numeric', timeZone: 'UTC',
              })}</CardDescription>
            </CardHeader>
            <CardContent>
              {points.length ? (
                <BarChart
                  highlightBars
                  className="h-64"
                  data={points}
                  index="label"
                  categories={[...(hasOfficial ? [officialLabel] : []), ...(hasEstimate ? [estimateLabel] : [])]}
                  colors={hasOfficial ? ['teal', 'violet'] : ['violet']}
                  showLegend={hasOfficial && hasEstimate}
                  yAxisWidth={80}
                  valueFormatter={money}
                />
              ) : <p className="text-sm text-muted-foreground">{t('noChart')}</p>}
            </CardContent>
          </Card>
          <div className="grid gap-4 xl:grid-cols-2">
            <Ranking title={t('byDepartment')} rows={estimate?.departments ?? []} fallback={t('noDepartment')} empty={t('noTemplateDeliveries')} money={money} />
            <Ranking title={t('byCampaign')} rows={estimate?.campaigns ?? []} fallback={t('noCampaign')} empty={t('noCampaignDeliveries')} money={money} />
          </div>
          <Ranking title={t('byTemplate')} rows={estimate?.templates ?? []} fallback={t('noTemplate')} empty={t('noTemplateDeliveries')} money={money} />
          <p className="text-xs text-muted-foreground">{t('estimateNote')}</p>
        </>
      )}
      {admin && <AiUsageCard showModelChart />}
    </div>
  )
}

function CostTotal({ title, amount, children }: { title: string; amount: string; children: React.ReactNode }) {
  return (
    <Card className={motion.surface}>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-1">
        <p className="text-2xl font-semibold tabular-nums">{amount}</p>
        <p className="text-sm text-muted-foreground">{children}</p>
      </CardContent>
    </Card>
  )
}

function Ranking({ title, rows, fallback, empty, money }: {
  title: string; rows: CostRanking[]; fallback: string; empty: string; money: (amount: number) => string
}) {
  const t = useTranslations('Dashboard.cost')
  const format = useFormatter()
  const top = Math.max(0, rows[0]?.amount ?? 0)
  return (
    <Card className={motion.surface}>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{t('name')}</TableHead>
                <TableHead scope="col" className="text-right">{t('deliveries')}</TableHead>
                <TableHead scope="col" className="text-right">{t('estimatedAmount')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => (
                <TableRow key={row.id ?? 'unassigned'} className="group">
                  <TableCell className="min-w-32 whitespace-normal font-medium">
                    {row.name || fallback}
                    {top > 0 && row.amount > 0 && (
                      <div className="mt-1.5 h-1 max-w-52 rounded-full bg-muted" aria-hidden>
                        <div
                          className="h-full origin-left rounded-full bg-primary/70 group-hover:bg-primary motion-safe:transition-[scale,background-color] motion-safe:group-hover:scale-y-150"
                          style={{ width: `${row.amount / top * 100}%` }}
                        />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{format.number(row.estimatedDeliveries)} / {format.number(row.totalDeliveries)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{row.estimatedDeliveries ? money(row.amount) : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
