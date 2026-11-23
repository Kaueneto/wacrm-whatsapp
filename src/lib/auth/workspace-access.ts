import { canEditSettings, canSendMessages, type AccountRole } from './roles';

export function canAccessWorkspacePage(
  role: AccountRole,
  pathname: string
): boolean {
  if (canEditSettings(role)) return true;
  if (pathname === '/dashboard') return canSendMessages(role);
  if (pathname === '/dashboard/costs') return role === 'supervisor';
  return ['/inbox', '/notifications', '/settings'].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export function canAccessSettingsSection(
  role: AccountRole,
  section: string
): boolean {
  return (
    canEditSettings(role) ||
    ['profile', 'security', 'appearance'].includes(section)
  );
}

// Session-authenticated workspace APIs. Webhooks, public bearer APIs and auth
// callbacks keep their own authentication and are not subject to this policy.
export function isWorkspaceApi(path: string): boolean {
  return (
    /^\/api\/(account|support|campaigns|automations|flows|ai|whatsapp|quick-replies|integrations)(\/|$)/.test(
      path
    ) && !path.startsWith('/api/whatsapp/webhook')
  );
}

export function canAccessWorkspaceApi(
  role: AccountRole,
  path: string,
  method: string
): boolean {
  if (canEditSettings(role)) return true;
  if (role === 'viewer') return false; // Legacy role remains readable, never promoted implicitly.
  if (
    method === 'GET' &&
    [
      '/api/account',
      '/api/account/members',
      '/api/account/teams',
      '/api/quick-replies',
    ].includes(path)
  )
    return true;
  if (method === 'GET' && /^\/api\/whatsapp\/media\/[^/]+$/.test(path))
    return true;
  if (
    method === 'POST' &&
    [
      '/api/whatsapp/send',
      '/api/whatsapp/react',
      '/api/whatsapp/typing',
    ].includes(path)
  )
    return true;
  return (
    role === 'supervisor' && (
      (path === '/api/support/assignment' && method === 'POST') ||
      (['/api/whatsapp/cost-overview', '/api/whatsapp/cost-details'].includes(path) && method === 'GET')
    )
  );
}
