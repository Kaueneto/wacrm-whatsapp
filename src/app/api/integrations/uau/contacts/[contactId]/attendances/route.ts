import { createHash } from 'node:crypto';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { isUuid } from '@/lib/api/v1/pagination';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { UauError } from '@/lib/uau/client';
import { uauErrorDetail } from '@/lib/uau/error-detail';
import {
  withUauReadSession,
  writeUauAttendance,
} from '@/lib/uau/connection-store';
import { getContactUauLink } from '@/lib/uau/contact-link-store';
import { decrypt } from '@/lib/whatsapp/encryption';
import { contracts } from '@/lib/uau/finance-normalize';
import { findUauCustomers } from '@/lib/uau/contact-finance';
import { attendanceCategories } from '@/lib/uau/attendance-categories';
import { loadAttendanceSettings } from '@/lib/uau/attendance-settings';
import { attendanceRequest } from '@/lib/uau/attendance-request';
import {
  attendanceResponseId,
  attendanceResponseOutcome,
  matchingNewAttendance,
} from '@/lib/uau/attendance-confirmation';
import { normalizeAttendances } from '@/lib/uau/attendance-normalize';
import {
  ATTENDANCE_SUMMARY_PROMPT,
  attendanceTranscript,
} from '@/lib/uau/attendance-summary';
import { loadAiConfig } from '@/lib/ai/config';
import { generateReply } from '@/lib/ai/generate';
import { AiError } from '@/lib/ai/types';
import { supabaseAdmin } from '@/lib/ai/admin-client';
import { logAiUsage } from '@/lib/ai/usage';

