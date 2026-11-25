import { UauError } from './client';
import { uauRows } from './finance-normalize';
import type { UauAttendance } from './finance-types';

function timestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim() || value === 'null')
    return null;
  // UAU dates without an offset refer to the ERP's Brazilian local time.
  const date = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}-03:00`;
  return Number.isFinite(Date.parse(date)) ? date : null;
}
export function normalizeAttendances(input: unknown): UauAttendance[] {
  const entries = uauRows(input).map((row) => {
    const id = Number(row.Num_atd);
    const createdAt = timestamp(row.DataCad_atd);
    if (!Number.isSafeInteger(id) || id < 1 || !createdAt)
      throw new UauError('Formato de atendimento UAU não reconhecido.', 502);
    const description =
      typeof row.Descr_atd === 'string'
        ? row.Descr_atd.replace(/\r\n?/g, '\n')
            .replace(/[\t ]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
        : '';
    return {
      id,
      createdAt,
      closedAt: timestamp(row.DataFim_atd),
      description,
      createdBy: userText(
        row[
          Object.keys(row).find((key) => key.toLowerCase() === 'usrcad_atd') ??
            'UsrCad_atd'
        ]
      ),
      responsible: userText(
        row[
          Object.keys(row).find(
            (key) => key.toLowerCase() === 'usrrespon_atd'
          ) ?? 'UsrRespon_atd'
        ]
      ),
      category: typeof row.Desc_cger === 'string' ? row.Desc_cger.trim() : '',
      categoryCode:
        typeof row.CodCateg_atd === 'string' ? row.CodCateg_atd : '',
      statusCode:
        row.Status_atd === null || row.Status_atd === undefined
          ? null
          : Number(row.Status_atd),
    };
  });
  return [...new Map(entries.map((entry) => [entry.id, entry])).values()].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
  );
}

function userText(value: unknown): string | null {
  return typeof value === 'string' &&
    value.trim() &&
    value.trim().toLowerCase() !== 'null'
    ? value.trim()
    : null;
}
