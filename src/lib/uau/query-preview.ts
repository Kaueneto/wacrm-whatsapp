import { parseInternationalPhone } from '@/lib/whatsapp/phone-utils';

export type UauRow = Record<string, unknown>;
export type PhoneMode = 'international' | 'br-national' | 'br-local';
export interface PhoneMapping {
  column: string;
  mode: PhoneMode;
  dddColumn?: string;
  identityColumn?: string;
}
export interface PreviewField {
  variable: string;
  column: string;
  format: 'text' | 'money' | 'date';
}
export type UauRowStatus =
  'eligible' | 'invalid' | 'duplicates' | 'conflicts' | 'incomplete';
export interface UauRowAssessment {
  status: UauRowStatus;
  reason: string;
}

function isZeroPhone(digits: string, mode: PhoneMode) {
  return (
    /^(?:55)?0+$/.test(digits) ||
    (mode === 'international' && /^55\d{2}0{8,9}$/.test(digits)) ||
    (mode === 'br-national' && /^\d{2}0{8,9}$/.test(digits))
  );
}

function invalidPhoneReason(row: UauRow, mapping: PhoneMapping) {
  const value = scalar(row[mapping.column]);
  if (!value) return `Telefone vazio em ${mapping.column}.`;
  if (!/^\+?[\d().\s-]+$/.test(value))
    return `A coluna ${mapping.column} não contém um número de telefone.`;
  const digits = value.replace(/\D/g, '');
  if (isZeroPhone(digits, mapping.mode))
    return `Telefone preenchido com zeros em ${mapping.column}.`;
  if (
    mapping.mode === 'br-local' &&
    !/^[1-9]\d$/.test(scalar(row[mapping.dddColumn ?? '']))
  ) {
    return `DDD vazio ou inválido em ${mapping.dddColumn}.`;
  }
  return `O número em ${mapping.column} não corresponde ao formato selecionado.`;
}

const normalized = (name: string) =>
  name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
const isPhoneColumn = (name: string) =>
  /(?:whats|zap|celular|telefone|fone|mobile|phone)/.test(name) &&
  !/(?:ddd|cpf|cnpj|documento|ramal|email)/.test(name);

function scalar(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  return typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : '';
}

export function resolveUauPhone(
  row: UauRow,
  { column, mode, dddColumn }: PhoneMapping
) {
  const value = row[column];
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return null;
  const raw = scalar(value);
  if (!/^\+?[\d().\s-]+$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, '');
  if (isZeroPhone(digits, mode)) return null;
  if (mode === 'international') {
    if (digits.startsWith('55') && !/^55[1-9]\d\d{8,9}$/.test(digits))
      return null;
    return parseInternationalPhone(`+${digits}`);
  }
  if (raw.startsWith('+')) return null;
  const ddd = mode === 'br-local' && dddColumn ? scalar(row[dddColumn]) : '';
  if (
    mode === 'br-local' &&
    (!/^[1-9]\d$/.test(ddd) || !/^\d{8,9}$/.test(digits))
  )
    return null;
  const national = ddd + digits;
  if (!/^[1-9]\d\d{8,9}$/.test(national)) return null;
  return parseInternationalPhone(`+55${national}`);
}

function suggestPhone(rows: UauRow[], columns: string[]): PhoneMapping[] {
  const sample = rows.slice(0, 100);
  const keys = columns.map((column) => ({ column, key: normalized(column) }));
  const areaCodes = keys.filter(
    ({ key }) => key.startsWith('ddd') || key.endsWith('ddd')
  );
  const identityColumn = keys.find(({ key }) =>
    /^(codcliente|codigocliente|codpessoa|idcliente|idpessoa)$/.test(key)
  )?.column;
  const candidates: { mapping: PhoneMapping; score: number }[] = [];
  for (const { column, key } of keys) {
    if (!isPhoneColumn(key)) continue;
    const available = sample.map((row) => scalar(row[column])).filter(Boolean);
    if (!available.length) continue;
    const modes: PhoneMapping[] = [
      { column, mode: 'br-national', identityColumn },
    ];
    if (
      available.some((value) =>
        /^\+|^55\d{10,11}$/.test(value.replace(/[\s().-]/g, ''))
      )
    ) {
      modes.push({ column, mode: 'international', identityColumn });
    }
    for (const ddd of areaCodes)
      modes.push({
        column,
        mode: 'br-local',
        dddColumn: ddd.column,
        identityColumn,
      });
    for (const mapping of modes) {
      const matches = sample.filter((row) => {
        if (mapping.mode === 'international') {
          const compact = scalar(row[column]).replace(/[\s().-]/g, '');
          if (!/^\+|^55\d{10,11}$/.test(compact)) return false;
        }
        return !!resolveUauPhone(row, mapping);
      }).length;
      if (!matches) continue;
      const areaKey = normalized(mapping.dddColumn ?? '').replace(
        /^ddd|ddd$/g,
        ''
      );
      const matchingArea = areaKey && key.includes(areaKey) ? 12 : 0;
      const whatsappHint = /whats|zap/.test(key) ? 30 : 0;
      candidates.push({
        mapping,
        score: (matches / available.length) * 60 + matchingArea + whatsappHint,
      });
    }
  }
  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ mapping }) => mapping);
}

