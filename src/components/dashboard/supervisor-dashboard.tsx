'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { browserTimeZone, DEFAULT_OVERVIEW_RANGE, ratio, type OverviewRange, type SupervisorOverview } from '@/lib/dashboard/overview'
import { derivePresence } from '@/lib/presence'
import { createClient } from '@/lib/supabase/client'
import { AttentionRow } from './attention-row'
import { KpiRow } from './kpi-row'
import { MessageVolumeCard } from './message-volume-card'
import { OverviewRangeControl } from './overview-range-control'
import { ReplyQueueCard } from './reply-queue-card'
import { TeamCard } from './team-card'
import { WhatsAppCostCard } from './whatsapp-cost-card'

const metrics = ['open', 'pending', 'closed', 'waiting', 'unassigned'] as const

export function SupervisorDashboard() {
  const t = useTranslations('Dashboard')
  const format = useFormatter()
  const [overview, setOverview] = useState<SupervisorOverview | null>(null)
  const [range, setRange] = useState<OverviewRange>(DEFAULT_OVERVIEW_RANGE)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const controller = new AbortController()
    const db = createClient()
    async function load() {
      const { data, error } = await db.rpc('supervisor_dashboard_metrics', {
        p_days: range,
        p_tz: browserTimeZone(),
      }).abortSignal(controller.signal)
      if (controller.signal.aborted) return
      setFailed(Boolean(error))
      setOverview(error ? null : data)
      setNow(Date.now())
    }
    void load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 30_000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [range, attempt])

  const data = overview?.days === range ? overview : null
  const onlineCount = data?.replies.team.filter((member) =>
    derivePresence(member.presence ?? undefined, member.lastSeenAt, now) === 'online',
  ).length ?? 0

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t('supervisor.title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <OverviewRangeControl range={range} onRangeChange={(value) => {
            setFailed(false)
            setRange(value)
          }} />
          <Button nativeButton={false} render={<Link href="/inbox" />}>
            {t('overview.queue.openInbox')}
          </Button>
        </div>
      </header>
      <WhatsAppCostCard scope="department" />
      {failed ? (
        <div className="flex flex-wrap items-center gap-3" role="alert">
          <p>{t('overview.loadFailed')}</p>
          <Button variant="outline" onClick={() => {
            setFailed(false)
            setAttempt((value) => value + 1)
          }}>{t('overview.retry')}</Button>
        </div>
      ) : (
        <>
          <AttentionRow data={data} now={now} onlineCount={onlineCount} />
          <KpiRow data={data} supervisor />
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            <MessageVolumeCard data={data} />
            <ReplyQueueCard data={data} now={now} />
          </div>
          {data && (
            <>
              <Card>
                <CardHeader><CardTitle>{t('supervisor.queues')}</CardTitle></CardHeader>
                <CardContent>
                  {data.queues.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('supervisor.noTeams')}</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead scope="col">{t('supervisor.department')}</TableHead>
                          <TableHead scope="col">{t('supervisor.team')}</TableHead>
                          {metrics.map((key) => <TableHead key={key} scope="col" className="text-right">{t(`supervisor.${key}`)}</TableHead>)}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.queues.map((team) => (
                          <TableRow key={team.id}>
                            <TableCell className="font-medium">{team.department}</TableCell>
                            <TableCell>{team.team}</TableCell>
                            {metrics.map((key) => <TableCell key={key} className="text-right tabular-nums">{format.number(team[key])}</TableCell>)}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
              <div className="grid gap-4 xl:grid-cols-2">
                <TeamCard data={data} now={now} supervisor />
                <DepartmentBroadcasts runs={data.broadcasts} onChange={() => setAttempt((value) => value + 1)} />
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}

function DepartmentBroadcasts({ runs, onChange }: {
  runs: SupervisorOverview['broadcasts']
  onChange: () => void
}) {
  const t = useTranslations('Dashboard.supervisor')
  const format = useFormatter()
  const [busy, setBusy] = useState<string | null>(null)
  const percent = (part: number, all: number) => {
    const value = ratio(part, all)
    return value == null ? '—' : format.number(value, { style: 'percent', maximumFractionDigits: 1 })
  }

  async function control(id: string, action: 'pause' | 'resume') {
    setBusy(id)
    try {
      const { data, error } = await createClient().rpc('control_department_broadcast', {
        p_id: id, p_action: action,
      })
      if (error || !data) toast.error(t('broadcastActionFailed'))
      else toast.success(t(action === 'pause' ? 'broadcastPaused' : 'broadcastResumed'))
    } finally {
      setBusy(null)
      onChange()
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>{t('broadcasts')}</CardTitle></CardHeader>
      <CardContent>
        {runs.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                {(['broadcast', 'delivery', 'read', 'replied', 'failed', 'status', 'action'] as const).map((key) => (
                  <TableHead key={key} scope="col">{t(key)}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => {
                const action = run.state === 'paused' ? 'resume' :
                  run.state === 'queued' || run.state === 'running' ? 'pause' : null
                return (
                  <TableRow key={run.id}>
                    <TableCell>
                      <p className="font-medium">{run.name}</p>
                      <p className="text-xs text-muted-foreground">{run.department}</p>
                    </TableCell>
                    <TableCell>{percent(run.delivered, run.recipients)}</TableCell>
                    <TableCell>{percent(run.read, run.delivered)}</TableCell>
                    <TableCell>{percent(run.replied, run.delivered)}</TableCell>
                    <TableCell>{format.number(run.failed)}</TableCell>
                    <TableCell>{run.state ? t(`broadcastState.${run.state}`) : '—'}</TableCell>
                    <TableCell>
                      {action && <Button size="sm" variant="outline" disabled={busy !== null}
                        onClick={() => void control(run.id, action)}>{t(action)}</Button>}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">{t('noBroadcasts')}</p>
        )}
      </CardContent>
    </Card>
  )
}
