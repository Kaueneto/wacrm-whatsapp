import { supabaseAdmin } from '@/lib/flows/admin-client';
import { UauError } from './client';
import type { UauContactLink } from './finance-types';

function links() {
  return supabaseAdmin().from('contact_uau_links');
}
function databaseError() {
  return new UauError(
    'Não foi possível acessar o vínculo UAU. Confira se a migration 095 está aplicada.',
    503
  );
}
export async function getContactUauLink(
  accountId: string,
  contactId: string
): Promise<UauContactLink | null> {
  const { data, error } = await links()
    .select(
      'account_id,contact_id,document_encrypted,person_id,person_name,connection_revision'
    )
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .maybeSingle();
  if (error) throw databaseError();
  return data;
}
export async function saveContactUauLink(link: UauContactLink, userId: string) {
  const { error } = await links().upsert(
    { ...link, linked_by: userId, updated_at: new Date().toISOString() },
    { onConflict: 'contact_id' }
  );
  if (error) throw databaseError();
}
export async function removeContactUauLink(
  accountId: string,
  contactId: string
) {
  const { error } = await links()
    .delete()
    .eq('account_id', accountId)
    .eq('contact_id', contactId);
  if (error) throw databaseError();
}
