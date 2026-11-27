import {
  defaultPortfolioSchedule,
  parsePortfolioSchedule,
  type PortfolioSchedule,
} from './schedule';

export const queryKinds = ['open', 'reconciliation'] as const;
export type QueryKind = (typeof queryKinds)[number];

export function isManagedPortfolioParameter(
  kind: QueryKind,
  name: string
): boolean {
  const names =
    kind === 'open'
      ? [
          'empresaobra',
          'exclusoesxml',
          'minimodiasatraso',
          'pagina',
          'tamanhopagina',
        ]
      : ['empresaobra', 'exclusoesxml', 'contratosxml'];
  return names.includes(name.trim().toLowerCase());
}
export interface PortfolioQuery {
  id: number | null;
  custom: 0 | 1;
  parameters: { name: string; value: string }[];
}
export interface CollectionStage {
  id: string;
  name: string;
  fromDay: number;
}
export interface ProjectKey {
  company: string;
  work: string;
}
export interface ProjectRule {
  id: string;
  name: string;
  company: string;
  work: string;
  stages: CollectionStage[];
}
export interface PortfolioSetup {
  version: 3;
  timezone: string;
  times: string[];
  schedule: PortfolioSchedule;
  minimumDays: number;
  excludedCompanies: string[];
  excludedProjects: ProjectKey[];
  scope: { mode: 'all' | 'selected'; projects: ProjectKey[] };
  projectRules: ProjectRule[];
  queries: Record<QueryKind, PortfolioQuery>;
  stages: CollectionStage[];
}

export function defaultPortfolioSetup(): PortfolioSetup {
  return {
    version: 3,
    timezone: 'America/Sao_Paulo',
    times: ['08:00', '14:00'],
    schedule: defaultPortfolioSchedule(),
    minimumDays: 1,
    excludedCompanies: [],
    excludedProjects: [],
    scope: { mode: 'all', projects: [] },
    projectRules: [],
    queries: {
      open: { id: null, custom: 1, parameters: [] },
      reconciliation: { id: null, custom: 1, parameters: [] },
    },
    stages: [
      { id: 'initial', name: 'Primeiro contato', fromDay: 1 },
      { id: 'follow-up', name: 'Acompanhamento', fromDay: 11 },
      { id: 'attention', name: 'Atenção especial', fromDay: 31 },
      { id: 'legal', name: 'Encaminhamento jurídico', fromDay: 61 },
    ],
  };
}

