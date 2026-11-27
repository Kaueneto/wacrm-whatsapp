import {
  requireRole,
  toErrorResponse,
  type AccountContext,
} from '@/lib/auth/account';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { isUuid } from '@/lib/api/v1/pagination';
import { encrypt, decrypt } from '@/lib/whatsapp/encryption';
import { UauError } from '@/lib/uau/client';
import { uauFinanceCache } from '@/lib/uau/finance-cache';
import { createHash } from 'node:crypto';
import {
  getUauConnectionRevision,
  withUauReadSession,
} from '@/lib/uau/connection-store';
import { normalizeCpf } from '@/lib/uau/finance-normalize';
import { attendanceUserNames } from '@/lib/uau/attendance-user-names';
import {
  findUauCustomers,
  loadContactFinance,
} from '@/lib/uau/contact-finance';
import {
  getContactUauLink,
  removeContactUauLink,
  saveContactUauLink,
} from '@/lib/uau/contact-link-store';
import { readUauLinkSuggestion } from '@/lib/uau/link-suggestion';

export const runtime = 'nodejs';
type Context = { params: Promise<{ contactId: string }> };
const respond = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
async function scope(
  context: Context
): Promise<(AccountContext & { contactId: string }) | { limited: Response }> {
  const auth = await requireRole('agent');
  const { contactId } = await context.params;
  if (!isUuid(contactId)) throw new UauError('Contato inválido.', 400);
  // RLS checks the acting agent's team/assignment, not just account membership.
  const { data, error } = await auth.supabase
    .from('contacts')
    .select('id')
    .eq('id', contactId)
    .eq('account_id', auth.accountId)
    .maybeSingle();
  if (error)
    throw new UauError('Não foi possível conferir o acesso ao contato.', 503);
  if (!data) throw new UauError('Contato não encontrado ou sem acesso.', 404);
  const limit = checkRateLimit(`uau:finance:${auth.accountId}:${auth.userId}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!limit.success) return { limited: rateLimitResponse(limit) };
  return { ...auth, contactId };
}
function failed(error: unknown) {
  if (error instanceof UauError)
    return respond(
      { error: error.message },
      [400, 403, 404, 409, 422, 503].includes(error.status) ? error.status : 502
    );
  return toErrorResponse(error);
}
async function readSaved(
  auth: Awaited<ReturnType<typeof scope>>,
  selectedKey?: string,
  force = false
) {
  if ('limited' in auth) return auth.limited;
  const link = await getContactUauLink(auth.accountId, auth.contactId);
  if (!link) return respond({ linked: false });
  const revision = await getUauConnectionRevision(auth.accountId);
  if (!revision || link.connection_revision !== revision)
    return respond({ linked: false, connectionChanged: true });
  // A changed document/link or ERP configuration cannot reuse an earlier snapshot.
  const fingerprint = createHash('sha256')
    .update(link.document_encrypted)
    .digest('hex');
  const cacheScope = JSON.stringify([
    'phone-complement-v7',
    auth.accountId,
    auth.userId,
    auth.contactId,
    link.person_id,
    revision,
    fingerprint,
  ]);
  const cached = force ? null : uauFinanceCache.get(cacheScope, selectedKey);
  const result =
    cached ??
    (await uauFinanceCache.load(
      cacheScope,
      selectedKey,
      () =>
        withUauReadSession(auth.accountId, async (read, currentRevision) => {
          if (revision !== currentRevision)
            throw new UauError(
              'A conexão UAU mudou. Confira o vínculo e tente novamente.',
              409
            );
          return loadContactFinance(
            read,
            decrypt(link.document_encrypted),
            link.person_id,
            selectedKey
          );
        }),
      force
    ));
  return respond({
    ...(await attendanceUserNames(auth.accountId, revision, result)),
    cacheStatus: cached ? 'hit' : force ? 'refreshed' : 'miss',
  });
}
export async function GET(_request: Request, context: Context) {
  try {
    return await readSaved(await scope(context));
  } catch (error) {
    return failed(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const auth = await scope(context);
    if ('limited' in auth) return auth.limited;
    const body = await request.json().catch(() => null);
    if (body?.action === 'suggestion') {
      const suggestion = readUauLinkSuggestion(body.token, {
        accountId: auth.accountId, contactId: auth.contactId,
        revision: await getUauConnectionRevision(auth.accountId),
      });
      return respond({ suggestion });
    }
    if (body?.action === 'refresh' || body?.action === 'select') {
      if (
        body.contractKey !== undefined &&
        (typeof body.contractKey !== 'string' || body.contractKey.length > 200)
      )
        throw new UauError('Contrato inválido.', 400);
      return await readSaved(auth, body.contractKey, body.action === 'refresh');
    }
    if (body?.action !== 'lookup')
      throw new UauError('Consulta inválida.', 400);
    const cpf = normalizeCpf(body.cpf);
    return await withUauReadSession(auth.accountId, async (read, revision) => {
      const suggestion = body.suggestionToken === undefined ? null : readUauLinkSuggestion(body.suggestionToken, {
        accountId: auth.accountId, contactId: auth.contactId, revision,
      });
      const candidates = await findUauCustomers(read, cpf);
      return respond({ candidates: suggestion ? candidates.filter(person => person.id === suggestion.personId) : candidates });
    });
  } catch (error) {
    return failed(error);
  }
}
export async function PUT(request: Request, context: Context) {
  try {
    const auth = await scope(context);
    if ('limited' in auth) return auth.limited;
    const body = await request.json().catch(() => null);
    const cpf = normalizeCpf(body?.cpf);
    if (!Number.isSafeInteger(body?.personId) || body.personId < 1)
      throw new UauError('Selecione o cadastro do cliente.', 400);
    return await withUauReadSession(auth.accountId, async (read, revision) => {
      if (body.suggestionToken !== undefined) {
        const suggestion = readUauLinkSuggestion(body.suggestionToken, {
          accountId: auth.accountId, contactId: auth.contactId, revision,
        });
        if (body.personId !== suggestion.personId)
          throw new UauError('O cadastro selecionado não corresponde à sugestão.', 409);
        const existing = await getContactUauLink(auth.accountId, auth.contactId);
        if (existing && existing.connection_revision === revision && existing.person_id !== suggestion.personId)
          throw new UauError('Este contato já tem outro vínculo UAU. Atualize o painel e confira antes de alterar.', 409);
      }
      const person = (await findUauCustomers(read, cpf)).find(
        (person) => person.id === body.personId
      );
      if (!person)
        throw new UauError(
          'O cliente selecionado não pertence ao CPF informado.',
          409
        );
      await saveContactUauLink(
        {
          account_id: auth.accountId,
          contact_id: auth.contactId,
          document_encrypted: encrypt(cpf),
          person_id: person.id,
          person_name: person.name,
          connection_revision: revision,
        },
        auth.userId
      );
      return respond({ linked: true });
    });
  } catch (error) {
    return failed(error);
  }
}
export async function DELETE(_request: Request, context: Context) {
  try {
    const auth = await scope(context);
    if ('limited' in auth) return auth.limited;
    await removeContactUauLink(auth.accountId, auth.contactId);
    return respond({ linked: false });
  } catch (error) {
    return failed(error);
  }
}
