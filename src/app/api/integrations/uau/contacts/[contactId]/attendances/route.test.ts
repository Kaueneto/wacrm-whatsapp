import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({
  role: vi.fn(),
  scope: vi.fn(),
  eq: vi.fn(),
  previous: vi.fn(),
  reserve: vi.fn(),
  update: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  link: vi.fn(),
  find: vi.fn(),
  settings: vi.fn(),
  transcript: vi.fn(),
  config: vi.fn(),
  generate: vi.fn(),
}));
vi.mock('@/lib/auth/account', () => ({
  requireRole: h.role,
  toErrorResponse: () => Response.json({ error: 'denied' }, { status: 403 }),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: () => ({ success: true }),
  rateLimitResponse: () => new Response(null, { status: 429 }),
}));
vi.mock('@/lib/uau/connection-store', () => ({
  withUauReadSession: (
    _id: string,
    callback: (read: unknown, revision: string) => unknown
  ) => callback(h.read, 'revision'),
  writeUauAttendance: h.write,
}));
vi.mock('@/lib/uau/contact-link-store', () => ({ getContactUauLink: h.link }));
vi.mock('@/lib/uau/contact-finance', () => ({ findUauCustomers: h.find }));
vi.mock('@/lib/uau/attendance-settings', () => ({
  loadAttendanceSettings: h.settings,
}));
vi.mock('@/lib/uau/attendance-summary', () => ({
  ATTENDANCE_SUMMARY_PROMPT: 'summarize',
  attendanceTranscript: h.transcript,
}));
vi.mock('@/lib/ai/config', () => ({ loadAiConfig: h.config }));
vi.mock('@/lib/ai/generate', () => ({ generateReply: h.generate }));
vi.mock('@/lib/ai/usage', () => ({ logAiUsage: vi.fn() }));
vi.mock('@/lib/ai/admin-client', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: h.previous }) }),
      insert: h.reserve,
      update: (value: unknown) => {
        h.update(value);
        return { eq: () => ({ eq: async () => ({ error: null }) }) };
      },
    }),
  }),
}));
import { POST } from './route';
import { UauError } from '@/lib/uau/client';
import { encrypt } from '@/lib/whatsapp/encryption';
const contactId = '00000000-0000-0000-0000-000000000001';
const input = {
  action: 'create',
  requestId: '00000000-0000-0000-0000-000000000002',
  category: '001',
  description: 'Cliente solicitou retorno.',
  type: 1,
  contractKey: '[1,"ABC",12]',
  reviewed: true,
};
const run = (body: object = input) =>
  POST(
    new Request('http://localhost/attendances', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ contactId }) }
  );
