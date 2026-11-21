import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('admin');
    const { data, error } = await supabase
      .from('pending_account_users')
      .select('id, full_name, email, role, created_at, invited_at')
      .eq('account_id', accountId)
      .is('activated_at', null)
      .order('created_at', { ascending: false });
    if (error)
      return NextResponse.json(
        { error: 'Não foi possível carregar os usuários pendentes.' },
        { status: 500 }
      );
    return NextResponse.json({ users: data });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin');
    const limit = checkRateLimit(
      `pending-user:${userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);
    const body = await request.json().catch(() => null);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const email =
      typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (
      !name ||
      name.length > 120 ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !['admin', 'supervisor', 'agent'].includes(body?.role)
    ) {
      return NextResponse.json(
        { error: 'Informe nome, e-mail e perfil válidos.' },
        { status: 400 }
      );
    }
    const { data, error } = await supabase
      .from('pending_account_users')
      .insert({
        account_id: accountId,
        created_by: userId,
        full_name: name,
        email,
        role: body.role,
      })
      .select('id, full_name, email, role, created_at, invited_at')
      .single();
    if (error)
      return NextResponse.json(
        {
          error:
            error.code === '23505'
              ? 'Já existe um usuário cadastrado com este e-mail na empresa.'
              : 'Não foi possível criar o cadastro.',
        },
        { status: error.code === '23505' ? 409 : 500 }
      );
    return NextResponse.json({ user: data }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
