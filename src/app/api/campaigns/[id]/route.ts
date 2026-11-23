import { isDeepStrictEqual } from 'node:util';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { isUuid } from '@/lib/api/v1/pagination';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { validateDefinition } from '@/lib/campaigns/definition';
import { getCampaignSchedule, nextOccurrence } from '@/lib/campaigns/schedule';
import { isUauCampaignDefinition } from '@/lib/uau/campaign-draft';

function invalid(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, accountId } = await requireRole('admin');
    const { id } = await params;
    const { data: campaign, error } = await supabase
      .from('campaigns')
      .select('id,name,description,definition,schedule,active,department_id')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle();
    if (error) throw error;
    if (!campaign) return invalid('Campanha não encontrada.', 404);
    if (isUauCampaignDefinition(campaign.definition))
      return NextResponse.json({ source: 'uau' });
    const { data: template, error: templateError } = await supabase
      .from('message_templates')
      .select('*')
      .eq('id', campaign.definition.templateId)
      .eq('account_id', accountId)
      .maybeSingle();
    if (templateError) throw templateError;
    return NextResponse.json({
      source: 'crm',
      id,
      name: campaign.name,
      description: campaign.description,
      active: campaign.active,
      departmentId: campaign.department_id,
      definition: campaign.definition,
      schedule: getCampaignSchedule(campaign.definition, campaign.schedule),
      template,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('admin');
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (body && Object.hasOwn(body, 'definition')) {
      if (typeof body.name !== 'string' || !body.name.trim() ||
          typeof body.description !== 'string' || typeof body.active !== 'boolean' ||
          (body.departmentId != null && (typeof body.departmentId !== 'string' || !isUuid(body.departmentId)))) {
        return invalid('Confira o título, a descrição e o departamento.');
      }
      try {
        validateDefinition(body.definition);
      } catch (error) {
        return invalid(error instanceof Error ? error.message : 'Definição de campanha inválida.');
      }
      const { data: current, error: readError } = await ctx.supabase
        .from('campaigns')
        .select('definition,schedule,active,next_run_at,updated_at')
        .eq('id', id)
        .eq('account_id', ctx.accountId)
        .maybeSingle();
      if (readError) throw readError;
      if (!current || isUauCampaignDefinition(current.definition))
        return invalid('Campanha do CRM não encontrada.', 404);
      if (body.definition.templateId !== current.definition.templateId) {
        if (!isUuid(body.definition.templateId)) return invalid('Escolha um template válido.');
        const { data: template, error: templateError } = await ctx.supabase
          .from('message_templates')
          .select('id')
          .eq('id', body.definition.templateId)
          .eq('account_id', ctx.accountId)
          .eq('status', 'APPROVED')
          .maybeSingle();
        if (templateError) throw templateError;
        if (!template) return invalid('Escolha um template aprovado desta conta.');
      }

      const schedule = body.schedule ?? null;
      let next: string | null = null;
      try {
        if (schedule !== null) {
          const calculated = nextOccurrence(schedule, new Date());
          if (body.active) {
            next = current.active && isDeepStrictEqual(current.schedule, schedule)
              ? current.next_run_at ?? calculated
              : calculated;
          }
        }
      } catch (error) {
        return invalid(error instanceof Error ? error.message : 'Confira o agendamento.');
      }
      if (body.active && !next) return invalid('Escolha uma data futura para programar a execução.');
      const { data, error } = await supabaseAdmin()
        .from('campaigns')
        .update({
          name: body.name.trim(),
          description: body.description.trim(),
          definition: body.definition,
          department_id: body.departmentId ?? null,
          schedule: schedule ?? {},
          active: body.active,
          next_run_at: next,
          last_error: null,
          scheduler_lease: null,
          scheduler_lease_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('account_id', ctx.accountId)
        .eq('updated_at', current.updated_at)
        .select('id')
        .maybeSingle();
      if (error?.code === '23503') return invalid('O departamento não pertence à empresa.');
      if (error) throw error;
      if (!data) return invalid('A campanha mudou enquanto você editava. Atualize e tente novamente.', 409);
      return NextResponse.json(data);
    }
    if (body && Object.hasOwn(body, 'departmentId')) {
      const departmentId = body.departmentId;
      if (
        departmentId !== null &&
        (typeof departmentId !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            departmentId
          ))
      ) {
        return NextResponse.json(
          { error: 'Selecione um departamento válido.' },
          { status: 400 }
        );
      }
      const { data, error } = await supabaseAdmin()
        .from('campaigns')
        .update({
          department_id: departmentId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('account_id', ctx.accountId)
        .select('id')
        .maybeSingle();
      if (error?.code === '23503')
        return NextResponse.json(
          { error: 'O departamento não pertence à empresa.' },
          { status: 400 }
        );
      if (error) throw error;
      if (!data)
        return NextResponse.json(
          { error: 'Campanha não encontrada.' },
          { status: 404 }
        );
      return NextResponse.json({ success: true });
    }
    if (typeof body?.active !== 'boolean')
      return NextResponse.json(
        { error: 'Informe se a programação está ativa.' },
        { status: 400 }
      );
    const { data: c } = await ctx.supabase
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .single();
    if (!c)
      return NextResponse.json(
        { error: 'Campanha não encontrada.' },
        { status: 404 }
      );
    const schedule = getCampaignSchedule(c.definition, c.schedule);
    let next: string | null = null;
    if (body.active && schedule) {
      try {
        next = nextOccurrence(schedule, new Date());
      } catch {
        // Legacy or invalid schedules can be corrected in the editor.
      }
    }
    if (body.active && !next)
      return NextResponse.json(
        {
          error:
            'Esta programação não tem uma próxima data. Edite o agendamento para continuar.',
          code: 'schedule_needs_edit',
        },
        { status: 400 }
      );
    const { data, error } = await supabaseAdmin()
      .from('campaigns')
      .update({
        active: body.active,
        next_run_at: next,
        scheduler_lease: null,
        scheduler_lease_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .eq('updated_at', c.updated_at)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) return invalid('A campanha mudou. Atualize e tente novamente.', 409);
    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
