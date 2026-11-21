'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface Team {
  id: string;
  name: string;
  department_id: string;
}
interface Department {
  id: string;
  name: string;
}
interface Member {
  user_id: string;
  full_name: string;
  role: string;
}
interface TeamMember {
  team_id: string;
  user_id: string;
}

export function TeamRoutingDialog({
  conversationId,
  currentTeamId,
  currentAgentId,
  onChanged,
}: {
  conversationId: string;
  currentTeamId?: string | null;
  currentAgentId?: string | null;
  onChanged: (agentId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [links, setLinks] = useState<TeamMember[]>([]);
  const [teamId, setTeamId] = useState('');
  const [agentId, setAgentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function show() {
    setTeamId(currentTeamId ?? '');
    setAgentId(currentAgentId ?? '');
    setError('');
    setOpen(true);
    setBusy(true);
    try {
      const [teamResponse, memberResponse] = await Promise.all([
        fetch('/api/account/teams', { cache: 'no-store' }),
        fetch('/api/account/members', { cache: 'no-store' }),
      ]);
      const [organization, roster] = await Promise.all([
        teamResponse.json(),
        memberResponse.json(),
      ]);
      if (!teamResponse.ok || !memberResponse.ok)
        throw new Error(
          organization.error || roster.error || 'Falha ao carregar equipes.'
        );
      setTeams(organization.teams);
      setDepartments(organization.departments);
      setLinks(organization.members);
      setMembers(roster.members);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Falha ao carregar.');
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    try {
      const response = await fetch('/api/support/assignment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          teamId: teamId || null,
          agentId: agentId || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      onChanged(data.conversation.assigned_agent_id);
      setOpen(false);
      toast.success('Atendimento direcionado.');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Falha ao direcionar.'
      );
    } finally {
      setBusy(false);
    }
  }
  const eligible = members.filter(
    (member) =>
      ['owner', 'admin', 'supervisor', 'agent'].includes(member.role) &&
      (!teamId ||
        links.some(
          (link) => link.team_id === teamId && link.user_id === member.user_id
        ))
  );
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => void show()}>
        <UsersRound className="size-4" />
        Equipe
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) setOpen(next);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Direcionar atendimento</DialogTitle>
            <DialogDescription>
              Escolha a equipe e o responsável. Sem responsável, o atendimento
              fica na fila da equipe. Supervisores só podem movimentar
              atendimentos entre suas equipes.
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : (
            <div className="space-y-4">
              <label className="block space-y-1 text-sm">
                <span>Departamento / Equipe</span>
                <select
                  className="border-input bg-background h-9 w-full rounded-md border px-3"
                  value={teamId}
                  disabled={busy}
                  onChange={(event) => {
                    setTeamId(event.target.value);
                    setAgentId('');
                  }}
                >
                  <option value="">Sem equipe</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {
                        departments.find((d) => d.id === team.department_id)
                          ?.name
                      }{' '}
                      / {team.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-sm">
                <span>Responsável</span>
                <select
                  className="border-input bg-background h-9 w-full rounded-md border px-3"
                  value={agentId}
                  disabled={busy}
                  onChange={(event) => setAgentId(event.target.value)}
                >
                  <option value="">Aguardar na fila</option>
                  {eligible.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.full_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button disabled={busy || !!error} onClick={() => void save()}>
              {busy ? 'Carregando…' : 'Confirmar direcionamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
