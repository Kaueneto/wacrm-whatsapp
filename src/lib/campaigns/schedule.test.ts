import { describe, expect, it } from 'vitest';
import { nextOccurrence } from './schedule';
import type { CampaignSchedule } from './definition';
const base: CampaignSchedule = {
  kind: 'daily',
  days: 1,
  time: '09:00',
  timezone: 'America/Sao_Paulo',
  startDate: '2026-11-18',
};
describe('Campaign calendar scheduling', () => {
  it('uses the selected zone and moves to tomorrow after the local time', () => {
    expect(nextOccurrence(base, new Date('2026-11-18T11:00:00Z'))).toBe(
      '2026-11-18T12:00:00.000Z'
    );
    expect(nextOccurrence(base, new Date('2026-11-18T12:00:00Z'))).toBe(
      '2026-11-19T12:00:00.000Z'
    );
  });
  it('skips missed recurrences without drifting from the initial date', () => {
    expect(
      nextOccurrence(
        { ...base, kind: 'interval', days: 3 },
        new Date('2026-12-01T13:00:00Z')
      )
    ).toBe('2026-12-03T12:00:00.000Z');
  });
  it('does not replay a completed one-time schedule', () => {
    expect(
      nextOccurrence(
        { ...base, kind: 'once' },
        new Date('2026-11-18T12:00:00Z')
      )
    ).toBeNull();
  });
  it('uses the selected weekdays and honors the last eligible day', () => {
    const weekly: CampaignSchedule = {
      ...base,
      kind: 'weekly',
      weekdays: [1, 5],
      endDate: '2026-11-20',
    };
    expect(nextOccurrence(weekly, new Date('2026-11-18T12:00:00Z'))).toBe(
      '2026-11-20T12:00:00.000Z'
    );
    expect(nextOccurrence(weekly, new Date('2026-11-20T12:00:00Z'))).toBeNull();
  });
  it('skips months without the selected day', () => {
    expect(
      nextOccurrence(
        { ...base, kind: 'monthly', monthDay: 31 },
        new Date('2026-11-18T12:00:00Z')
      )
    ).toBe('2026-12-31T12:00:00.000Z');
  });
  it('preserves local wall time across daylight saving changes', () => {
    expect(
      nextOccurrence(
        { ...base, startDate: '2026-03-07', timezone: 'America/New_York' },
        new Date('2026-03-07T15:00:00Z')
      )
    ).toBe('2026-03-08T13:00:00.000Z');
  });
  it('rejects invalid dates and zones', () => {
    expect(() =>
      nextOccurrence({ ...base, startDate: '2026-02-30' }, new Date())
    ).toThrow();
    expect(() =>
      nextOccurrence({ ...base, timezone: 'Invalid/Zone' }, new Date())
    ).toThrow();
    expect(() => nextOccurrence({ ...base, days: 0 }, new Date())).toThrow();
  });
});
