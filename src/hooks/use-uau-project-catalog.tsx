'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import { useAuth } from './use-auth';
import {
  createProjectCatalogStore,
  emptyCatalogSnapshot,
} from '@/lib/uau/project-catalog-store';

const CatalogContext = createContext<ReturnType<
  typeof createProjectCatalogStore
> | null>(null);

function AccountCatalog({ children }: { children: React.ReactNode }) {
  const [store] = useState(() => createProjectCatalogStore());
  useEffect(() => {
    void store.load();
  }, [store]);
  return (
    <CatalogContext.Provider value={store}>{children}</CatalogContext.Provider>
  );
}

export function UauProjectCatalogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { accountId, user, accountRole, canEditSettings } = useAuth();
  if (!accountId || !user || !canEditSettings) return children;
  return (
    <AccountCatalog key={`${user.id}:${accountId}:${accountRole}`}>
      {children}
    </AccountCatalog>
  );
}

const subscribeEmpty = () => () => {};
const readEmpty = () => emptyCatalogSnapshot;
const noop = () => Promise.resolve();

export function useUauProjectCatalog() {
  const store = useContext(CatalogContext);
  const snapshot = useSyncExternalStore(
    store?.subscribe ?? subscribeEmpty,
    store?.read ?? readEmpty,
    readEmpty
  );
  return {
    ...snapshot,
    load: store?.load ?? noop,
    refresh: store?.refresh ?? noop,
  };
}
