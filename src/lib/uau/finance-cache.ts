import type { UauFinance } from './finance-types';

/** Process-local, bounded snapshots. Authorization and link revision are checked by the route. */
export class UauFinanceCache {
  private entries = new Map<
    string,
    { scope: string; contract: string | null; json: string; bytes: number }
  >();
  private pending = new Map<string, Promise<UauFinance>>();
  private bytes = 0;
  constructor(
    private maxBytes = 16 * 1024 * 1024,
    private maxEntries = 50
  ) {}

  clear() {
    this.entries.clear();
    this.pending.clear();
    this.bytes = 0;
  }
  invalidate(scope: string) {
    for (const [key, entry] of this.entries)
      if (entry.scope === scope) {
        this.bytes -= entry.bytes;
        this.entries.delete(key);
      }
    for (const key of this.pending.keys())
      if (JSON.parse(key)[0] === scope) this.pending.delete(key);
  }
  get(scope: string, contract?: string): UauFinance | null {
    const found = [...this.entries]
      .reverse()
      .find(
        ([, entry]) =>
          entry.scope === scope &&
          (contract === undefined || entry.contract === contract)
      );
    if (!found) return null;
    const [key, entry] = found;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return JSON.parse(entry.json) as UauFinance;
  }
  private put(scope: string, data: UauFinance) {
    // Failed sections are retryable, not successful cached queries.
    if (data.warnings.length) return;
    const json = JSON.stringify(data),
      bytes = Buffer.byteLength(json, 'utf8');
    if (bytes > this.maxBytes) return;
    const key = JSON.stringify([scope, data.selectedKey]);
    const existing = this.entries.get(key);
    if (existing) {
      this.bytes -= existing.bytes;
      this.entries.delete(key);
    }
    while (
      this.entries.size &&
      (this.bytes + bytes > this.maxBytes ||
        this.entries.size >= this.maxEntries)
    ) {
      const oldest = this.entries.keys().next().value!;
      this.bytes -= this.entries.get(oldest)!.bytes;
      this.entries.delete(oldest);
    }
    this.entries.set(key, { scope, contract: data.selectedKey, json, bytes });
    this.bytes += bytes;
  }
  async load(
    scope: string,
    contract: string | undefined,
    loader: () => Promise<UauFinance>,
    force = false
  ): Promise<UauFinance> {
    if (force) this.invalidate(scope);
    else {
      const hit = this.get(scope, contract);
      if (hit) return hit;
    }
    const key = JSON.stringify([scope, contract ?? null]);
    const existing = this.pending.get(key);
    if (existing) return existing;
    const pending = Promise.resolve().then(loader);
    this.pending.set(key, pending);
    try {
      const result = await pending;
      if (this.pending.get(key) === pending) this.put(scope, result);
      return result;
    } finally {
      if (this.pending.get(key) === pending) this.pending.delete(key);
    }
  }
}
export const uauFinanceCache = new UauFinanceCache();
