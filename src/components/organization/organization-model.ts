import type { AccountRole } from '@/lib/auth/roles';

export interface OrganizationUser {
  user_id: string;
  full_name: string;
  role: AccountRole;
  avatar_url?: string | null;
}
export interface Department {
  id: string;
  name: string;
}
export interface Team {
  id: string;
  name: string;
  department_id: string;
}
export interface Membership {
  team_id: string;
  user_id: string;
}
export interface OrganizationData {
  departments: Department[];
  teams: Team[];
  users: OrganizationUser[];
  memberships: Membership[];
}
export interface DraggedUser {
  userId: string;
  sourceTeamId: string | null;
}

export function roleLabel(role: AccountRole): string {
  return {
    owner: 'Administrador',
    admin: 'Administrador',
    supervisor: 'Supervisor',
    agent: 'Atendente',
    viewer: 'Somente leitura',
  }[role];
}

export function teamUsers(
  data: OrganizationData,
  teamId: string
): OrganizationUser[] {
  const ids = new Set(
    data.memberships
      .filter((link) => link.team_id === teamId)
      .map((link) => link.user_id)
  );
  const rank = { owner: 0, admin: 0, supervisor: 1, agent: 2, viewer: 3 };
  return data.users
    .filter((user) => ids.has(user.user_id))
    .sort(
      (a, b) =>
        rank[a.role] - rank[b.role] || a.full_name.localeCompare(b.full_name)
    );
}

export function organizationLayout(data: OrganizationData) {
  let x = 0;
  const positions: Record<string, { x: number; y: number }> = {};
  for (const department of data.departments) {
    const teams = data.teams.filter(
      (team) => team.department_id === department.id
    );
    const width = Math.max(teams.length, 1) * 340;
    positions[`department:${department.id}`] = {
      x: x + width / 2 - 150,
      y: 155,
    };
    teams.forEach((team, index) => {
      positions[`team:${team.id}`] = { x: x + index * 340 + 20, y: 320 };
    });
    x += width + 60;
  }
  positions.company = { x: Math.max(340, x - 60) / 2 - 150, y: 0 };
  return positions;
}

export function applyMembershipChange(
  links: Membership[],
  userId: string,
  teamId: string,
  sourceTeamId?: string | null
): Membership[] {
  const next = sourceTeamId
    ? links.filter(
        (link) => link.user_id !== userId || link.team_id !== sourceTeamId
      )
    : [...links];
  if (!next.some((link) => link.user_id === userId && link.team_id === teamId))
    next.push({ user_id: userId, team_id: teamId });
  return next;
}
