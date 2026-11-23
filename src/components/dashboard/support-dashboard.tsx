'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { ConversationStatus } from '@/types'

const statuses = ['open', 'pending', 'closed'] as const satisfies readonly ConversationStatus[]

export function SupportDashboard({ accountId }: { accountId: string }) {
  const t = useTranslations('Dashboard')
  const format = useFormatter()
  const [counts, setCounts] = useState<number[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const db = createClient()
    // Count only the conversations the current session can read under RLS.
    void Promise.all(statuses.map((status) => db
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('status', status)
      .abortSignal(controller.signal)
    )).then((results) => {
      if (controller.signal.aborted) return
      if (results.some(({ error }) => error)) {
        setFailed(true)
        return
      }
      setCounts(results.map(({ count }) => count ?? 0))
    })
    return () => controller.abort()
  }, [accountId, attempt])

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t('support.title')}</h1>
        <Button nativeButton={false} render={<Link href="/inbox" />}>
          {t('overview.queue.openInbox')}
        </Button>
      </div>
      {failed ? (
        <div className="flex flex-wrap items-center gap-3" role="alert">
          <p>{t('overview.loadFailed')}</p>
          <Button
            variant="outline"
            onClick={() => {
              setFailed(false)
              setAttempt((value) => value + 1)
            }}
          >
            {t('overview.retry')}
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3" aria-busy={counts === null}>
          {statuses.map((status, index) => (
            <Link
              key={status}
              href={`/inbox?filter=${status}`}
              className="rounded-xl focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Card className="transition-colors hover:bg-accent/40">
                <CardContent className="space-y-1">
                  <p className="text-sm text-muted-foreground">{t(`support.${status}`)}</p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {counts ? format.number(counts[index]) : '—'}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