/** Normalize saved settings, including older configurations without recurrence. */
export function parsePortfolioSetup(value: unknown): PortfolioSetup {
  const fail = (message: string): never => {
    throw new Error(message);
  };
  if (!value || typeof value !== 'object')
    return fail('Configuração inválida.');
  if ((value as { version?: number }).version === 1) {
    const legacy = value as Record<string, unknown>;
    // A former receipts query is not a reconciliation query. Never silently
    // reinterpret its code; require the newly registered SQL explicitly.
    return parsePortfolioSetup({
      ...legacy,
      version: 2,
      queries: {
        open: (legacy.queries as Record<string, unknown> | undefined)?.open,
        reconciliation: { id: null, custom: 1, parameters: [] },
      },
    });
  }
  if ((value as { version?: number }).version === 2) {
    const legacy = value as Record<string, unknown>;
    const queries = legacy.queries as PortfolioSetup['queries'];
    const literal =
      queries?.open?.parameters?.find(
        (p) => p.name.toLowerCase() === 'empresaobra'
      )?.value ?? '';
    const projects = literal
      .replace(/^N?'/, '')
      .replace(/'$/, '')
      .split(',')
      .filter(Boolean)
      .map((pair) => {
        const [company, work] = pair.split('|');
        return { company, work };
      });
    return parsePortfolioSetup({
      ...legacy,
      version: 3,
      excludedProjects: [],
      projectRules: [],
      scope: { mode: projects.length ? 'selected' : 'all', projects },
    });
  }
  const input = value as PortfolioSetup;
  if (input.version !== 3)
    return fail('Versão de configuração não reconhecida.');
  if (typeof input.timezone !== 'string' || input.timezone.length > 80)
    return fail('Informe um fuso horário válido.');
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: input.timezone });
  } catch {
    return fail('Fuso horário inválido.');
  }
  if (
    !Array.isArray(input.times) ||
    input.times.length < 1 ||
    input.times.length > 12 ||
    input.times.some(
      (time) =>
        typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
    ) ||
    new Set(input.times).size !== input.times.length
  )
    return fail('Informe de 1 a 12 horários diferentes, no formato HH:mm.');
  if (
    !Number.isSafeInteger(input.minimumDays) ||
    input.minimumDays < 1 ||
    input.minimumDays > 36500
  )
    return fail('O atraso mínimo deve ser de pelo menos um dia.');
  if (
    !Array.isArray(input.excludedCompanies) ||
    input.excludedCompanies.length > 200 ||
    input.excludedCompanies.some(
      (code) => typeof code !== 'string' || !/^\d{1,10}$/.test(code)
    )
  )
    return fail('Informe os códigos numéricos das empresas a excluir.');
  if (
    !Array.isArray(input.stages) ||
    input.stages.length < 1 ||
    input.stages.length > 10
  )
    return fail('Cadastre de 1 a 10 etapas.');
  const ids = new Set<string>();
  const stages = input.stages.map((stage, index) => {
    if (
      !stage ||
      typeof stage.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(stage.id) ||
      ids.has(stage.id)
    )
      return fail('Identificador de etapa inválido ou repetido.');
    ids.add(stage.id);
    if (
      typeof stage.name !== 'string' ||
      !stage.name.trim() ||
      stage.name.length > 80
    )
      return fail('Informe um nome de até 80 caracteres para cada etapa.');
    if (
      !Number.isSafeInteger(stage.fromDay) ||
      stage.fromDay < 1 ||
      stage.fromDay > 36500 ||
      (index > 0 && stage.fromDay <= input.stages[index - 1].fromDay)
    )
      return fail(
        'As etapas devem começar em dias diferentes e em ordem crescente.'
      );
    return { id: stage.id, name: stage.name.trim(), fromDay: stage.fromDay };
  });
  const project = (value: ProjectKey): ProjectKey => {
    if (
      !value ||
      typeof value.company !== 'string' ||
      !/^[1-9]\d{0,9}$/.test(value.company) ||
      Number(value.company) > 2147483647 ||
      typeof value.work !== 'string' ||
      !/^[A-Za-z0-9_.-]{1,50}$/.test(value.work)
    )
      return fail(
        'Confira o código da empresa e da obra. Preserve os zeros da obra.'
      );
    return { company: value.company, work: value.work };
  };
  if (
    !input.scope ||
    !['all', 'selected'].includes(input.scope.mode) ||
    !Array.isArray(input.scope.projects) ||
    input.scope.projects.length > 500 ||
    !Array.isArray(input.excludedProjects) ||
    input.excludedProjects.length > 1000 ||
    !Array.isArray(input.projectRules) ||
    input.projectRules.length > 500
  )
    return fail('Configuração de empreendimentos inválida.');
  const uniqueProjects = (items: ProjectKey[]) => {
    const parsed = items.map(project);
    if (
      new Set(parsed.map((p) => `${p.company}|${p.work.toUpperCase()}`))
        .size !== parsed.length
    )
      return fail('Há empresas/obras repetidas.');
    return parsed;
  };
  const scope = {
    mode: input.scope.mode,
    projects: uniqueProjects(input.scope.projects),
  };
  if (scope.mode === 'selected' && scope.projects.length === 0)
    return fail('Selecione ao menos uma empresa e obra.');
  const excludedProjects = uniqueProjects(input.excludedProjects);
  const targets = new Set<string>(),
    ruleIds = new Set<string>();
  const projectRules = input.projectRules.map((rule) => {
    const key = project(rule);
    if (
      typeof rule.id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(rule.id) ||
      ruleIds.has(rule.id) ||
      typeof rule.name !== 'string' ||
      !rule.name.trim() ||
      rule.name.length > 80 ||
      targets.has(`${key.company}|${key.work.toUpperCase()}`)
    )
      return fail(
        'Cada empresa/obra deve ter uma única régua, com nome e identificador válidos.'
      );
    targets.add(`${key.company}|${key.work.toUpperCase()}`);
    ruleIds.add(rule.id);
    const parsed = parsePortfolioSetup({
      ...input,
      stages: rule.stages,
      projectRules: [],
    });
    return {
      ...key,
      id: rule.id,
      name: rule.name.trim(),
      stages: parsed.stages,
    };
  });
  const queries = {} as PortfolioSetup['queries'];
  for (const kind of queryKinds) {
    const query = input.queries?.[kind];
    if (
      !query ||
      (query.id !== null &&
        (!Number.isSafeInteger(query.id) ||
          query.id < 1 ||
          query.id > 2147483647)) ||
      ![0, 1].includes(query.custom)
    )
      return fail('Confira o código e o tipo de cada consulta.');
    if (!Array.isArray(query.parameters) || query.parameters.length > 50)
      return fail('Cada consulta aceita no máximo 50 parâmetros.');
    const names = new Set<string>();
    const parameters = query.parameters.map((parameter) => {
      if (
        !parameter ||
        typeof parameter.name !== 'string' ||
        !/^[\p{L}\p{N}_. -]{1,80}$/u.test(parameter.name.trim()) ||
        typeof parameter.value !== 'string' ||
        parameter.value.length > 512
      )
        return fail('Confira os nomes e os valores dos parâmetros.');
      const name = parameter.name.trim();
      if (names.has(name.toLowerCase()))
        return fail('Há parâmetros repetidos na mesma consulta.');
      names.add(name.toLowerCase());
      return { name, value: parameter.value };
    });
    queries[kind] = { id: query.id, custom: query.custom, parameters };
  }
  const schedule = parsePortfolioSchedule(
    input.schedule,
    input.timezone,
    input.times
  );
  if (schedule.enabled && (!queries.open.id || !queries.reconciliation.id))
    return fail(
      'Configure as duas consultas do UAU antes de ativar o agendamento.'
    );
  return {
    version: 3,
    timezone: input.timezone,
    times: [...input.times].sort(),
    schedule,
    minimumDays: input.minimumDays,
    excludedCompanies: [...new Set(input.excludedCompanies)],
    excludedProjects,
    scope,
    projectRules,
    stages,
    queries,
  };
}

