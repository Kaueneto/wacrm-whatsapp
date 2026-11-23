import { beforeEach, expect, it, vi } from 'vitest';
import { decrypt } from '@/lib/whatsapp/encryption';
import { GET, POST } from './route';

const mocks = vi.hoisted(() => ({
  campaign: vi.fn(),
  template: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}));
vi.mock('@/lib/auth/account', () => ({
  requireRole: async () => ({
    accountId: 'account-1',
    userId: 'admin-1',
    supabase: {
      from: (table: string) => {
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: table === 'campaigns' ? mocks.campaign : mocks.template,
        };
        return query;
      },
    },
  }),
  toErrorResponse: () => new Response(null, { status: 500 }),
}));
vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: () => ({
    from: () => ({ insert: mocks.insert, update: mocks.update }),
  }),
}));

const id = 'bbba4e49-a497-4df9-b1e7-22222424f788';
const input = {
  name: '  Cobrança UAU  ',
  description: 'Revisar público',
  templateId: '1b5385ed-a7b3-4915-8dc8-e5df83cf9cce',
  audience: {
    type: 'uau',
    queryId: 133,
    personalized: 1,
    parameters: [{ name: 'Empreendimento', value: 'Exemplo de parâmetro' }],
    phone: { column: 'FoneWhats', mode: 'international' },
    fields: [{ variable: '1', column: 'Cliente', format: 'text' }],
    rows: [{ Cliente: 'Linha que não deve ser guardada' }],
  },
};

beforeEach(() => {
  mocks.template.mockResolvedValue({ data: { body_text: 'Olá, {{1}}!' } });
  const write = {
    eq: () => write,
    select: () => write,
    maybeSingle: async () => ({ data: { id } }),
  };
  mocks.insert.mockReturnValue(write);
  mocks.update.mockReturnValue(write);
});

it('creates an inactive draft and saves only the configuration with encrypted parameters', async () => {
  const response = await POST(
    new Request('http://localhost/api/campaigns/uau-draft', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  );
  expect(response.status).toBe(201);
  const stored = mocks.insert.mock.calls[0][0];
  expect(stored).toMatchObject({
    account_id: 'account-1',
    name: 'Cobrança UAU',
    active: false,
    next_run_at: null,
  });
  expect(stored.definition.audience).not.toHaveProperty('rows');
  expect(stored.definition.audience).not.toHaveProperty('parameters');
  expect(
    JSON.parse(decrypt(stored.definition.audience.parametersEncrypted))
  ).toEqual(input.audience.parameters);

  mocks.campaign.mockResolvedValueOnce({ data: { ...stored, id } });
  const restored = await GET(
    new Request('http://localhost/api/campaigns/uau-draft?id=' + id)
  );
  expect(restored.status).toBe(200);
  expect(await restored.json()).toMatchObject({
    id,
    audience: {
      queryId: 133,
      parameters: input.audience.parameters,
      fields: input.audience.fields,
    },
  });
});

it('rejects a draft that does not cover all variables of its selected template', async () => {
  const response = await POST(
    new Request('http://localhost/api/campaigns/uau-draft', {
      method: 'POST',
      body: JSON.stringify({
        ...input,
        audience: { ...input.audience, fields: [] },
      }),
    })
  );
  expect(response.status).toBe(400);
  expect(mocks.insert).not.toHaveBeenCalled();
});

it('stores the next execution only when automatic scheduling is active', async () => {
  const schedule = {
    kind: 'once',
    days: 1,
    startDate: '2099-01-01',
    time: '09:00',
    timezone: 'America/Sao_Paulo',
  };
  const response = await POST(
    new Request('http://localhost/api/campaigns/uau-draft', {
      method: 'POST',
      body: JSON.stringify({ ...input, schedule, active: true }),
    })
  );
  expect(response.status).toBe(201);
  expect(mocks.insert).toHaveBeenCalledWith(
    expect.objectContaining({
      active: true,
      next_run_at: '2099-01-01T12:00:00.000Z',
      schedule: { ...schedule, configured: true },
    })
  );
});
