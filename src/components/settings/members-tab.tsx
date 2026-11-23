'use client';

// ============================================================
// MembersTab — Settings → Members
//
// Two stacked sections:
//   1. Roster   — account members, departments, teams and presence.
//                 Admin+ can edit names, roles and team memberships.
//                 Owner/self roles and ownership remain protected.
//   2. Pending  — outstanding invite links. Admin+ can revoke. The
//                 plaintext URL is gone after the create dialog
//                 closes, so we surface a "revoke + new link" hint
//                 rather than pretending we can resurface it.
//
// Role-gating
//   The tab itself is reachable by any member, but mutation buttons
//   are wrapped in `<RequireRole min="admin">` / `useCan` so an
//   agent or viewer sees the roster read-only. The server-side
//   RPCs (set_member_role, remove_account_member) double-check
//   the role anyway.
// ============================================================

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Loader2,
  MailX,
  Pencil,
  UserPlus,
  Trash2,
  UsersRound,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import motion from '@/components/ui/surface-motion.module.css';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslations } from 'next-intl';
import { RequireRole } from '@/components/auth/require-role';
import { useAuth } from '@/hooks/use-auth';
import { usePresence } from '@/hooks/use-presence';
import type { AccountRole } from '@/lib/auth/roles';
import { presenceLabel, summarize } from '@/lib/presence';
import { PresenceDot } from '@/components/presence/presence-dot';
import { SettingsPanelHead } from './settings-panel-head';
import { ROLE_META } from './role-meta';

interface Member {
  user_id: string;
  full_name: string;
  email: string | null;
  avatar_url: string | null;
  role: AccountRole;
  joined_at: string;
}

interface Invitation {
  id: string;
  role: 'admin' | 'supervisor' | 'agent' | 'viewer';
  label: string | null;
  created_at: string;
  expires_at: string;
}

interface Organization {
  departments: { id: string; name: string }[];
  teams: { id: string; name: string; department_id: string }[];
  members: { user_id: string; team_id: string }[];
}

interface PendingUser {
  id: string;
  full_name: string;
  email: string;
  role: 'admin' | 'supervisor' | 'agent';
}

// These roles are translated via `useTranslations("Settings.roles")` where they are used.
const EDITABLE_ROLES: { value: AccountRole }[] = [
  { value: 'admin' },
  { value: 'supervisor' },
  { value: 'agent' },
];

// Per-role chip metadata (icon / label / colour) lives in the shared
// ROLE_META module so this roster and the Overview identity chip can't
// drift. The colour scale runs amber (owner — scarce, immutable) →
// primary (admin) → muted (agent / viewer).

function fmtDate(iso: string): string {
  // Match the rest of the dashboard's locale-light formatting.
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function fmtExpiresIn(
  iso: string,
  t: (key: string, values?: Record<string, string | number>) => string
): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return t('expired');
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return t('expiresInDays', { days });
  const hours = Math.max(1, Math.floor(ms / (60 * 60 * 1000)));
  return t('expiresInHours', { hours });
}