export function formatUauValue(value: unknown, format: PreviewField['format']) {
  const text = scalar(value);
  if (!text) return null;
  if (format === 'money') {
    const normalizedAmount = text.includes(',')
      ? text.replace(/\./g, '').replace(',', '.')
      : text;
    if (
      !/^-?\d+(?:\.\d+)?$/.test(normalizedAmount) ||
      !Number.isFinite(Number(normalizedAmount))
    )
      return null;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(Number(normalizedAmount));
  }
  if (format === 'date') {
    const parsed = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
    const iso = parsed
      ? `${parsed[3]}-${parsed[2]}-${parsed[1]}`
      : /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(text)
        ? text.slice(0, 10)
        : '';
    if (!iso) return null;
    const date = new Date(`${iso}T00:00:00Z`);
    return Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === iso
      ? iso.split('-').reverse().join('/')
      : null;
  }
  return text.slice(0, 240);
}

export function analyzeUauRows(
  rows: UauRow[],
  mapping?: PhoneMapping,
  fields: PreviewField[] = []
) {
  const columnNames = new Set<string>();
  for (const row of rows)
    for (const name of Object.keys(row)) columnNames.add(name);
  const columns = [...columnNames];
  const suggestions = suggestPhone(rows, columns);
  const phone = mapping ?? suggestions[0];
  const missingColumns = [
    ...new Set([
      phone?.column,
      phone?.dddColumn,
      phone?.identityColumn,
      ...fields.map(({ column }) => column),
    ]),
  ].filter(
    (column): column is string =>
      !!column && rows.length > 0 && !columns.includes(column)
  );
  const result = {
    columns,
    suggestions,
    phone,
    missingColumns,
    total: rows.length,
    eligible: 0,
    invalid: 0,
    duplicates: 0,
    conflicts: 0,
    incomplete: 0,
    assessments: [] as UauRowAssessment[],
    examples: [] as { phone: string; values: Record<string, string> }[],
  };
  if (!phone || missingColumns.length) return result;

  const groups = new Map<string, { row: UauRow; index: number }[]>();
  function mark(index: number, status: UauRowStatus, reason: string) {
    result.assessments[index] = { status, reason };
  }
  for (const [index, row] of rows.entries()) {
    const number = resolveUauPhone(row, phone);
    if (!number) {
      result.invalid++;
      mark(index, 'invalid', invalidPhoneReason(row, phone));
      continue;
    }
    const group = groups.get(number);
    if (group) group.push({ row, index });
    else groups.set(number, [{ row, index }]);
  }
  for (const [number, group] of groups) {
    const identityColumn = phone.identityColumn;
    const identities = identityColumn
      ? new Set(
          group.map(({ row }) => scalar(row[identityColumn])).filter(Boolean)
        )
      : null;
    const conflictingColumns = fields
      .filter(
        ({ column, format }) =>
          new Set(
            group
              .map(({ row }) => formatUauValue(row[column], format))
              .filter((value) => value !== null)
          ).size > 1
      )
      .map(({ column }) => column);
    const lines = group.map(({ index }) => index + 1);
    const lineHint =
      lines.length > 8
        ? `${lines.slice(0, 8).join(', ')} e mais ${lines.length - 8}`
        : lines.join(', ');
    const conflict =
      identities && identities.size > 1
        ? `O mesmo telefone está ligado a clientes diferentes em ${identityColumn}. Linhas ${lineHint}.`
        : conflictingColumns.length
          ? `O mesmo telefone tem valores diferentes para ${[...new Set(conflictingColumns)].join(', ')}. Linhas ${lineHint}. Confira os contratos ou parcelas.`
          : null;
    if (conflict) {
      result.conflicts += group.length;
      for (const { index } of group) mark(index, 'conflicts', conflict);
      continue;
    }
    let firstEligible: number | undefined;
    for (const { row, index } of group) {
      const values = fields.map((field) => ({
        ...field,
        value: formatUauValue(row[field.column], field.format),
      }));
      const incomplete = values
        .filter(({ value }) => value === null)
        .map(({ column }) => column);
      if (identityColumn && group.length > 1 && !scalar(row[identityColumn]))
        incomplete.push(identityColumn);
      if (incomplete.length) {
        result.incomplete++;
        mark(
          index,
          'incomplete',
          `Campos vazios ou fora do formato esperado: ${[...new Set(incomplete)].join(', ')}.`
        );
      } else if (firstEligible !== undefined) {
        result.duplicates++;
        mark(
          index,
          'duplicates',
          `Mesmo telefone da linha ${firstEligible + 1}. Pode ser outro contrato ou parcela do mesmo cliente.`
        );
      } else {
        firstEligible = index;
        result.eligible++;
        mark(
          index,
          'eligible',
          group.length > 1
            ? `Telefone válido. Também aparece nas linhas ${lineHint}.`
            : 'Telefone válido para esta prévia.'
        );
        if (result.examples.length < 5)
          result.examples.push({
            phone: `+${number.slice(0, 2)} •••• ${number.slice(-4)}`,
            values: Object.fromEntries(
              values.map(({ variable, value }) => [variable, value ?? ''])
            ),
          });
      }
    }
  }
  return result;
}

export type UauPreviewResult = ReturnType<typeof analyzeUauRows>;
