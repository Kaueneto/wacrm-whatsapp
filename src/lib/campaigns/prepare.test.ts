import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, expect, it, vi } from 'vitest';
import { encrypt } from '@/lib/whatsapp/encryption';
import { runSavedUauQuery } from '@/lib/uau/connection-store';
import { findOrCreateContact } from '@/lib/api/v1/contacts';
import type { UauCampaignDefinition } from '@/lib/uau/campaign-draft';
import { enqueueDefinition } from './prepare';

vi.mock('@/lib/uau/connection-store', () => ({ runSavedUauQuery: vi.fn() }));
vi.mock('@/lib/api/v1/contacts', () => ({ findOrCreateContact: vi.fn() }));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function setup() {
  const definition: UauCampaignDefinition = {
    templateId: 'template',
    audience: {
      type: 'uau',
      queryId: 143,
      personalized: 1,
      parametersEncrypted: encrypt(
        JSON.stringify([{ name: 'DiasVencimento', value: '4' }])
      ),
      phone: {
        column: 'FoneWhats',
        mode: 'international',
        identityColumn: 'CodCliente',
      },
      fields: [
        { variable: '2', column: 'ValorPrincipal', format: 'money' },
        { variable: '1', column: 'Cliente', format: 'text' },
      ],
    },
  };
  const template = {
    status: 'APPROVED',
    name: 'teste',
    body_text: 'Olá {{1}}, valor {{2}}.',
    language: 'pt_BR',
    meta_template_id: 'remote-id',
  };
  const config = {
    waba_id: 'waba',
    access_token: encrypt('test'),
    phone_number_id: 'sender',
  };
  const db = {
    from: vi.fn((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data:
          table === 'whatsapp_config'
            ? config
            : table === 'campaigns'
              ? { department_id: null }
              : template,
      }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: 'broadcast-id' }),
  };
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      Response.json({
        data: [
          {
            id: 'remote-id',
            name: 'teste',
            language: 'pt_BR',
            status: 'APPROVED',
          },
        ],
      })
    )
  );
  vi.mocked(findOrCreateContact).mockResolvedValue({
    id: 'contact-id',
    created: false,
  });
  return {
    db,
    definition,
    run: () =>
      enqueueDefinition(
        db as unknown as SupabaseClient,
        'account',
        'user',
        'Campanha',
        definition,
        'campaign'
      ),
  };
}

it('reexecutes the saved UAU query and queues only eligible rows in template order', async () => {
  const { db, run } = setup();
  const row = {
    CodCliente: 1,
    Cliente: 'Cliente Teste',
    ValorPrincipal: 300,
    FoneWhats: '5562999990001',
  };
  const conflict = { ...row, CodCliente: 2, FoneWhats: '5562999990002' };
  vi.mocked(runSavedUauQuery).mockResolvedValue([
    row,
    row,
    conflict,
    { ...conflict, CodCliente: 3 },
    { ...row, FoneWhats: '' },
  ]);

  expect(await run()).toMatchObject({
    broadcastId: 'broadcast-id',
    total: 1,
    duplicates: 1,
    invalid: 3,
  });
  expect(runSavedUauQuery).toHaveBeenCalledWith('account', {
    Id: 143,
    Personalizado: 1,
    Parameters: ['DiasVencimento', '4'],
  });
  expect(db.rpc).toHaveBeenCalledWith(
    'enqueue_broadcast',
    expect.objectContaining({
      p_campaign: 'campaign',
      p_audience: { type: 'uau', queryId: 143 },
      p_recipients: [
        {
          contact_id: 'contact-id',
          phone: '+5562999990001',
          name: 'Cliente Teste',
          params: ['Cliente Teste', 'R$ 300,00'],
        },
      ],
    })
  );
});

it('does not enqueue an empty audience', async () => {
  const { db, run } = setup();
  vi.mocked(runSavedUauQuery).mockResolvedValue([]);
  await expect(run()).rejects.toThrow('não retornou destinatários elegíveis');
  expect(db.rpc).not.toHaveBeenCalled();
  expect(findOrCreateContact).not.toHaveBeenCalled();
});
