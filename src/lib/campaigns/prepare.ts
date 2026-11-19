import type { SupabaseClient } from '@supabase/supabase-js';
import { decrypt } from '@/lib/whatsapp/encryption';
import { parseInternationalPhone } from '@/lib/whatsapp/phone-utils';
import { fetchAllPages, fetchAllInChunks } from '@/lib/supabase/paged-query';
import {
  fetchTaggedContactIds,
  fetchCustomFieldContactIds,
} from '@/lib/broadcast-audience';
import { findOrCreateContact } from '@/lib/api/v1/contacts';
import { buildSendComponents } from '@/lib/whatsapp/template-send-builder';
import type { Contact, MessageTemplate } from '@/types';
import {
  resolveVariables,
  validateDefinition,
  type CampaignDefinition,
} from './definition';

export async function enqueueDefinition(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  name: string,
  definition: CampaignDefinition,
  campaignId?: string,
  scheduled?: { lease: string; nextRun: string | null },
  requestKey?: string
) {
  validateDefinition(definition);
  if (!name.trim()) throw new Error('Informe o nome.');
  const { data: config, error: configError } = await db
    .from('whatsapp_config')
    .select('*')
    .eq('account_id', accountId)
    .single();
  if (configError || !config?.waba_id)
    throw new Error('Configure a conexão com o WhatsApp.');
  const { data: template, error: templateError } = await db
    .from('message_templates')
    .select('*')
    .eq('account_id', accountId)
    .eq('id', definition.templateId)
    .single();
  if (templateError || !template || template.status !== 'APPROVED')
    throw new Error('Escolha um template aprovado.');
  // Verify ownership against the current WABA. Old local catalog entries must
  // never silently use a template from the previous test connection.
  const url = new URL(
    `https://graph.facebook.com/v25.0/${config.waba_id}/message_templates`
  );
  url.searchParams.set('name', template.name);
  url.searchParams.set('fields', 'id,name,language,status');
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${decrypt(config.access_token)}` },
    signal: AbortSignal.timeout(15000),
  });
  const remote = await response.json();
  if (!response.ok)
    throw new Error(
      'Não foi possível validar o template com a Meta. Confira a conexão.'
    );
  if (
    !remote.data?.some(
      (r: { id: string; language: string; status: string }) =>
        r.id === template.meta_template_id &&
        r.language === template.language &&
        r.status === 'APPROVED'
    )
  )
    throw new Error(
      'Este template não está aprovado na conta WhatsApp atual. Sincronize os modelos.'
    );

  const audience = definition.audience;
  let contacts: Contact[];
  if (audience.type === 'csv') {
    const ids: string[] = [];
    for (const row of audience.csvContacts ?? []) {
      if (!parseInternationalPhone(row.phone))
        throw new Error('CSV contém telefone inválido. Use +DDI e DDD.');
      const result = await findOrCreateContact(db, accountId, userId, {
        phone: row.phone,
        name: row.name,
      });
      ids.push(result.id);
    }
    contacts = await fetchAllInChunks<Contact, string>(
      [...new Set(ids)],
      (slice, from, to) =>
        db
          .from('contacts')
          .select('*')
          .eq('account_id', accountId)
          .in('id', slice)
          .order('id')
          .range(from, to)
    );
  } else {
    contacts = await fetchAllPages<Contact>((from, to) =>
      db
        .from('contacts')
        .select('*')
        .eq('account_id', accountId)
        .order('id')
        .range(from, to)
    );
    if (audience.type === 'tags') {
      const ids = await fetchTaggedContactIds(db, audience.tagIds ?? []);
      contacts = contacts.filter((c) => ids.has(c.id));
    }
    if (audience.type === 'custom_field' && audience.customField) {
      const ids = await fetchCustomFieldContactIds(db, audience.customField);
      contacts = contacts.filter((c) => ids.has(c.id));
    }
  }
  if (audience.excludeTagIds?.length) {
    const ids = await fetchTaggedContactIds(db, audience.excludeTagIds);
    contacts = contacts.filter((c) => !ids.has(c.id));
  }
  const values = await fetchAllInChunks<
    { contact_id: string; custom_field_id: string; value: string },
    string
  >(
    contacts.map((c) => c.id),
    (slice, from, to) =>
      db
        .from('contact_custom_values')
        .select('contact_id,custom_field_id,value')
        .in('contact_id', slice)
        .order('id')
        .range(from, to)
  );
  const index = new Map<string, Map<string, string>>();
  for (const v of values) {
    if (!index.has(v.contact_id)) index.set(v.contact_id, new Map());
    index.get(v.contact_id)!.set(v.custom_field_id, v.value);
  }
  const seen = new Set<string>();
  let invalid = 0;
  let duplicates = 0;
  const recipients = [];
  for (const contact of contacts) {
    const phone = parseInternationalPhone(contact.phone);
    if (!phone) {
      invalid++;
      continue;
    }
    if (seen.has(phone)) {
      duplicates++;
      continue;
    }
    seen.add(phone);
    const params = resolveVariables(
      definition.variables,
      contact,
      index.get(contact.id)
    );
    buildSendComponents(template as MessageTemplate, {
      body: params,
      headerMediaUrl: definition.headerMediaUrl,
    });
    recipients.push({
      contact_id: contact.id,
      phone: `+${phone}`,
      name: contact.name ?? '',
      params,
    });
  }
  if (!recipients.length)
    throw new Error('Nenhum destinatário elegível com telefone válido.');
  const { data: id, error } = await db.rpc('enqueue_broadcast', {
    p_account: accountId,
    p_user: userId,
    p_name: name.trim(),
    p_template: template,
    p_phone: config.phone_number_id,
    p_waba: config.waba_id,
    p_recipients: recipients,
    p_audience: audience,
    p_variables: definition.variables,
    p_media: definition.headerMediaUrl ?? null,
    p_campaign: campaignId ?? null,
    p_schedule_lease: scheduled?.lease ?? null,
    p_next_run: scheduled?.nextRun ?? null,
    p_request: requestKey ?? null,
  });
  if (error)
    throw new Error(
      error.message.includes('unfinished')
        ? 'Esta campanha já tem um disparo em andamento.'
        : 'Não foi possível enfileirar o disparo.'
    );
  return {
    broadcastId: id as string,
    total: recipients.length,
    invalid,
    duplicates,
  };
}
