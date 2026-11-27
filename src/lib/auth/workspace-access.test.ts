import { describe, expect, it } from 'vitest';
import {
  canAccessSettingsSection,
  canAccessWorkspaceApi,
  canAccessWorkspacePage,
} from './workspace-access';
import { canSupervise, hasMinRole } from './roles';

describe('support roles', () => {
  it('restricts the first portfolio preview and its query configuration to administrators', () => {
    for (const role of ['owner', 'admin', 'supervisor', 'agent', 'viewer'] as const) {
      const allowed = role === 'owner' || role === 'admin';
      expect(canAccessWorkspacePage(role, '/collections')).toBe(allowed);
      expect(canAccessWorkspaceApi(role, '/api/integrations/uau/portfolio-settings', 'GET')).toBe(allowed);
      expect(canAccessWorkspaceApi(role, '/api/integrations/uau/portfolio-settings', 'PUT')).toBe(allowed);
    }
  });
  it('allows attendants to claim a team queue without opening supervisor assignment', () => {
    expect(canAccessWorkspaceApi('agent', '/api/support/claim', 'POST')).toBe(true);
    expect(canAccessWorkspaceApi('agent', '/api/support/assignment', 'POST')).toBe(false);
    expect(canAccessWorkspaceApi('viewer', '/api/support/claim', 'POST')).toBe(false);
  });
  it('allows contact finance reads and confirmed links without opening administrative ERP queries', () => {
    const path='/api/integrations/uau/contacts/00000000-0000-0000-0000-000000000001/finance';
    for(const role of ['agent','supervisor'] as const){
      for(const method of ['GET','POST','PUT','DELETE']) expect(canAccessWorkspaceApi(role,path,method)).toBe(true);
      expect(canAccessWorkspaceApi(role,'/api/integrations/uau/query-preview','POST')).toBe(false);
      expect(canAccessWorkspaceApi(role,'/api/integrations/uau','GET')).toBe(false);
    }
    expect(canAccessWorkspaceApi('viewer',path,'GET')).toBe(false);
  });
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
      expect(canAccessWorkspacePage(role, '/dashboard')).toBe(true);
      expect(canAccessWorkspacePage(role, '/tags')).toBe(false);
      expect(canAccessWorkspacePage(role, '/dashboard/costs')).toBe(role === 'supervisor');
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
      expect(canAccessWorkspaceApi(role, '/api/whatsapp/cost-overview', 'GET')).toBe(role === 'supervisor');
      expect(canAccessWorkspaceApi(role, '/api/whatsapp/cost-overview', 'POST')).toBe(false);
      expect(canAccessWorkspaceApi(role, '/api/whatsapp/cost-details', 'GET')).toBe(role === 'supervisor');
      expect(canAccessWorkspaceApi(role, '/api/ai/usage', 'GET')).toBe(false);
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
