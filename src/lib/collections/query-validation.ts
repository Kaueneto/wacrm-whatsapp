import { uauRows } from '@/lib/uau/finance-normalize';
import { UauError } from '@/lib/uau/client';
import {
  isExcludedProject,
  type PortfolioSetup,
  type QueryKind,
} from './setup';
import { createPortfolioPlan } from './query-plan';

export interface PilotContract {
  company: number;
  work: string;
  sale: number;
}
export type PilotSelection = Omit<PilotContract, 'sale'> & { sale?: number };
export interface PortfolioValidationRow {
  key: string;
  company: number;
  work: string;
  sale: number;
  customer: string;
  openInstallments: number;
  overdueInstallments: number;
  baseOpen: number;
  receipts: number;
  confirmedReceipts: number;
  cancellations: number;
  maintenance: number;
  contractFound: boolean;
  referenceDate: string;
}
export interface PortfolioValidationResult {
  discovery: PortfolioValidationRow[];
  reconciliation: PortfolioValidationRow[];
  possiblyMorePages: boolean;
  persisted: false;
}
const fail = (message: string): never => {
  throw new UauError(message, 422);
};
export function parsePilot(value: unknown): PilotSelection {
  if (!value || typeof value !== 'object')
    return fail('Informe empresa e obra do teste.');
  const pilot = value as PilotSelection;
  if (
    ![pilot.company, ...(pilot.sale === undefined ? [] : [pilot.sale])].every(
      (number) =>
        Number.isSafeInteger(number) && number > 0 && number <= 2147483647
    ) ||
    typeof pilot.work !== 'string' ||
    !/^[A-Za-z0-9_.-]{1,50}$/.test(pilot.work)
  )
    return fail('Confira os códigos de empresa, obra e venda do teste.');
  return { company: pilot.company, work: pilot.work, sale: pilot.sale };
}

export function pilotXml(pilot: PilotContract): string {
  const valid = parsePilot(pilot);
  if (valid.sale === undefined)
    return fail('Informe a venda para montar a consulta de conciliação.');
  return `<contratos><contrato empresa="${valid.company}" obra="${valid.work}" venda="${valid.sale}" /></contratos>`;
}

function field(row: Record<string, unknown>, name: string): unknown {
  const key = Object.keys(row).find(
    (key) => key.toLowerCase() === name.toLowerCase()
  );
  return key ? row[key] : undefined;
}
function integer(value: unknown, name: string, minimum = 0): number {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value)
        ? Number(value)
        : NaN;
  if (!Number.isSafeInteger(numeric) || numeric < minimum)
    return fail(`O UAU retornou ${name} inválido.`);
  return numeric;
}
function collection(
  row: Record<string, unknown>,
  name: string
): Record<string, unknown>[] {
  let value = field(row, name);
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return fail(`A coluna ${name} não contém JSON válido.`);
    }
  }
  if (
    !Array.isArray(value) ||
    value.some(
      (item) => !item || typeof item !== 'object' || Array.isArray(item)
    )
  )
    return fail(`A consulta não retornou a coleção ${name}.`);
  return value;
}
function date(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T| |$)/.test(value))
    return fail('O UAU retornou uma data inválida.');
  const day = value.slice(0, 10);
  if (
    !Number.isFinite(Date.parse(day + 'T00:00:00Z')) ||
    new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) !== day
  )
    return fail('O UAU retornou uma data inválida.');
  return day;
}

