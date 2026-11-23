import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { UauError } from '@/lib/uau/client';
import { runSavedUauQuery } from '@/lib/uau/connection-store';
import {
  analyzeUauRows,
  type PhoneMapping,
  type PreviewField,
} from '@/lib/uau/query-preview';

export const runtime = 'nodejs';

function isColumn(value: unknown): value is string {
  return (
    typeof value === 'string' && value.trim().length > 0 && value.length <= 256
  );
}

export async function POST(request: Request) {
  try {
    const { accountId } = await requireRole('admin');
    const limit = checkRateLimit(`uau:query:${accountId}`, {
      limit: 10,
      windowMs: 60_000,
    });
    if (!limit.success) return rateLimitResponse(limit);
    const input = await request.json().catch(() => null);
    if (
      !input ||
      !Number.isSafeInteger(input.id) ||
      input.id < 1 ||
      ![0, 1].includes(input.custom)
    ) {
      throw new UauError(
        'Informe um código de consulta válido e escolha o tipo.',
        400
      );
    }
    const parameters: unknown = input.parameters ?? [];
    if (
      !Array.isArray(parameters) ||
      parameters.length > 50 ||
      parameters.some(
        (p) =>
          !p ||
          typeof p.name !== 'string' ||
          !/^[\p{L}\p{N}_. -]{1,80}$/u.test(p.name.trim()) ||
          typeof p.value !== 'string' ||
          !p.value.trim() ||
          p.value.length > 512
      )
    )
      throw new UauError(
        'Confira o nome e o valor de cada parâmetro da consulta.',
        400
      );
    const names = parameters.map((p) => p.name.trim().toLowerCase());
    if (new Set(names).size !== names.length)
      throw new UauError('Cada parâmetro deve aparecer apenas uma vez.', 400);
    const phone: PhoneMapping | undefined = input.phone;
    if (
      phone &&
      (!isColumn(phone.column) ||
        !['international', 'br-national', 'br-local'].includes(phone.mode) ||
        (phone.mode === 'br-local' && !isColumn(phone.dddColumn)) ||
        (phone.identityColumn && !isColumn(phone.identityColumn)))
    ) {
      throw new UauError('Confira as colunas do telefone e do DDD.', 400);
    }
    const fields: PreviewField[] = input.fields ?? [];
    if (
      !Array.isArray(fields) ||
      fields.length > 24 ||
      fields.some(
        (field) =>
          !field ||
          typeof field.variable !== 'string' ||
          !/^[A-Za-z0-9_]{1,64}$/.test(field.variable) ||
          !isColumn(field.column) ||
          !['text', 'money', 'date'].includes(field.format)
      )
    ) {
      throw new UauError(
        'Confira as colunas escolhidas para as variáveis do template.',
        400
      );
    }
    const rows = await runSavedUauQuery(accountId, {
      Id: input.id,
      Personalizado: input.custom,
      Parameters: parameters.flatMap((p) => [p.name.trim(), p.value.trim()]),
    });
    return Response.json(
      { ...analyzeUauRows(rows, phone, fields), rows },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    if (error instanceof UauError) {
      return Response.json(
        { error: error.message },
        { status: [400, 409, 422].includes(error.status) ? error.status : 502 }
      );
    }
    return toErrorResponse(error);
  }
}
