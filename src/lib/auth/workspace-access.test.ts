import { describe, expect, it } from 'vitest';
import {
  canAccessSettingsSection,
  canAccessWorkspaceApi,
  canAccessWorkspacePage,
} from './workspace-access';
import { canSupervise, hasMinRole } from './roles';

describe('support roles', () => {
  it('places supervisor between administrator and attendant', () => {
    expect(hasMinRole('admin', 'supervisor')).toBe(true);
    expect(hasMinRole('supervisor', 'agent')).toBe(true);
    expect(hasMinRole('supervisor', 'admin')).toBe(false);
    expect(canSupervise('agent')).toBe(false);
  });
  it.each(['agent', 'supervisor'] as const)(
    'restricts %s to support and personal settings',
    (role) => {
      expect(canAccessWorkspacePage(role, '/inbox')).toBe(true);
      expect(canAccessWorkspacePage(role, '/campaigns/new')).toBe(false);
      expect(canAccessSettingsSection(role, 'profile')).toBe(true);
      expect(canAccessSettingsSection(role, 'whatsapp')).toBe(false);
      expect(canAccessWorkspaceApi(role, '/api/whatsapp/send', 'POST')).toBe(
        true
      );
      expect(canAccessWorkspaceApi(role, '/api/account/members', 'PATCH')).toBe(
        false
      );
      expect(canAccessWorkspaceApi(role, '/api/whatsapp/config', 'GET')).toBe(
        false
      );
      expect(
        canAccessWorkspaceApi(role, '/api/whatsapp/broadcast', 'POST')
      ).toBe(false);
      expect(canAccessWorkspaceApi(role, '/api/account/teams', 'POST')).toBe(
        false
      );
    }
  );
  it('allows only supervisors and administrators to route', () => {
    expect(
      canAccessWorkspaceApi('agent', '/api/support/assignment', 'POST')
    ).toBe(false);
    expect(
      canAccessWorkspaceApi('supervisor', '/api/support/assignment', 'POST')
    ).toBe(true);
    expect(
      canAccessWorkspaceApi('admin', '/api/support/assignment', 'POST')
    ).toBe(true);
  });
});
