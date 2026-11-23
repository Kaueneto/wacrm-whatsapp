import type { CampaignSchedule } from './definition';
import { getUauSchedule, isUauCampaignDefinition } from '@/lib/uau/campaign-draft';

export function getCampaignSchedule(definition: unknown, schedule: CampaignSchedule | null): CampaignSchedule | null {
  return isUauCampaignDefinition(definition) ? getUauSchedule(schedule) : schedule?.kind ? schedule : null;
}

export function campaignScheduleCanActivate(schedule: CampaignSchedule, now = new Date()): boolean {
  try {
    return nextOccurrence(schedule, now) !== null;
  } catch {
    return false;
  }
}

function localParts(date: Date, timezone: string) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, Number(p.value)])
  );
}

export function validateSchedule(s: CampaignSchedule) {
  if (
    !s ||
    !['once', 'daily', 'interval', 'weekly', 'monthly'].includes(s.kind) ||
    !Number.isInteger(s.days) ||
    s.days < 1 ||
    s.days > 365 ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time) ||
    typeof s.timezone !== 'string' ||
    !s.timezone ||
    !/^\d{4}-\d{2}-\d{2}$/.test(s.startDate)
  ) {
    throw new Error(
      'Programação inválida. Informe data, horário e intervalo de 1 a 365 dias.'
    );
  }
  localParts(new Date(), s.timezone); // Intl rejects unsupported IANA zones.
  const check = new Date(s.startDate + 'T00:00:00Z');
  if (
    !Number.isFinite(check.getTime()) ||
    check.toISOString().slice(0, 10) !== s.startDate
  )
    throw new Error('Data inválida.');
  if (s.endDate) {
    const end = new Date(s.endDate + 'T00:00:00Z');
    if (
      !Number.isFinite(end.getTime()) ||
      end.toISOString().slice(0, 10) !== s.endDate ||
      s.endDate < s.startDate
    )
      throw new Error(
        'A data de término deve ser igual ou posterior à data inicial.'
      );
  }
  if (
    s.kind === 'weekly' &&
    (!Array.isArray(s.weekdays) ||
      !s.weekdays.length ||
      s.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6))
  )
    throw new Error('Selecione os dias da semana.');
  if (
    s.kind === 'monthly' &&
    (!s.monthDay ||
      !Number.isInteger(s.monthDay) ||
      s.monthDay < 1 ||
      s.monthDay > 31)
  )
    throw new Error('Selecione um dia do mês entre 1 e 31.');
}

export function describeSchedule(schedule: CampaignSchedule) {
  switch (schedule.kind) {
    case 'once':
      return 'Envio único';
    case 'daily':
      return 'Diariamente';
    case 'interval':
      return `A cada ${schedule.days} dias`;
    case 'weekly':
      return 'Semanalmente';
    case 'monthly':
      return `Todo dia ${schedule.monthDay} do mês`;
  }
}

// Calendar recurrence in the chosen zone, not 24h arithmetic. Missed occurrences
// collapse into one overdue execution; the next date is strictly in the future.
export function nextOccurrence(
  s: CampaignSchedule,
  after: Date
): string | null {
  validateSchedule(s);
  const anchor = Date.parse(s.startDate + 'T00:00:00Z');
  const end = s.endDate ? Date.parse(s.endDate + 'T00:00:00Z') : Infinity;
  const [hour, minute] = s.time.split(':').map(Number);
  const step = s.kind === 'interval' ? s.days : 1;
  const local = localParts(after, s.timezone);
  const localDay = Date.UTC(local.year, local.month - 1, local.day);
  let index = Math.max(0, Math.floor((localDay - anchor) / 86400000 / step));
  if (s.kind === 'once') index = 0;
  for (let attempts = 0; attempts < 370; attempts++, index++) {
    if (s.kind === 'once' && index > 0) return null;
    const day = anchor + index * step * 86400000;
    if (day > end) return null;
    if (s.kind === 'weekly' && !s.weekdays?.includes(new Date(day).getUTCDay()))
      continue;
    if (s.kind === 'monthly' && new Date(day).getUTCDate() !== s.monthDay)
      continue;
    const target = day + hour * 3600000 + minute * 60000;
    let candidate = target;
    for (let i = 0; i < 4; i++) {
      const p = localParts(new Date(candidate), s.timezone);
      const represented = Date.UTC(
        p.year,
        p.month - 1,
        p.day,
        p.hour,
        p.minute
      );
      const delta = target - represented;
      if (delta === 0) break;
      candidate += delta;
    }
    if (candidate > after.getTime()) return new Date(candidate).toISOString();
  }
  throw new Error('Não foi possível calcular a próxima execução.');
}
