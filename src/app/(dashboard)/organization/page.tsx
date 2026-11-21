import { redirect } from 'next/navigation';
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
} from '@/lib/auth/account';
import { OrganizationWorkspace } from '@/components/organization/organization-workspace';

export default async function OrganizationPage() {
  try {
    await requireRole('admin');
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect('/login');
    if (error instanceof ForbiddenError) redirect('/inbox');
    throw error;
  }
  return <OrganizationWorkspace />;
}
