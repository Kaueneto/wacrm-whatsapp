import { Parser } from 'saxen';
import { UauError } from './client';
import type {
  UauContract,
  UauCustomer,
  UauInstallment,
  UauPhone,
} from './finance-types';
type Row = Record<string, unknown>;
/** Legacy UAU DataSets prepend a row describing CLR column types. */
export function isUauTypeRow(row: Row): boolean {
  const values = Object.values(row).filter(
    (value) => value !== null && value !== ''
  );
  return (
    values.length > 0 &&
    values.every(
      (value) =>
        typeof value === 'string' &&
        /^System\.[\w.`\[\]]+,\s*(?:mscorlib|System\.)/.test(value)
    )
  );
}
const badResponse = () =>
  new UauError(
    'O UAU retornou dados em formato inesperado. Confira a versão da integração.',
    502
  );

export function normalizeCpf(input: unknown): string {
  if (typeof input !== 'string' || !/^[\d.\-\s]+$/.test(input))
    throw new UauError('Informe um CPF válido.', 400);
  const cpf = input.replace(/\D/g, '');
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1+$/.test(cpf))
    throw new UauError('Informe um CPF válido.', 400);
  for (const count of [9, 10]) {
    const sum = [...cpf.slice(0, count)].reduce(
      (total, digit, index) => total + Number(digit) * (count + 1 - index),
      0
    );
    const digit = ((sum * 10) % 11) % 10;
    if (digit !== Number(cpf[count]))
      throw new UauError('Informe um CPF válido.', 400);
  }
  return cpf;
}
export const maskCpf = (cpf: string) =>
  `***.***.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
export function brazilDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  return ['year', 'month', 'day']
    .map((type) => parts.find((part) => part.type === type)?.value)
    .join('-');
}

/** UAU returns JSON tables and XML DataSets. Only records are extracted; no XML entities/DTD. */
export function uauRows(input: unknown): Row[] {
  if (typeof input === 'string') {
    const text = input.trim();
    if (!text) throw badResponse();
    if (text.startsWith('{') || text.startsWith('[')) {
      try {
        return uauRows(JSON.parse(text));
      } catch {
        throw badResponse();
      }
    }
    if (!text.startsWith('<') || /<!DOCTYPE|<!ENTITY/i.test(text))
      throw badResponse();
    const stack: {
      name: string;
      text: string;
      children: { name: string; text: string; leaf: boolean }[];
    }[] = [];
    const rows: Row[] = [];
    const parser = new Parser();
    parser.on('openTag', (name) => {
      if (stack.length > 32) throw badResponse();
      stack.push({ name: name.split(':').pop()!, text: '', children: [] });
    });
    parser.on('text', (text, decode) => {
      if (stack.length) stack.at(-1)!.text += decode(text);
    });
    parser.on('cdata', (text) => {
      if (stack.length) stack.at(-1)!.text += text;
    });
    parser.on('closeTag', () => {
      const node = stack.pop();
      if (!node) throw badResponse();
      if (node.children.length && node.children.every((child) => child.leaf)) {
        const row = Object.fromEntries(
          node.children.map((child) => [child.name, child.text])
        );
        if (!isUauTypeRow(row)) rows.push(row);
        if (rows.length > 10000) throw badResponse();
      }
      stack.at(-1)?.children.push({
        name: node.name,
        text: node.text,
        leaf: !node.children.length,
      });
    });
    parser.on('error', () => {
      throw badResponse();
    });
    try {
      parser.parse(text);
    } catch {
      throw badResponse();
    }
    if (stack.length) throw badResponse();
    return rows;
  }
  if (Array.isArray(input)) {
    if (
      !input.every(
        (row) => row && typeof row === 'object' && !Array.isArray(row)
      )
    )
      throw badResponse();
    return input.flatMap((row) => uauRows(row));
  }
  if (!input || typeof input !== 'object') throw badResponse();
  const row = input as Row;
  if (isUauTypeRow(row)) return [];
  const nested = Object.values(row).filter(
    (value) => Array.isArray(value) || (value && typeof value === 'object')
  );
  if (nested.length) return nested.flatMap(uauRows);
  return Object.keys(row).length ? [row] : [];
}
const field = (row: Row, name: string) =>
  row[
    Object.keys(row).find((key) => key.toLowerCase() === name.toLowerCase()) ??
      name
  ];
const text = (value: unknown) =>
  typeof value === 'string'
    ? value.trim()
    : typeof value === 'number' && Number.isFinite(value)
      ? String(value)
      : '';
const integer = (value: unknown) =>
  /^\d+$/.test(text(value)) && Number.isSafeInteger(Number(value))
    ? Number(value)
    : null;

export function customers(input: unknown, cpf: string): UauCustomer[] {
  const rows = uauRows(input);
  const found = rows
    .filter((row) => text(field(row, 'cpf_pes')).replace(/\D/g, '') === cpf)
    .map((row) => {
      const id = integer(field(row, 'cod_pes'));
      const name = text(field(row, 'nome_pes'));
      if (!id || !name) throw badResponse();
      const email =
        [field(row, 'Email_pes'), field(row, 'email')]
          .map(text)
          .find((value) => value && value.toLowerCase() !== 'null') || null;
      return { id, name, email };
    });
  if (rows.length && !found.length) throw badResponse();
  return [...new Map(found.map((person) => [person.id, person])).values()];
}
export function phones(input: unknown): UauPhone[] {
  return uauRows(input).map((row) => {
    const phone = text(field(row, 'Telefone'));
    const ddd = text(field(row, 'DDD'));
    const complement = text(field(row, 'Complemento'));
    if (!phone) throw badResponse();
    return {
      number: ddd ? `(${ddd}) ${phone}` : phone,
      complement:
        complement && complement.toLowerCase() !== 'null' ? complement : null,
      type: integer(field(row, 'Tipo')),
      primary: integer(field(row, 'Principal')) === 1,
    };
  });
}
export function contracts(input: unknown): UauContract[] {
  const grouped = new Map<string, UauContract>();
  for (const row of uauRows(input)) {
    const company = integer(field(row, 'Empresa'));
    const project = text(field(row, 'Obra'));
    const sale = integer(field(row, 'Venda'));
    if (company === null || !project || sale === null) throw badResponse();
    const key = JSON.stringify([company, project, sale]);
    const contract = grouped.get(key) ?? {
      key,
      company,
      project,
      sale,
      status: integer(field(row, 'StatusVenda')),
      units: [],
    };
    const unit = [
      text(field(row, 'DescPerson')),
      text(field(row, 'IdentificadorUnid')),
    ]
      .filter(Boolean)
      .join(' · ');
    if (unit && !contract.units.includes(unit)) contract.units.push(unit);
    if (unit) {
      const detail = {
        description: text(field(row, 'DescPerson')),
        identifier: text(field(row, 'IdentificadorUnid')),
      };
      contract.unitDetails ??= [];
      if (
        !contract.unitDetails.some(
          (item) =>
            item.description === detail.description &&
            item.identifier === detail.identifier
        )
      )
        contract.unitDetails.push(detail);
    }
    grouped.set(key, contract);
  }
  return [...grouped.values()];
}
function date(value: unknown): string | null {
  const raw = text(value);
  const ms = /^\/Date\((-?\d+)(?:[+-]\d+)?\)\/$/.exec(raw);
  const normalized = ms
    ? brazilDate(new Date(Number(ms[1])))
    : raw.slice(0, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(normalized) ||
    !Number.isFinite(Date.parse(normalized)) ||
    new Date(normalized).toISOString().slice(0, 10) !== normalized ||
    normalized < '1900-01-01'
  )
    return null;
  return normalized;
}
function cents(value: unknown): number {
  const raw = text(value);
  if (!raw) throw badResponse();
  const amount = Number(
    raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw
  );
  const result = Math.round(amount * 100);
  if (!Number.isSafeInteger(result)) throw badResponse();
  return result;
}
export function openInstallments(
  input: unknown,
  contract: UauContract,
  today: string
): UauInstallment[] {
  // The installed API returns a direct array although Swagger describes {Vendas}.
  const sales = Array.isArray(input)
    ? input
    : input && typeof input === 'object'
      ? (input as { Vendas?: unknown }).Vendas
      : null;
  if (
    !Array.isArray(sales) ||
    sales.some(
      (sale) => !sale || typeof sale !== 'object' || Array.isArray(sale)
    )
  )
    throw badResponse();
  const found = sales.filter(
    (sale) =>
      Number(sale.Empresa) === contract.company &&
      sale.Obra === contract.project &&
      Number(sale.Venda) === contract.sale
  );
  return found
    .flatMap((sale) => {
      if (!Array.isArray(sale.ParcelasVenda)) throw badResponse();
      return sale.ParcelasVenda.map((row: Row) => {
        const dueDate = date(row.DataVencimento);
        if (!dueDate || !text(row.NumParcela)) throw badResponse();
        return {
          key: `${text(row.NumGeralParcela)}:${text(row.NumParcela)}:${text(row.TipoParcela)}`,
          number: text(row.NumParcela),
          type: text(row.TipoParcela),
          dueDate,
          paidDate: null,
          amountCents: cents(row.ValorParcela),
          daysOverdue: Math.max(
            0,
            Math.round((Date.parse(today) - Date.parse(dueDate)) / 86400000)
          ),
        };
      });
    })
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
}
const optionalCents = (value: unknown) =>
  value === undefined || value === null || value === 'null' || value === ''
    ? null
    : cents(value);

export function receivedInstallments(
  input: unknown,
  contract: UauContract
): UauInstallment[] {
  const rows = uauRows(input);
  const receipts = rows.filter((row) => field(row, 'Valor_rec') !== undefined);
  if (rows.length && !receipts.length) throw badResponse();
  return receipts
    .map((row) => {
      if (
        Number(field(row, 'Empresa_rec')) !== contract.company ||
        text(field(row, 'Obra_rec')) !== contract.project ||
        Number(field(row, 'NumVend_rec')) !== contract.sale
      )
        throw badResponse();
      return {
        key: `${text(field(row, 'NumParcGer_rec'))}:${text(field(row, 'Tipo_rec'))}:${text(field(row, 'NumReceb_rec'))}`,
        number: text(field(row, 'NumParc_rec')),
        type: text(field(row, 'Tipo_rec')),
        dueDate: date(field(row, 'DataVenci_rec') ?? field(row, 'Data_rec')),
        paidDate: date(
          field(row, 'DataRec') ??
            (field(row, 'DataVenci_rec') !== undefined
              ? field(row, 'Data_rec')
              : null)
        ),
        amountCents: cents(field(row, 'Valor_rec')),
        correctionCents: optionalCents(field(row, 'VlCorrecao_rec')),
        interestCents: optionalCents(field(row, 'VlJurosParc_rec')),
        lateInterestCents: optionalCents(field(row, 'VlJuros_rec')),
        fineCents: optionalCents(field(row, 'VlMulta_rec')),
        discountCents: optionalCents(field(row, 'VlDesconto_rec')),
        daysOverdue: 0,
      };
    })
    .sort((a, b) => (b.paidDate ?? '').localeCompare(a.paidDate ?? ''));
}

/** Detailed receivables are scoped by company, project and sale, never by phone. */
export function detailedOpenInstallments(
  input: unknown,
  contract: UauContract,
  today: string
): UauInstallment[] {
  const optionalText = (value: unknown) =>
    value === 'null' ? null : text(value) || null;
  return uauRows(input)
    .map((row) => {
      if (
        Number(field(row, 'Empresa_prc')) !== contract.company ||
        text(field(row, 'Obra_prc')) !== contract.project ||
        Number(field(row, 'NumVend_prc')) !== contract.sale
      )
        throw badResponse();
      const originalDueDate = date(field(row, 'Data_prc'));
      // Classify and age receivables by the original contractual due date.
      const dueDate = originalDueDate;
      const number = text(field(row, 'NumParc_prc'));
      if (!originalDueDate || !dueDate || !number) throw badResponse();
      return {
        key: [field(row, 'NumParcGer_prc'), number, field(row, 'Tipo_prc')]
          .map(text)
          .join(':'),
        number,
        type: text(field(row, 'Tipo_prc')),
        description:
          optionalText(field(row, 'Descricao_par')) ??
          optionalText(field(row, 'Descr_ctp')),
        dueDate,
        originalDueDate,
        extensionDate: date(field(row, 'DataPror_prc')),
        paidDate: null,
        // Keep the ERP's calculated amount verbatim. Never add charges to it again.
        amountCents: cents(field(row, 'ValorReaj')),
        principalCents: cents(field(row, 'Valor_prc')),
        adjustmentIndex: optionalText(field(row, 'IdxReaj_prc')),
        correctionCents: optionalCents(field(row, 'vlrCorrecao')),
        lateCorrectionCents: optionalCents(field(row, 'vlrCorrecaoAtra')),
        interestCents: optionalCents(field(row, 'vlrJurosParcela')),
        lateInterestCents: optionalCents(field(row, 'vlrJurosAtraso')),
        fineCents: optionalCents(field(row, 'ValorMulta')),
        discountCents: optionalCents(field(row, 'vlrDescAdiantamento')),
        daysOverdue: Math.max(
          0,
          Math.round((Date.parse(today) - Date.parse(dueDate)) / 86400000)
        ),
      };
    })
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
}
