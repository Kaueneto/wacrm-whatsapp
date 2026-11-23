'use client';

import { Fragment, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { TagEditor } from '@/components/contacts/tag-editor';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import { displayTagColor, saveAccountTag, type TagDraft } from '@/lib/contacts/tag-catalog';
import { fetchAccountTags } from '@/lib/settings/account-catalog';
import { createClient } from '@/lib/supabase/client';
import type { Tag } from '@/types';

export function TagManager() {
  const t = useTranslations('Tags');
  const legacy = useTranslations('Settings.tagsAndFields');
  const { accountId, user, canEditSettings } = useAuth();
  const [catalog, setCatalog] = useState<Tag[] | 'failed' | null>(null);
  const [editor, setEditor] = useState<Tag | 'new' | null>(null);
  const [removing, setRemoving] = useState<Tag | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!accountId || !canEditSettings) return;
    let active = true;
    void fetchAccountTags(createClient(), accountId)
      .then(tags => { if (active) setCatalog(tags); })
      .catch(() => { if (active) setCatalog('failed'); });
    return () => { active = false; };
  }, [accountId, canEditSettings, reload]);

  if (!accountId || !user || !canEditSettings) return null;
  const tags = Array.isArray(catalog) ? [...catalog].sort((a, b) => a.name.localeCompare(b.name)) : [];

  async function save(draft: TagDraft) {
    if (!accountId || !user || !editor || busy) return;
    const id = editor === 'new' ? undefined : editor.id;
    setBusy(true);
    try {
      const tag = await saveAccountTag(createClient(), accountId, user.id, draft, id);
      setCatalog(old => [...(Array.isArray(old) ? old.filter(item => item.id !== tag.id) : []), tag]);
      setEditor(null);
      toast.success(t(id ? 'updated' : 'created'));
    } catch {
      toast.error(t('saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!removing || !accountId || busy) return;
    setBusy(true);
    try {
      const { data, error } = await createClient().from('tags')
        .delete().eq('id', removing.id).eq('account_id', accountId).select('id').single();
      if (error || !data) throw error ?? new Error('Tag not available');
      setCatalog(old => Array.isArray(old) ? old.filter(tag => tag.id !== removing.id) : old);
      setRemoving(null);
      toast.success(legacy('tagDeleted'));
    } catch {
      toast.error(legacy('failedToDeleteTag'));
    } finally {
      setBusy(false);
    }
  }

  function renderEditor(tag?: Tag) {
    return (
      <TableRow id={tag ? `edit-tag-${tag.id}` : 'new-tag'} className="bg-muted/40">
        <TableCell colSpan={3} className="whitespace-normal px-4 py-4">
          <p className="mb-3 text-sm font-semibold">{tag ? t('editTag', { name: tag.name }) : t('new')}</p>
          <TagEditor inline initial={tag} busy={busy} submitLabel={t('save')}
            onSubmit={draft => void save(draft)} onCancel={() => setEditor(null)} />
        </TableCell>
      </TableRow>
    );
  }

  return (
    <section className="max-w-5xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <Button onClick={() => setEditor('new')} disabled={!Array.isArray(catalog) || busy}
          aria-expanded={editor === 'new'} aria-controls={editor === 'new' ? 'new-tag' : undefined}>
          <Plus className="size-4" />{t('new')}
        </Button>
      </header>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table aria-busy={catalog === null}>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead scope="col" className="w-1/2 px-4">{t('name')}</TableHead>
              <TableHead scope="col">{t('color')}</TableHead>
              <TableHead scope="col" className="w-48 min-w-44 pr-4 text-right">{t('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {editor === 'new' && renderEditor()}
            {tags.map(tag => (
              <Fragment key={tag.id}>
              <TableRow className={typeof editor === 'object' && editor?.id === tag.id ? 'bg-muted/40' : undefined}>
                <TableCell className="whitespace-normal px-4">
                  <button type="button" className="text-left font-medium [overflow-wrap:anywhere] hover:underline focus-visible:underline"
                    disabled={busy} onClick={() => setEditor(tag)}>{tag.name}</button>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="size-3 rounded" style={{ backgroundColor: displayTagColor(tag.color) }} aria-hidden />
                    {displayTagColor(tag.color)}
                  </div>
                </TableCell>
                <TableCell className="pr-4">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="outline" size="sm" disabled={busy} aria-label={t('editTag', { name: tag.name })}
                      aria-expanded={typeof editor === 'object' && editor?.id === tag.id}
                      aria-controls={typeof editor === 'object' && editor?.id === tag.id ? `edit-tag-${tag.id}` : undefined}
                      onClick={() => setEditor(tag)}>
                      <Pencil className="size-3.5" />{t('edit')}
                    </Button>
                    <Button variant="ghost" size="sm" disabled={busy} aria-label={legacy('deleteAria', { name: tag.name })} onClick={() => setRemoving(tag)}>
                      <Trash2 className="size-3.5" />{legacy('deleteTag')}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
              {typeof editor === 'object' && editor?.id === tag.id && renderEditor(tag)}
              </Fragment>
            ))}
            {tags.length === 0 && editor !== 'new' && (
              <TableRow>
                <TableCell colSpan={3} className="whitespace-normal px-4 py-8 text-center text-sm text-muted-foreground">
                  {t(catalog === null ? 'loading' : catalog === 'failed' ? 'loadFailed' : 'empty')}
                  {catalog === 'failed' && (
                    <Button className="ml-2" variant="outline" size="sm" onClick={() => { setCatalog(null); setReload(value => value + 1); }}>
                      {t('retry')}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!removing} onOpenChange={open => { if (!open && !busy) setRemoving(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{legacy('deleteTag')}</DialogTitle>
            <DialogDescription>{removing && legacy('deleteConfirm', { name: removing.name })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setRemoving(null)}>{t('cancel')}</Button>
            <Button variant="destructive" disabled={busy} onClick={() => void remove()}>{legacy('deleteTag')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
