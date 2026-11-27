import { describe, it, expect, vi } from 'vitest';
import { createProjectCatalogStore } from './project-catalog-store';

const catalog = {
  companies: [{ code: '900', name: 'Teste' }],
  works: [{ company: '900', code: '00001', name: 'Kapta', source: 'uau' }],
};
const response = (data = catalog) => Response.json(data);

describe('shared UAU project catalog', () => {
  it('shares one in-flight request and immediately reuses results for subsequent forms', async () => {
    let finish!: (value: Response) => void;
    const fetcher = vi.fn<typeof fetch>(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const store = createProjectCatalogStore(fetcher);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const first = store.load();
    expect(store.load()).toBe(first);
    expect(store.read().loading).toBe(true);
    finish(response());
    await first;
    for (let i = 0; i < 10; i++) await store.load();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(store.read()).toEqual({ catalog, loading: false, error: '' });
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
  it('does not expire between page visits', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response());
    const store = createProjectCatalogStore(fetcher);
    await store.load();
    const now = vi
      .spyOn(Date, 'now')
      .mockReturnValue(Date.now() + 24 * 3600000);
    try {
      await store.load();
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      now.mockRestore();
    }
  });
  it('retries failures only explicitly instead of on every dropdown open', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(Error('Indisponível'))
      .mockResolvedValueOnce(response());
    const store = createProjectCatalogStore(fetcher);
    await store.load();
    await store.load();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(store.read().error).toBe('Indisponível');
    await store.refresh();
    expect(store.read().catalog).toEqual(catalog);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('discards results from an old connection when refreshed during a request', async () => {
    let finish!: (value: Response) => void;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      )
      .mockResolvedValueOnce(Response.json({ companies: [], works: [] }));
    const store = createProjectCatalogStore(fetcher);
    const old = store.load();
    await store.refresh();
    finish(response());
    await old;
    expect(store.read().catalog).toEqual({ companies: [], works: [] });
  });
  it('keeps authenticated account stores isolated', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response());
    const first = createProjectCatalogStore(fetcher);
    const second = createProjectCatalogStore(fetcher);
    await first.load();
    expect(second.read().catalog).toBeNull();
    await second.load();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
