import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  role: vi.fn(),
  contact: vi.fn(),
  eq: vi.fn(),
  read: vi.fn(),
  find: vi.fn(),
  load: vi.fn(),
  get: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  revision: vi.fn(),
}));
vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.role,
  toErrorResponse: () => Response.json({ error: 'denied' }, { status: 403 }),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: () => ({ success: true }),
  rateLimitResponse: () => new Response(null, { status: 429 }),
}));
vi.mock('@/lib/uau/connection-store', () => ({
  getUauConnectionRevision: mocks.revision,
  withUauReadSession: (
    _id: string,
    callback: (read: unknown, revision: string) => Promise<unknown>
  ) => callback(mocks.read, 'revision-1'),
}));
vi.mock('@/lib/uau/contact-finance', () => ({
  findUauCustomers: mocks.find,
  loadContactFinance: mocks.load,
}));
vi.mock('@/lib/uau/contact-link-store', () => ({
  getContactUauLink: mocks.get,
  saveContactUauLink: mocks.save,
  removeContactUauLink: mocks.remove,
}));
import { GET, POST, PUT, DELETE } from './route';
import { uauFinanceCache } from '@/lib/uau/finance-cache';
import { encrypt, decrypt } from '@/lib/whatsapp/encryption';
import { createUauLinkSuggestion } from '@/lib/uau/link-suggestion';
const contactId = '00000000-0000-0000-0000-000000000001';
const context = () => ({ params: Promise.resolve({ contactId }) });
const suggestionToken = (patch = {}) => createUauLinkSuggestion({
  accountId: 'account-a', contactId, revision: 'revision-1',
  personId: 7, personName: 'Cliente', contractKey: '900_00001_1', ...patch,
});
const request = (body?: object) =>
  new Request(
    'http://localhost/api/integrations/uau/contacts/' + contactId + '/finance',
    { method: 'POST', body: JSON.stringify(body ?? {}) }
  );
