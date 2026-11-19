import type { CampaignSchedule } from './definition';

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
    !['once', 'daily', 'interval'].includes(s.kind) ||
    !Number.isInteger(s.days) ||
    s.days < 1 ||
    s.days > 365 ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time) ||
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
}

// Calendar recurrence in the chosen zone, not 24h arithmetic. Missed occurrences
// collapse into one overdue execution; the next date is strictly in the future.
export function nextOccurrence(
  s: CampaignSchedule,
  after: Date
): string | null {
  validateSchedule(s);
  const anchor = Date.parse(s.startDate + 'T00:00:00Z');
  const [hour, minute] = s.time.split(':').map(Number);
  const step = s.kind === 'interval' ? s.days : 1;
  const local = localParts(after, s.timezone);
  const localDay = Date.UTC(local.year, local.month - 1, local.day);
  let index = Math.max(0, Math.floor((localDay - anchor) / 86400000 / step));
  if (s.kind === 'once') index = 0;
  for (let attempts = 0; attempts < 370; attempts++, index++) {
    if (s.kind === 'once' && index > 0) return null;
    const day = anchor + index * step * 86400000;
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
