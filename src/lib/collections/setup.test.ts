import { describe, expect, it } from 'vitest';
import {
  defaultPortfolioSetup,
  parsePortfolioSetup,
  stageForDelay,
  stageRange,
} from './setup';

describe('collection portfolio configuration', () => {
  it('saves an incomplete draft without manufacturing query IDs or activating jobs', () => {
    const parsed = parsePortfolioSetup({
      ...defaultPortfolioSetup(),
      enabled: true,
      account_id: 'other',
      status: 'active',
    });
    expect(parsed.queries.open.id).toBeNull();
    expect(parsed).not.toHaveProperty('enabled');
    expect(parsed).not.toHaveProperty('account_id');
    expect(parsed).not.toHaveProperty('status');
  });
  it('preserves work codes and query parameter values verbatim', () => {
    const setup = defaultPortfolioSetup();
    setup.queries.open = {
      id: 126,
      custom: 1,
      parameters: [{ name: 'EmpresaObra', value: "'900|00001'" }],
    };
    expect(parsePortfolioSetup(setup).queries.open.parameters[0].value).toBe(
      "'900|00001'"
    );
  });
  it('sorts schedules and deduplicates excluded companies', () => {
    const setup = defaultPortfolioSetup();
    setup.times = ['18:30', '08:00'];
    setup.excludedCompanies = ['900', '900', '101'];
    expect(parsePortfolioSetup(setup)).toMatchObject({
      times: ['08:00', '18:30'],
      excludedCompanies: ['900', '101'],
    });
  });
  it.each([
    { times: [] },
    { times: ['25:00'] },
    { times: ['08:00', '08:00'] },
    { timezone: 'not/a/timezone' },
    { minimumDays: 0 },
    { minimumDays: 1.5 },
    { excludedCompanies: ['900 OR 1=1'] },
    {
      stages: [
        { id: 'a', name: 'A', fromDay: 1 },
        { id: 'b', name: 'B', fromDay: 1 },
      ],
    },
    { stages: [{ id: 'a', name: 'A', fromDay: 5 }] },
    { queries: { open: { id: -1, custom: 1, parameters: [] } } },
  ])('rejects ambiguous or invalid settings %j', (patch) => {
    expect(() =>
      parsePortfolioSetup({ ...defaultPortfolioSetup(), ...patch })
    ).toThrow();
  });
  it('rejects duplicate parameter names ignoring case', () => {
    const setup = defaultPortfolioSetup();
    setup.queries.open.parameters = [
      { name: 'EmpresaObra', value: 'a' },
      { name: 'empresaobra', value: 'b' },
    ];
    expect(() => parsePortfolioSetup(setup)).toThrow('repetidos');
  });
  it('moves a contract across exact financial boundaries and allows it to move back', () => {
    const { stages } = defaultPortfolioSetup();
    expect(
      [0, 1, 10, 11, 30, 31, 60, 61, 10].map(
        (day) => stageForDelay(day, stages)?.id ?? null
      )
    ).toEqual([
      null,
      'initial',
      'initial',
      'follow-up',
      'follow-up',
      'attention',
      'attention',
      'legal',
      'initial',
    ]);
    expect(stageRange(stages, 0)).toBe('1–10 dias');
    expect(stageRange(stages, 3)).toBe('61+ dias');
  });
});
