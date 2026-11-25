import { describe, it, expect, vi } from 'vitest';
import { UauFinanceCache } from './finance-cache';
import type { UauFinance } from './finance-types';
const result = (selectedKey = 'sale-a', name = 'Exemplo'): UauFinance => ({
  linked: true,
  customer: { id: 7, name, email: null },
  documentMasked: '***',
  phones: [],
  contracts: [],
  selectedKey,
  open: [],
  received: [],
  attendances: [],
  warnings: [],
  updatedAt: '2026-11-24T12:00:00Z',
});
describe('bounded UAU finance cache', () => {
  it('reuses snapshots per scope and sale and remembers the latest selection', async () => {
    const cache = new UauFinanceCache();
    const load = vi.fn(async () => result());
    await cache.load('user-a', undefined, load);
    await cache.load('user-a', 'sale-a', load);
    expect(load).toHaveBeenCalledTimes(1);
    await cache.load('user-a', 'sale-b', async () => result('sale-b'));
    expect(cache.get('user-a')?.selectedKey).toBe('sale-b');
    expect(cache.get('user-b')).toBeNull();
  });
  it('returns isolated copies rather than mutable shared objects', async () => {
    const cache = new UauFinanceCache();
    await cache.load('scope', undefined, async () => result());
    cache.get('scope')!.customer.name = 'Changed';
    expect(cache.get('scope')!.customer.name).toBe('Exemplo');
  });
  it('evicts least recently used entries at the entry limit', async () => {
    const cache = new UauFinanceCache(100000, 2);
    for (const key of ['a', 'b'])
      await cache.load(key, undefined, async () => result());
    cache.get('a');
    await cache.load('c', undefined, async () => result());
    expect(cache.get('b')).toBeNull();
    expect(cache.get('a')).not.toBeNull();
  });
  it('bounds serialized bytes, including multibyte text, and skips oversized results', async () => {
    const data = result('sale-a', 'á'.repeat(200));
    const size = Buffer.byteLength(JSON.stringify(data));
    const cache = new UauFinanceCache(size + 5);
    await cache.load('a', undefined, async () => data);
    await cache.load('b', undefined, async () => data);
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).not.toBeNull();
    await cache.load('large', undefined, async () =>
      result('sale-a', 'á'.repeat(5000))
    );
    expect(cache.get('large')).toBeNull();
  });
  it('deduplicates simultaneous loads and replaces snapshots on explicit refresh', async () => {
    const cache = new UauFinanceCache();
    const loader = vi.fn(async () => result());
    await Promise.all([
      cache.load('a', undefined, loader),
      cache.load('a', undefined, loader),
    ]);
    expect(loader).toHaveBeenCalledTimes(1);
    await cache.load('a', undefined, loader, true);
    expect(loader).toHaveBeenCalledTimes(2);
  });
  it('does not let an old pending request overwrite a manual refresh', async () => {
    const cache = new UauFinanceCache();
    let complete!: (value: UauFinance) => void;
    const old = cache.load(
      'a',
      undefined,
      () =>
        new Promise((resolve) => {
          complete = resolve;
        })
    );
    await Promise.resolve();
    await cache.load('a', undefined, async () => result('sale-a', 'New'), true);
    complete(result('sale-a', 'Old'));
    await old;
    expect(cache.get('a')!.customer.name).toBe('New');
  });
  it('never caches failures or incomplete responses', async () => {
    const cache = new UauFinanceCache();
    await expect(
      cache.load('a', undefined, async () => {
        throw Error('failed');
      })
    ).rejects.toThrow();
    await cache.load('a', undefined, async () => ({
      ...result(),
      warnings: ['open'],
      open: null,
    }));
    expect(cache.get('a')).toBeNull();
  });
});