export function MembersTab({
  onUpdated,
  revision = 0,
}: { onUpdated?: () => void; revision?: number } = {}) {
  const t = useTranslations('Settings.members');
  const tRoles = useTranslations('Settings.roles');
  const { user, canManageMembers } = useAuth();
  const { getPresence, getRow, now } = usePresence();

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [activating, setActivating] = useState<PendingUser | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [editing, setEditing] = useState<Member | null>(null);
  const [editTeamIds, setEditTeamIds] = useState<string[]>([]);
  const [editRole, setEditRole] = useState<AccountRole>('agent');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');
  const [organizationError, setOrganizationError] = useState(false);
  const [departmentId, setDepartmentId] = useState('');
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [removingMember, setRemovingMember] = useState<Member | null>(null);
  const [pendingMemberAction, setPendingMemberAction] = useState<string | null>(
    null
  );

  const loadEverything = useCallback(async () => {
    try {
      const [mres, ires, pres, ores] = await Promise.all([
        fetch('/api/account/members', { cache: 'no-store' }),
        canManageMembers
          ? fetch('/api/account/invitations', { cache: 'no-store' })
          : Promise.resolve(null),
        canManageMembers
          ? fetch('/api/account/pending-users', { cache: 'no-store' })
          : Promise.resolve(null),
        canManageMembers
          ? fetch('/api/account/teams', { cache: 'no-store' })
          : Promise.resolve(null),
      ]);

      setOrganizationError(!!ores && !ores.ok);
      setOrganization(ores?.ok ? await ores.json() : null);

      if (!mres.ok) {
        const payload = await mres.json().catch(() => ({}));
        toast.error(payload.error || t('loadFailed'));
        return;
      }
      const mdata = (await mres.json()) as { members: Member[] };
      setMembers(mdata.members);

      if (pres?.ok) {
        const data = (await pres.json()) as { users: PendingUser[] };
        setPendingUsers(data.users);
      } else if (pres) {
        toast.error('Não foi possível carregar os cadastros pendentes.');
      }

      if (ires) {
        if (!ires.ok) {
          const payload = await ires.json().catch(() => ({}));
          toast.error(payload.error || t('loadInvitationsFailed'));
          return;
        }
        const idata = (await ires.json()) as { invitations: Invitation[] };
        setInvitations(idata.invitations);
      } else {
        setInvitations([]);
      }
    } catch (err) {
      console.error('[MembersTab] load error:', err);
      toast.error(t('networkError'));
    } finally {
      setLoading(false);
    }
  }, [canManageMembers, t]);

  useEffect(() => {
    void loadEverything();
  }, [loadEverything, revision]);

  async function loadOrganization() {
    setOrganization(null);
    setOrganizationError(false);
    try {
      const response = await fetch('/api/account/teams', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      setOrganization(await response.json());
    } catch {
      setOrganizationError(true);
    }
  }

  function openCreate(pending: PendingUser | null = null) {
    setActivating(pending);
    setDepartmentId('');
    setCreateError('');
    setCreateOpen(true);
    void loadOrganization();
  }

  function openEdit(member: Member) {
    if (!organization) return;
    setEditing(member);
    setEditRole(member.role);
    setEditTeamIds(
      organization.members
        .filter((link) => link.user_id === member.user_id)
        .map((link) => link.team_id)
    );
    setEditError('');
  }

  async function handleEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || savingEdit) return;
    const form = new FormData(event.currentTarget);
    setSavingEdit(true);
    setEditError('');
    try {
      const response = await fetch(`/api/account/members/${editing.user_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'),
          role: editRole,
          teamIds: editTeamIds,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || 'Não foi possível salvar o usuário.');
      setEditing(null);
      toast.success('Usuário atualizado.');
      onUpdated?.();
      await loadEverything();
    } catch (error) {
      setEditError(
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar o usuário.'
      );
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    const form = new FormData(event.currentTarget);
    setCreating(true);
    setCreateError('');
    try {
      const response = await fetch('/api/account/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'),
          email: activating?.email ?? form.get('email'),
          role: form.get('role'),
          password: form.get('password'),
          departmentId,
          teamId: form.get('teamId') ?? '',
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || 'Não foi possível criar o usuário.');
      setCreateOpen(false);
      toast.success(
        activating ? 'Acesso ativado.' : 'Usuário criado com acesso ativo.'
      );
      onUpdated?.();
      await loadEverything();
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : 'Não foi possível criar o usuário.'
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleRoleChange(member: Member, nextRole: AccountRole) {
    if (member.role === nextRole) return;
    // Optimistic update — flip the dropdown immediately so the UI
    // feels snappy. If the server PATCH fails we revert below so
    // the dropdown doesn't lie about the persisted state.
    const previousRole = member.role;
    setPendingMemberAction(member.user_id);
    setMembers((prev) =>
      prev.map((m) =>
        m.user_id === member.user_id ? { ...m, role: nextRole } : m
      )
    );
    try {
      const res = await fetch(`/api/account/members/${member.user_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      });
      if (!res.ok) {
        // Revert the optimistic flip. The toast on its own wasn't
        // enough — the dropdown was left showing the new role
        // forever, so the next interaction operated on a wrong
        // baseline (re-trying the same change would no-op via the
        // `member.role === nextRole` guard at the top).
        setMembers((prev) =>
          prev.map((m) =>
            m.user_id === member.user_id ? { ...m, role: previousRole } : m
          )
        );
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || t('updateRoleFailed'));
        return;
      }
      toast.success(
        t('updatedToast', {
          name: member.full_name || t('unnamed'),
          role: tRoles(nextRole),
        })
      );
      onUpdated?.();
    } catch (err) {
      // Same revert on network failure.
      setMembers((prev) =>
        prev.map((m) =>
          m.user_id === member.user_id ? { ...m, role: previousRole } : m
        )
      );
      console.error('[MembersTab] role change error:', err);
      toast.error(t('networkError'));
    } finally {
      setPendingMemberAction(null);
    }
  }

  async function handleRemove() {
    if (!removingMember) return;
    setPendingMemberAction(removingMember.user_id);
    try {
      const res = await fetch(
        `/api/account/members/${removingMember.user_id}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || t('removeFailed'));
        return;
      }
      toast.success(
        t('removedToast', { name: removingMember.full_name || t('unnamed') })
      );
      setMembers((prev) =>
        prev.filter((m) => m.user_id !== removingMember.user_id)
      );
      setRemovingMember(null);
      onUpdated?.();
    } catch (err) {
      console.error('[MembersTab] remove error:', err);
      toast.error(t('networkError'));
    } finally {
      setPendingMemberAction(null);
    }
  }

  async function handleRevoke(invite: Invitation) {
    try {
      const res = await fetch(`/api/account/invitations/${invite.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || t('revokeFailed'));
        return;
      }
      toast.success(t('revokedToast'));
      setInvitations((prev) => prev.filter((i) => i.id !== invite.id));
    } catch (err) {
      console.error('[MembersTab] revoke error:', err);
      toast.error(t('networkError'));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="text-primary size-6 animate-spin" />
      </div>
    );
  }

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      <SettingsPanelHead
        title={t('title')}
        description={t('description')}
        action={
          <RequireRole min="admin">
            <Button onClick={() => openCreate()} className={motion.action}>
              <UserPlus className="size-4" aria-hidden="true" />
              <span className={motion.label}>Criar usuário</span>
            </Button>
          </RequireRole>
        }
      />

      {/* Live presence summary across the roster. Updates without a
          full refresh as heartbeats and the local re-derive tick land. */}
      {members.length > 0 &&
        (() => {
          const counts = summarize(members.map((m) => getPresence(m.user_id)));
          return (
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <PresenceDot status="online" />
                {counts.online} {t('online')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <PresenceDot status="away" />
                {counts.away} {t('away')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <PresenceDot status="offline" />
                {counts.offline} {t('offline')}
              </span>
              <span className="text-muted-foreground/70">
                · {t('memberCount', { count: members.length })}
              </span>
            </div>
          );
        })()}

      {/* Usuários da empresa */}
      {organizationError && (
        <div role="alert" className="flex items-center gap-3 text-sm">
          <p>Não foi possível carregar departamentos e equipes.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadEverything()}
          >
            Tentar novamente
          </Button>
        </div>
      )}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground border-b">
                <tr>
                  <th className="px-4 py-2 font-medium">Usuário</th>
                  <th className="px-4 py-2 font-medium">E-mail</th>
                  <th className="px-4 py-2 font-medium">Perfil</th>
                  <th className="px-4 py-2 font-medium">Departamentos</th>
                  <th className="px-4 py-2 font-medium">Equipes</th>
                  <th className="px-4 py-2 font-medium">Disponibilidade</th>
                  <th className="px-4 py-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {members.map((member) => {
                  const isSelf = member.user_id === user?.id;
                  const editable =
                    canManageMembers && member.role !== 'owner' && !isSelf;
                  const presence = getPresence(member.user_id);
                  const teamIds = new Set(
                    organization?.members
                      .filter((link) => link.user_id === member.user_id)
                      .map((link) => link.team_id)
                  );
                  const teams =
                    organization?.teams.filter((team) =>
                      teamIds.has(team.id)
                    ) ?? [];
                  const departments =
                    organization?.departments.filter((department) =>
                      teams.some((team) => team.department_id === department.id)
                    ) ?? [];
                  return (
                    <tr key={member.user_id} className="hover:bg-muted/50">
                      <td className="px-4 py-2 font-medium">
                        {member.full_name || t('unnamed')}
                        {isSelf && (
                          <span className="text-muted-foreground ml-2 text-xs">
                            ({t('you')})
                          </span>
                        )}
                      </td>
                      <td className="text-muted-foreground px-4 py-2">
                        {member.email || '—'}
                      </td>
                      <td className="px-4 py-2">
                        {editable ? (
                          <Select
                            value={member.role}
                            onValueChange={(value) =>
                              value &&
                              handleRoleChange(member, value as AccountRole)
                            }
                          >
                            <SelectTrigger
                              className="w-36"
                              disabled={pendingMemberAction === member.user_id}
                            >
                              <SelectValue>{tRoles(member.role)}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {EDITABLE_ROLES.map((role) => (
                                <SelectItem key={role.value} value={role.value}>
                                  {tRoles(role.value)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          tRoles(member.role)
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          {departments.map((department) => (
                            <Badge key={department.id} variant="secondary">
                              {department.name}
                            </Badge>
                          ))}
                          {!departments.length && (
                            <span className="text-muted-foreground">
                              {organization
                                ? 'Sem departamento'
                                : 'Indisponível'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          {teams.map((team) => (
                            <Badge
                              key={team.id}
                              variant="outline"
                              title={
                                organization?.departments.find(
                                  (department) =>
                                    department.id === team.department_id
                                )?.name
                              }
                            >
                              {team.name}
                            </Badge>
                          ))}
                          {!teams.length && (
                            <span className="text-muted-foreground">
                              {organization ? 'Sem equipe' : 'Indisponível'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-muted-foreground px-4 py-2">
                        <span className="inline-flex items-center gap-2">
                          <PresenceDot status={presence} />
                          {presenceLabel(
                            presence,
                            getRow(member.user_id)?.last_seen_at ?? null,
                            now
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          {canManageMembers && (
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label={`Editar ${member.full_name || 'usuário'}`}
                              onClick={() => openEdit(member)}
                              disabled={
                                !organization ||
                                pendingMemberAction === member.user_id
                              }
                            >
                              <Pencil className="size-4" />
                              Editar
                            </Button>
                          )}
                          {editable && (
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label={`Remover ${member.full_name || 'usuário'}`}
                              onClick={() => setRemovingMember(member)}
                              disabled={pendingMemberAction === member.user_id}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {canManageMembers &&
                  pendingUsers.map((member) => (
                    <tr key={member.id}>
                      <td className="px-4 py-2 font-medium">
                        {member.full_name}
                      </td>
                      <td className="text-muted-foreground px-4 py-2">
                        {member.email}
                      </td>
                      <td className="px-4 py-2">{tRoles(member.role)}</td>
                      <td className="text-muted-foreground px-4 py-2">
                        Sem departamento
                      </td>
                      <td className="text-muted-foreground px-4 py-2">
                        Sem equipe
                      </td>
                      <td className="px-4 py-2">—</td>
                      <td className="px-4 py-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openCreate(member)}
                        >
                          Ativar acesso
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open && !savingEdit) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
            <DialogDescription>
              Atualize o nome, o perfil e as equipes de atendimento.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <form onSubmit={handleEdit} className="space-y-4">
              <label className="block space-y-1 text-sm">
                <span>Nome completo</span>
                <Input
                  name="name"
                  defaultValue={editing.full_name}
                  required
                  maxLength={120}
                  disabled={savingEdit}
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span>E-mail de acesso</span>
                <Input type="email" value={editing.email ?? ''} readOnly />
                <span className="text-muted-foreground block text-xs">
                  O e-mail de acesso não é alterado neste formulário.
                </span>
              </label>
              <label className="block space-y-1 text-sm">
                <span>Perfil</span>
                <select
                  value={editRole}
                  onChange={(event) =>
                    setEditRole(event.target.value as AccountRole)
                  }
                  disabled={
                    savingEdit ||
                    editing.role === 'owner' ||
                    editing.user_id === user?.id
                  }
                  className="border-input bg-background h-9 w-full rounded-md border px-3"
                >
                  {(editing.role === 'owner' || editing.role === 'viewer') && (
                    <option value={editing.role}>{tRoles(editing.role)}</option>
                  )}
                  {EDITABLE_ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {tRoles(role.value)}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset
                disabled={savingEdit || editRole === 'viewer'}
                className="space-y-3"
              >
                <legend className="mb-1 text-sm font-medium">
                  Departamentos e equipes
                </legend>
                <p className="text-muted-foreground text-xs">
                  Marque as equipes das quais o usuário faz parte. Os
                  departamentos são definidos pelas equipes selecionadas.
                </p>
                {organization?.departments.map((department) => {
                  const teams = organization.teams.filter(
                    (team) => team.department_id === department.id
                  );
                  if (!teams.length) return null;
                  return (
                    <div
                      key={department.id}
                      className="space-y-2 rounded-md border p-3"
                    >
                      <p className="text-sm font-medium">{department.name}</p>
                      {teams.map((team) => (
                        <label
                          key={team.id}
                          className="flex items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={editTeamIds.includes(team.id)}
                            onChange={(event) =>
                              setEditTeamIds((previous) =>
                                event.target.checked
                                  ? [...previous, team.id]
                                  : previous.filter((id) => id !== team.id)
                              )
                            }
                          />
                          {team.name}
                        </label>
                      ))}
                    </div>
                  );
                })}
                {!organization?.teams.length && (
                  <p className="text-muted-foreground text-sm">
                    Nenhuma equipe cadastrada.
                  </p>
                )}
              </fieldset>
              {organization?.members.some(
                (link) =>
                  link.user_id === editing.user_id &&
                  !editTeamIds.includes(link.team_id)
              ) && (
                <p className="text-muted-foreground rounded-md border p-3 text-xs">
                  Ao remover uma equipe, os atendimentos desse usuário nela
                  voltarão à fila para redistribuição.
                </p>
              )}
              {editError && (
                <p role="alert" className="text-destructive text-sm">
                  {editError}
                </p>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={savingEdit}
                  onClick={() => setEditing(null)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={savingEdit}>
                  {savingEdit ? 'Salvando…' : 'Salvar alterações'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Preserve access to previously issued links. */}
      {invitations.length > 0 && (
        <RequireRole min="admin">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <UsersRound className="text-muted-foreground size-4" />
              <h3 className="text-foreground text-sm font-semibold">
                {t('pendingInvitations')}
              </h3>
              <Badge className="bg-muted text-muted-foreground border-border">
                {invitations.length}
              </Badge>
            </div>
            {/* P10 — make the no-resend design explicit. Admins were
              confused why the pending list shows roles + expiry but
              no "copy link again" button. Stating the constraint up
              front (rather than letting the user discover it by
              looking for a button) keeps it from feeling like a bug. */}
            {invitations.length > 0 ? (
              <p className="text-muted-foreground mb-3 text-xs">
                {t('inviteHint')}
              </p>
            ) : null}

            <Card>
              <CardContent className="p-0">
                <ul className="divide-border divide-y">
                  {invitations.map((inv) => {
                    const inviteRoleMeta = ROLE_META[inv.role];
                    const InviteRoleIcon = inviteRoleMeta.icon;
                    return (
                      <li
                        key={inv.id}
                        className="flex items-center gap-4 px-4 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-foreground text-sm font-medium">
                              {inv.label || t('untitledInvite')}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${inviteRoleMeta.className}`}
                            >
                              <InviteRoleIcon className="size-3" />
                              {tRoles(inv.role)}
                            </span>
                          </div>
                          <p className="text-muted-foreground mt-0.5 text-xs">
                            {t('created', { date: fmtDate(inv.created_at) })} ·{' '}
                            {fmtExpiresIn(inv.expires_at, t)}
                          </p>
                        </div>

                        {/* Revoke: red default state, mirrors the
                          members-tab Remove button. Pre-polish version
                          read as a neutral secondary button until
                          hover. */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRevoke(inv)}
                          className="border-red-500/40 bg-red-500/10 text-red-300 hover:border-red-500/60 hover:bg-red-500/20 hover:text-red-200"
                        >
                          <MailX className="size-4" />
                          {t('revoke')}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          </div>
        </RequireRole>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!creating) setCreateOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {activating ? 'Ativar acesso' : 'Criar usuário'}
            </DialogTitle>
            <DialogDescription>
              O e-mail e a senha inicial já poderão ser usados para entrar.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleCreate}>
            <label className="block space-y-1 text-sm">
              <span>Nome completo</span>
              <Input
                name="name"
                defaultValue={activating?.full_name}
                autoComplete="name"
                required
                maxLength={120}
                disabled={creating}
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span>E-mail</span>
              <Input
                name="email"
                type="email"
                defaultValue={activating?.email}
                readOnly={!!activating}
                autoComplete="email"
                required
                maxLength={254}
                disabled={creating}
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span>Perfil</span>
              <select
                name="role"
                defaultValue={activating?.role ?? 'agent'}
                disabled={creating}
                className="border-input bg-background h-9 w-full rounded-md border px-3"
              >
                {EDITABLE_ROLES.map((role) => (
                  <option key={role.value} value={role.value}>
                    {tRoles(role.value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 text-sm">
              <span>Senha inicial</span>
              <Input
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={72}
                disabled={creating}
              />
              <span className="text-muted-foreground block text-xs">
                Pelo menos 12 caracteres.
              </span>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1 text-sm">
                <span>Departamento</span>
                <select
                  value={departmentId}
                  onChange={(event) => setDepartmentId(event.target.value)}
                  disabled={creating || !organization}
                  className="border-input bg-background h-9 w-full rounded-md border px-3"
                >
                  <option value="">Sem departamento</option>
                  {organization?.departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-sm">
                <span>Equipe</span>
                <select
                  key={departmentId}
                  name="teamId"
                  required={!!departmentId}
                  disabled={creating || !departmentId}
                  className="border-input bg-background h-9 w-full rounded-md border px-3"
                >
                  <option value="">
                    {departmentId
                      ? 'Selecione uma equipe'
                      : 'Selecione um departamento'}
                  </option>
                  {organization?.teams
                    .filter((team) => team.department_id === departmentId)
                    .map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            {!organization && !organizationError && (
              <p role="status" className="text-muted-foreground text-xs">
                Carregando departamentos e equipes…
              </p>
            )}
            {organizationError && (
              <div className="flex items-center gap-2 text-xs">
                <p role="alert">
                  Não foi possível carregar departamentos e equipes.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void loadOrganization()}
                >
                  Tentar novamente
                </Button>
              </div>
            )}
            {createError && (
              <p role="alert" className="text-destructive text-sm">
                {createError}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={creating}
                onClick={() => setCreateOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={creating} className={motion.action}>
                <span className={motion.label}>
                  {creating
                    ? 'Salvando…'
                    : activating
                      ? 'Ativar acesso'
                      : 'Criar usuário'}
                </span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={removingMember !== null}
        onOpenChange={(open) => {
          if (!open) setRemovingMember(null);
        }}
      >
        <DialogContent className="bg-popover border-border sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-400" />
              {t('removeDialogTitle')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t.rich('removeDialogDesc', {
                name: removingMember?.full_name || t('unnamed'),
                bold: (chunks: React.ReactNode) => <strong>{chunks}</strong>,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setRemovingMember(null)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={handleRemove}
              disabled={!!pendingMemberAction}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {pendingMemberAction ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('removing')}
                </>
              ) : (
                t('removeBtn')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