/** Homologation summary only: no paid/renegotiated classification or financial writes. */
export function validatePortfolioRows(
  input: unknown,
  kind: QueryKind,
  minimumDays: number
): PortfolioValidationRow[] {
  const seen = new Set<string>();
  return uauRows(input).map((row) => {
    if (
      integer(field(row, 'VersaoContratoDados'), 'VersaoContratoDados') !== 1 ||
      field(row, 'TipoRegistro') !==
        (kind === 'open' ? 'INADIMPLENCIA' : 'CONCILIACAO') ||
      field(row, 'EscopoParcelas') !==
        (kind === 'open' ? 'SOMENTE_VENCIDAS' : 'TODAS_ABERTAS')
    )
      return fail(
        'A consulta não corresponde ao modelo de sincronização v1. Confira o SQL cadastrado.'
      );
    const company = integer(field(row, 'CodEmpresa'), 'CodEmpresa', 1);
    const sale = integer(field(row, 'Venda'), 'Venda', 1);
    const work = field(row, 'CodObra');
    if (typeof work !== 'string' || !/^[A-Za-z0-9_.-]{1,50}$/.test(work))
      return fail('A obra deve retornar como texto, preservando os zeros.');
    const key = `${company}_${work}_${sale}`;
    if (field(row, 'ChaveContrato') !== key || seen.has(key))
      return fail(
        'A consulta retornou contratos repetidos ou com chave inconsistente.'
      );
    seen.add(key);
    const referenceDate = date(field(row, 'DataReferenciaAtraso'));
    const open = collection(row, 'ParcelasAbertasJson');
    const receipt = collection(row, 'RecebimentosJson');
    const cancellation = collection(row, 'DistratosJson');
    const maintenance = collection(row, 'ManutencoesJson');
    collection(row, 'UnidadesJson');
    const installmentKeys = new Set<string>();
    let baseOpen = 0,
      overdueInstallments = 0;
    for (const item of open) {
      const type = field(item, 'TipoParcela');
      if (typeof type !== 'string' || !type.trim())
        return fail('Tipo de parcela ausente.');
      const key = `${type}_${integer(field(item, 'NumeroParcela'), 'NumeroParcela')}_${integer(field(item, 'NumeroGeralParcela'), 'NumeroGeralParcela')}`;
      if (installmentKeys.has(key))
        return fail('Há parcelas abertas duplicadas no contrato.');
      installmentKeys.add(key);
      const raw = field(item, 'ValorBaseAbertoUAU');
      const value =
        typeof raw === 'number'
          ? raw
          : typeof raw === 'string' && /^-?\d+(\.\d+)?$/.test(raw)
            ? Number(raw)
            : NaN;
      if (!Number.isFinite(value) || Math.abs(value) > 1e12)
        return fail('Saldo de parcela inválido.');
      baseOpen += value;
      const due = date(field(item, 'VencimentoOriginal'));
      const days = Math.round(
        (Date.parse(referenceDate + 'T00:00:00Z') -
          Date.parse(due + 'T00:00:00Z')) /
          86400000
      );
      if (value > 0 && days >= minimumDays) overdueInstallments++;
    }
    const contractFound = integer(
      field(row, 'ContratoLocalizado'),
      'ContratoLocalizado'
    );
    if (![0, 1].includes(contractFound))
      return fail('Indicador de localização do contrato inválido.');
    return {
      key,
      company,
      work,
      sale,
      customer:
        typeof field(row, 'NomeCliente') === 'string'
          ? String(field(row, 'NomeCliente'))
          : 'Cadastro não localizado',
      openInstallments: open.length,
      overdueInstallments,
      baseOpen: Math.round(baseOpen * 100) / 100,
      receipts: receipt.length,
      confirmedReceipts: receipt.filter(
        (item) =>
          integer(
            field(item, 'StatusRecebimentoUAU'),
            'StatusRecebimentoUAU'
          ) === 1
      ).length,
      cancellations: cancellation.length,
      maintenance: maintenance.length,
      contractFound: contractFound === 1,
      referenceDate,
    };
  });
}

export async function validatePortfolioQueries(
  accountId: string,
  setup: PortfolioSetup,
  pilot?: PilotSelection
): Promise<PortfolioValidationResult> {
  const selection = pilot === undefined ? undefined : parsePilot(pilot);
  let valid: PilotContract | undefined =
    selection?.sale === undefined
      ? undefined
      : { ...selection, sale: selection.sale };
  // A manual check is read-only and uses its own temporary scope. It must not
  // change which companies or works are imported into the saved portfolio.
  const validationSetup: PortfolioSetup = selection
    ? {
        ...setup,
        scope: {
          mode: 'selected',
          projects: [
            { company: String(selection.company), work: selection.work },
          ],
        },
        excludedCompanies: [],
        excludedProjects: [],
      }
    : setup;
  const inScope = (contract: PilotContract) =>
    !isExcludedProject(
      validationSetup,
      String(contract.company),
      contract.work
    ) &&
    (validationSetup.scope.mode === 'all' ||
      validationSetup.scope.projects.some(
        (project) =>
          project.company === String(contract.company) &&
          project.work.toUpperCase() === contract.work.toUpperCase()
      ));
  const plan = await createPortfolioPlan(accountId, validationSetup);
  const result: PortfolioValidationResult = {
    discovery: [],
    reconciliation: [],
    possiblyMorePages: false,
    persisted: false,
  };
  for (const kind of ['open', 'reconciliation'] as const) {
    if (kind === 'reconciliation' && !valid) break;
    const raw = await plan.execute(
      kind,
      kind === 'open' ? { page: 1, size: 100 } : { contracts: [valid!] }
    );
    const rows = validatePortfolioRows(raw, kind, setup.minimumDays);
    if (kind === 'open') {
      if (rows.some((row) => !inScope(row)))
        return fail(
          'A consulta de inadimplência retornou contratos fora do escopo. Confira o filtro EmpresaObra no SQL cadastrado no UAU.'
        );
      result.discovery = rows;
      result.possiblyMorePages = rows.length === 100;
      valid ??= rows[0];
    } else {
      if (
        rows.length !== 1 ||
        rows[0].key !== `${valid!.company}_${valid!.work}_${valid!.sale}`
      )
        return fail(
          'A conciliação não retornou exatamente o contrato solicitado. Confira o escopo EmpresaObra.'
        );
      if (!rows[0].contractFound)
        return fail(
          'A venda informada não foi localizada no UAU para essa empresa e obra. Confira o número da venda ou use a seleção automática.'
        );
      result.reconciliation = rows;
    }
  }
  return result;
}
