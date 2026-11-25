/** Safe metadata only; parameter values are saved separately in the encrypted audience. */
export interface UauQueryParameter {
  name: string;
  description: string;
  type: string | null;
  restricted: boolean | null;
  multiple: boolean | null;
}
export function mergeQueryParameterValues(
  definitions: UauQueryParameter[],
  previous: { name: string; value: string }[]
) {
  const values = new Map(
    previous.map((parameter) => [
      parameter.name.trim().toLocaleLowerCase('pt-BR'),
      parameter.value,
    ])
  );
  return definitions.map((parameter) => ({
    name: parameter.name,
    value: values.get(parameter.name.trim().toLocaleLowerCase('pt-BR')) ?? '',
  }));
}

/** Match the current ERP schema before executing, never silently dropping a filter. */
export function resolveQueryParameterValues(
  definitions: UauQueryParameter[],
  supplied: { name: string; value: string }[]
) {
  const expected = new Set(
    definitions.map((parameter) => parameter.name.trim().toLowerCase())
  );
  if (
    supplied.some(
      (parameter) => !expected.has(parameter.name.trim().toLowerCase())
    )
  )
    throw new Error(
      'Os parâmetros da consulta mudaram. Busque os parâmetros novamente.'
    );
  const values = mergeQueryParameterValues(definitions, supplied);
  const missing = values.filter((parameter) => !parameter.value.trim());
  if (missing.length)
    throw new Error(
      'Preencha os parâmetros obrigatórios: ' +
        missing.map((parameter) => parameter.name).join(', ') +
        '.'
    );
  return values.map((parameter) => ({
    ...parameter,
    value: parameter.value.trim(),
  }));
}
