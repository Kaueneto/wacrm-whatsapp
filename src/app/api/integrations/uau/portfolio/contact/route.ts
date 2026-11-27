import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/ai/admin-client';
import { withUauReadSession } from '@/lib/uau/connection-store';
import { phones } from '@/lib/uau/finance-normalize';
import {
  uauDialablePhone,
  reconcileContactOptions,
  type CollectionContactOption,
} from '@/lib/collections/contact-options';
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation';
import { SendMessageError } from '@/lib/whatsapp/send-message';
import { getUauConnectionRevision } from '@/lib/uau/connection-store';
import { loadPortfolioSetup, projectInScope } from '@/lib/collections/sync';
import { createPortfolioPlan } from '@/lib/collections/query-plan';
import { snapshotFromUau } from '@/lib/collections/reconcile';
import { uauRows } from '@/lib/uau/finance-normalize';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { isUniqueViolation } from '@/lib/contacts/dedupe';
import type { CollectionSnapshot } from '@/lib/collections/portfolio-types';
import { createUauLinkSuggestion } from '@/lib/uau/link-suggestion';
import { loadUauPersonEmail } from '@/lib/uau/person-email';

/** Opens a CRM conversation only; never sends a WhatsApp message. */
async function handle(request: Request, open: boolean) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin');
    const limit = checkRateLimit(
      `portfolio:contact:${open ? 'open' : 'list'}:${accountId}`,
      {
        limit: open ? 20 : 120,
        windowMs: 60000,
      }
    );
    if (!limit.success) return rateLimitResponse(limit);
    const body = open
      ? await request.json().catch(() => null)
      : { contract: new URL(request.url).searchParams.get('contract') };
    if (typeof body?.contract !== 'string' || body.contract.length > 150)
      return Response.json(
        { error: 'Informe um contrato válido.' },
        { status: 400 }
      );
    const revision = await getUauConnectionRevision(accountId);
    const [stored, settings] = await Promise.all([
      supabase
        .from('collection_contracts')
        .select('data')
        .eq('account_id', accountId)
        .eq('source_revision', revision ?? '')
        .eq('contract_key', body.contract)
        .maybeSingle(),
      loadPortfolioSetup(supabase, accountId),
    ]);
    if (stored.error) throw stored.error;
    let contract = stored.data?.data as CollectionSnapshot | undefined;
    if (
      !contract ||
      !projectInScope(settings.setup, contract.company, contract.work)
    )
      return Response.json(
        { error: 'Contrato não encontrado no escopo atual.' },
        { status: 404 }
      );
    // Older imported snapshots predate the person identifier. Obtain it from
    // the exact sale, never through a name or partial document match.
    if (!contract.customerId) {
      const plan = await createPortfolioPlan(accountId, settings.setup);
      const rows = uauRows(
        await plan.execute('reconciliation', {
          contracts: [
            {
              company: Number(contract.company),
              work: contract.work,
              sale: contract.sale,
            },
          ],
        })
      );
      if (rows.length !== 1)
        return Response.json(
          {
            error: 'Não foi possível identificar o titular desta venda no UAU.',
          },
          { status: 422 }
        );
      const fresh = snapshotFromUau(rows[0], settings.setup, contract);
      if (fresh.key !== contract.key)
        return Response.json(
          { error: 'O UAU retornou outro contrato.' },
          { status: 422 }
        );
      contract = fresh;
    }
    if (!contract.customerId)
      return Response.json(
        { error: 'O UAU não informou o código do titular desta venda.' },
        { status: 422 }
      );
    const links = await supabaseAdmin()
      .from('contact_uau_links')
      .select('contact_id')
      .eq('account_id', accountId)
      .eq('connection_revision', revision ?? '')
      .eq('person_id', contract.customerId)
      .limit(100);
    if (links.error) throw links.error;
    const contactIds = links.data?.map((link) => link.contact_id) ?? [];
    const contacts = contactIds.length
      ? await supabase
          .from('contacts')
          .select('id,name,phone')
          .eq('account_id', accountId)
          .in('id', contactIds)
      : { data: [], error: null };
    if (contacts.error) throw contacts.error;
    const options: CollectionContactOption[] = (contacts.data ?? []).map(
      (contact) => ({
        id: 'crm:' + contact.id,
        phone: contact.phone,
        dialable: /^[1-9]\d{7,14}$/.test(contact.phone.replace(/\D/g, ''))
          ? contact.phone.replace(/\D/g, '')
          : null,
        source: 'CRM',
        primary: false,
        note: contact.name,
        contactId: contact.id,
      })
    );
    let warning: string | null = null;
    let email: string | null = null;
    let emailUnavailable = false;
    try {
      const uauContacts = await withUauReadSession(
        accountId,
        async (read, currentRevision) => {
          if (currentRevision !== revision) throw Error('Conexão alterada.');
          const [phoneResult, emailResult] = await Promise.allSettled([
            read('Pessoas/ConsultarTelefones', {
              Numero: contract!.customerId!,
            }).then(phones),
            open
              ? Promise.resolve(null)
              : loadUauPersonEmail(read, contract!.customerId!),
          ]);
          return { phoneResult, emailResult };
        }
      );
      if (uauContacts.emailResult.status === 'fulfilled')
        email = uauContacts.emailResult.value;
      else emailUnavailable = true;
      if (uauContacts.phoneResult.status === 'rejected')
        throw uauContacts.phoneResult.reason;
      options.push(
        ...uauContacts.phoneResult.value.map((phone, index) => ({
          id: 'uau:' + index + ':' + phone.number,
          phone: phone.number,
          dialable: uauDialablePhone(phone.number),
          source: 'UAU' as const,
          primary: phone.primary,
          note: phone.complement ?? null,
        }))
      );
    } catch {
      if (!open && !email) emailUnavailable = true;
      warning =
        'Não foi possível consultar os telefones do UAU. Os contatos vinculados no CRM continuam disponíveis.';
    }
    if ((await getUauConnectionRevision(accountId)) !== revision)
      return Response.json(
        { error: 'A conexão UAU mudou. Atualize a carteira.' },
        { status: 409 }
      );
    const reconciled = reconcileContactOptions(options);
    if (!open)
      return Response.json(
        { options: reconciled, email, emailUnavailable, warning },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    const chosen = reconciled.find((option) => option.id === body?.option);
    if (!chosen?.dialable)
      return Response.json(
        { error: 'Escolha um telefone válido do cliente.' },
        { status: 400 }
      );
    if (!chosen.contactId) {
      const resolved = await resolveConversationByPhone(
        supabase,
        accountId,
        '+' + chosen.dialable,
        contract.customer
      );
      return Response.json(
        {
          conversationId: resolved.conversationId,
          uauSuggestion: createUauLinkSuggestion({
            accountId,
            contactId: resolved.contactId,
            revision: revision!,
            personId: contract.customerId,
            personName: contract.customer,
            contractKey: contract.key,
          }),
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }
    const contactId = chosen.contactId;
    const find = () =>
      supabase
        .from('conversations')
        .select('id')
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .maybeSingle();
    const existing = await find();
    if (existing.error) throw existing.error;
    if (existing.data)
      return Response.json({ conversationId: existing.data.id });
    const created = await supabase
      .from('conversations')
      .insert({ account_id: accountId, user_id: userId, contact_id: contactId })
      .select('id')
      .single();
    if (created.error) {
      if (isUniqueViolation(created.error)) {
        const raced = await find();
        if (!raced.error && raced.data)
          return Response.json({ conversationId: raced.data.id });
      }
      throw created.error;
    }
    return Response.json({ conversationId: created.data.id });
  } catch (error) {
    if (error instanceof SendMessageError)
      return Response.json({ error: error.message }, { status: error.status });
    return toErrorResponse(error);
  }
}

export const GET = (request: Request) => handle(request, false);
export const POST = (request: Request) => handle(request, true);
