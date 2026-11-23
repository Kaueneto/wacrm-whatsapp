import { NextResponse } from 'next/server';
import {
  requireRole,
  toErrorResponse,
  UnauthorizedError,
  ForbiddenError,
} from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { validateDefinition } from '@/lib/campaigns/definition';
import { getCampaignSchedule, nextOccurrence } from '@/lib/campaigns/schedule';
import { isUauCampaignDefinition } from '@/lib/uau/campaign-draft';

export async function GET() {
  try {
    const ctx = await requireRole('admin');
    const { data, error } = await ctx.supabase
      .from('campaigns')
      .select(
        'id,name,description,active,next_run_at,last_error,schedule,definition,broadcasts(id)'
      )
      .eq('account_id', ctx.accountId)
      .eq('broadcasts.status', 'sending')
      .order('created_at', { ascending: false });
    if (error)
      return NextResponse.json(
        { error: 'Não foi possível carregar as campanhas.' },
        { status: 500 }
      );
    const campaigns = (data ?? []).map(
      ({ definition, broadcasts, ...campaign }) => {
        const uau = isUauCampaignDefinition(definition);
        return {
          ...campaign,
          uau,
          unfinished: Boolean(broadcasts?.length),
          schedule: getCampaignSchedule(definition, campaign.schedule),
        };
      }
    );
    return NextResponse.json({ campaigns });
  } catch (error) {
    return toErrorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const body = await request.json();
    const departmentId = body.departmentId ?? null;
    if (
      departmentId !== null &&
      (typeof departmentId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          departmentId
        ))
    )
      throw new Error('Selecione um departamento válido.');
    if (typeof body.name !== 'string' || !body.name.trim())
      throw new Error('Informe o título da campanha.');
    validateDefinition(body.definition);
    const next = body.schedule == null ? null : nextOccurrence(body.schedule, new Date());
    if (body.active && !next)
      throw new Error('Escolha uma data futura para programar a execução.');
    const { data, error } = await supabaseAdmin()
      .from('campaigns')
      .insert({
        account_id: ctx.accountId,
        user_id: ctx.userId,
        name: body.name.trim(),
        department_id: departmentId,
        description:
          typeof body.description === 'string' ? body.description : '',
        definition: body.definition,
        schedule: body.schedule ?? {},
        active: body.active === true,
        next_run_at: body.active === true ? next : null,
      })
      .select('id')
      .single();
    if (error?.code === '23503' && departmentId)
      throw new Error('O departamento não pertence à empresa.');
    if (error)
      return NextResponse.json(
        { error: 'Não foi possível salvar a campanha.' },
        { status: 500 }
      );
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError)
      return toErrorResponse(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Dados inválidos.' },
      { status: 400 }
    );
  }
}
