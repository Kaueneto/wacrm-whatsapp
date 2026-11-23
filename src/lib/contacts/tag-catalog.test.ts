import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { Tag } from '@/types';
import { applyContactTagChange, saveAccountTag } from './tag-catalog';

const tag: Tag = {
  id: 'tag-1',
  name: 'Cliente',
  color: '#3b82f6',
  user_id: 'user',
  created_at: '',
};

describe('contact tag management', () => {
  it('edits the same tag in the current account without replacing the association', async () => {
    const edited = { ...tag, name: 'Cobrança', color: '#ef4444' };
    const builder = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: edited, error: null }),
    };
    const db = {
      from: vi.fn().mockReturnValue(builder),
    } as unknown as SupabaseClient;
    expect(
      await saveAccountTag(
        db,
        'account-1',
        'user',
        { name: ' Cobrança ', color: '#EF4444' },
        tag.id
      )
    ).toEqual(edited);
    expect(builder.update).toHaveBeenCalledWith({
      name: 'Cobrança',
      color: '#ef4444',
    });
    expect(builder.eq.mock.calls).toEqual([
      ['id', tag.id],
      ['account_id', 'account-1'],
    ]);
  });

  it('applies and removes the same tag without duplicating or dropping unrelated tags', () => {
    const other = { ...tag, id: 'tag-2' };
    const renamed = { ...tag, name: 'Cobrança' };
    expect(applyContactTagChange([other, tag], renamed, true)).toEqual([
      other,
      renamed,
    ]);
    expect(applyContactTagChange([other, tag], renamed, false)).toEqual([
      other,
    ]);
  });
});
