import { uauRows } from './finance-normalize';
import { UauError } from './client';
import type { UauQueryParameter } from './query-parameters';
const flag = (value: unknown): boolean | null =>
  value === true ||
  value === 1 ||
  (typeof value === 'string' && /^(true|1)$/i.test(value))
    ? true
    : value === false ||
        value === 0 ||
        (typeof value === 'string' && /^(false|0)$/i.test(value))
      ? false
      : null;
// Tipo/Restrito/MultiSelecao are documented as object. Unknown structured values
// must not make a real parameter row disappear during generic DataSet extraction.
function preserveParameterRows(input: unknown): unknown {
  if (typeof input === 'string' && /^[\[{]/.test(input.trim())) {
    try {
      return preserveParameterRows(JSON.parse(input));
    } catch {
      return input;
    }
  }
  if (Array.isArray(input)) return input.map(preserveParameterRows);
  if (input && typeof input === 'object') {
    const entries = Object.entries(input);
    if (entries.some(([key]) => key.toLowerCase() === 'parametro'))
      return Object.fromEntries(
        entries.map(([key, value]) => [
          key,
          value && typeof value === 'object' ? null : value,
        ])
      );
    return Object.fromEntries(
      entries.map(([key, value]) => [key, preserveParameterRows(value)])
    );
  }
  return input;
}
export function normalizeQueryParameters(input: unknown): UauQueryParameter[] {
  const rows = uauRows(preserveParameterRows(input));
  if (rows.length > 50)
    throw new UauError('A consulta excede o limite de 50 parâmetros.', 422);
  const names = new Set<string>();
  return rows.map((row) => {
    const field = (name: string) =>
      row[
        Object.keys(row).find(
          (key) => key.toLowerCase() === name.toLowerCase()
        ) ?? name
      ];
    const name =
      typeof field('Parametro') === 'string'
        ? (field('Parametro') as string).trim()
        : '';
    if (!/^[\p{L}\p{N}_. -]{1,80}$/u.test(name))
      throw new UauError(
        'O UAU retornou um nome de parâmetro não reconhecido. Confira o cadastro da consulta.',
        422
      );
    if (names.has(name.toLowerCase()))
      throw new UauError('O UAU retornou parâmetros duplicados.', 422);
    names.add(name.toLowerCase());
    return {
      name,
      description:
        typeof field('Descricao') === 'string'
          ? (field('Descricao') as string).slice(0, 2000)
          : '',
      type:
        typeof field('Tipo') === 'string' || typeof field('Tipo') === 'number'
          ? String(field('Tipo')).slice(0, 100)
          : null,
      restricted: flag(field('Restrito')),
      multiple: flag(field('MultiSelecao')),
    };
  });
}
