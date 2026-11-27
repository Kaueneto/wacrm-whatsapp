import { describe, expect, it } from 'vitest';
import { defaultPortfolioSetup, parsePortfolioSetup } from './setup';
import { nextPortfolioSync } from './schedule';

function scheduled() {
  const setup = defaultPortfolioSetup();
  setup.schedule = {
    ...setup.schedule,
    enabled: true,
    startDate: '2026-01-01',
  };
  setup.queries.open.id = 144;
  setup.queries.reconciliation.id = 145;
  return setup;
}
describe('collection calendar scheduling', () => {
  it('keeps legacy settings manual and preserves existing hours', () => {
    const setup = {
      ...defaultPortfolioSetup(),
      schedule: undefined,
      times: ['09:00', '14:00'],
    };
    const parsed = parsePortfolioSetup(setup);
    expect(parsed.schedule.enabled).toBe(false);
    expect(parsed.times).toEqual(setup.times);
    expect(nextPortfolioSync(parsed)).toBeNull();
  });
  it('chooses the next daily time in the selected timezone', () => {
    expect(
      nextPortfolioSync(scheduled(), new Date('2026-01-05T11:00:00Z'))
    ).toBe('2026-01-05T17:00:00.000Z');
  });
  it('keeps N-day recurrence anchored to the initial date and skips missed days', () => {
    const setup = scheduled();
    setup.schedule.kind = 'interval';
    setup.schedule.days = 3;
    expect(nextPortfolioSync(setup, new Date('2026-01-05T11:00:00Z'))).toBe(
      '2026-01-07T11:00:00.000Z'
    );
  });
  it('supports the beginning of every month', () => {
    const setup = scheduled();
    setup.schedule.kind = 'monthly';
    setup.schedule.monthDay = 1;
    expect(nextPortfolioSync(setup, new Date('2026-01-31T23:00:00Z'))).toBe(
      '2026-02-01T11:00:00.000Z'
    );
  });
  it('supports specific weekdays', () => {
    const setup = scheduled();
    setup.schedule.kind = 'weekly';
    setup.schedule.weekdays = [1];
    expect(nextPortfolioSync(setup, new Date('2026-01-06T12:00:00Z'))).toBe(
      '2026-01-12T11:00:00.000Z'
    );
  });
  it('requires configured queries before activation', () => {
    const setup = defaultPortfolioSetup();
    setup.schedule.enabled = true;
    expect(() => parsePortfolioSetup(setup)).toThrow('duas consultas');
  });
  it.each([
    { days: 0 },
    { days: 366 },
    { kind: 'weekly', weekdays: [] },
    { monthDay: 32 },
    { startDate: '2026-02-30' },
    { enabled: 'true' },
  ])('rejects invalid recurrence %j', (patch) => {
    const setup = scheduled();
    expect(() =>
      parsePortfolioSetup({
        ...setup,
        schedule: { ...setup.schedule, ...patch },
      })
    ).toThrow();
  });
});
