import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { isUuid } from '@/lib/api/v1/pagination';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { extractTemplateVariables } from '@/lib/whatsapp/template-validators';
import {
  getUauSchedule,
  isUauCampaignDefinition,
  isUauDraftAudience,
} from '@/lib/uau/campaign-draft';
import { decrypt, encrypt } from '@/lib/whatsapp/encryption';
import { nextOccurrence } from '@/lib/campaigns/schedule';

function invalid(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function GET(request: Request) {
  try {
    const { accountId, supabase } = await requireRole('admin');
    const id = new URL(request.url).searchParams.get('id') ?? '';
    if (!isUuid(id)) return invalid('Campanha inválida.');
    const { data, error } = await supabase
      .from('campaigns')
      .select('id,name,description,definition,schedule,active,department_id')
      .eq('account_id', accountId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data || !isUauCampaignDefinition(data.definition))
      return invalid('Campanha UAU não encontrada.', 404);
    const { data: template, error: templateError } = await supabase
      .from('message_templates')
      .select('*')
      .eq('account_id', accountId)
      .eq('id', data.definition.templateId)
      .eq('status', 'APPROVED')
      .maybeSingle();
    if (templateError) throw templateError;
    const { parametersEncrypted, ...audience } = data.definition.audience;
    const parameters = parametersEncrypted
      ? JSON.parse(decrypt(parametersEncrypted))
      : [];
    return Response.json(
      {
        id: data.id,
        name: data.name,
        description: data.description,
        schedule: getUauSchedule(data.schedule),
        active: data.active,
        departmentId: data.department_id,
        audience: { ...audience, parameters },
        template,
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { accountId, userId, supabase } = await requireRole('admin');
    const body = await request.json().catch(() => null);
    const audience: unknown = body?.audience;
    const departmentId = body?.departmentId ?? null;
    if (
      !body ||
      typeof body.name !== 'string' ||
      !body.name.trim() ||
      body.name.trim().length > 200 ||
      typeof body.description !== 'string' ||
      body.description.length > 5000 ||
      typeof body.templateId !== 'string' ||
      !isUuid(body.templateId) ||
      (body.id !== undefined &&
        (typeof body.id !== 'string' || !isUuid(body.id))) ||
      (departmentId !== null &&
        (typeof departmentId !== 'string' || !isUuid(departmentId))) ||
      !isUauDraftAudience(audience)
    ) {
      return invalid(
        'Preencha o título, a consulta, a coluna do telefone e o template.'
      );
    }
    if (
      audience.excludeTagIds &&
      (!Array.isArray(audience.excludeTagIds) ||
        !audience.excludeTagIds.every(
          (id) => typeof id === 'string' && isUuid(id)
        ))
    )
      return invalid('Confira as etiquetas excluídas da campanha.');
    const schedule =
      body.schedule == null ? null : { ...body.schedule, configured: true };
    const active = Boolean(schedule) && body.active !== false;
    let nextRun: string | null = null;
    if (schedule) {
      try {
        nextRun = nextOccurrence(schedule, new Date());
      } catch (error) {
        return invalid(
          error instanceof Error ? error.message : 'Confira o agendamento.'
        );
      }
      if (active && !nextRun)
        return invalid('Escolha uma data futura para programar a execução.');
    }
    const { data: template, error: templateError } = await supabase
      .from('message_templates')
      .select('body_text')
      .eq('account_id', accountId)
      .eq('id', body.templateId)
      .eq('status', 'APPROVED')
      .maybeSingle();
    if (templateError) throw templateError;
    if (!template) return invalid('Escolha um template aprovado desta conta.');
    const keys = extractTemplateVariables(template.body_text);
    const fields = audience.fields.map(({ variable }) => variable);
    if (
      fields.length !== keys.length ||
      keys.some((key) => !fields.includes(key))
    )
      return invalid('Mapeie todas as variáveis do template.');

    const {
      queryId,
      personalized,
      parameters,
      phone,
      fields: mappings,
    } = audience;
    const definition = {
      templateId: body.templateId,
      audience: {
        type: 'uau',
        queryId,
        personalized,
        parametersEncrypted: parameters.length
          ? encrypt(
              JSON.stringify(
                parameters.map(({ name, value }) => ({ name, value }))
              )
            )
          : undefined,
        phone: {
          column: phone.column,
          mode: phone.mode,
          dddColumn: phone.mode === 'br-local' ? phone.dddColumn : undefined,
          identityColumn: phone.identityColumn,
        },
        fields: mappings.map(({ variable, column, format }) => ({
          variable,
          column,
          format,
        })),
        excludeTagIds: audience.excludeTagIds,
      },
      variables: {},
    };
    const changes = {
      name: body.name.trim(),
      description: body.description.trim(),
      definition,
      department_id: departmentId,
      schedule: schedule ?? {},
      active,
      next_run_at: active ? nextRun : null,
      last_error: null,
      scheduler_lease: null,
      scheduler_lease_until: null,
    };
    const table = supabaseAdmin().from('campaigns');
    const write = body.id
      ? table
          .update({ ...changes, updated_at: new Date().toISOString() })
          .eq('account_id', accountId)
          .eq('id', body.id)
          .eq('definition->audience->>type', 'uau')
      : table.insert({
          ...changes,
          account_id: accountId,
          user_id: userId,
        });
    const { data, error } = await write.select('id').maybeSingle();
    if (error?.code === '23503' && departmentId)
      return invalid('O departamento não pertence à empresa.');
    if (error) throw error;
    return data
      ? Response.json(data, { status: body.id ? 200 : 201 })
      : invalid('Campanha UAU não encontrada.', 404);
  } catch (error) {
    return toErrorResponse(error);
  }
}
