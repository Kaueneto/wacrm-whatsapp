import { beforeEach, describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  role: vi.fn(),
  revision: vi.fn(),
  session: vi.fn(),
  read: vi.fn(),
  from: vi.fn(),
  scope: vi.fn(),
  filters: vi.fn(),
}));
vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.role,
  toErrorResponse: () => Response.json({ error: 'denied' }, { status: 403 }),
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
  createPortfolioPlan: vi.fn(),
}));
import { GET } from './route';

const row = {
  Empresa_prc: 900,
  Obra_prc: '00001',
  NumVend_prc: 1,
  NumParc_prc: 1,
  NumParcGer_prc: 1,
  Data_prc: '2026-11-01',
  DataPror_prc: '2026-12-01',
  Valor_prc: 100,
  ValorReaj: 123.45,
  Tipo_prc: 'E',
  Descricao_par: 'Entrada',
  vlrJurosParcela: 5,
  vlrCorrecao: 10,
  vlrJurosAtraso: 3,
  ValorMulta: 2,
  vlrDescAdiantamento: null,
};
const url = () =>
  new Request(
    'http://localhost/api/integrations/uau/portfolio/events?contract=900_00001_1&financial=1'
  );
beforeEach(() => {
  vi.resetAllMocks();
  mocks.role.mockResolvedValue({
    accountId: 'account-a',
    supabase: { from: mocks.from },
  });
  mocks.revision.mockResolvedValue('revision-a');
  mocks.scope.mockReturnValue(true);
  mocks.session.mockImplementation((_account, callback) =>
    callback(mocks.read, 'revision-a')
  );
  mocks.read.mockResolvedValue([row]);
  mocks.from.mockImplementation(() => {
    const q = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: {
          data: { key: '900_00001_1', company: '900', work: '00001', sale: 1 },
        },
        error: null,
      })),
    };
    q.select.mockReturnValue(q);
    q.eq.mockImplementation((...args) => {
      mocks.filters(...args);
      return q;
    });
    return q;
  });
});
describe('live UAU contract financial detail', () => {
  it('uses the persisted scoped sale and returns ERP-adjusted amounts with separate components', async () => {
    const response = await GET(url());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.finance.positions[0]).toMatchObject({
      amountCents: 12345,
      principalCents: 10000,
      interestCents: 500,
      correctionCents: 1000,
      lateInterestCents: 300,
      fineCents: 200,
      discountCents: null,
      extensionDate: '2026-12-01',
    });
    expect(mocks.read).toHaveBeenCalledExactlyOnceWith(
      'Venda/BuscarParcelasAReceber',
      expect.objectContaining({
        empresa: 900,
        obra: '00001',
        num_ven: 1,
        valor_presente: false,
      })
    );
    expect(mocks.filters).toHaveBeenCalledWith('account_id', 'account-a');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
  it('rejects another sale returned by UAU instead of mixing balances', async () => {
    mocks.read.mockResolvedValue([{ ...row, NumVend_prc: 2 }]);
    expect((await GET(url())).status).toBe(502);
  });
  it('keeps an empty successful response distinct from a failed query', async () => {
    mocks.read.mockResolvedValue([]);
    expect(await (await GET(url())).json()).toMatchObject({
      finance: { positions: [] },
    });
    mocks.read.mockRejectedValue(Error('offline'));
    expect((await GET(url())).status).toBe(502);
  });
  it('does not call UAU for an excluded contract or unauthenticated user', async () => {
    mocks.scope.mockReturnValue(false);
    expect((await GET(url())).status).toBe(404);
    mocks.role.mockRejectedValue(Error('denied'));
    expect((await GET(url())).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('rejects data if the connection changes during calculation', async () => {
    mocks.revision
      .mockResolvedValueOnce('revision-a')
      .mockResolvedValue('revision-b');
    expect((await GET(url())).status).toBe(502);
  });
});
