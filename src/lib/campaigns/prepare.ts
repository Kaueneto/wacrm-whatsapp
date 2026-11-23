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
import { verifyCampaignTemplate } from '@/lib/whatsapp/verify-campaign-template';
import type { Contact, MessageTemplate } from '@/types';
import { extractTemplateVariables } from '@/lib/whatsapp/template-validators';
import {
  isUauCampaignDefinition,
  isUauDraftAudience,
  type UauCampaignDefinition,
} from '@/lib/uau/campaign-draft';
import { runSavedUauQuery } from '@/lib/uau/connection-store';
import {
  analyzeUauRows,
  formatUauValue,
  resolveUauPhone,
} from '@/lib/uau/query-preview';
import {
  resolveVariables,
  validateDefinition,
  type CampaignDefinition,
} from './definition';

export class EmptyUauAudienceError extends Error {}

async function departmentContacts(
  db: SupabaseClient,
  accountId: string,
  contactIds: string[],
  campaignId?: string
) {
  if (!campaignId) return null;
  const { data: campaign, error } = await db
    .from('campaigns')
    .select('department_id')
    .eq('id', campaignId)
    .eq('account_id', accountId)
    .single();
  if (error || !campaign)
    throw new Error('Não foi possível conferir o departamento da campanha.');
  if (!campaign.department_id) return null;
  const scoped = await fetchAllInChunks<
    { id: string; contact_id: string },
    string
  >(contactIds, (slice, from, to) =>
    db
      .from('conversations')
      .select(
        'id,contact_id,team:teams!conversations_team_account_fk!inner(id)'
      )
      .eq('account_id', accountId)
      .eq('team.department_id', campaign.department_id)
      .in('contact_id', slice)
      .order('id')
      .range(from, to)
  );
  return new Set(scoped.map(({ contact_id }) => contact_id));
}

async function prepareUauRecipients(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  definition: UauCampaignDefinition,
  template: MessageTemplate,
  campaignId?: string
) {
  const { parametersEncrypted, ...storedAudience } = definition.audience;
  const audience = {
    ...storedAudience,
    parameters: parametersEncrypted
      ? JSON.parse(decrypt(parametersEncrypted))
      : [],
  };
  if (!isUauDraftAudience(audience))
    throw new Error('Confira a configuração da consulta UAU.');
  const keys = extractTemplateVariables(template.body_text);
  const fieldsByKey = new Map(
    audience.fields.map((field) => [field.variable, field])
  );
  if (
    keys.length !== audience.fields.length ||
    keys.some((key) => !fieldsByKey.has(key))
  )
    throw new Error(
      'O template mudou. Revise o mapeamento de variáveis da campanha.'
    );
  const rows = await runSavedUauQuery(accountId, {
    Id: audience.queryId,
    Personalizado: audience.personalized,
    Parameters: audience.parameters.flatMap(({ name, value }) => [
      name.trim(),
      value.trim(),
    ]),
  });
  const analysis = analyzeUauRows(rows, audience.phone, audience.fields);
  if (analysis.missingColumns.length)
    throw new Error(
      `A consulta UAU não retornou as colunas: ${analysis.missingColumns.join(', ')}.`
    );
  if (!analysis.eligible)
    throw new EmptyUauAudienceError(
      'A consulta UAU não retornou destinatários elegíveis. Confira a prévia da campanha.'
    );

  const candidates = rows.flatMap((row, index) => {
    if (analysis.assessments[index]?.status !== 'eligible') return [];
    const digits = resolveUauPhone(row, audience.phone);
    const params = keys.map((key) => {
      const field = fieldsByKey.get(key);
      return field
        ? (formatUauValue(row[field.column], field.format) ?? '')
        : '';
    });
    if (!digits || params.some((value) => !value))
      throw new Error('Revise os telefones e campos mapeados da consulta UAU.');
    buildSendComponents(template, { body: params });
    const rawName = row.Cliente ?? row.NomeCliente;
    const name =
      typeof rawName === 'string' ? rawName.trim().slice(0, 240) : '';
    return [{ phone: `+${digits}`, name, params }];
  });
  const recipients = [];
  for (let offset = 0; offset < candidates.length; offset += 20) {
    const batch = await Promise.all(
      candidates.slice(offset, offset + 20).map(async (candidate) => {
        const contact = await findOrCreateContact(db, accountId, userId, {
          phone: candidate.phone,
          name: candidate.name || undefined,
        });
        return { contact_id: contact.id, ...candidate };
      })
    );
    recipients.push(...batch);
  }
  if (new Set(recipients.map((r) => r.contact_id)).size !== recipients.length)
    throw new Error(
      'A consulta trouxe números diferentes associados ao mesmo contato. Revise a prévia da campanha.'
    );
  const excluded = await fetchTaggedContactIds(
    db,
    audience.excludeTagIds ?? []
  );
  const scoped = await departmentContacts(
    db,
    accountId,
    recipients.map((r) => r.contact_id),
    campaignId
  );
  const eligible = recipients.filter(
    (r) => !excluded.has(r.contact_id) && (!scoped || scoped.has(r.contact_id))
  );
  if (!eligible.length)
    throw new EmptyUauAudienceError(
      'Nenhum destinatário do UAU atende aos filtros da campanha.'
    );
  return {
    recipients: eligible,
    invalid: analysis.invalid + analysis.incomplete + analysis.conflicts,
    duplicates: analysis.duplicates,
  };
}

