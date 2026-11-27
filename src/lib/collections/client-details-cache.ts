import type { CollectionContactOption } from './contact-options';
import type { ContractFinance } from './contract-finance';
import type { CollectionSnapshot } from './portfolio-types';

export interface ContractHistoryItem {
  id: string;
  kind: string;
  detail: Record<string, unknown>;
  created_at: string;
}
export interface ContractDetailsSnapshot {
  details: CollectionSnapshot | null;
  finance: ContractFinance | null;
  contactOptions: CollectionContactOption[] | null;
  contactEmail: string | null;
  contactEmailUnavailable: boolean;
  contactsLoading: boolean;
  contactsError: string;
  financeLoading: boolean;
  financeError: string;
  history: ContractHistoryItem[] | null;
  loading: boolean;
  error: string;
  descriptionLoading: boolean;
  descriptionError: string;
}
export const emptyContractDetails: ContractDetailsSnapshot = {
  details: null,
  finance: null,
  contactOptions: null,
  contactEmail: null,
  contactEmailUnavailable: false,
  contactsLoading: false,
  contactsError: '',
  financeLoading: false,
  financeError: '',
  history: null,
  loading: false,
  error: '',
  descriptionLoading: false,
  descriptionError: '',
};
interface Entry {
  snapshot: ContractDetailsSnapshot;
  expires: number;
  pending?: Promise<void>;
  listeners: Set<() => void>;
}

/** Owned by one mounted account workspace, never persisted to browser storage.
 * The caller includes the import/configuration version in each cache key. */
export function createContractDetailsCache({
  fetcher = fetch,
  now = Date.now,
  ttl = 300_000,
  limit = 20,
}: {
  fetcher?: typeof fetch;
  now?: () => number;
  ttl?: number;
  limit?: number;
} = {}) {
  const entries = new Map<string, Entry>();
  function entry(key: string) {
    let value = entries.get(key);
    if (!value) {
      value = {
        snapshot: emptyContractDetails,
        expires: 0,
        listeners: new Set(),
      };
      entries.set(key, value);
    }
    return value;
  }
  function publish(value: Entry, patch: Partial<ContractDetailsSnapshot>) {
    value.snapshot = { ...value.snapshot, ...patch };
    value.listeners.forEach((notify) => notify());
  }
  function trim() {
    for (const [key, value] of entries) {
      if (entries.size <= limit) break;
      if (!value.pending && !value.listeners.size) entries.delete(key);
    }
  }
  async function request(url: string) {
    const response = await fetcher(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(45_000),
    });
    const body = await response.json();
    if (!response.ok)
      throw new Error(body.error || 'Falha ao carregar o contrato.');
    return body;
  }
  return {
    read: (key: string): ContractDetailsSnapshot =>
      entries.get(key)?.snapshot ?? emptyContractDetails,
    subscribe(key: string, listener: () => void) {
      const value = entry(key);
      value.listeners.add(listener);
      return () => {
        value.listeners.delete(listener);
        trim();
      };
    },
    load(key: string, contract: string): Promise<void> {
      const value = entry(key);
      // Reopening while a request is in flight shares that request; closing the
      // drawer must not abort it and force the next opening to start over.
      if (value.pending) return value.pending;
      if (value.expires > now()) return Promise.resolve();
      entries.delete(key);
      entries.set(key, value);
      publish(value, {
        loading: true,
        error: '',
        descriptionError: '',
        financeError: '',
        financeLoading: true,
        contactsLoading: true,
      });
      value.pending = (async () => {
        try {
          const url = `/api/integrations/uau/portfolio/events?contract=${encodeURIComponent(contract)}`;
          const body = await request(url);
          const details = body.contract as CollectionSnapshot;
          publish(value, { details, history: body.events, loading: false });
          value.expires = now() + ttl;
          const contactsRequest = (async () => {
            publish(value, { contactsLoading: true, contactsError: '' });
            try {
              const contacts = await request(
                '/api/integrations/uau/portfolio/contact?contract=' +
                  encodeURIComponent(contract)
              );
              publish(value, {
                contactOptions: contacts.options,
                contactEmail: contacts.email ?? null,
                contactEmailUnavailable: contacts.emailUnavailable ?? false,
                contactsError: contacts.warning ?? '',
              });
            } catch (error) {
              publish(value, {
                contactEmailUnavailable: true,
                contactsError:
                  error instanceof Error
                    ? error.message
                    : 'Telefones indisponíveis.',
              });
            } finally {
              publish(value, { contactsLoading: false });
            }
          })();
          const financeRequest = (async () => {
            publish(value, { financeLoading: true });
            try {
              const enriched = await request(`${url}&financial=1`);
              if (!enriched.finance)
                throw new Error('Valores reajustados indisponíveis.');
              publish(value, { finance: enriched.finance });
            } catch (error) {
              value.expires = now() + Math.min(ttl, 60_000);
              publish(value, {
                financeError:
                  error instanceof Error
                    ? error.message
                    : 'Valores reajustados indisponíveis.',
              });
            } finally {
              publish(value, { financeLoading: false });
            }
          })();
          if (details.positions.some((position) => !position.typeName)) {
            publish(value, { descriptionLoading: true });
            try {
              const enriched = await request(`${url}&descriptions=1`);
              publish(value, { details: enriched.contract });
            } catch (error) {
              value.expires = now() + Math.min(ttl, 60_000);
              publish(value, {
                descriptionError:
                  error instanceof Error
                    ? error.message
                    : 'Descrições indisponíveis.',
              });
            } finally {
              publish(value, { descriptionLoading: false });
            }
          }
          await Promise.all([financeRequest, contactsRequest]);
        } catch (error) {
          value.expires = 0;
          publish(value, {
            loading: false,
            financeLoading: false,
            contactsLoading: false,
            error:
              error instanceof Error
                ? error.message
                : 'Falha ao carregar o contrato.',
          });
        }
      })().finally(() => {
        value.pending = undefined;
        trim();
      });
      return value.pending;
    },
  };
}
export type ContractDetailsCache = ReturnType<
  typeof createContractDetailsCache
>;
