"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";

interface Organization {
  departments: { id: string; name: string }[];
  teams: { id: string; name: string; department_id: string }[];
  members: { team_id: string; user_id: string }[];
}

interface Roster {
  members: { user_id: string; full_name: string; role: string }[];
}

/** Each resource loads independently so the roster cannot hold up the team selector. */
function useRoutingResource<T>(url: string, accountId: string | null) {
  const [result, setResult] = useState<{ accountId: string; data?: T; error: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!accountId) return;
    const controller = new AbortController();
    void fetch(url, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Routing catalog: ${response.status}`);
        return response.json() as Promise<T>;
      })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ accountId, data, error: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ accountId, error: true });
      });
    return () => controller.abort();
  }, [url, accountId, attempt]);

  // Never expose another account's catalog during an account change.
  const current = result?.accountId === accountId ? result : null;
  return {
    data: current?.data ?? null,
    error: current?.error ?? false,
    retry: () => {
      setResult(null);
      setAttempt((value) => value + 1);
    },
  };
}

const RoutingCatalogContext = createContext<{
  organization: ReturnType<typeof useRoutingResource<Organization>>;
  roster: ReturnType<typeof useRoutingResource<Roster>>;
} | null>(null);

/** Mounted with the editor page, before the graph finishes loading. Node panels share it. */
export function RoutingCatalogProvider({ children }: { children: ReactNode }) {
  const { accountId } = useAuth();
  const organization = useRoutingResource<Organization>("/api/account/teams", accountId);
  const roster = useRoutingResource<Roster>("/api/account/members", accountId);
  return (
    <RoutingCatalogContext.Provider value={{ organization, roster }}>
      {children}
    </RoutingCatalogContext.Provider>
  );
}

export function useRoutingCatalog() {
  const catalog = useContext(RoutingCatalogContext);
  if (!catalog) throw new Error("RoutingCatalogProvider is required");
  return catalog;
}
