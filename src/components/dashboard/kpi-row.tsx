'use client'

import { useFormatter, useTranslations } from 'next-intl'

import {
  compare,
  ratio,
  seriesValues,
  type OperationalOverview,
} from '@/lib/dashboard/overview'
import { KpiTile, KpiTileSkeleton, TargetBar } from './kpi-tile'
import { Sparkline } from './sparkline'
import { useFormatDuration } from './use-format-duration'

export function KpiRow({
  data,
  supervisor = false,
}: {
  data: OperationalOverview | null
  supervisor?: boolean
}) {
  const t = useTranslations('Dashboard.overview.kpi')
  const format = useFormatter()
  const formatDuration = useFormatDuration()

  if (!data) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <KpiTileSkeleton key={i} />
        ))}
      </div>
    )
  }

  const { kpis, replies, volume } = data
  const replyTime = (supervisor ? replies.averageHuman : replies.medianHuman) ?? null
  const previousReplyTime = (supervisor ? replies.averageHumanPrevious : replies.medianHumanPrevious) ?? null
  const comparisonLabel = t(`vsPrevious.${data.days}`)
  const readRate = ratio(kpis.broadcastRead, kpis.broadcastDelivered)
  const readRatePrevious = ratio(kpis.broadcastReadPrevious, kpis.broadcastDeliveredPrevious)
  const percent = (v: number) => format.number(v, { style: 'percent', maximumFractionDigits: 0 })

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiTile
        title={t('newConversations')}
        info={t('newConversationsInfo')}
        value={format.number(kpis.newConversations)}
        change={compare(kpis.newConversations, kpis.newConversationsPrevious)}
        comparisonLabel={comparisonLabel}
        footer={<Sparkline values={seriesValues(volume.series, 'newConversations')} />}
      />
      <KpiTile
        title={t(supervisor ? 'averageReply' : 'medianReply')}
        info={t(supervisor ? 'averageReplyInfo' : 'medianReplyInfo')}
        value={replyTime == null ? t('none') : formatDuration(replyTime)}
        change={compare(replyTime, previousReplyTime, true)}
        comparisonLabel={comparisonLabel}
        footer={<TargetBar value={replyTime} target={data.replyTargetMinutes} />}
      />
      <KpiTile
        title={t('resolved')}
        info={t('resolvedInfo')}
        value={format.number(kpis.resolved)}
        change={compare(kpis.resolved, kpis.resolvedPrevious)}
        comparisonLabel={comparisonLabel}
        footer={<Sparkline values={seriesValues(volume.series, 'resolved')} />}
      />
      <KpiTile
        title={t('readRate')}
        info={t('readRateInfo')}
        value={readRate == null ? t('none') : percent(readRate)}
        change={compare(readRate, readRatePrevious)}
        comparisonLabel={comparisonLabel}
        footer={
          <p className="pt-3 text-xs text-muted-foreground tabular-nums">
            {kpis.broadcastDelivered
              ? t('readOfDelivered', {
                  read: format.number(kpis.broadcastRead),
                  delivered: format.number(kpis.broadcastDelivered),
                })
              : t('noBroadcasts')}
          </p>
        }
      />
    </div>
  )
}
