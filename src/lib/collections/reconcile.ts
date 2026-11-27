import { validatePortfolioRows } from './query-validation';
import {
  isExcludedProject,
  stagesForProject,
  stageForDelay,
  type PortfolioSetup,
} from './setup';
import type {
  CollectionSnapshot,
  CollectionEvent,
  ReceiptPosition,
} from './portfolio-types';

const field = (r: Record<string, unknown>, name: string) =>
  r[Object.keys(r).find((k) => k.toLowerCase() === name.toLowerCase()) ?? name];
const rows = (
  r: Record<string, unknown>,
  name: string
): Record<string, unknown>[] => {
  const value = field(r, name);
  return typeof value === 'string'
    ? JSON.parse(value)
    : (value as Record<string, unknown>[]);
};
const day = (value: unknown) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)
    ? value.slice(0, 10)
    : null;
const integer = (value: unknown) => {
  const n = Number(value);
  if (value === null || value === undefined || !Number.isSafeInteger(n))
    throw Error('Identificador ou status inválido no UAU.');
  return n;
};
export function moneyCents(value: unknown): number {
  const text =
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Math.abs(value) < 1e10
      ? value.toFixed(6)
      : typeof value === 'string'
        ? value
        : '';
  if (!/^-?\d{1,12}(\.\d{1,6})?$/.test(text))
    throw Error('Valor financeiro inválido no UAU.');
  const negative = text.startsWith('-'),
    [whole, fraction = ''] = text.replace('-', '').split('.');
  const padded = fraction.padEnd(6, '0');
  const amount =
    BigInt(whole) * BigInt(100) +
    BigInt(padded.slice(0, 2)) +
    BigInt(padded[2] >= '5' ? 1 : 0);
  const result = Number(amount) * (negative ? -1 : 1);
  if (!Number.isSafeInteger(result))
    throw Error('Valor financeiro excede o limite.');
  return result;
}
export function snapshotFromUau(
  row: Record<string, unknown>,
  setup: PortfolioSetup,
  previous?: CollectionSnapshot
): CollectionSnapshot {
  const [base] = validatePortfolioRows([row], 'reconciliation', 1);
  const positions = rows(row, 'ParcelasAbertasJson').map((p) => ({
    key: `${field(p, 'TipoParcela')}_${field(p, 'NumeroParcela')}_${field(p, 'NumeroGeralParcela')}`,
    typeCode: String(field(p, 'TipoParcela')),
    typeName:
      typeof field(p, 'DescricaoTipoParcela') === 'string'
        ? String(field(p, 'DescricaoTipoParcela')).trim() || null
        : null,
    number: integer(field(p, 'NumeroParcela')),
    generalNumber: integer(field(p, 'NumeroGeralParcela')),
    due: day(field(p, 'VencimentoOriginal'))!,
    extension: day(field(p, 'Prorrogacao')),
    cents: moneyCents(field(p, 'ValorBaseAbertoUAU')),
    status:
      field(p, 'StatusParcelaUAU') == null
        ? null
        : integer(field(p, 'StatusParcelaUAU')),
  }));
  const receipts: ReceiptPosition[] = rows(row, 'RecebimentosJson').map((p) => {
    const receipt = String(field(p, 'NumeroRecebimento'));
    if (!/^\d{1,18}(?:\.\d{1,6})?$/.test(receipt))
      throw Error('Número de recebimento inválido.');
    const [whole, fractional = ''] = receipt.split('.');
    const canonicalReceipt =
      String(BigInt(whole)) +
      (fractional.replace(/0+$/, '')
        ? '.' + fractional.replace(/0+$/, '')
        : '');
    const installmentKey = `${field(p, 'TipoParcela')}_${field(p, 'NumeroParcela')}_${field(p, 'NumeroGeralParcela')}`;
    const status = integer(field(p, 'StatusRecebimentoUAU'));
    const date = day(field(p, 'DataRecebimentoUAU'));
    if (!date) throw Error('Data de recebimento inválida.');
    return {
      key: `${canonicalReceipt}_${installmentKey}_${field(p, 'TipoRecebimentoUAU')}`,
      installmentKey,
      date,
      status,
      principalCents: status === 1 ? moneyCents(field(p, 'ValorConf_Rec')) : 0,
    };
  });
  if (new Set(receipts.map((p) => p.key)).size !== receipts.length)
    throw Error('Recebimentos duplicados no contrato.');
  const maintenance = rows(row, 'ManutencoesJson').map((m) => ({
    key: String(integer(field(m, 'NumeroHistorico'))),
    type: integer(field(m, 'TipoManutencaoUAU')),
    date: day(field(m, 'DataManutencaoUAU')) ?? base.referenceDate,
  }));
  const cancellations = rows(row, 'DistratosJson').map((d) => ({
    status:
      field(d, 'StatusAprovacaoDistratoUAU') == null
        ? null
        : integer(field(d, 'StatusAprovacaoDistratoUAU')),
    date: day(field(d, 'DataAprovacaoDistratoUAU')),
  }));
  const overdue = positions.filter(
    (p) => p.cents > 0 && p.due < base.referenceDate
  );
  const delay = overdue.length
    ? Math.max(
        ...overdue.map((p) =>
          Math.round(
            (Date.parse(base.referenceDate) - Date.parse(p.due)) / 86400000
          )
        )
      )
    : 0;
  const cancellationDate = day(field(row, 'DataCancelamentoEncontrada'));
  const addedReceipts = receipts.filter(
    (r) =>
      r.status === 1 &&
      !previous?.receipts.some(
        (old) =>
          old.key === r.key &&
          old.status === 1 &&
          old.principalCents === r.principalCents
      )
  );
  const newMaintenance = maintenance.filter(
    (m) => !previous?.maintenance.some((old) => old.key === m.key)
  );
  const oldOverdue =
    previous?.positions.filter(
      (p) => p.cents > 0 && p.due < previous.referenceDate
    ) ?? [];
  const paid =
    oldOverdue.length > 0 &&
    oldOverdue.every(
      (p) =>
        addedReceipts
          .filter((r) => r.installmentKey === p.key)
          .reduce(
            (sum, r) =>
              sum +
              r.principalCents -
              (previous?.receipts.find(
                (old) => old.key === r.key && old.status === 1
              )?.principalCents ?? 0),
            0
          ) >= p.cents
    ) &&
    !newMaintenance.some((m) => [1, 2, 6, 7, 8, 9].includes(m.type));
  let state: CollectionSnapshot['state'] = 'current',
    reason: string | null = null;
  if (isExcludedProject(setup, String(base.company), base.work)) {
    state = 'excluded';
    reason = 'Empresa ou obra excluída da carteira.';
  } else if (cancellationDate || cancellations.length) {
    state = 'cancelled';
    reason =
      cancellations.some((d) => d.status === 1) || cancellationDate
        ? 'Cancelamento/distrato identificado no UAU.'
        : 'Distrato pendente ou desconhecido: requer conferência.';
  } else if (
    !base.contractFound ||
    Number(field(row, 'QuantidadeClientesNasFontes')) !== 1 ||
    field(row, 'CodCliente') == null ||
    positions.some((p) => p.status !== 0) ||
    receipts.some((p) => ![0, 1].includes(p.status))
  ) {
    state = 'review';
    reason = 'Situação do contrato ou das parcelas precisa de conferência.';
  } else if (overdue.length) state = 'overdue';
  else if (paid) state = 'paid';
  else if (
    previous?.state === 'paid' &&
    !previous.receipts.some(
      (old) =>
        old.status === 1 &&
        !receipts.some(
          (r) =>
            r.key === old.key &&
            r.status === 1 &&
            r.principalCents >= old.principalCents
        )
    )
  )
    state = 'paid';
  else if (previous && positions.length === 0) {
    state = 'review';
    reason = 'Sem parcelas abertas; pagamento não comprovado pela conciliação.';
  }
  const units = rows(row, 'UnidadesJson');
  const project = String(field(row, 'NomeObra') ?? base.work),
    company = String(base.company);
  const rule = setup.projectRules.find(
    (r) =>
      r.company === company && r.work.toUpperCase() === base.work.toUpperCase()
  );
  return {
    key: base.key,
    company,
    work: base.work,
    sale: base.sale,
    customer: base.customer,
    customerId:
      field(row, 'CodCliente') == null
        ? null
        : integer(field(row, 'CodCliente')),
    project,
    unit: units
      .map((u) =>
        String(field(u, 'Unidade') ?? field(u, 'DescricaoProduto') ?? '')
      )
      .filter(Boolean)
      .join(' · '),
    referenceDate: base.referenceDate,
    state,
    delay,
    overdueCents: overdue.reduce((sum, p) => sum + p.cents, 0),
    openCents: positions.reduce((sum, p) => sum + p.cents, 0),
    overdueCount: overdue.length,
    positions,
    receipts,
    maintenance,
    cancellationDate,
    cancellations,
    stageId:
      state === 'overdue'
        ? (stageForDelay(delay, stagesForProject(setup, company, base.work))
            ?.id ?? null)
        : null,
    ruleName: rule?.name ?? 'Régua padrão',
    reason,
  };
}
export function collectionEvents(
  previous: CollectionSnapshot | undefined,
  next: CollectionSnapshot
): CollectionEvent[] {
  if (!previous)
    return [
      {
        key: 'first',
        kind: 'first_seen',
        detail: { state: next.state, overdueCents: next.overdueCents },
      },
    ];
  const events: CollectionEvent[] = [];
  if (previous.state !== next.state)
    events.push({
      key: 'state',
      kind: 'state_changed',
      detail: { from: previous.state, to: next.state },
    });
  if (
    previous.overdueCents !== next.overdueCents ||
    previous.openCents !== next.openCents
  )
    events.push({
      key: 'balance',
      kind: 'balance_changed',
      detail: {
        fromOverdue: previous.overdueCents,
        toOverdue: next.overdueCents,
        fromOpen: previous.openCents,
        toOpen: next.openCents,
      },
    });
  if (previous.stageId !== next.stageId)
    events.push({
      key: 'stage',
      kind: 'stage_changed',
      detail: { from: previous.stageId, to: next.stageId, rule: next.ruleName },
    });
  for (const receipt of next.receipts) {
    const old = previous.receipts.find((r) => r.key === receipt.key);
    const delta = receipt.principalCents - (old?.principalCents ?? 0);
    if (delta !== 0)
      events.push({
        key: `receipt:${receipt.key}`,
        kind: delta > 0 ? 'receipt_confirmed' : 'receipt_reversed',
        detail: { receipt: receipt.key, principalDeltaCents: delta },
      });
  }
  for (const old of previous.receipts)
    if (old.status === 1 && !next.receipts.some((r) => r.key === old.key))
      events.push({
        key: `receipt:${old.key}`,
        kind: 'receipt_reversed',
        detail: { receipt: old.key, principalDeltaCents: -old.principalCents },
      });
  for (const item of next.maintenance)
    if (!previous.maintenance.some((old) => old.key === item.key))
      events.push({
        key: `maintenance:${item.key}`,
        kind: 'maintenance_detected',
        detail: item,
      });
  return events;
}
