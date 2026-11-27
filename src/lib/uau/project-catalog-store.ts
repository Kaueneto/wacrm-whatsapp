import type { ProjectCatalog } from '@/lib/collections/project-catalog';

type Snapshot = {
  catalog: ProjectCatalog | null;
  loading: boolean;
  error: string;
};
export const emptyCatalogSnapshot: Snapshot = {
  catalog: null,
  loading: false,
  error: '',
};

// One instance per authenticated dashboard. Consumers share both results and
// the in-flight request, without a timer expiring between form mounts.
export function createProjectCatalogStore(fetcher: typeof fetch = fetch) {
  let snapshot = emptyCatalogSnapshot;
  let attempted = false;
  let generation = 0;
  let pending: Promise<void> | undefined;
  let controller: AbortController | undefined;
  const listeners = new Set<() => void>();
  function publish(next: Snapshot) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }
  function load(): Promise<void> {
    if (pending) return pending;
    if (attempted) return Promise.resolve();
    attempted = true;
    const version = generation;
    controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(45_000),
    ]);
    publish({ catalog: null, loading: true, error: '' });
    pending = (async () => {
      try {
        const response = await fetcher('/api/integrations/uau/projects', {
          cache: 'no-store',
          signal,
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || 'Falha ao buscar empresas e obras.');
        if (!Array.isArray(body.companies) || !Array.isArray(body.works))
          throw new Error(
            'O catálogo de empresas e obras retornou um formato inválido.'
          );
        if (generation === version)
          publish({ catalog: body, loading: false, error: '' });
      } catch (error) {
        if (generation === version)
          publish({
            catalog: null,
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : 'Falha ao buscar empresas e obras.',
          });
      } finally {
        if (generation === version) pending = undefined;
      }
    })();
    return pending;
  }
  return {
    read: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load,
    refresh() {
      generation++;
      controller?.abort();
      pending = undefined;
      attempted = false;
      return load();
    },
  };
}