beforeEach(() => {
  vi.clearAllMocks();
  const builder = { select: () => builder, eq: h.eq, maybeSingle: h.scope };
  h.eq.mockReturnValue(builder);
  h.scope.mockResolvedValue({ data: { id: contactId }, error: null });
  h.role.mockResolvedValue({
    accountId: 'account',
    userId: 'agent',
    supabase: { from: () => builder },
  });
  h.previous.mockResolvedValue({ data: null, error: null });
  h.reserve.mockResolvedValue({ error: null });
  h.link.mockResolvedValue({
    connection_revision: 'revision',
    person_id: 7,
    document_encrypted: encrypt('52998224725'),
  });
  h.settings.mockResolvedValue({ uau_login: 'GABRIEL', channel_code: 3 });
  h.find.mockResolvedValue([{ id: 7 }]);
  h.read.mockImplementation(async (operation: string) =>
    operation.includes('CategDeComent')
      ? [
          {
            MyTable: [
              {
                Codigo_cger: '001',
                Desc_cger: 'Informação',
                AtInat_cger: 0,
                NumVcwf_CGer: 12,
              },
            ],
          },
        ]
      : [{ Empresa: 1, Obra: 'ABC', Venda: 12 }]
  );
  h.write.mockResolvedValue({});
  h.config.mockResolvedValue({ provider: 'gemini', model: 'test' });
  h.transcript.mockResolvedValue({
    text: 'Cliente: Solicito retorno.',
    messageCount: 1,
    truncated: false,
  });
  h.generate.mockResolvedValue({
    text: 'Cliente solicitou retorno.',
    usage: null,
  });
});
describe('reviewed UAU attendance creation', () => {
  it('uses the returned number even when history is unavailable and preserves it on an idempotent replay', async () => {
    h.write.mockResolvedValue(22701);
    const first = await run();
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ saved: true, attendanceId: 22701 });
    expect(h.update).toHaveBeenCalledWith({
      state: 'succeeded',
      attendance_id: 22701,
    });
    h.previous.mockResolvedValue({
      data: {
        ...h.reserve.mock.calls[0][0],
        state: 'succeeded',
        attendance_id: 22701,
      },
      error: null,
    });
    const second = await run();
    expect(await second.json()).toEqual({ saved: true, attendanceId: 22701 });
    expect(h.write).toHaveBeenCalledTimes(1);
    expect(h.reserve).toHaveBeenCalledTimes(1);
  });
  it.each([812, '812', { Num_atd: 812 }, null])(
    'recognizes a returned ID or confirms an unfamiliar success without a second write (%s)',
    async (result) => {
      let historyReads = 0;
      h.read.mockImplementation(async (operation: string) => {
        if (operation.includes('CategDeComent'))
          return [
            {
              Codigo_cger: '001',
              Desc_cger: 'Informação',
              AtInat_cger: 0,
              NumVcwf_CGer: 12,
            },
          ];
        if (operation.endsWith('ConsultarAtendimentoPorPessoa')) {
          historyReads++;
          return historyReads === 1
            ? []
            : [
                {
                  Num_atd: 812,
                  CodCateg_atd: '001',
                  Descr_atd: input.description,
                  UsrCad_atd: 'GABRIEL',
                  DataCad_atd: new Date().toISOString(),
                },
              ];
        }
        return [{ Empresa: 1, Obra: 'ABC', Venda: 12 }];
      });
      h.write.mockResolvedValue(result);
      const response = await run();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ saved: true, attendanceId: 812 });
      expect(h.write).toHaveBeenCalledTimes(1);
      expect(h.update).toHaveBeenCalledWith({
        state: 'succeeded',
        attendance_id: 812,
      });
    }
  );
  it('allows creation without a type and does not send a zero or null in its place', async () => {
    expect((await run({ ...input, type: undefined })).status).toBe(200);
    expect(h.write.mock.calls[0][2]).not.toHaveProperty('tipo_atd');
    expect(h.write.mock.calls[0][2]).toHaveProperty('numccm_atd', 21);
  });
  it.each([null, '', '0', -1, 5, 1.5])(
    'rejects malformed explicitly supplied types (%s) before sending',
    async (type) => {
      expect((await run({ ...input, type })).status).toBe(400);
      expect(h.write).not.toHaveBeenCalled();
    }
  );
  it('rejects a category whose workflow was removed before reserving or sending the request', async () => {
    h.read.mockResolvedValue([
      {
        MyTable: [
          {
            Codigo_cger: '001',
            Desc_cger: 'Informação',
            AtInat_cger: 0,
            NumVcwf_CGer: 'null',
          },
        ],
      },
    ]);
    const response = await run();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'not_sent',
      error: expect.stringContaining('não possui workflow'),
    });
    expect(h.reserve).not.toHaveBeenCalled();
    expect(h.write).not.toHaveBeenCalled();
  });
  it('returns the actual upstream status and reason while preserving the duplicate guard', async () => {
    h.write.mockRejectedValue(
      new UauError(
        'O UAU recusou a requisição (HTTP 400). Categoria sem workflow.',
        400,
        400
      )
    );
    const response = await run();
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      code: 'submission_rejected',
      error: expect.stringContaining('HTTP 400). Categoria sem workflow.'),
    });
    expect(h.write).toHaveBeenCalledTimes(1);
    // A definitive validation refusal must not tell the user it may have succeeded.
    expect(h.update).toHaveBeenCalledWith({ state: 'rejected' });
  });
  it('validates and forwards return and recurrence flags', async () => {
    expect((await run({ ...input, returnToCustomer: 'yes' })).status).toBe(400);
    expect(h.write).not.toHaveBeenCalled();
    expect(
      (await run({ ...input, returnToCustomer: true, recurrent: true })).status
    ).toBe(200);
    expect(h.write).toHaveBeenCalledWith(
      'account',
      'revision',
      expect.objectContaining({ retoraten_atd: 1, reincidente_atd: true })
    );
  });
  it('checks access, revalidates category and contract, reserves and sends once', async () => {
    expect((await run()).status).toBe(200);
    expect(h.role).toHaveBeenCalledWith('agent');
    expect(h.eq).toHaveBeenCalledWith('account_id', 'account');
    expect(h.write).toHaveBeenCalledExactlyOnceWith(
      'account',
      'revision',
      expect.objectContaining({
        codpes_atd: 7,
        codcateg_atd: '001',
        usrrespon_atd: 'GABRIEL',
        empresa_atd: 1,
        obra_atd: 'ABC',
      })
    );
    expect(h.reserve.mock.invocationCallOrder[0]).toBeLessThan(
      h.write.mock.invocationCallOrder[0]
    );
    expect(h.update).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'succeeded' })
    );
    expect(h.write.mock.calls[0][2]).toHaveProperty('numccm_atd', 21);
  });
  it('denies inaccessible contacts before service-role or ERP lookup', async () => {
    h.scope.mockResolvedValue({ data: null, error: null });
    expect((await run()).status).toBe(404);
    expect(h.previous).not.toHaveBeenCalled();
    expect(h.link).not.toHaveBeenCalled();
    expect(h.write).not.toHaveBeenCalled();
  });
  it('rejects missing review or a foreign contract without writing', async () => {
    expect((await run({ ...input, reviewed: false })).status).toBe(400);
    expect(
      (await run({ ...input, contractKey: '[9,"FOREIGN",99]' })).status
    ).toBe(403);
    expect(h.reserve).not.toHaveBeenCalled();
    expect(h.write).not.toHaveBeenCalled();
  });
  it('rejects unavailable categories and stale identity links', async () => {
    expect((await run({ ...input, category: '999' })).status).toBe(409);
    h.link.mockResolvedValue({ connection_revision: 'old' });
    expect((await run()).status).toBe(409);
    expect(h.write).not.toHaveBeenCalled();
  });
  it('does not send if the durable reservation fails', async () => {
    h.reserve.mockResolvedValue({ error: { code: '23505' } });
    expect((await run()).status).toBe(409);
    expect(h.write).not.toHaveBeenCalled();
  });
  it.each([
    new Error('timeout'),
    { _Sucesso: false, _ListaErros: ['rejected'] },
  ])('retains unknown outcomes without replaying the write', async (result) => {
    if (result instanceof Error) h.write.mockRejectedValue(result);
    else h.write.mockResolvedValue(result);
    expect((await run()).status).toBe(502);
    expect(h.write).toHaveBeenCalledTimes(1);
    expect(h.update).toHaveBeenCalledWith({
      state: result instanceof Error ? 'uncertain' : 'rejected',
    });
  });
  it('blocks an existing request belonging to another account', async () => {
    h.previous.mockResolvedValue({
      data: { account_id: 'other' },
      error: null,
    });
    expect((await run()).status).toBe(409);
    expect(h.read).not.toHaveBeenCalled();
    expect(h.write).not.toHaveBeenCalled();
  });
  it('drafts from an authorized conversation without writing to the ERP', async () => {
    const conversationId = '00000000-0000-0000-0000-000000000003';
    expect(
      (
        await run({
          action: 'draft',
          conversationId,
          since: '2026-11-24T00:00:00Z',
        })
      ).status
    ).toBe(200);
    expect(h.eq).toHaveBeenCalledWith('contact_id', contactId);
    expect(h.transcript).toHaveBeenCalledWith(
      expect.anything(),
      conversationId,
      '2026-11-24T00:00:00Z',
      expect.any(String)
    );
    expect(h.reserve).not.toHaveBeenCalled();
    expect(h.write).not.toHaveBeenCalled();
  });
});
