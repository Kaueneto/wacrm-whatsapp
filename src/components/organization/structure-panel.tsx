'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  Building2,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { OrganizationCanvas } from './organization-canvas';
import {
  applyMembershipChange,
  roleLabel,
  teamUsers,
  type DraggedUser,
  type OrganizationData,
} from './organization-model';

interface Editor {
  kind: 'department' | 'team';
  id?: string;
  name: string;
  departmentId: string;
}
interface LinkEditor {
  userId: string;
  sourceTeamId: string | null;
  teamId: string;
  mode: 'add' | 'move';
}
const selectClass =
  'border-input bg-background h-9 w-full rounded-md border px-3 text-sm';

export default function StructurePanel({
  revision,
  view = 'structure',
}: {
  revision: number;
  view?: 'structure' | 'departments' | 'teams';
}) {
  const [display, setDisplay] = useState<'chart' | 'list'>('chart');
  const { account } = useAuth();
  const [data, setData] = useState<OrganizationData | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(true);
  const [saving, setSaving] = useState(false);
  const mutationLock = useRef(false);
  const request = useRef<AbortController | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [link, setLink] = useState<LinkEditor | null>(null);
  const [removal, setRemoval] = useState<{
    userId: string;
    teamId: string;
  } | null>(null);

  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setRefreshing(true);
    try {
      const [organizationResponse, usersResponse] = await Promise.all([
        fetch('/api/account/teams', {
          cache: 'no-store',
          signal: controller.signal,
        }),
        fetch('/api/account/members', {
          cache: 'no-store',
          signal: controller.signal,
        }),
      ]);
      const [organization, roster] = await Promise.all([
        organizationResponse.json(),
        usersResponse.json(),
      ]);
      if (!organizationResponse.ok || !usersResponse.ok)
        throw new Error(
          organization.error ||
            roster.error ||
            'Não foi possível carregar a estrutura.'
        );
      if (controller.signal.aborted) return;
      setData({
        departments: organization.departments,
        teams: organization.teams,
        memberships: organization.members,
        users: roster.members,
      });
      setError('');
    } catch (error) {
      if (!controller.signal.aborted)
        setError(
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar a estrutura.'
        );
    } finally {
      if (!controller.signal.aborted) setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, [load, revision]);

  async function mutate(
    payload: Record<string, string>,
    update: (data: OrganizationData, entity: unknown) => OrganizationData
  ) {
    if (mutationLock.current) return false;
    mutationLock.current = true;
    setSaving(true);
    // Cancel older reads so they cannot overwrite a successfully saved change.
    request.current?.abort();
    setRefreshing(false);
    try {
      const response = await fetch('/api/account/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || 'Não foi possível salvar.');
      setData((previous) =>
        previous ? update(previous, result.entity) : previous
      );
      toast.success('Estrutura atualizada.');
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Falha ao salvar. Tente novamente.'
      );
      return false;
    } finally {
      mutationLock.current = false;
      setSaving(false);
    }
  }

  async function saveEntity(event: FormEvent) {
    event.preventDefault();
    if (!editor || !editor.name.trim()) return;
    const payload = {
      action: editor.id ? `update-${editor.kind}` : editor.kind,
      name: editor.name.trim(),
      departmentId: editor.departmentId,
      ...(editor.id ? { id: editor.id } : {}),
    };
    const success = await mutate(payload, (previous, entity) => {
      if (editor.kind === 'department') {
        const department = entity as OrganizationData['departments'][number];
        return {
          ...previous,
          departments: editor.id
            ? previous.departments.map((item) =>
                item.id === editor.id ? department : item
              )
            : [...previous.departments, department],
        };
      }
      const team = entity as OrganizationData['teams'][number];
      return {
        ...previous,
        teams: editor.id
          ? previous.teams.map((item) => (item.id === editor.id ? team : item))
          : [...previous.teams, team],
      };
    });
    if (success) setEditor(null);
  }

  async function saveLink(event: FormEvent) {
    event.preventDefault();
    if (!link?.userId || !link.teamId) return;
    const moving = link.mode === 'move' && !!link.sourceTeamId;
    const success = await mutate(
      {
        action: moving ? 'move-member' : 'add-member',
        userId: link.userId,
        teamId: link.teamId,
        ...(moving ? { sourceTeamId: link.sourceTeamId! } : {}),
      },
      (previous) => ({
        ...previous,
        memberships: applyMembershipChange(
          previous.memberships,
          link.userId,
          link.teamId,
          moving ? link.sourceTeamId : null
        ),
      })
    );
    if (success) setLink(null);
  }

  async function removeMembership() {
    if (!removal) return;
    const success = await mutate(
      {
        action: 'remove-member',
        userId: removal.userId,
        teamId: removal.teamId,
      },
      (previous) => ({
        ...previous,
        memberships: previous.memberships.filter(
          (item) =>
            item.team_id !== removal.teamId || item.user_id !== removal.userId
        ),
      })
    );
    if (success) setRemoval(null);
  }

  function chooseLink(user: DraggedUser, targetTeamId?: string) {
    if (
      targetTeamId &&
      !user.sourceTeamId &&
      data?.memberships.some(
        (item) => item.user_id === user.userId && item.team_id === targetTeamId
      )
    ) {
      toast.info('Esta pessoa já faz parte da equipe.');
      return;
    }
    setLink({
      userId: user.userId,
      sourceTeamId: user.sourceTeamId,
      teamId: targetTeamId ?? '',
      mode: user.sourceTeamId ? 'move' : 'add',
    });
  }

  if (!data && refreshing)
    return (
      <div
        role="status"
        className="border-border bg-card flex h-[65vh] items-center justify-center gap-2 rounded-xl border text-sm"
      >
        <Loader2 className="text-primary size-4 animate-spin motion-reduce:animate-none" />
        Carregando estrutura…
      </div>
    );
  if (!data)
    return (
      <div
        role="alert"
        className="border-border space-y-3 rounded-xl border p-6"
      >
        <p>{error || 'Não foi possível carregar.'}</p>
        <Button variant="outline" onClick={() => void load()}>
          Tentar novamente
        </Button>
      </div>
    );

  const targetTeam = data.teams.find((team) => team.id === link?.teamId);
  const sourceTeam = data.teams.find((team) => team.id === link?.sourceTeamId);
  const linkUser = data.users.find((user) => user.user_id === link?.userId);
  const hasTargetMembership =
    !!link &&
    data.memberships.some(
      (item) => item.user_id === link.userId && item.team_id === link.teamId
    );
  const canSubmitLink =
    !!link?.userId &&
    !!targetTeam &&
    link.sourceTeamId !== link.teamId &&
    (!hasTargetMembership || link.mode === 'move');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {view !== 'structure' ? (
          <h2 className="text-lg font-semibold">
            {view === 'departments' ? 'Departamentos' : 'Equipes'}
          </h2>
        ) : (
          <div className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-1 text-xs">
            <span>
              <strong className="text-foreground">
                {data.departments.length}
              </strong>{' '}
              departamentos
            </span>
            <span>
              <strong className="text-foreground">{data.teams.length}</strong>{' '}
              equipes
            </span>
            <span>
              <strong className="text-foreground">{data.users.length}</strong>{' '}
              usuários
            </span>
            <span>
              <strong className="text-foreground">
                {
                  data.users.filter(
                    (user) =>
                      !data.memberships.some(
                        (link) => link.user_id === user.user_id
                      )
                  ).length
                }
              </strong>{' '}
              sem equipe
            </span>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            aria-label="Atualizar estrutura"
            disabled={saving || refreshing}
            onClick={() => void load()}
          >
            <RefreshCw
              className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`}
            />
          </Button>
          {view !== 'teams' && (
            <Button
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() =>
                setEditor({ kind: 'department', name: '', departmentId: '' })
              }
            >
              <Building2 className="size-3.5" />
              Novo departamento
            </Button>
          )}
          {view !== 'departments' && (
            <Button
              size="sm"
              disabled={saving || !data.departments.length}
              onClick={() =>
                setEditor({
                  kind: 'team',
                  name: '',
                  departmentId: data.departments[0]?.id ?? '',
                })
              }
            >
              <Plus className="size-3.5" />
              Nova equipe
            </Button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {view === 'departments' && (
        <div className="border-border bg-card rounded-xl border">
          <Table aria-label="Departamentos">
            <TableHeader>
              <TableRow>
                <TableHead>Departamento</TableHead>
                <TableHead>Equipes</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.departments.map((department) => (
                <TableRow key={department.id}>
                  <TableCell className="font-medium">
                    {department.name}
                  </TableCell>
                  <TableCell>
                    {
                      data.teams.filter(
                        (team) => team.department_id === department.id
                      ).length
                    }
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={saving}
                      aria-label={`Editar ${department.name}`}
                      onClick={() =>
                        setEditor({
                          kind: 'department',
                          id: department.id,
                          name: department.name,
                          departmentId: '',
                        })
                      }
                    >
                      Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!data.departments.length && (
                <TableRow>
                  <TableCell colSpan={3}>
                    Nenhum departamento cadastrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
      {view === 'teams' && (
        <div className="border-border bg-card rounded-xl border">
          <Table aria-label="Equipes">
            <TableHeader>
              <TableRow>
                <TableHead>Equipe</TableHead>
                <TableHead>Departamento</TableHead>
                <TableHead>Integrantes</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.teams.map((team) => (
                <TableRow key={team.id}>
                  <TableCell className="font-medium">{team.name}</TableCell>
                  <TableCell>
                    {data.departments.find(
                      (department) => department.id === team.department_id
                    )?.name ?? '—'}
                  </TableCell>
                  <TableCell>{teamUsers(data, team.id).length}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={saving}
                      aria-label={`Editar ${team.name}`}
                      onClick={() =>
                        setEditor({
                          kind: 'team',
                          id: team.id,
                          name: team.name,
                          departmentId: team.department_id,
                        })
                      }
                    >
                      Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!data.teams.length && (
                <TableRow>
                  <TableCell colSpan={4}>
                    {data.departments.length
                      ? 'Nenhuma equipe cadastrada.'
                      : 'Crie um departamento para cadastrar a primeira equipe.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
      {view === 'structure' && (
        <>
          <div
            role="group"
            className="bg-muted border-border inline-flex rounded-lg border p-0.5"
            aria-label="Formato da estrutura"
          >
            {(
              [
                { value: 'chart', label: 'Organograma' },
                { value: 'list', label: 'Lista' },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                className="text-muted-foreground aria-pressed:bg-background aria-pressed:text-foreground rounded-md px-3 py-1.5 text-sm font-medium aria-pressed:shadow-sm"
                aria-pressed={display === option.value}
                onClick={() => setDisplay(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {display === 'list' ? (
            <div className="border-border bg-card divide-border divide-y rounded-xl border">
              {data.departments.map((department) => (
                <details key={department.id} className="p-4">
                  <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold [&::-webkit-details-marker]:hidden [&[aria-expanded=true]>svg]:rotate-90 [details[open]>&>svg]:rotate-90">
                    <ChevronRight
                      aria-hidden="true"
                      className="bg-primary/10 text-primary size-6 rounded p-1 transition-transform motion-reduce:transition-none"
                    />
                    {department.name}
                  </summary>
                  <div className="mt-3 space-y-2 pl-5">
                    {data.teams
                      .filter((team) => team.department_id === department.id)
                      .map((team) => (
                        <details
                          key={team.id}
                          className="border-border rounded-lg border p-3"
                        >
                          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden [details[open]>&>svg]:rotate-90">
                            <ChevronRight
                              aria-hidden="true"
                              className="size-5 rounded bg-sky-500/10 p-0.5 text-sky-700 transition-transform motion-reduce:transition-none dark:text-sky-300"
                            />
                            {team.name}
                          </summary>
                          <ul className="text-muted-foreground mt-2 space-y-2 pl-5 text-sm">
                            {teamUsers(data, team.id).map((user) => (
                              <li key={user.user_id}>
                                {user.full_name} · {roleLabel(user.role)}
                              </li>
                            ))}
                            {!teamUsers(data, team.id).length && (
                              <li>Sem integrantes</li>
                            )}
                          </ul>
                        </details>
                      ))}
                  </div>
                </details>
              ))}
              {!data.departments.length && (
                <p className="text-muted-foreground p-5 text-sm">
                  Nenhum departamento cadastrado.
                </p>
              )}
            </div>
          ) : (
            <OrganizationCanvas
              data={data}
              companyName={account?.name || 'Sua empresa'}
              busy={saving}
              onEditDepartment={(department) =>
                setEditor({
                  kind: 'department',
                  id: department.id,
                  name: department.name,
                  departmentId: '',
                })
              }
              onEditTeam={(team) =>
                setEditor({
                  kind: 'team',
                  id: team.id,
                  name: team.name,
                  departmentId: team.department_id,
                })
              }
              onCreateTeam={(departmentId) =>
                setEditor({ kind: 'team', name: '', departmentId })
              }
              onLinkUser={chooseLink}
              onRemoveUser={(userId, teamId) => setRemoval({ userId, teamId })}
            />
          )}
          {display === 'chart' && (
            <p className="text-muted-foreground text-xs">
              Arraste os cabeçalhos para organizar o mapa. Os vínculos são
              salvos ao confirmar; a posição dos cartões é apenas uma
              organização visual desta sessão.
            </p>
          )}
        </>
      )}

      <Dialog
        open={!!editor}
        onOpenChange={(open) => {
          if (!open && !saving) setEditor(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editor?.id ? 'Editar' : 'Criar'}{' '}
              {editor?.kind === 'department' ? 'departamento' : 'equipe'}
            </DialogTitle>
            <DialogDescription>
              {editor?.kind === 'department'
                ? 'Agrupe as equipes por área de atendimento.'
                : 'Defina o nome e o departamento da equipe. Os integrantes são adicionados no mapa.'}
            </DialogDescription>
          </DialogHeader>
          {editor && (
            <form onSubmit={saveEntity} className="space-y-4">
              <label className="block space-y-1 text-sm">
                <span>Nome</span>
                <Input
                  autoFocus
                  required
                  maxLength={80}
                  value={editor.name}
                  disabled={saving}
                  onChange={(event) =>
                    setEditor({ ...editor, name: event.target.value })
                  }
                  placeholder={
                    editor.kind === 'department'
                      ? 'Ex.: Financeiro'
                      : 'Ex.: Cobrança'
                  }
                />
              </label>
              {editor.kind === 'team' && (
                <label className="block space-y-1 text-sm">
                  <span>Departamento</span>
                  <select
                    required
                    value={editor.departmentId}
                    disabled={saving}
                    onChange={(event) =>
                      setEditor({ ...editor, departmentId: event.target.value })
                    }
                    className={selectClass}
                  >
                    <option value="">Selecione</option>
                    {data.departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => setEditor(null)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={
                    saving ||
                    !editor.name.trim() ||
                    (editor.kind === 'team' && !editor.departmentId)
                  }
                >
                  {saving ? 'Salvando…' : 'Salvar'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!link}
        onOpenChange={(open) => {
          if (!open && !saving) setLink(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Organizar integrante</DialogTitle>
            <DialogDescription>
              {link?.sourceTeamId
                ? `Escolha como vincular ${linkUser?.full_name || 'esta pessoa'} à equipe de destino.`
                : 'Adicione uma pessoa à equipe. O perfil e as permissões permanecem os mesmos.'}
            </DialogDescription>
          </DialogHeader>
          {link && (
            <form onSubmit={saveLink} className="space-y-4">
              <label className="block space-y-1 text-sm">
                <span>Pessoa</span>
                <select
                  required
                  value={link.userId}
                  disabled={saving || !!link.sourceTeamId}
                  onChange={(event) =>
                    setLink({ ...link, userId: event.target.value })
                  }
                  className={selectClass}
                >
                  <option value="">Selecione uma pessoa</option>
                  {data.users
                    .filter((user) => user.role !== 'viewer')
                    .map((user) => (
                      <option key={user.user_id} value={user.user_id}>
                        {user.full_name} · {roleLabel(user.role)}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block space-y-1 text-sm">
                <span>Equipe de destino</span>
                <select
                  required
                  value={link.teamId}
                  disabled={saving}
                  onChange={(event) =>
                    setLink({ ...link, teamId: event.target.value })
                  }
                  className={selectClass}
                >
                  <option value="">Selecione uma equipe</option>
                  {data.teams
                    .filter((team) => team.id !== link.sourceTeamId)
                    .map((team) => (
                      <option key={team.id} value={team.id}>
                        {
                          data.departments.find(
                            (department) => department.id === team.department_id
                          )?.name
                        }{' '}
                        / {team.name}
                      </option>
                    ))}
                </select>
              </label>
              {link.sourceTeamId && (
                <fieldset className="space-y-2 text-sm">
                  <legend className="mb-2 font-medium">
                    Vínculo com {sourceTeam?.name || 'a equipe de origem'}
                  </legend>
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="membership-mode"
                      value="move"
                      checked={link.mode === 'move'}
                      disabled={saving}
                      onChange={() => setLink({ ...link, mode: 'move' })}
                    />
                    <span>Mover para a nova equipe</span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="membership-mode"
                      value="add"
                      checked={link.mode === 'add'}
                      disabled={saving}
                      onChange={() => setLink({ ...link, mode: 'add' })}
                    />
                    <span>Manter na origem e adicionar à nova equipe</span>
                  </label>
                </fieldset>
              )}
              {link.sourceTeamId && link.mode === 'move' && (
                <p className="border-border text-muted-foreground rounded-lg border p-3 text-xs">
                  Os atendimentos desta pessoa em{' '}
                  {sourceTeam?.name || 'sua equipe anterior'} voltam à fila
                  dessa equipe para redistribuição.
                </p>
              )}
              {hasTargetMembership && (
                <p className="text-muted-foreground text-xs">
                  Esta pessoa já integra a equipe de destino.
                  {link.mode === 'move'
                    ? ' Será removido apenas o vínculo com a origem.'
                    : ''}
                </p>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => setLink(null)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving || !canSubmitLink}>
                  {saving ? 'Salvando…' : 'Confirmar vínculo'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!removal}
        onOpenChange={(open) => {
          if (!open && !saving) setRemoval(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover integrante da equipe?</DialogTitle>
            <DialogDescription>
              {data.users.find((user) => user.user_id === removal?.userId)
                ?.full_name || 'A pessoa'}{' '}
              continuará na empresa. Seus atendimentos nesta equipe voltarão à
              fila para redistribuição.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => setRemoval(null)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={saving}
              onClick={() => void removeMembership()}
            >
              {saving ? 'Removendo…' : 'Remover da equipe'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
