import type { SupabaseClient } from '@supabase/supabase-js';
import type { Tag } from '@/types';

export const TAG_COLORS = [
  { name: 'red', value: '#ef4444' },
  { name: 'orange', value: '#f97316' },
  { name: 'amber', value: '#f59e0b' },
  { name: 'emerald', value: '#10b981' },
  { name: 'cyan', value: '#06b6d4' },
  { name: 'blue', value: '#3b82f6' },
  { name: 'violet', value: '#8b5cf6' },
  { name: 'pink', value: '#ec4899' },
] as const;

export const DEFAULT_TAG_COLOR = '#10b981';
export const TAG_NAME_LIMIT = 40;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
export type TagDraft = { name: string; color: string };

export function displayTagColor(color: string): string {
  return HEX_COLOR.test(color) ? color : DEFAULT_TAG_COLOR;
}

export async function saveAccountTag(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  draft: TagDraft,
  id?: string
): Promise<Tag> {
  const name = draft.name.trim();
  if (!name || name.length > TAG_NAME_LIMIT || !HEX_COLOR.test(draft.color)) {
    throw new Error('Invalid tag');
  }
  const fields = { name, color: draft.color.toLowerCase() };
  const query = id
    ? db.from('tags').update(fields).eq('id', id).eq('account_id', accountId)
    : db
        .from('tags')
        .insert({ ...fields, account_id: accountId, user_id: userId });
  const { data, error } = await query
    .select('id,user_id,name,color,created_at')
    .single();
  if (error) throw error;
  return data;
}

export function applyContactTagChange(
  tags: readonly Tag[],
  tag: Tag,
  assigned: boolean
): Tag[] {
  const others = tags.filter((item) => item.id !== tag.id);
  return assigned ? [...others, tag] : others;
}