beforeEach(() => {
  vi.clearAllMocks();
  uauFinanceCache.clear();
  mocks.revision.mockResolvedValue('revision-1');
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: mocks.eq.mockReturnThis(),
    maybeSingle: mocks.contact,
  };
  // Use a closure so chained account/contact filters share one builder.
  builder.eq = mocks.eq.mockImplementation(() => builder);
  mocks.role.mockResolvedValue({
    accountId: 'account-a',
    userId: 'agent-a',
    supabase: { from: () => builder },
  });
  mocks.contact.mockResolvedValue({ data: { id: contactId }, error: null });
  mocks.find.mockResolvedValue([{ id: 7, name: 'Cliente', email: null }]);
  mocks.get.mockResolvedValue(null);
  mocks.load.mockResolvedValue({
    linked: true,
    selectedKey: '[1,"ABC",12]',
    warnings: [],
    open: [],
    received: [],
  });
});
describe('contact UAU finance access', () => {
  it('shows the origin suggestion without saving a link or loading financial data', async () => {
    const response = await POST(request({ action: 'suggestion', token: suggestionToken() }), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ suggestion: {
      personId: 7, personName: 'Cliente', contractKey: '900_00001_1',
    } });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it('does not reveal a suggestion for a different contact or changed connection', async () => {
    for (const patch of [{ contactId: 'other-contact' }, { accountId: 'other-account' }, { revision: 'old' }]) {
      const response = await POST(request({ action: 'suggestion', token: suggestionToken(patch) }), context());
      expect(response.status).toBe(409);
    }
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('only suggests the origin customer after verifying the entered CPF', async () => {
    mocks.find.mockResolvedValue([{ id: 7, name: 'Cliente' }, { id: 8, name: 'Outro cadastro' }]);
    const response = await POST(request({ action: 'lookup', cpf: '52998224725', suggestionToken: suggestionToken() }), context());
    expect(await response.json()).toEqual({ candidates: [{ id: 7, name: 'Cliente' }] });
    expect(mocks.find).toHaveBeenCalledWith(mocks.read, '52998224725');
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('saves the suggested link only on explicit confirmation with a matching CPF and person', async () => {
    const token = suggestionToken();
    const response = await PUT(request({ cpf: '52998224725', personId: 7, suggestionToken: token }), context());
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ person_id: 7, contact_id: contactId }), 'agent-a');
    expect(mocks.load).not.toHaveBeenCalled();
    mocks.save.mockClear();
    expect((await PUT(request({ cpf: '52998224725', personId: 8, suggestionToken: token }), context())).status).toBe(409);
    mocks.find.mockResolvedValue([{ id: 8, name: 'Outro cliente' }]);
    expect((await PUT(request({ cpf: '52998224725', personId: 7, suggestionToken: token }), context())).status).toBe(409);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('does not overwrite a different link created while the suggestion was open', async () => {
    mocks.get.mockResolvedValue({ person_id: 8, connection_revision: 'revision-1' });
    const response = await PUT(request({ cpf: '52998224725', personId: 7, suggestionToken: suggestionToken() }), context());
    expect(response.status).toBe(409);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('checks role and RLS-scoped contact before exposing the saved identity', async () => {
    const response = await GET(request(), context());
    expect(mocks.role).toHaveBeenCalledWith('agent');
    expect(mocks.eq).toHaveBeenCalledWith('account_id', 'account-a');
    expect(mocks.eq).toHaveBeenCalledWith('id', contactId);
    expect(await response.json()).toEqual({ linked: false });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
  it('never reads an ERP identity when contact RLS denies access', async () => {
    mocks.contact.mockResolvedValue({ data: null, error: null });
    for (const handler of [GET, POST, PUT, DELETE])
      expect(
        (
          await handler(
            request({ action: 'lookup', cpf: '52998224725' }),
            context()
          )
        ).status
      ).toBe(404);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('rejects invalid CPF without querying the ERP', async () => {
    expect(
      (await POST(request({ action: 'lookup', cpf: '11111111111' }), context()))
        .status
    ).toBe(400);
    expect(mocks.find).not.toHaveBeenCalled();
  });
  it('saves an encrypted document only after verifying the selected person', async () => {
    expect(
      (await PUT(request({ cpf: '529.982.247-25', personId: 7 }), context()))
        .status
    ).toBe(200);
    const [link, userId] = mocks.save.mock.calls[0];
    expect(link).toMatchObject({
      account_id: 'account-a',
      contact_id: contactId,
      person_id: 7,
      connection_revision: 'revision-1',
    });
    expect(userId).toBe('agent-a');
    expect(link.document_encrypted).not.toBe('52998224725');
    expect(decrypt(link.document_encrypted)).toBe('52998224725');
    mocks.save.mockClear();
    expect(
      (await PUT(request({ cpf: '52998224725', personId: 99 }), context()))
        .status
    ).toBe(409);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('invalidates stale links after the configured ERP connection changes', async () => {
    mocks.get.mockResolvedValue({
      connection_revision: 'old',
      document_encrypted: encrypt('52998224725'),
      person_id: 7,
    });
    expect(await (await GET(request(), context())).json()).toEqual({
      linked: false,
      connectionChanged: true,
    });
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it('refreshes with the server-side document rather than a caller-supplied CPF', async () => {
    mocks.get.mockResolvedValue({
      connection_revision: 'revision-1',
      document_encrypted: encrypt('52998224725'),
      person_id: 7,
    });
    await POST(
      request({
        action: 'refresh',
        cpf: '00000000000',
        contractKey: '[1,"ABC",12]',
      }),
      context()
    );
    expect(mocks.load).toHaveBeenCalledWith(
      mocks.read,
      '52998224725',
      7,
      '[1,"ABC",12]'
    );
  });
});

describe('cached finance keeps server access checks', () => {
  beforeEach(() =>
    mocks.get.mockResolvedValue({
      connection_revision: 'revision-1',
      document_encrypted: encrypt('52998224725'),
      person_id: 7,
    })
  );
  it('reuses successful results and only refreshes ERP data on explicit reload', async () => {
    expect(await (await GET(request(), context())).json()).toMatchObject({
      cacheStatus: 'miss',
    });
    expect(await (await GET(request(), context())).json()).toMatchObject({
      cacheStatus: 'hit',
    });
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(mocks.contact).toHaveBeenCalledTimes(2);
    await POST(
      request({ action: 'refresh', contractKey: '[1,"ABC",12]' }),
      context()
    );
    expect(mocks.load).toHaveBeenCalledTimes(2);
    await POST(
      request({ action: 'select', contractKey: '[1,"ABC",12]' }),
      context()
    );
    expect(mocks.load).toHaveBeenCalledTimes(2);
  });
  it('denies cached data when contact access is revoked', async () => {
    await GET(request(), context());
    mocks.contact.mockResolvedValue({ data: null, error: null });
    expect((await GET(request(), context())).status).toBe(404);
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });
  it('rejects cached data after a connection revision changes', async () => {
    await GET(request(), context());
    mocks.revision.mockResolvedValue('revision-2');
    expect(await (await GET(request(), context())).json()).toEqual({
      linked: false,
      connectionChanged: true,
    });
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });
  it('does not expose a cached identity once the link is removed', async () => {
    await GET(request(), context());
    mocks.get.mockResolvedValue(null);
    expect(await (await GET(request(), context())).json()).toEqual({
      linked: false,
    });
  });
});
