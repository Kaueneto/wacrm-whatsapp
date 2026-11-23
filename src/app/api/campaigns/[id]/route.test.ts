import { beforeEach, expect, it, vi } from 'vitest';
import { GET, PATCH } from './route';

const mocks = vi.hoisted(() => ({
  campaign: vi.fn(),
  template: vi.fn(),
  fromAdmin: vi.fn(),
  update: vi.fn(),
  saved: vi.fn(),
}));

vi.mock('@/lib/auth/account', () => ({
  requireRole: async () => ({
    accountId: 'account-1',
    supabase: {
      from(table: string) {
        const result = table === 'campaigns' ? mocks.campaign : mocks.template;
        const query = { select: () => query, eq: () => query, single: result, maybeSingle: result };
        return query;
      },
    },
  }),
  toErrorResponse: () => new Response(null, { status: 500 }),
}));

vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: () => ({ from: mocks.fromAdmin }),
}));

const id = 'bbba4e49-a497-4df9-b1e7-22222424f788';
const templateId = '1b5385ed-a7b3-4915-8dc8-e5df83cf9cce';
const definition = {
  templateId,
  audience: { type: 'csv', csvContacts: [{ phone: '+5562999990123', name: 'Ana' }] },
  variables: {},
};
const schedule = { kind: 'once', days: 1, time: '09:00', timezone: 'America/Sao_Paulo', startDate: '2020-01-01' };
const updated_at = '2020-01-01T00:00:00.000Z';
const params = { params: Promise.resolve({ id }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.campaign.mockResolvedValue({
    data: { id, name: 'Campanha original', description: '', definition, schedule, active: false, updated_at },
  });
  mocks.template.mockResolvedValue({ data: { id: templateId, body_text: 'Olá' } });
  const save = { eq: () => save, select: () => save, maybeSingle: mocks.saved };
  mocks.saved.mockResolvedValue({ data: { id } });
  mocks.update.mockReturnValue(save);
  mocks.fromAdmin.mockReturnValue({ update: mocks.update });
});

function patch(body: unknown) {
  return PATCH(new Request('http://localhost/api/campaigns/' + id, {
    method: 'PATCH',
    body: JSON.stringify(body),
  }), params);
}

it('loads the saved spreadsheet audience and the template for editing', async () => {
  const response = await GET(new Request('http://localhost/api/campaigns/' + id), params);
  expect(await response.json()).toMatchObject({
    source: 'crm', id, definition, schedule, template: { id: templateId },
  });
});

it('directs a paused campaign with a past date to editing', async () => {
  const response = await patch({ active: true });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code: 'schedule_needs_edit' });
  expect(mocks.update).not.toHaveBeenCalled();
});

it('saves the name, template and future schedule only on the campaign', async () => {
  const newSchedule = { ...schedule, startDate: '2099-02-01' };
  const newTemplate = '07131295-feca-4283-adf9-a20d83c10967';
  mocks.template.mockResolvedValue({ data: { id: newTemplate } });
  const response = await patch({
    name: 'Campanha corrigida',
    description: 'Novo objetivo',
    definition: { ...definition, templateId: newTemplate },
    active: true,
    schedule: newSchedule,
  });
  expect(response.status).toBe(200);
  expect(mocks.fromAdmin.mock.calls).toEqual([['campaigns']]);
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
    name: 'Campanha corrigida',
    description: 'Novo objetivo',
    definition: { ...definition, templateId: newTemplate },
    schedule: newSchedule,
    active: true,
    next_run_at: '2099-02-01T12:00:00.000Z',
  }));
});

it('can switch to manual execution while keeping the imported audience', async () => {
  const response = await patch({
    name: 'Campanha', description: '', definition, active: false, schedule: null,
  });
  expect(response.status).toBe(200);
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
    definition, schedule: {}, active: false, next_run_at: null,
  }));
});
