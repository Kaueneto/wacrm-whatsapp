import { nextOccurrence, validateSchedule } from '@/lib/campaigns/schedule';
import type { PortfolioSetup } from './setup';

export interface PortfolioSchedule {
  enabled: boolean;
  kind: 'daily' | 'interval' | 'weekly' | 'monthly';
  startDate: string;
  days: number;
  weekdays: number[];
  monthDay: number;
}

export function defaultPortfolioSchedule(
  timezone = 'America/Sao_Paulo'
): PortfolioSchedule {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    enabled: false,
    kind: 'daily',
    startDate: `${part('year')}-${part('month')}-${part('day')}`,
    days: 1,
    weekdays: [1, 2, 3, 4, 5],
    monthDay: 1,
  };
}

export function parsePortfolioSchedule(
  value: unknown,
  timezone: string,
  times: string[]
): PortfolioSchedule {
  if (value === undefined) return defaultPortfolioSchedule(timezone);
  const s = value as PortfolioSchedule;
  if (
    !s ||
    typeof s.enabled !== 'boolean' ||
    !['daily', 'interval', 'weekly', 'monthly'].includes(s.kind) ||
    !Array.isArray(s.weekdays) ||
    s.weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6) ||
    !Number.isInteger(s.monthDay) ||
    s.monthDay < 1 ||
    s.monthDay > 31
  )
    throw new Error('Confira a frequência e os dias do agendamento.');
  validateSchedule({ ...s, timezone, time: times[0] });
  return {
    enabled: s.enabled,
    kind: s.kind,
    startDate: s.startDate,
    days: s.days,
    weekdays: [...new Set(s.weekdays)].sort(),
    monthDay: s.monthDay,
  };
}

export function nextPortfolioSync(
  setup: Pick<PortfolioSetup, 'schedule' | 'timezone' | 'times'>,
  after = new Date()
): string | null {
  if (!setup.schedule.enabled) return null;
  const dates = setup.times
    .map((time) =>
      nextOccurrence(
        { ...setup.schedule, time, timezone: setup.timezone },
        after
      )
    )
    .filter((date): date is string => date !== null)
    .sort();
  return dates[0] ?? null;
}
