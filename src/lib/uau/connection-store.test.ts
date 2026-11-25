import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decrypt, encrypt } from '@/lib/whatsapp/encryption';
import { runSavedUauQuery, saveUauConnection, withUauReadSession, writeUauAttendance } from './connection-store';
import { executeUauRead, normalizeUauBase } from './client';
import { Readable } from 'node:stream';

const mocks = vi.hoisted(() => ({ request: vi.fn(), read: vi.fn(), update: vi.fn(), upsert: vi.fn() }));

vi.mock('undici', () => ({ Agent: class {}, request: mocks.request }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: mocks.read }) }),
    upsert: mocks.upsert,
    update: (value: unknown) => ({ eq: () => ({ eq: () => ({ select: () => ({
      maybeSingle: () => mocks.update(value),
    }) }) }) }),
  }) }),
}));

const connection = {
  baseUrl: 'http://187.72.213.73:3388/uauAPI', version: '1.0',
  sessionHeader: 'Authorization', bearer: false,
  integrationKey: 'fictitious-integration-key', login: 'tester', password: 'fictitious-password',
};
const cachedToken = 'cached-example-token';
const renewedToken = 'renewed-example-token';
const query = { Id: 87, Personalizado: 1, Parameters: [] } as const;

function response(statusCode: number, value?: unknown) {
  return { statusCode, body: Object.assign((async function* () {
    if (value !== undefined) yield Buffer.from(JSON.stringify(value));
  })(), { destroy() {} }) };
}

beforeEach(() => {
  mocks.request.mockReset();
  mocks.read.mockResolvedValue({ data: {
    base_url: connection.baseUrl, api_version: connection.version, session_header: connection.sessionHeader,
    bearer: connection.bearer, credentials_encrypted: encrypt(JSON.stringify(connection)),
    session_encrypted: encrypt(cachedToken), session_expires_at: new Date(Date.now() + 60_000).toISOString(), revision: 'revision-1',
  } });
  mocks.update.mockResolvedValue({ data: { revision: 'revision-1' } });
  mocks.upsert.mockResolvedValue({});
});

describe('UAU connection', () => {
  it('consumes an HTTP rejection and preserves its business reason without directly destroying the stream', async () => {
    const body = Readable.from([Buffer.from(JSON.stringify({ Mensagem: 'Categoria sem workflow' }))]);
    const destroy = vi.spyOn(body, 'destroy');
    mocks.request.mockResolvedValueOnce({ statusCode: 400, body });
    await expect(writeUauAttendance('account-1', 'revision-1', { codpes_atd: 7 }))
      .rejects.toMatchObject({ status: 400, upstreamStatus: 400, message: 'O UAU recusou a requisição (HTTP 400). Categoria sem workflow' });
    expect(body.readableEnded).toBe(true);
    // Node may auto-destroy a fully consumed stream; it must not be aborted with unread data.
    for (const [error] of destroy.mock.calls) expect(error).toBeUndefined();
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
  it('never refreshes and replays an attendance creation after an upstream rejection', async () => {
    mocks.request.mockResolvedValueOnce(response(401));
    await expect(writeUauAttendance('account-1', 'revision-1', { codpes_atd: 7 })).rejects.toMatchObject({ status: 401 });
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.request.mock.calls[0][0]).toContain('/Atendimento/GravarAtendimento');
    expect(JSON.parse(mocks.request.mock.calls[0][1].body)).toEqual({ atendimento: { codpes_atd: 7 } });
  });
  it('pins financial consultations to one saved revision and uses documented payloads', async () => {
    mocks.request.mockResolvedValueOnce(response(200, [])).mockResolvedValueOnce(response(200, []));
    await withUauReadSession('account-1', async (read, revision) => {
      expect(revision).toBe('revision-1');
      await read('Pessoas/ConsultarPessoasPorCPFCNPJ', {cpf_cnpj:'52998224725',status:2});
      await read('Pessoas/ConsultarTelefones', {Numero:7});
    });
    expect(mocks.read).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mocks.request.mock.calls[1][1].body)).toEqual({Numero:7});
  });
  it('renews a rejected session for a read and never permits financial write operations', async () => {
    mocks.request.mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response(200, renewedToken)).mockResolvedValueOnce(response(200, []));
    await withUauReadSession('account-1', read => read('Venda/BuscarParcelasRecebidas',{empresa:1,obra:'ABC',num_ven:12}));
    expect(mocks.request.mock.calls[2][1].headers.Authorization).toBe(renewedToken);
    mocks.request.mockClear();
    expect(()=>executeUauRead(connection,cachedToken,'Venda/ProcessarRecebimentoParcelas' as never,{} as never)).toThrow('não permitida');
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it('accepts public HTTP and HTTPS bases and rejects credentials, internal destinations and operation paths', () => {
    expect(normalizeUauBase(connection.baseUrl + '/')).toBe(connection.baseUrl);
    expect(normalizeUauBase('https://uau.example.com/UAUApi_Integracao/')).toBe('https://uau.example.com/UAUApi_Integracao');
    for (const value of ['http://127.0.0.1/uau', 'https://127.0.0.1/uau', 'http://user:password@uau.example.com', `${connection.baseUrl}/swagger/ui/index`, `${connection.baseUrl}/api/v1.0/RotinasGerais/ExecutarConsultaGeral`]) {
      expect(() => normalizeUauBase(value)).toThrow();
    }
  });

  it('authenticates with the integration header before storing encrypted credentials', async () => {
    mocks.request.mockResolvedValueOnce(response(200, { Token: renewedToken }));
    await saveUauConnection('account-1', connection);
    expect(mocks.request).toHaveBeenCalledWith(`${connection.baseUrl}/api/v1.0/Autenticador/AutenticarUsuario`, expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ 'X-INTEGRATION-Authorization': connection.integrationKey }),
      body: JSON.stringify({ Login: connection.login, Senha: connection.password }),
    }));
    const saved = mocks.upsert.mock.calls[0][0];
    expect(saved.account_id).toBe('account-1');
    expect(JSON.stringify(saved)).not.toContain(connection.password);
    expect(decrypt(saved.session_encrypted)).toBe(renewedToken);
  });

  it('refreshes a rejected cached token once and repeats the same read-only query', async () => {
    mocks.request.mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response(200, renewedToken))
      .mockResolvedValueOnce(response(200, [{ WhatsApp: '+5562999990001' }]));
    await expect(runSavedUauQuery('account-1', { ...query, Parameters: [] })).resolves.toHaveLength(1);
    expect(mocks.request.mock.calls.map(([url]) => url.split('/').at(-1))).toEqual(['ExecutarConsultaGeral', 'AutenticarUsuario', 'ExecutarConsultaGeral']);
    expect(mocks.request.mock.calls[0][1].headers.Authorization).toBe(cachedToken);
    expect(mocks.request.mock.calls[0][1].headers['X-INTEGRATION-Authorization']).toBe(connection.integrationKey);
    expect(mocks.request.mock.calls[0][0]).toBe(`${connection.baseUrl}/api/v1.0/RotinasGerais/ExecutarConsultaGeral`);
    expect(mocks.request.mock.calls[2][1].headers.Authorization).toBe(renewedToken);
    expect(mocks.request.mock.calls[2][1].body).toBe(JSON.stringify(query));
    expect(decrypt(mocks.update.mock.calls[0][0].session_encrypted)).toBe(renewedToken);
  });
});
