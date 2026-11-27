import { beforeEach, describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  role: vi.fn(),
  from: vi.fn(),
  adminFrom: vi.fn(),
  revision: vi.fn(),
  session: vi.fn(),
  read: vi.fn(),
  scope: vi.fn(),
  resolve: vi.fn(),
  plan: vi.fn(),
  execute: vi.fn(),
  parse: vi.fn(),
  insert: vi.fn(),
  filters: vi.fn(),
}));
vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.role,
  toErrorResponse: () => Response.json({ error: 'denied' }, { status: 403 }),
}));
vi.mock('@/lib/ai/admin-client', () => ({
  supabaseAdmin: () => ({ from: mocks.adminFrom }),
}));
vi.mock('@/lib/uau/connection-store', () => ({
  getUauConnectionRevision: mocks.revision,
  withUauReadSession: mocks.session,
}));
vi.mock('@/lib/collections/sync', () => ({
  loadPortfolioSetup: async () => ({ setup: {} }),
  projectInScope: mocks.scope,
}));
vi.mock('@/lib/collections/query-plan', () => ({
  createPortfolioPlan: mocks.plan,
}));
vi.mock('@/lib/collections/reconcile', () => ({
  snapshotFromUau: mocks.parse,
}));
vi.mock('@/lib/whatsapp/resolve-conversation', () => ({
  resolveConversationByPhone: mocks.resolve,
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: () => ({ success: true }),
  rateLimitResponse: () => new Response(null, { status: 429 }),
}));
import { GET, POST } from './route';
import { readUauLinkSuggestion } from '@/lib/uau/link-suggestion';

const contract = {
  key: '900_00001_1',
  customer: 'Cliente',
  customerId: 77,
  company: '900',
  work: '00001',
  sale: 1,
};
function query(data: unknown) {
  const q = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    limit: vi.fn(),
    insert: mocks.insert,
    maybeSingle: vi.fn(async () => ({ data, error: null })),
    single: vi.fn(async () => ({ data, error: null })),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data, error: null }).then(resolve),
  };
  q.select.mockReturnValue(q);
  q.eq.mockImplementation((...args) => {
    mocks.filters(...args);
    return q;
  });
  q.in.mockReturnValue(q);
  q.limit.mockReturnValue(q);
  return q;
}
const request = (option?: string, extra = {}) =>
  new Request(
    'http://localhost/api/integrations/uau/portfolio/contact?contract=900_00001_1',
    option === undefined
      ? {}
      : {
          method: 'POST',
          body: JSON.stringify({ contract: contract.key, option, ...extra }),
        }
  );

beforeEach(() => {
  vi.resetAllMocks();
  mocks.role.mockResolvedValue({
    supabase: { from: mocks.from },
    accountId: 'account-a',
    userId: 'user-a',
  });
  mocks.revision.mockResolvedValue('revision-a');
  mocks.scope.mockReturnValue(true);
  mocks.from.mockImplementation((table) =>
    query(
      table === 'collection_contracts'
        ? { data: contract }
        : table === 'contacts'
          ? [{ id: 'contact-a', name: 'Cliente CRM', phone: '5511988881234' }]
          : { id: 'conversation-a' }
    )
  );
  mocks.adminFrom.mockImplementation(() =>
    query([{ contact_id: 'contact-a' }])
  );
  mocks.session.mockImplementation((_account, callback) =>
    callback(mocks.read, 'revision-a')
  );
  mocks.read.mockResolvedValue([
    {
      Telefone: '99999-1234',
      DDD: '11',
      Principal: 1,
      Complemento: 'Celular',
      Tipo: 2,
    },
  ]);
  mocks.resolve.mockResolvedValue({
    conversationId: 'uau-conversation',
    contactId: 'new-contact',
  });
});

