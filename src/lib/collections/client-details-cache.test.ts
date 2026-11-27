import { describe, expect, it, vi } from 'vitest';
import {
  createContractDetailsCache,
  emptyContractDetails,
} from './client-details-cache';

const contract = { key: '900_00001_1', positions: [], overdueCents: 100 };
const body = () => ({
  contract,
  events: [
    { id: 'event', kind: 'first_seen', detail: {}, created_at: '2026-11-27' },
  ],
});
const standardResponse = (url: unknown) =>
  String(url).includes('financial=1')
    ? Response.json({
        finance: {
          positions: [],
          referenceDate: '2026-11-27',
          updatedAt: '2026-11-27T12:00:00Z',
        },
      })
    : String(url).includes('/portfolio/contact?')
      ? Response.json({
          options: [],
          email: 'cliente@example.com',
          emailUnavailable: false,
          warning: null,
        })
      : Response.json(body());
const fetcher = () => vi.fn<typeof fetch>(async (url) => standardResponse(url));

describe('account workspace contract detail cache', () => {
  it('opens the same card ten times without repeating any endpoint and an immediate cached snapshot', async () => {
    const request = fetcher();
    const cache = createContractDetailsCache({ fetcher: request });
    await cache.load('version:one', '900_00001_1');
    expect(cache.read('version:one').contactEmail).toBe('cliente@example.com');
    for (let i = 0; i < 10; i++) {
      expect(cache.read('version:one').details?.overdueCents).toBe(100);
      await cache.load('version:one', '900_00001_1');
    }
    expect(request).toHaveBeenCalledTimes(3);
  });
  it('shares an in-flight request even when the drawer closes before it completes', async () => {
    let finish!: (value: Response) => void;
    const request = fetcher().mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const cache = createContractDetailsCache({ fetcher: request });
    const unsubscribe = cache.subscribe('v1', vi.fn());
    const pending = cache.load('v1', '900_00001_1');
    unsubscribe();
    expect(cache.load('v1', '900_00001_1')).toBe(pending);
    finish(Response.json(body()));
    await pending;
    expect(request).toHaveBeenCalledTimes(3);
    expect(cache.read('v1').history).toHaveLength(1);
  });
  it('loads a new import version instead of serving the previous financial position', async () => {
    const request = fetcher();
    const cache = createContractDetailsCache({ fetcher: request });
    await cache.load('run1:succeeded', '900_00001_1');
    expect(cache.read('run2:succeeded')).toBe(emptyContractDetails);
    request.mockResolvedValueOnce(
      Response.json({ ...body(), contract: { ...contract, overdueCents: 200 } })
    );
    await cache.load('run2:succeeded', '900_00001_1');
    expect(cache.read('run2:succeeded').details?.overdueCents).toBe(200);
    expect(request).toHaveBeenCalledTimes(6);
  });
  it('keeps a cached view while refreshing expired entries', async () => {
    let now = 100;
    const request = fetcher();
    const cache = createContractDetailsCache({
      fetcher: request,
      now: () => now,
      ttl: 10,
    });
    await cache.load('v', '900_00001_1');
    now = 111;
    const refreshing = cache.load('v', '900_00001_1');
    expect(cache.read('v').details?.overdueCents).toBe(100);
    expect(cache.read('v').loading).toBe(true);
    await refreshing;
    expect(request).toHaveBeenCalledTimes(6);
  });
  it('also caches the enriched installment descriptions', async () => {
    const request = fetcher();
    request.mockResolvedValueOnce(
      Response.json({
        ...body(),
        contract: {
          ...contract,
          positions: [{ key: 'E_1_1', typeName: null }],
        },
      })
    );
    request.mockImplementation(async (url) =>
      String(url).includes('descriptions=1')
        ? Response.json({
            contract: {
              ...contract,
              positions: [{ key: 'E_1_1', typeName: 'Entrada' }],
            },
          })
        : standardResponse(url)
    );
    const cache = createContractDetailsCache({ fetcher: request });
    await cache.load('v', '900_00001_1');
    expect(cache.read('v').details?.positions[0].typeName).toBe('Entrada');
    expect(cache.read('v').finance?.referenceDate).toBe('2026-11-27');
    await cache.load('v', '900_00001_1');
    expect(request).toHaveBeenCalledTimes(4);
  });
  it('retries a failed initial request rather than caching an empty contract forever', async () => {
    const request = fetcher();
    request.mockResolvedValueOnce(
      Response.json({ error: 'Indisponível' }, { status: 503 })
    );
    const cache = createContractDetailsCache({ fetcher: request });
    await cache.load('v', '900_00001_1');
    expect(cache.read('v').error).toBe('Indisponível');
    await cache.load('v', '900_00001_1');
    expect(cache.read('v').error).toBe('');
    expect(cache.read('v').details?.key).toBe(contract.key);
  });
  it('does not share private contract details between workspace instances', async () => {
    const one = createContractDetailsCache({ fetcher: fetcher() });
    const two = createContractDetailsCache({ fetcher: fetcher() });
    await one.load('v', '900_00001_1');
    expect(two.read('v')).toBe(emptyContractDetails);
  });
  it('bounds inactive entries so opening many contracts does not retain an unlimited portfolio', async () => {
    const request = fetcher();
    const cache = createContractDetailsCache({ fetcher: request, limit: 2 });
    await cache.load('a', '900_00001_1');
    await cache.load('b', '900_00001_2');
    await cache.load('c', '900_00001_3');
    expect(cache.read('a')).toBe(emptyContractDetails);
    expect(cache.read('c').details).not.toBeNull();
  });
});