export async function enqueueDefinition(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  name: string,
  definition: CampaignDefinition | UauCampaignDefinition,
  campaignId?: string,
  scheduled?: { lease: string; nextRun: string | null },
  requestKey?: string
) {
  const uau = isUauCampaignDefinition(definition);
  if (!uau) validateDefinition(definition);
  if (!name.trim()) throw new Error('Informe o nome.');
  const { data: config, error: configError } = await db
    .from('whatsapp_config')
    .select('*')
    .eq('account_id', accountId)
    .single();
  if (configError || !config?.waba_id)
    throw new Error('Configure a conexão com o WhatsApp.');
  const { data: localTemplate, error: templateError } = await db
    .from('message_templates')
    .select('*')
    .eq('account_id', accountId)
    .eq('id', definition.templateId)
    .single();
  if (templateError || !localTemplate || localTemplate.status !== 'APPROVED')
    throw new Error('Escolha um template aprovado.');
  const template = await verifyCampaignTemplate(
    localTemplate,
    config.waba_id,
    decrypt(config.access_token)
  );

  const prepared = uau
    ? await prepareUauRecipients(
        db,
        accountId,
        userId,
        definition,
        template,
        campaignId
      )
    : await prepareCrmRecipients(
        db,
        accountId,
        userId,
        definition,
        template,
        campaignId
      );
  const { recipients, invalid, duplicates } = prepared;
  const { data: id, error } = await db.rpc('enqueue_broadcast', {
    p_account: accountId,
    p_user: userId,
    p_name: name.trim(),
    p_template: template,
    p_phone: config.phone_number_id,
    p_waba: config.waba_id,
    p_recipients: recipients,
    p_audience: uau
      ? { type: 'uau', queryId: definition.audience.queryId }
      : definition.audience,
    p_variables: uau ? {} : definition.variables,
    p_media: uau ? null : (definition.headerMediaUrl ?? null),
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

async function prepareCrmRecipients(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  definition: CampaignDefinition,
  template: MessageTemplate,
  campaignId?: string
) {
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
  const scoped = await departmentContacts(
    db,
    accountId,
    contacts.map(({ id }) => id),
    campaignId
  );
  if (scoped) {
    contacts = contacts.filter(({ id }) => scoped.has(id));
    if (!contacts.length)
      throw new Error(
        'Nenhum contato do público escolhido tem atendimento no departamento da campanha.'
      );
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
  return { recipients, invalid, duplicates };
}
