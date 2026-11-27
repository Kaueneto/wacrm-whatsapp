import { UauError, type UauRead } from './client';

/** Read only the exact portfolio customer; discard all other personal fields. */
export async function loadUauPersonEmail(
  read: UauRead,
  personId: number
): Promise<string | null> {
  if (!Number.isSafeInteger(personId) || personId < 1 || personId > 2147483647)
    throw new UauError('Código do cliente inválido.', 400);
  // This endpoint returns person DTOs with nested address/individual/company
  // lists. The generic DataSet flattener discards their parent email fields.
  const rows = await read('Pessoas/ConsultarPessoasPorCondicao', {
    condicaoConsultarPessoa: `cod_pes = ${personId}`,
  });
  if (
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    !rows[0] ||
    Number(rows[0].CodigoPessoa) !== personId
  )
    throw new UauError(
      'O UAU não confirmou o cadastro do cliente para consultar o e-mail.',
      422
    );
  const email = rows[0].EmailPessoa;
  return typeof email === 'string' &&
    email.trim() &&
    email.trim().toLowerCase() !== 'null'
    ? email.trim()
    : null;
}