export const runtime = 'nodejs';
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function POST(
  request: Request,
  context: { params: Promise<{ contactId: string }> }
) {
  let submissionLocked = false;
  let submissionRejected = false;
  try {
    const auth = await requireRole('agent');
    const { contactId } = await context.params;
    if (!isUuid(contactId)) throw new UauError('Contato inválido.', 400);
    const { data: contact, error: contactError } = await auth.supabase
      .from('contacts')
      .select('id')
      .eq('id', contactId)
      .eq('account_id', auth.accountId)
      .maybeSingle();
    if (contactError)
      throw new UauError('Não foi possível conferir o acesso ao contato.', 503);
    if (!contact)
      throw new UauError('Contato não encontrado ou sem acesso.', 404);
    const limit = checkRateLimit(
      `uau:attendances:${auth.accountId}:${auth.userId}`,
      { limit: 10, windowMs: 60000 }
    );
    const accountLimit = checkRateLimit(`uau:attendances:${auth.accountId}`, {
      limit: 30,
      windowMs: 60000,
    });
    if (!limit.success) return rateLimitResponse(limit);
    if (!accountLimit.success) return rateLimitResponse(accountLimit);
    const body = await request.json().catch(() => null);
    if (body?.action === 'draft') {
      if (!isUuid(body.conversationId) || typeof body.since !== 'string')
        throw new UauError('Conversa ou período inválido.', 400);
      const { data: conv, error } = await auth.supabase
        .from('conversations')
        .select('id')
        .eq('id', body.conversationId)
        .eq('contact_id', contactId)
        .eq('account_id', auth.accountId)
        .maybeSingle();
      if (error)
        throw new UauError('Não foi possível conferir a conversa.', 503);
      if (!conv)
        throw new UauError('Conversa não encontrada ou sem acesso.', 404);
      const transcript = await attendanceTranscript(
        auth.supabase,
        body.conversationId,
        body.since,
        new Date().toISOString()
      );
      const config = await loadAiConfig(auth.supabase, auth.accountId);
      if (!config)
        throw new UauError(
          'Configure e ative a IA antes de gerar a descrição.',
          400
        );
      const result = await generateReply({
        config,
        systemPrompt: ATTENDANCE_SUMMARY_PROMPT,
        messages: [{ role: 'user', content: transcript.text }],
      });
      if (!result.text.trim())
        throw new UauError(
          'A IA não gerou uma descrição. Tente novamente ou escreva manualmente.',
          502
        );
      void logAiUsage(supabaseAdmin(), {
        accountId: auth.accountId,
        conversationId: body.conversationId,
        mode: 'draft',
        provider: config.provider,
        model: config.model,
        usage: result.usage,
      });
      return reply({
        description: result.text,
        messageCount: transcript.messageCount,
        truncated: transcript.truncated,
        since: transcript.since,
        until: transcript.until,
      });
    }
    if (
      body?.action !== 'create' ||
      !isUuid(body.requestId) ||
      typeof body.description !== 'string' ||
      typeof body.category !== 'string' ||
      body.category.length > 100 ||
      (body.type !== undefined &&
        (!Number.isInteger(body.type) || body.type < 0 || body.type > 4)) ||
      (body.returnToCustomer !== undefined &&
        typeof body.returnToCustomer !== 'boolean') ||
      (body.recurrent !== undefined && typeof body.recurrent !== 'boolean') ||
      (body.contractKey !== null &&
        (typeof body.contractKey !== 'string' ||
          body.contractKey.length > 200)) ||
      body.reviewed !== true
    )
      throw new UauError(
        'Confira os dados e confirme a revisão do atendimento.',
        400
      );
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify([
          auth.accountId,
          auth.userId,
          contactId,
          body.category,
          body.description,
          body.type,
          body.contractKey,
          body.returnToCustomer ?? false,
          body.recurrent ?? false,
        ])
      )
      .digest('hex');
    const admin = supabaseAdmin();
    const { data: previous, error: previousError } = await admin
      .from('uau_attendance_submissions')
      .select('account_id,user_id,contact_id,request_hash,state,attendance_id')
      .eq('id', body.requestId)
      .maybeSingle();
    if (previousError)
      throw new UauError(
        'Não foi possível conferir o lançamento. Confira a migration 096.',
        503
      );
    if (previous) {
      submissionLocked = true;
      if (
        previous.account_id !== auth.accountId ||
        previous.user_id !== auth.userId ||
        previous.contact_id !== contactId ||
        previous.request_hash !== fingerprint
      )
        throw new UauError(
          'Este identificador já foi utilizado em outro lançamento.',
          409
        );
      if (previous.state === 'succeeded')
        return reply({
          saved: true,
          ...(previous.attendance_id
            ? { attendanceId: previous.attendance_id }
            : {}),
        });
      if (previous.state === 'rejected') {
        submissionRejected = true;
        submissionLocked = false;
        throw new UauError(
          'O UAU recusou este envio. Confira os dados antes de iniciar uma nova tentativa.',
          409
        );
      }
      throw new UauError(
        'O envio já foi iniciado. Confira a linha do tempo no UAU antes de lançar novamente.',
        409
      );
    }
    const link = await getContactUauLink(auth.accountId, contactId);
    if (!link)
      throw new UauError(
        'Vincule o contato ao cadastro UAU antes de lançar.',
        409
      );
    const prepared = await withUauReadSession(
      auth.accountId,
      async (read, revision) => {
        if (revision !== link.connection_revision)
          throw new UauError('A conexão mudou. Confira o vínculo UAU.', 409);
        const settings = await loadAttendanceSettings(
          auth.accountId,
          auth.userId,
          revision
        );
        if (!settings)
          throw new UauError(
            'Preencha seu login UAU em Configurações → Perfil.',
            409
          );
        const categories = attendanceCategories(
          await read('Atendimento/ConsultarCategDeComentAtivas', {}),
          { requireWorkflow: true }
        );
        if (!categories.some((c) => c.code === body.category))
          throw new UauError(
            'A categoria não está ativa ou não possui workflow cadastrado no UAU. Recarregue as categorias.',
            409
          );
        const cpf = decrypt(link.document_encrypted);
        if (
          !(await findUauCustomers(read, cpf)).some(
            (p) => p.id === link.person_id
          )
        )
          throw new UauError(
            'O cadastro vinculado não foi encontrado no UAU.',
            409
          );
        let contract = null;
        if (body.contractKey !== null) {
          contract =
            contracts(
              await read('Venda/ConsultarUnidadesCompradasPorCPFCNPJ', {
                CpfCnpj: cpf,
              })
            ).find((c) => c.key === body.contractKey) ?? null;
          if (!contract)
            throw new UauError(
              'O contrato selecionado não pertence ao cliente vinculado.',
              403
            );
        }
        let baselineIds: number[] | null = null;
        try {
          baselineIds = normalizeAttendances(
            await read('Atendimento/ConsultarAtendimentoPorPessoa', {
              codigo_pessoa: link.person_id,
            })
          ).map((item) => item.id);
        } catch {
          // Known success responses remain usable when this optional read fails.
          // An unfamiliar response must then stay unconfirmed rather than risk a false success.
        }
        return {
          revision,
          baselineIds,
          payload: attendanceRequest({
            personId: link.person_id,
            login: settings.uau_login,
            category: body.category,
            description: body.description,
            type: body.type,
            contract,
            returnToCustomer: body.returnToCustomer ?? false,
            recurrent: body.recurrent ?? false,
          }),
        };
      }
    );
    const { error: reserveError } = await admin
      .from('uau_attendance_submissions')
      .insert({
        id: body.requestId,
        account_id: auth.accountId,
        user_id: auth.userId,
        contact_id: contactId,
        request_hash: fingerprint,
      });
    if (reserveError) {
      submissionLocked = true;
      throw new UauError(
        'O envio não foi iniciado ou já está em andamento. Confira o atendimento antes de tentar novamente.',
        409
      );
    }
    submissionLocked = true;
    try {
      const result = await writeUauAttendance(
        auth.accountId,
        prepared.revision,
        prepared.payload
      );
      const outcome = attendanceResponseOutcome(result);
      if (outcome === 'rejected')
        throw new UauError(
          `O UAU informou uma falha ao gravar o atendimento.${uauErrorDetail(result) ? ` ${uauErrorDetail(result)}` : ''}`,
          502,
          undefined,
          true
        );
      let attendanceId = attendanceResponseId(result) ?? undefined;
      if (outcome === 'unknown') {
        const baselineIds = prepared.baselineIds;
        if (baselineIds === null)
          throw new Error('Unknown creation response without a baseline');
        const confirmed = await withUauReadSession(
          auth.accountId,
          async (read, revision) => {
            if (revision !== prepared.revision) return null;
            return matchingNewAttendance(
              baselineIds,
              prepared.payload,
              normalizeAttendances(
                await read('Atendimento/ConsultarAtendimentoPorPessoa', {
                  codigo_pessoa: link.person_id,
                })
              )
            );
          }
        );
        if (!confirmed)
          throw new Error(
            'Unknown creation response without a unique new record'
          );
        attendanceId = confirmed.id;
      }
      const { error } = await admin
        .from('uau_attendance_submissions')
        .update({
          state: 'succeeded',
          ...(attendanceId !== undefined
            ? { attendance_id: attendanceId }
            : {}),
        })
        .eq('id', body.requestId)
        .eq('account_id', auth.accountId);
      if (error) throw new Error('Confirmation persistence failed');
      return reply({
        saved: true,
        ...(attendanceId !== undefined ? { attendanceId } : {}),
      });
    } catch (error) {
      const rejected =
        error instanceof UauError &&
        (error.rejected ||
          error.upstreamStatus === 400 ||
          error.upstreamStatus === 422);
      await admin
        .from('uau_attendance_submissions')
        .update({ state: rejected ? 'rejected' : 'uncertain' })
        .eq('id', body.requestId)
        .eq('account_id', auth.accountId);
      // Log status only: descriptions, documents and ERP credentials stay out of logs.
      console.error('[uau/attendance] creation not confirmed', {
        upstreamStatus:
          error instanceof UauError ? (error.upstreamStatus ?? null) : null,
        kind: error instanceof UauError ? 'uau_error' : 'unconfirmed_response',
      });
      if (rejected) {
        submissionRejected = true;
        submissionLocked = false;
        throw new UauError(error.message, 502);
      }
      throw new UauError(
        `${error instanceof UauError ? `${error.message} ` : 'Não foi possível confirmar o lançamento. '}Confira no UAU antes de repetir: o atendimento pode ter sido gravado.`,
        502
      );
    }
  } catch (error) {
    if (error instanceof UauError || error instanceof AiError)
      return reply(
        {
          error: error.message,
          code: submissionRejected
            ? 'submission_rejected'
            : submissionLocked
              ? 'submission_locked'
              : 'not_sent',
        },
        error.status >= 500 && error.status !== 503 ? 502 : error.status
      );
    return toErrorResponse(error);
  }
}
