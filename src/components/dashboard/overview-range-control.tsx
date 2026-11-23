'use client'

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs'
import { useTranslations } from 'next-intl'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { OVERVIEW_RANGES, type OverviewRange } from '@/lib/dashboard/overview'

export function OverviewRangeControl({
  range,
  onRangeChange,
}: {
  range: OverviewRange
  onRangeChange: (range: OverviewRange) => void
}) {
  const t = useTranslations('Dashboard.overview.header')

  return (
    <Tabs value={range} onValueChange={(value) => {
      const next = OVERVIEW_RANGES.find((days) => days === value)
      if (next !== undefined && next !== range) onRangeChange(next)
    }}>
      <TabsList aria-label={t('rangeLabel')} className="relative isolate">
        {OVERVIEW_RANGES.map((days) => (
          <TabsTrigger
            key={days}
            value={days}
            className="z-10 px-2.5 text-xs data-active:bg-transparent dark:data-active:border-transparent dark:data-active:bg-transparent group-data-[variant=default]/tabs-list:data-active:shadow-none"
          >
            {t(`range.${days}`)}
          </TabsTrigger>
        ))}
        <TabsPrimitive.Indicator
          data-slot="tabs-indicator"
          aria-hidden="true"
          className="pointer-events-none absolute top-(--active-tab-top) left-0 h-(--active-tab-height) w-(--active-tab-width) translate-x-(--active-tab-left) rounded-md border border-border/70 bg-background shadow-sm motion-safe:transition-[width,translate] motion-safe:duration-200 motion-safe:ease-out dark:bg-card"
        />
      </TabsList>
    </Tabs>
  )
}
