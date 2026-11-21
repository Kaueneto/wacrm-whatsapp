// ============================================================
// GET /api/account/members
//
// Lists every member of the caller's account. Any member can call
// it (the Members tab is shown to admins+, but agents/viewers see
// a read-only roster too).
//
// Field visibility
//   Sensitive fields (email) are returned only when the caller is
//   admin+. Agents and viewers see name + avatar + role + joined
//   date only. This mirrors the design decision from the planning
//   phase: "agent/viewer sees names only".
// ============================================================

import { NextResponse } from 'next/server';

import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { canManageMembers, isAccountRole } from '@/lib/auth/roles';
import type { AccountMember } from '@/types';
import { getT } from '@/lib/i18n/translate';

const t = getT('Api');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin');
    const limit = checkRateLimit(
      `create-user:${userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);
    const body = await request.json().catch(() => null);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const email =
      typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = body?.password;
    const role = body?.role;
    const departmentId = body?.departmentId ?? '';
    const teamId = body?.teamId ?? '';
    if (
      !name ||
      name.length > 120 ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !['admin', 'supervisor', 'agent'].includes(role)
    ) {
      return NextResponse.json(
        { error: 'Informe nome, e-mail e perfil válidos.' },
        { status: 400 }
      );
    }
    if (
      typeof password !== 'string' ||
      password.trim().length < 12 ||
      Buffer.byteLength(password, 'utf8') > 72
    ) {
      return NextResponse.json(
        {
          error:
            'Use uma senha inicial com pelo menos 12 caracteres e até 72 bytes.',
        },
        { status: 400 }
      );
    }
    if (departmentId !== '' || teamId !== '') {
      if (
        typeof departmentId !== 'string' ||
        typeof teamId !== 'string' ||
        !uuid.test(departmentId) ||
        !uuid.test(teamId)
      ) {
        return NextResponse.json(
          { error: 'Selecione um departamento e uma equipe.' },
          { status: 400 }
        );
      }
      const { data, error } = await supabase
        .from('teams')
        .select('id')
        .eq('id', teamId)
        .eq('department_id', departmentId)
        .eq('account_id', accountId)
        .maybeSingle();
      if (error)
        return NextResponse.json(
          { error: 'Não foi possível verificar a equipe.' },
          { status: 500 }
        );
      if (!data)
        return NextResponse.json(
          { error: 'A equipe não pertence ao departamento selecionado.' },
          { status: 400 }
        );
    }
    const { error } = await supabaseAdmin().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
      app_metadata: {
        crm_provision: {
          account_id: accountId,
          creator_id: userId,
          role,
          department_id: departmentId || null,
          team_id: teamId || null,
        },
      },
    });
    if (error) {
      if (
        error.code === 'email_exists' ||
        error.code === 'user_already_exists'
      ) {
        return NextResponse.json(
          { error: 'Já existe um acesso com este e-mail.' },
          { status: 409 }
        );
      }
      if (error.code === 'weak_password') {
        return NextResponse.json(
          { error: 'Escolha uma senha inicial mais forte.' },
          { status: 400 }
        );
      }
      return NextResponse.json(
        {
          error:
            'Não foi possível criar o acesso. Atualize a lista antes de tentar novamente.',
        },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

interface ProfileRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  account_role: string;
  created_at: string;
}

export async function GET() {
  try {
    const ctx = await getCurrentAccount();

    // RLS on profiles allows reading any row whose account matches
    // the caller's, so this query is naturally account-scoped.
    const { data, error } = await ctx.supabase
      .from('profiles')
      .select('user_id, full_name, email, avatar_url, account_role, created_at')
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[GET /api/account/members] fetch error:', error);
      return NextResponse.json(
        { error: t('account.members.loadFailed') },
        { status: 500 }
      );
    }

    const canSeeEmails = canManageMembers(ctx.role);

    const members: AccountMember[] = (data as ProfileRow[]).flatMap((row) => {
      // Defensive: the DB enum should never let an unknown role
      // through, but if a migration ever broadens the enum without
      // updating TS, skip the row rather than crash the page.
      if (!isAccountRole(row.account_role)) return [];
      return [
        {
          user_id: row.user_id,
          full_name: row.full_name ?? '',
          email: canSeeEmails ? row.email : null,
          avatar_url: row.avatar_url,
          role: row.account_role,
          joined_at: row.created_at,
        },
      ];
    });

    return NextResponse.json({ members });
  } catch (err) {
    return toErrorResponse(err);
  }
}
