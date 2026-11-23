'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Plus,
  Trash2,
  Loader2,
  RefreshCw,
  Pencil,
  RotateCcw,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { fetchAccountTemplates } from '@/lib/settings/account-catalog';
import { isUuid } from '@/lib/api/v1/pagination';
import { Button } from '@/components/ui/button';
import { PageNavigation } from '@/components/ui/page-navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import type { MessageTemplate } from '@/types';
import { TemplateCatalog, TemplateDetails } from './template-catalog';
import { TemplateEditor } from './template-editor';

export function TemplateManager({ templateId }: { templateId?: string }) {
  const t = useTranslations('Settings.templates');
  const tPage = useTranslations('TemplatePages');
  const tSidebar = useTranslations('Sidebar');
  const router = useRouter();
  const supabase = createClient();
  const { user, accountId, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const selectedTemplate = templateId
    ? templates.find((row) => row.id === templateId)
    : undefined;
  const fetchSequence = useRef(0);

  const [syncing, setSyncing] = useState(false);
  const [outsideCatalog, setOutsideCatalog] = useState<{
    templateId: string;
    wabaId: string;
  } | null>(null);
  const [editingTemplate, setEditingTemplate] =
    useState<MessageTemplate | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Template selected for the confirm-delete dialog. The destructive
  // action goes through this two-step so a slip on the trash icon
  // doesn't take the template off Meta as well as locally.
  const [templateToDelete, setTemplateToDelete] =
    useState<MessageTemplate | null>(null);
  useEffect(() => {
    if (authLoading) return;
    if (!user || !accountId) {
      setLoading(false);
      return;
    }
    void fetchTemplates(accountId, true);
    return () => {
      fetchSequence.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id, accountId, templateId]);

  async function fetchTemplates(acctId: string, initial = false) {
    const sequence = ++fetchSequence.current;
    if (initial) {
      setLoading(true);
      setTemplates([]);
      setLoadFailed(false);
    }
    try {
      let rows: MessageTemplate[] = [];
      if (!templateId) {
        rows = await fetchAccountTemplates(supabase, acctId);
      } else if (isUuid(templateId)) {
        const { data, error } = await supabase
          .from('message_templates')
          .select('*')
          .eq('account_id', acctId)
          .eq('id', templateId)
          .maybeSingle();
        if (error) throw error;
        if (data) rows = [data];
      }
      if (sequence !== fetchSequence.current) return;
      setTemplates(rows);
      setLoadFailed(false);
    } catch (err) {
      if (sequence !== fetchSequence.current) return;
      console.error('Failed to fetch templates:', err);
      if (initial) setLoadFailed(true);
      toast.error(t('toastLoadFailed'));
    } finally {
      if (sequence === fetchSequence.current) setLoading(false);
    }
  }

  async function handleSyncFromMeta() {
    if (!user) return;
    setSyncing(true);
    try {
      const url = templateId
        ? `/api/whatsapp/templates/sync?templateId=${encodeURIComponent(templateId)}`
        : '/api/whatsapp/templates/sync';
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data?.error || t('syncFailedHttp', { status: res.status })
        );
      }
      if (data.total)
        toast.success(
          t('toastSyncCount', { total: data.total }) +
            (data.inserted || data.updated
              ? t('toastSyncDetails', {
                  inserted: data.inserted,
                  updated: data.updated,
                })
              : '')
        );
      if (templateId)
        setOutsideCatalog(
          data.outsideChannel ? { templateId, wabaId: data.wabaId } : null
        );
      if (data.outsideChannel) {
        toast.warning(
          templateId
            ? t('syncOutsideChannelDetail', { waba: data.wabaId })
            : t('syncOutsideChannel', {
                count: data.outsideChannel,
                waba: data.wabaId,
              }),
          { duration: 8000 }
        );
      }
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        const preview = data.errors
          .slice(0, 3)
          .map(
            (e: { name: string; language: string; message: string }) =>
              `${e.name} (${e.language})`
          );
        const suffix =
          data.errors.length > 3
            ? t('syncMoreSuffix', { count: data.errors.length - 3 })
            : '';
        toast.error(
          t('toastSyncFailed', { preview: preview.join(', ') + suffix })
        );
      }
      if (data.truncated) {
        // Use error (not warning) so the message survives long
        // enough to read — sonner's `warning` auto-dismisses on
        // the same short timer as `success`.
        toast.error(t('toastSyncTruncated'), { duration: 10000 });
      }
      if (accountId) await fetchTemplates(accountId);
    } catch (err) {
      console.error('Template sync error:', err);
      toast.error(err instanceof Error ? err.message : t('toastSyncError'));
    } finally {
      setSyncing(false);
    }
  }

  async function confirmDelete() {
    const target = templateToDelete;
    if (!target || deletingId) return;
    setDeletingId(target.id);
    try {
      // Route handler scopes the Meta delete via hsm_id (so sibling
      // language variants survive) and falls through to remove the
      // local row. Local-only rows skip the Meta call.
      const res = await fetch(`/api/whatsapp/templates/${target.id}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data?.error || t('deleteFailedHttp', { status: res.status })
        );
      }
      toast.success(t('toastDeleteSuccess'));
      setTemplates((prev) => prev.filter((t) => t.id !== target.id));
      setTemplateToDelete(null);
      if (templateId === target.id) router.replace('/campaigns/templates');
    } catch (err) {
      console.error('Delete error:', err);
      toast.error(err instanceof Error ? err.message : t('toastDeleteError'));
    } finally {
      setDeletingId(null);
    }
  }

  function templateActions(template: MessageTemplate, compact = false) {
    const canEdit = template.status === 'APPROVED';
    const canResubmit =
      template.status === 'REJECTED' || template.status === 'PAUSED';
    const deleteLabel = t(
      template.meta_template_id ? 'deleteMetaLocallyAria' : 'deleteLocallyAria'
    );
    return (
      <div className="flex items-center gap-1">
        {(canEdit || canResubmit) && (
          <Button
            variant="ghost"
            size={compact ? 'icon-sm' : 'sm'}
            onClick={() => setEditingTemplate(template)}
            title={t(canEdit ? 'editTitle' : 'resubmitTitle')}
            aria-label={t(canEdit ? 'editLabel' : 'resubmitLabel')}
          >
            {canEdit ? (
              <Pencil className="size-3.5" />
            ) : (
              <RotateCcw className="size-3.5" />
            )}
            {!compact && t(canEdit ? 'edit' : 'resubmit')}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setTemplateToDelete(template)}
          disabled={deletingId === template.id}
          aria-label={deleteLabel}
          title={t(
            template.meta_template_id
              ? 'deleteMetaLocallyTitle'
              : 'deleteLocallyTitle'
          )}
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          {deletingId === template.id ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Trash2 />
          )}
        </Button>
      </div>
    );
  }

  const templatesTitle = tSidebar('templates');
  const path: { label: string; href?: string }[] = [
    { label: tSidebar('campaigns'), href: '/campaigns' },
    { label: templatesTitle, href: '/campaigns/templates' },
  ];
  if (selectedTemplate) path.push({ label: selectedTemplate.display_name ?? selectedTemplate.name });

  return (
    <section className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-4 min-w-0 space-y-6 motion-safe:duration-300">
      <PageNavigation
        backHref={templateId ? '/campaigns/templates' : '/campaigns'}
        backLabel={tPage(templateId ? 'backToTemplates' : 'backToCampaigns')}
        items={path}
      />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight wrap-break-word">
            {selectedTemplate?.display_name ?? selectedTemplate?.name ?? templatesTitle}
          </h1>
          {selectedTemplate && <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{selectedTemplate.name}</p>}
          {!templateId && (
            <p className="text-muted-foreground mt-1 max-w-prose text-sm">
              {t('description')}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={handleSyncFromMeta}
            disabled={syncing || loading || !accountId}
            title={t('syncTitle')}
          >
            <RefreshCw className={syncing ? 'animate-spin' : undefined} />
            {t(syncing ? 'syncing' : 'syncFromMeta')}
          </Button>
          <Button
            nativeButton={false}
            render={<Link href="/campaigns/templates/new" />}
          >
            <Plus />
            {t('newTemplate')}
          </Button>
        </div>
      </header>

      {outsideCatalog && outsideCatalog.templateId === templateId && (
        <p
          role="status"
          className="rounded-lg border border-amber-500/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-300"
        >
          {t('syncOutsideChannelDetail', { waba: outsideCatalog.wabaId })}
        </p>
      )}

      {loading ? (
        <div
          role="status"
          aria-label={tPage('loading')}
          className="flex justify-center py-12"
        >
          <Loader2 className="text-primary size-6 animate-spin" />
        </div>
      ) : loadFailed ? (
        <p role="alert" className="text-destructive text-sm">
          {t('toastLoadFailed')}
        </p>
      ) : templateId ? (
        selectedTemplate ? (
          <TemplateDetails
            template={selectedTemplate}
            actions={templateActions(selectedTemplate)}
          />
        ) : (
          <p role="status" className="text-muted-foreground text-sm">
            {tPage('notFound')}
          </p>
        )
      ) : (
        <TemplateCatalog
          templates={templates}
          renderActions={templateActions}
        />
      )}

      <Dialog
        open={editingTemplate !== null}
        onOpenChange={(open) => {
          if (!open) setEditingTemplate(null);
        }}
      >
        <DialogContent className="bg-popover border-border max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('dialogEditTitle')}</DialogTitle>
            <DialogDescription>{t('dialogEditDesc')}</DialogDescription>
          </DialogHeader>
          {editingTemplate && (
            <TemplateEditor
              key={editingTemplate.id}
              template={editingTemplate}
              canSubmit={!!accountId}
              onCancel={() => setEditingTemplate(null)}
              onSaved={async () => {
                if (accountId) await fetchTemplates(accountId);
                setEditingTemplate(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm-delete dialog. Surfacing the meta_template_id case
          separately so users understand a real Meta delete is happening,
          not just a local cleanup. */}
      <Dialog
        open={templateToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setTemplateToDelete(null);
        }}
      >
        <DialogContent className="bg-popover border-border sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              {t('deleteDialogTitle')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {templateToDelete?.meta_template_id
                ? t('deleteMetaDesc', { name: templateToDelete.name })
                : t('deleteLocalDesc', { name: templateToDelete?.name || '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setTemplateToDelete(null)}
              disabled={deletingId !== null}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={deletingId !== null}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deletingId !== null ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('deleting')}
                </>
              ) : (
                t('delete')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
