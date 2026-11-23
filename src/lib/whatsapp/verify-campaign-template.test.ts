import { afterEach, expect, it, vi } from 'vitest';
import type { MessageTemplate } from '@/types';
import {
  listAvailableCampaignTemplates,
  verifyCampaignTemplate,
} from './verify-campaign-template';

const local: MessageTemplate = {
  id: 'local',
  user_id: 'user',
  created_at: '',
  name: 'aspers_market_order_confirmation_v1',
  category: 'Utility',
  language: 'en_US',
  status: 'APPROVED',
  meta_template_id: 'previous-waba-id',
  body_text: 'Hi {{1}}, order {{2}} arrives {{3}}.',
};
const approved = {
  id: 'active-waba-id',
  name: local.name,
  language: 'en_US',
  status: 'APPROVED',
  components: [{ type: 'BODY', text: local.body_text }],
};

afterEach(() => vi.unstubAllGlobals());

it('offers only approved, matching templates from the connected WABA', async () => {
  const available = {
    ...local,
    id: 'available',
    name: 'available_here',
    meta_template_id: 'active-id',
  };
  const paused = {
    ...local,
    id: 'paused',
    name: 'paused_here',
    meta_template_id: 'paused-id',
  };
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      Response.json({
        data: [
          { ...approved, id: 'active-id', name: available.name },
          { ...approved, id: 'paused-id', name: paused.name, status: 'PAUSED' },
          { ...approved, name: local.name, language: 'es_ES' },
        ],
      })
    )
  );

  expect(
    await listAvailableCampaignTemplates(
      [local, available, paused],
      'active-waba',
      'token'
    )
  ).toEqual([available]);
});

it('identifies the connected WABA when the template is missing from its catalog', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ data: [] }))
  );
  await expect(
    verifyCampaignTemplate(local, '123456789', 'token')
  ).rejects.toThrow('não aparece no catálogo da conta WhatsApp 123456789');
});

it('accepts the approved equivalent in the current WABA with a different id and follows the catalog cursor', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        data: [{ ...approved, language: 'pt_BR' }],
        paging: { next: 'https://graph.facebook.com/next?after=cursor' },
      })
    )
    .mockResolvedValueOnce(Response.json({ data: [approved] }));
  vi.stubGlobal('fetch', fetcher);

  expect(
    await verifyCampaignTemplate(local, 'active-waba', 'token')
  ).toMatchObject({ meta_template_id: approved.id });
  expect(fetcher).toHaveBeenCalledTimes(2);
  const next = fetcher.mock.calls[1][0] as URL;
  expect(next.pathname).toBe('/v25.0/active-waba/message_templates');
  expect(next.searchParams.get('after')).toBe('cursor');
  expect(next.searchParams.get('language')).toBe('en_US');
});

it('reports the actual status for the selected language', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ data: [{ ...approved, status: 'PAUSED' }] })
      )
  );
  await expect(
    verifyCampaignTemplate(local, 'active-waba', 'token')
  ).rejects.toThrow('status PAUSED');
});

it('rejects a different body under the same name and locale on the new account', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      Response.json({
        data: [
          {
            ...approved,
            components: [
              {
                type: 'BODY',
                text: 'Hi {{1}}, expected {{2}} for order {{3}}.',
              },
            ],
          },
        ],
      })
    )
  );
  await expect(
    verifyCampaignTemplate(local, 'active-waba', 'token')
  ).rejects.toThrow('o conteúdo diverge');
});
