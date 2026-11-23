import { expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({ run: vi.fn(), requireRole: vi.fn() }));
vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: () => new Response(null, { status: 403 }),
}));
vi.mock('@/lib/uau/connection-store', () => ({ runSavedUauQuery: mocks.run }));

function previewRequest() {
  return new Request('http://localhost/api/integrations/uau/query-preview', {
    method: 'POST',
    body: JSON.stringify({ id: 56, custom: 1 }),
  });
}

it('returns all rows and columns with the UAU order and disables response caching', async () => {
  mocks.requireRole.mockResolvedValueOnce({ accountId: 'account-test' });
  const rows = Array.from({ length: 26 }, (_, i) => ({
    Nome: `Contato ${i + 1}`,
    CodCliente: i + 1,
  }));
  const data = [
    ...rows,
    { Nome: 'Outro contato', Unidade: 'B01', CodCliente: 27 },
  ];
  mocks.run.mockResolvedValueOnce(data);

  const response = await POST(previewRequest());

  expect(mocks.requireRole).toHaveBeenCalledWith('admin');
  expect(mocks.run).toHaveBeenCalledWith('account-test', {
    Id: 56,
    Personalizado: 1,
    Parameters: [],
  });
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toMatchObject({
    total: 27,
    columns: ['Nome', 'CodCliente', 'Unidade'],
    rows: data,
  });
});

it('does not query the UAU or return rows when access is denied', async () => {
  mocks.run.mockClear();
  mocks.requireRole.mockRejectedValueOnce(new Error('Forbidden'));

  expect((await POST(previewRequest())).status).toBe(403);
  expect(mocks.run).not.toHaveBeenCalled();
});