describe('portfolio phone choices and chat routing', () => {
  it('returns the email of the exact UAU customer alongside the phone options', async () => {
    mocks.read.mockImplementation(async (operation) =>
      operation === 'Pessoas/ConsultarPessoasPorCondicao'
        ? [
            {
              CodigoPessoa: 77,
              EmailPessoa: 'cliente@example.com',
              CpfPessoa: 'private',
              SenhaLoginPessoa: 'private',
              ListaDadosPessoaEndereco: [
                { CodigoPessoa: 77, Endereco: 'private' },
              ],
              ListaDadosPessoFisica: [],
              ListaDadosPessoaJuridica: [],
            },
          ]
        : [{ Telefone: '99999-1234', DDD: '11', Principal: 1 }]
    );
    const response = await GET(request());
    const body = await response.json();
    expect(body).toMatchObject({
      email: 'cliente@example.com',
      emailUnavailable: false,
    });
    expect(JSON.stringify(body)).not.toContain('private');
    expect(body.options).toHaveLength(2);
  });

  it('keeps phones available when the email consultation fails', async () => {
    mocks.read.mockImplementation(async (operation) => {
      if (operation === 'Pessoas/ConsultarPessoasPorCondicao')
        throw Error('offline');
      return [{ Telefone: '99999-1234', DDD: '11', Principal: 1 }];
    });
    const body = await (await GET(request())).json();
    expect(body).toMatchObject({ email: null, emailUnavailable: true });
    expect(body.options).toHaveLength(2);
  });
  it('lists all ERP numbers and CRM links with provenance without creating or sending anything', async () => {
    mocks.read.mockResolvedValue([
      { Telefone: '99999-1234', DDD: '11', Principal: 1 },
      { Telefone: '3333-9876', DDD: '11', Principal: 0 },
    ]);
    const response = await GET(request());
    const body = await response.json();
    expect(body.options).toHaveLength(3);
    expect(body.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'CRM', contactId: 'contact-a' }),
        expect.objectContaining({
          source: 'UAU',
          primary: true,
          dialable: '5511999991234',
        }),
        expect.objectContaining({
          source: 'UAU',
          primary: false,
          dialable: '551133339876',
        }),
      ])
    );
    expect(mocks.read).toHaveBeenCalledWith('Pessoas/ConsultarTelefones', {
      Numero: 77,
    });
    expect(mocks.filters).toHaveBeenCalledWith('account_id', 'account-a');
    expect(mocks.filters).toHaveBeenCalledWith(
      'connection_revision',
      'revision-a'
    );
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it('opens the existing conversation for the explicitly chosen CRM contact', async () => {
    const response = await POST(request('crm:contact-a'));
    expect(await response.json()).toEqual({ conversationId: 'conversation-a' });
    expect(mocks.filters).toHaveBeenCalledWith('contact_id', 'contact-a');
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('merges an exact CRM/UAU phone match and opens its existing CRM conversation', async () => {
    const original = mocks.from.getMockImplementation()!;
    mocks.from.mockImplementation((table) =>
      table === 'contacts'
        ? query([
            { id: 'contact-a', name: 'Cliente CRM', phone: '5511999991234' },
          ])
        : original(table)
    );
    const body = await (await GET(request())).json();
    expect(body.options).toHaveLength(1);
    expect(body.options[0]).toMatchObject({
      source: 'UAU + CRM',
      contactId: 'contact-a',
    });
    expect(await (await POST(request(body.options[0].id))).json()).toEqual({
      conversationId: 'conversation-a',
    });
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it('resolves only the selected ERP number, ignoring client-supplied phone and name', async () => {
    const response = await POST(
      request('uau:0:(11) 99999-1234', {
        phone: '+19999999999',
        name: 'Outro cliente',
        accountId: 'account-b',
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(
      readUauLinkSuggestion(body.uauSuggestion, {
        accountId: 'account-a',
        contactId: 'new-contact',
        revision: 'revision-a',
      })
    ).toEqual({
      personId: 77,
      personName: 'Cliente',
      contractKey: contract.key,
    });
    expect(mocks.resolve).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      'account-a',
      '+5511999991234',
      'Cliente'
    );
  });
  it('rejects arbitrary phones/contact identifiers', async () => {
    expect((await POST(request('crm:other-account-contact'))).status).toBe(400);
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('preserves visible incomplete numbers without opening a chat for them', async () => {
    mocks.read.mockResolvedValue([{ Telefone: '99999-1234', Principal: 1 }]);
    const response = await POST(request('uau:0:99999-1234'));
    expect(response.status).toBe(400);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it('keeps CRM choices available if ERP phones fail', async () => {
    mocks.read.mockRejectedValue(Error('offline'));
    const response = await GET(request());
    expect(await response.json()).toMatchObject({
      options: [expect.objectContaining({ source: 'CRM' })],
      warning: expect.any(String),
    });
  });
  it('enforces authentication and scope before disclosing phone numbers', async () => {
    mocks.role.mockRejectedValueOnce(Error('denied'));
    expect((await GET(request())).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
    mocks.scope.mockReturnValue(false);
    expect((await GET(request())).status).toBe(404);
    expect(mocks.adminFrom).not.toHaveBeenCalled();
  });
  it('rejects results from a different connection revision', async () => {
    mocks.revision
      .mockResolvedValueOnce('revision-a')
      .mockResolvedValue('revision-b');
    expect((await GET(request())).status).toBe(409);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
});
