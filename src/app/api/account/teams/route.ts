import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validId(value: unknown): value is string {
  return typeof value === 'string' && uuid.test(value);
}

export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('agent');
    const results = await Promise.all([
      supabase
        .from('departments')
        .select('id, name')
        .eq('account_id', accountId)
        .order('name'),
      supabase
        .from('teams')
        .select('id, name, department_id')
        .eq('account_id', accountId)
        .order('name'),
      supabase
        .from('team_members')
        .select('team_id, user_id')
        .eq('account_id', accountId),
    ]);
    if (results.some((result) => result.error)) {
      return NextResponse.json(
        {
          error:
            'Não foi possível carregar as equipes. Tente atualizar a página.',
        },
        { status: 500 }
      );
    }
    return NextResponse.json({
      departments: results[0].data,
      teams: results[1].data,
      members: results[2].data,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin');
    const limit = checkRateLimit(
      `support-teams:${userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object')
      return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
    let result;
    if (
      ['department', 'team', 'update-department', 'update-team'].includes(
        body.action
      )
    ) {
      const isTeam = body.action === 'team' || body.action === 'update-team';
      const isUpdate = body.action.startsWith('update-');
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (
        !name ||
        name.length > 80 ||
        (isTeam && !validId(body.departmentId)) ||
        (isUpdate && !validId(body.id))
      ) {
        return NextResponse.json(
          {
            error:
              'Informe um nome de até 80 caracteres e um departamento válido.',
          },
          { status: 400 }
        );
      }
      result = isUpdate
        ? await supabase
            .from(isTeam ? 'teams' : 'departments')
            .update(
              isTeam ? { name, department_id: body.departmentId } : { name }
            )
            .eq('id', body.id)
            .eq('account_id', accountId)
            .select(isTeam ? 'id, name, department_id' : 'id, name')
            .single()
        : body.action === 'department'
          ? await supabase
              .from('departments')
              .insert({ account_id: accountId, name })
              .select('id, name')
              .single()
          : await supabase
              .from('teams')
              .insert({
                account_id: accountId,
                department_id: body.departmentId,
                name,
              })
              .select('id, name, department_id')
              .single();
    } else if (body.action === 'move-member') {
      if (![body.userId, body.sourceTeamId, body.teamId].every(validId)) {
        return NextResponse.json(
          { error: 'Usuário ou equipes inválidos.' },
          { status: 400 }
        );
      }
      result = await supabase.rpc('move_support_team_member', {
        p_user_id: body.userId,
        p_source_team_id: body.sourceTeamId,
        p_target_team_id: body.teamId,
      });
    } else if (
      body.action === 'add-member' ||
      body.action === 'remove-member'
    ) {
      if (!validId(body.teamId) || !validId(body.userId))
        return NextResponse.json(
          { error: 'Equipe ou usuário inválido.' },
          { status: 400 }
        );
      result =
        body.action === 'add-member'
          ? await supabase.from('team_members').insert({
              account_id: accountId,
              team_id: body.teamId,
              user_id: body.userId,
            })
          : await supabase
              .from('team_members')
              .delete()
              .eq('account_id', accountId)
              .eq('team_id', body.teamId)
              .eq('user_id', body.userId);
    } else {
      return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
    }
    if (result.error) {
      const conflict = result.error.code === '23505';
      return NextResponse.json(
        {
          error: conflict
            ? 'Este cadastro já existe.'
            : 'Não foi possível salvar. Confira se a equipe, o departamento e o usuário pertencem à empresa.',
        },
        { status: conflict ? 409 : 400 }
      );
    }
    return NextResponse.json({ ok: true, entity: result.data ?? undefined });
  } catch (error) {
    return toErrorResponse(error);
  }
}