export function isExcludedProject(
  setup: PortfolioSetup,
  company: string,
  work: string
): boolean {
  return (
    setup.excludedCompanies.includes(company) ||
    setup.excludedProjects.some(
      (p) =>
        p.company === company && p.work.toUpperCase() === work.toUpperCase()
    )
  );
}
export function stagesForProject(
  setup: PortfolioSetup,
  company: string,
  work: string
): CollectionStage[] {
  return (
    setup.projectRules.find(
      (rule) =>
        rule.company === company &&
        rule.work.toUpperCase() === work.toUpperCase()
    )?.stages ?? setup.stages
  );
}
export function scopeLiteral(setup: PortfolioSetup): string {
  return setup.scope.mode === 'all'
    ? "'*'"
    : `'${setup.scope.projects.map((p) => `${p.company}|${p.work}`).join(',')}'`;
}
export function exclusionsLiteral(setup: PortfolioSetup): string {
  return `N'<exclusoes>${setup.excludedCompanies.map((company) => `<empresa codigo="${company}" />`).join('')}${setup.excludedProjects.map((p) => `<obra empresa="${p.company}" codigo="${p.work}" />`).join('')}</exclusoes>'`;
}

export function stageForDelay(
  days: number,
  stages: CollectionStage[]
): CollectionStage | null {
  return stages.findLast((stage) => days >= stage.fromDay) ?? null;
}

export function stageRange(stages: CollectionStage[], index: number): string {
  const stage = stages[index];
  const next = stages[index + 1];
  return next
    ? `${stage.fromDay}–${next.fromDay - 1} dias`
    : `${stage.fromDay}+ dias`;
}
