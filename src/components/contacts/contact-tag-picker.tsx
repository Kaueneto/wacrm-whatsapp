'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Tag as TagIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { useAuth } from '@/hooks/use-auth';
import { addContactTag, deleteContactTag } from '@/lib/contacts/tag-api';
import { displayTagColor, saveAccountTag, type TagDraft } from '@/lib/contacts/tag-catalog';
import { fetchAccountTags } from '@/lib/settings/account-catalog';
import { createClient } from '@/lib/supabase/client';
import type { Tag } from '@/types';
import { TagEditor } from './tag-editor';

export function ContactTagPicker({ contactId, assignedTags, onChange, compact = false }: {
  contactId: string;
  assignedTags: readonly Tag[];
  onChange: (tag: Tag, assigned: boolean) => void;
  compact?: boolean;
}) {
  const t = useTranslations('Tags');
  const { accountId, user, canEditSettings } = useAuth();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [catalog, setCatalog] = useState<Tag[] | 'failed' | null>(null);

  useEffect(() => {
    if (!open || !accountId) return;
    let active = true;
    void fetchAccountTags(createClient(), accountId)
      .then(tags => { if (active) setCatalog(tags); })
      .catch(() => { if (active) setCatalog('failed'); });
    return () => { active = false; };
  }, [accountId, open]);

  async function toggle(tag: Tag, assigned: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      if (assigned) await addContactTag(contactId, tag.id);
      else await deleteContactTag(contactId, tag.id);
      onChange(tag, assigned);
    } catch {
      toast.error(t('assignmentFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function createAndApply(draft: TagDraft) {
    if (busy || !canEditSettings || !accountId || !user) return;
    setBusy(true);
    try {
      const tag = await saveAccountTag(createClient(), accountId, user.id, draft);
      setCatalog(previous => [...(Array.isArray(previous) ? previous : []), tag]);
      setCreating(false);
      setSearch('');
      try {
        await addContactTag(contactId, tag.id);
        onChange(tag, true);
      } catch {
        toast.error(t('createdButNotApplied'));
      }
    } catch {
      toast.error(t('saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  const matching = Array.isArray(catalog) ? [...catalog]
    .filter(tag => tag.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name)) : [];
  return (
    <Popover open={open} onOpenChange={next => {
      if (busy) return;
      setOpen(next);
      if (!next) {
        setCreating(false);
        setSearch('');
        setCatalog(null);
      }
    }}>
      <PopoverTrigger render={<Button type="button" size={compact ? 'icon-sm' : 'sm'} variant={compact ? 'ghost' : 'outline'}
        aria-label={t('assign')} title={t('assign')} onClick={event => event.stopPropagation()} />}>
        <TagIcon className="size-4" aria-hidden />
        {!compact && t('assign')}
      </PopoverTrigger>
      <PopoverContent align="end" aria-busy={busy} onClick={event => event.stopPropagation()}>
        <PopoverTitle>{t(creating ? 'new' : 'assign')}</PopoverTitle>
        {creating ? (
          <TagEditor busy={busy} submitLabel={t('createAndApply')} onSubmit={draft => void createAndApply(draft)}
            onCancel={() => setCreating(false)} />
        ) : (
          <>
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder={t('search')}
              aria-label={t('search')} />
            <div className="max-h-52 space-y-1 overflow-y-auto">
              {matching.length ? matching.map(tag => (
                <label key={tag.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
                  <Checkbox checked={assignedTags.some(item => item.id === tag.id)} disabled={busy} aria-label={tag.name}
                    onCheckedChange={checked => void toggle(tag, checked === true)} />
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: displayTagColor(tag.color) }} />
                  <span className="truncate">{tag.name}</span>
                </label>
              )) : (
                <p className="px-2 py-2 text-xs text-muted-foreground">
                  {t(catalog === null ? 'loading' : catalog === 'failed' ? 'loadFailed' : search.trim() ? 'noMatches' : 'empty')}
                </p>
              )}
            </div>
            {canEditSettings && (
              <div className="flex flex-wrap items-center justify-between gap-1.5 border-t border-border pt-2">
                <Button type="button" variant="outline" size="sm" disabled={busy || !accountId || catalog === null} onClick={() => setCreating(true)}>
                  <Plus className="size-4" />{t('new')}
                </Button>
                <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/tags" />}>{t('manage')}</Button>
              </div>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
