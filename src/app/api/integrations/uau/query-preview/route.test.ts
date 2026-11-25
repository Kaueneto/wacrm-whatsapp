import { beforeEach, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  read: vi.fn(),
  requireRole: vi.fn(),
}));
vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: () => new Response(null, { status: 403 }),
}));
vi.mock('@/lib/uau/connection-store', () => ({
  runSavedUauQuery: mocks.run,
  withUauReadSession: (
    _accountId: string,
    callback: (read: unknown) => Promise<unknown>
  ) => callback(mocks.read),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRole.mockResolvedValue({ accountId: 'account-test' });
  mocks.read.mockResolvedValue({ Table: [] });
  mocks.run.mockResolvedValue([]);
});

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

function withParameters(parameters: { name: string; value: string }[]) {
  return new Request('http://localhost/api/integrations/uau/query-preview', {
    method: 'POST',
    body: JSON.stringify({ id: 56, custom: 1, parameters }),
  });
}
it('refuses an unfiltered execution when the current UAU query requires parameters', async () => {
  mocks.read.mockResolvedValue({
    Table: [{ Parametro: 'DiasAtraso', Descricao: 'Dias em atraso' }],
  });
  const response = await POST(previewRequest());
  expect(response.status).toBe(422);
  expect((await response.json()).error).toContain('DiasAtraso');
  expect(mocks.run).not.toHaveBeenCalled();
});
it('executes with the entered values only after matching the current parameter schema', async () => {
  mocks.read.mockResolvedValue({
    Table: [{ Parametro: 'DiasAtraso' }, { Parametro: 'Obra' }],
  });
  const response = await POST(
    withParameters([
      { name: 'diasatraso', value: ' 3 ' },
      { name: 'Obra', value: "'ABC'" },
    ])
  );
  expect(response.status).toBe(200);
  expect(mocks.read).toHaveBeenCalledWith(
    'RotinasGerais/ConsultarParamConsultaGeral',
    { Id: 56, Personalizado: 1 }
  );
  expect(mocks.run).toHaveBeenCalledWith('account-test', {
    Id: 56,
    Personalizado: 1,
    Parameters: ['DiasAtraso', '3', 'Obra', "'ABC'"],
  });
});
it('blocks stale parameter names instead of silently dropping a campaign filter', async () => {
  mocks.read.mockResolvedValue({ Table: [{ Parametro: 'DiasAtraso' }] });
  expect(
    (await POST(withParameters([{ name: 'Antigo', value: '3' }]))).status
  ).toBe(422);
  expect(mocks.run).not.toHaveBeenCalled();
});
it('does not execute if parameter discovery fails', async () => {
  mocks.read.mockRejectedValue(Error('metadata unavailable'));
  await POST(previewRequest());
  expect(mocks.run).not.toHaveBeenCalled();
});
