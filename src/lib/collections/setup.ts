export const queryKinds = ['open', 'reconciliation'] as const;
export type QueryKind = (typeof queryKinds)[number];

export function isManagedPortfolioParameter(
  kind: QueryKind,
  name: string
): boolean {
  const names =
    kind === 'open'
      ? ['minimodiasatraso', 'pagina', 'tamanhopagina']
      : ['contratosxml'];
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
export interface PortfolioSetup {
  version: 2;
  timezone: string;
  times: string[];
  minimumDays: number;
  excludedCompanies: string[];
  queries: Record<QueryKind, PortfolioQuery>;
  stages: CollectionStage[];
}

export function defaultPortfolioSetup(): PortfolioSetup {
  return {
    version: 2,
    timezone: 'America/Sao_Paulo',
    times: ['08:00', '14:00'],
    minimumDays: 1,
    excludedCompanies: [],
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

/** Only a draft can be saved in this release; it cannot start jobs or messages. */
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
  const input = value as PortfolioSetup;
  if (input.version !== 2)
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
  if (stages[0].fromDay > input.minimumDays)
    return fail(
      'A primeira etapa deve começar até o atraso mínimo da carteira.'
    );
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
  return {
    version: 2,
    timezone: input.timezone,
    times: [...input.times].sort(),
    minimumDays: input.minimumDays,
    excludedCompanies: [...new Set(input.excludedCompanies)],
    stages,
    queries,
  };
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
