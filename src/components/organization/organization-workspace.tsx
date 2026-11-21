'use client';

import { Suspense, useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import {
  Building2,
  Network,
  Users,
  UsersRound,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { canManageMembers } from '@/lib/auth/roles';

const panelLoading = () => (
  <div
    role="status"
    className="text-muted-foreground border-border flex h-96 items-center justify-center rounded-xl border text-sm"
  >
    Carregando…
  </div>
);
const StructurePanel = dynamic(() => import('./structure-panel'), {
  loading: panelLoading,
});
const UsersPanel = dynamic(
  () =>
    import('@/components/settings/members-tab').then(
      (module) => module.MembersTab
    ),
  { loading: panelLoading }
);

const tabs = [
  { id: 'users', label: 'Usuários', icon: UsersRound },
  { id: 'structure', label: 'Estrutura', icon: Network },
  { id: 'departments', label: 'Departamentos', icon: Building2 },
  { id: 'teams', label: 'Equipes', icon: Users },
] as const;
type View = (typeof tabs)[number]['id'];

export function OrganizationWorkspace() {
  return (
    <Suspense fallback={panelLoading()}>
      <Workspace />
    </Suspense>
  );
}

function Workspace() {
  const params = useSearchParams();
  const initialView =
    tabs.find((tab) => tab.id === params.get('view'))?.id ?? 'users';
  const [view, setView] = useState(initialView);
  const [visited, setVisited] = useState(() => new Set([initialView]));
  const [revision, setRevision] = useState(0);
  const { accountRole, profileLoading } = useAuth();
  const refreshStructure = useCallback(
    () => setRevision((value) => value + 1),
    []
  );
  if (profileLoading) return panelLoading();
  if (!accountRole || !canManageMembers(accountRole)) return null;

  function select(next: View) {
    setView(next);
    setVisited((previous) => new Set([...previous, next]));
    // Local tabs preserve both panels and avoid a server navigation per click.
    const url = new URL(window.location.href);
    url.searchParams.set('view', next);
    window.history.replaceState(null, '', url);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Usuários e equipes
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Uma visão de quem faz parte da empresa e de como o atendimento está
            organizado.
          </p>
        </div>
        <span className="text-muted-foreground border-border inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs">
          <ShieldCheck className="size-3.5" />
          Área do administrador
        </span>
      </div>
      <div
        role="tablist"
        aria-label="Gestão de pessoas"
        className="border-border flex gap-1 overflow-x-auto border-b"
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            id={`organization-tab-${tab.id}`}
            role="tab"
            aria-selected={view === tab.id}
            aria-controls={
              tab.id === 'users'
                ? 'organization-panel-users'
                : 'organization-panel-structure'
            }
            tabIndex={view === tab.id ? 0 : -1}
            onKeyDown={(event) => {
              if (
                ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
              ) {
                event.preventDefault();
                const next =
                  event.key === 'Home'
                    ? tabs[0].id
                    : event.key === 'End'
                      ? tabs[tabs.length - 1].id
                      : tabs[
                          (index +
                            (event.key === 'ArrowRight'
                              ? 1
                              : tabs.length - 1)) %
                            tabs.length
                        ].id;
                select(next);
                document.getElementById(`organization-tab-${next}`)?.focus();
              }
            }}
            onClick={() => select(tab.id)}
            className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${view === tab.id ? 'border-primary text-primary' : 'text-muted-foreground hover:text-foreground border-transparent'}`}
          >
            <tab.icon className="size-4" />
            {tab.label}
          </button>
        ))}
      </div>
      <div
        id="organization-panel-structure"
        role="tabpanel"
        aria-labelledby={`organization-tab-${view === 'users' ? 'structure' : view}`}
        hidden={view === 'users'}
      >
        {[...visited].some((item) => item !== 'users') && (
          <StructurePanel
            revision={revision}
            view={view === 'users' ? 'structure' : view}
          />
        )}
      </div>
      <div
        id="organization-panel-users"
        role="tabpanel"
        aria-labelledby="organization-tab-users"
        hidden={view !== 'users'}
      >
        {visited.has('users') && <UsersPanel onUpdated={refreshStructure} />}
      </div>
    </div>
  );
}
