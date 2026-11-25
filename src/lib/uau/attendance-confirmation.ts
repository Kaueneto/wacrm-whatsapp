import type { UauAttendance } from './finance-types';
import type { attendanceRequest } from './attendance-request';

/** This installation returns the new Num_atd as a positive Int32 on HTTP success. */
export function attendanceResponseId(input: unknown): number | null {
  let value = input;
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const response = input as Record<string, unknown>;
    if (
      response.Sucesso === false ||
      response._Sucesso === false ||
      (Array.isArray(response._ListaErros) && response._ListaErros.length)
    )
      return null;
    const key = Object.keys(response).find(
      (key) => key.toLowerCase() === 'num_atd'
    );
    value = key ? response[key] : undefined;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim()))
    value = Number(value.trim());
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= 2147483647
    ? value
    : null;
}

export function attendanceResponseOutcome(
  input: unknown
): 'success' | 'rejected' | 'unknown' {
  if (input === true) return 'success';
  if (input === false) return 'rejected';
  if (attendanceResponseId(input) !== null) return 'success';
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return 'unknown';
  const response = input as Record<string, unknown>;
  if (
    response.Sucesso === false ||
    response._Sucesso === false ||
    (Array.isArray(response._ListaErros) && response._ListaErros.length)
  )
    return 'rejected';
  if (
    response.Sucesso === true ||
    response._Sucesso === true ||
    Object.keys(response).length === 0
  )
    return 'success';
  return 'unknown';
}

const normalizeDescription = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Confirm an unfamiliar 2xx response by reading a new, uniquely matching ERP record.
 * Existing records can never prove this request succeeded. No write is repeated. */
export function matchingNewAttendance(
  baselineIds: number[],
  payload: ReturnType<typeof attendanceRequest>,
  records: UauAttendance[]
): UauAttendance | null {
  const baseline = new Set(baselineIds);
  const timestamp = Date.parse(payload.datacad_atd);
  const matches = records.filter(
    (record) =>
      !baseline.has(record.id) &&
      record.categoryCode.trim() === payload.codcateg_atd.trim() &&
      normalizeDescription(record.description) ===
        normalizeDescription(payload.descr_atd) &&
      record.createdBy?.trim().toUpperCase() === payload.usrcad_atd &&
      Math.abs(Date.parse(record.createdAt) - timestamp) <= 120_000
  );
  return matches.length === 1 ? matches[0] : null;
}
