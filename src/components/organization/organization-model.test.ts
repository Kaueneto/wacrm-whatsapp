import { describe, expect, it } from 'vitest';
import {
  applyMembershipChange,
  organizationLayout,
  teamUsers,
  type OrganizationData,
} from './organization-model';

const data: OrganizationData = {
  departments: [
    { id: 'finance', name: 'Financeiro' },
    { id: 'sales', name: 'Comercial' },
  ],
  teams: [
    { id: 'a', name: 'Cobrança', department_id: 'finance' },
    { id: 'b', name: 'Acordos', department_id: 'finance' },
    { id: 'c', name: 'Vendas', department_id: 'sales' },
  ],
  users: [
    { user_id: 'one', full_name: 'Ana', role: 'agent' },
    { user_id: 'two', full_name: 'Bruna', role: 'supervisor' },
  ],
  memberships: [
    { team_id: 'a', user_id: 'one' },
    { team_id: 'a', user_id: 'two' },
  ],
};
describe('organization structure', () => {
  it('shows supervisors ahead of attendants within their teams', () => {
    expect(teamUsers(data, 'a').map((user) => user.user_id)).toEqual([
      'two',
      'one',
    ]);
    expect(teamUsers(data, 'b')).toEqual([]);
  });
  it('preserves other team memberships when adding and avoids duplicates', () => {
    const result = applyMembershipChange(data.memberships, 'one', 'b');
    expect(result).toContainEqual({ user_id: 'one', team_id: 'a' });
    expect(applyMembershipChange(result, 'one', 'b')).toHaveLength(3);
    expect(data.memberships).toHaveLength(2);
  });
  it('moves only the specified source membership', () => {
    const links = [...data.memberships, { user_id: 'one', team_id: 'c' }];
    expect(applyMembershipChange(links, 'one', 'b', 'a')).toEqual([
      { user_id: 'two', team_id: 'a' },
      { user_id: 'one', team_id: 'c' },
      { user_id: 'one', team_id: 'b' },
    ]);
  });
  it('gives teams separate columns within their department hierarchy', () => {
    const positions = organizationLayout(data);
    expect(positions['team:a'].x).toBeLessThan(positions['team:b'].x);
    expect(positions['team:b'].x).toBeLessThan(positions['team:c'].x);
    expect(positions.company.y).toBeLessThan(positions['department:finance'].y);
    expect(positions['department:finance'].y).toBeLessThan(
      positions['team:a'].y
    );
  });
});
