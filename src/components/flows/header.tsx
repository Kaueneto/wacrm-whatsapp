'use client';

/**
 * Editor toolbar — flow name / description, status chip, dirty
 * indicator, and the action buttons (Save, Activate/Pause, Delete,
 * View runs, Back).
 *
 * Restyled to the Flow Builder design handoff: a single compact
 * toolbar row (back · icon · inline-editable name · status chip ·
 * edited dot on the left; Runs · Delete · Activate · Save on the
 * right) followed by a subtle, full-width description "note" line.
 * Replaces the old three-row stack so the editor reads as one app
 * chrome bar above the canvas/list stage.
 *
 * Lifted out of flow-builder.tsx so the same toolbar renders above
 * both views in FlowEditorShell. Without this, canvas users had no
 * way to save without toggling to list view.
 *
 * Reads everything from the editor context (`useFlowEditor`) so it
 * stays in sync with whichever view is mutating state, and routes
 * router navigation locally (back to /flows, View runs to
 * /flows/[id]/runs) — those don't belong in the hook.
 */

import { useRouter } from 'next/navigation';
import type { KeyboardEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  ArrowLeft,
  CircleDot,
  History,
  Loader2,
  PauseCircle,
  Pencil,
  PlayCircle,
  Save,
  Trash2,
  Workflow,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFlowEditor, type BuilderState } from './flow-editor-state';

export function EditorHeader() {
  const router = useRouter();
  const t = useTranslations('Flows.header');
  const locale = useLocale();
  const {
    flow,
    state,
    setState,
    dirty,
    pendingChanges,
    lastSavedChanges,
    saveError,
    lastEditedAt,
    saving,
    activating,
    canActivate,
    save,
    setStatus,
    deleteFlow,
  } = useFlowEditor();

  function saveDetailsOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (!activating) void save('details');
  }
  const pendingLabels = pendingChanges
    .map((change) => t(`changes.${change}`))
    .join(', ');
  const savedLabels = lastSavedChanges
    .map((change) => t(`changes.${change}`))
    .join(', ');

  return (
    <div className="flex flex-col gap-1.5 px-6 pt-5">
      <div className="flex flex-wrap items-center gap-3">
        {/* ---- left: back · icon · name · status · edited ---- */}
        <button
          type="button"
          onClick={() => router.push('/flows')}
          title={t('backToFlows')}
          aria-label={t('backToFlows')}
          className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="bg-primary-soft text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
          <Workflow className="h-[18px] w-[18px]" />
        </span>
        <div className="flex min-w-0 items-center gap-1">
          <input
            value={state.name}
            onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
            placeholder={t('namePlaceholder')}
            spellCheck={false}
            aria-label={t('namePlaceholder')}
            aria-describedby="flow-inline-save-hint"
            onKeyDown={saveDetailsOnEnter}
            className="text-foreground hover:bg-muted focus:border-primary max-w-[340px] min-w-[120px] rounded-lg border border-transparent bg-transparent px-2 py-1 text-lg leading-tight font-bold tracking-tight transition-colors outline-none focus:bg-transparent focus:shadow-[0_0_0_3px_var(--primary-soft)]"
          />
          <Pencil
            aria-hidden
            className="text-muted-foreground size-3 shrink-0"
          />
        </div>
        <StatusChip status={state.status} />
        <span className="text-muted-foreground text-xs" aria-live="polite">
          {lastEditedAt ? (
            <>
              {t('lastEdited')}{' '}
              <time dateTime={lastEditedAt}>
                {new Date(lastEditedAt).toLocaleString(locale, {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </time>
            </>
          ) : (
            t('lastEditedUnknown')
          )}
        </span>

        {/* ---- right: runs · delete · activate · save ---- */}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/flows/${flow.id}/runs`)}
          >
            <History className="h-3.5 w-3.5" />
            {t('runs')}
            <span className="bg-muted text-muted-foreground ml-0.5 rounded px-1.5 py-0.5 font-mono text-[11px]">
              {flow.execution_count}
            </span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void deleteFlow()}
            className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t('delete')}
          </Button>
          {state.status === 'active' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void setStatus('draft')}
              disabled={activating || saving}
            >
              {activating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PauseCircle className="h-3.5 w-3.5" />
              )}
              {t('pause')}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void setStatus('active')}
              disabled={activating || saving || !canActivate}
              title={!canActivate ? t('fixIssues') : undefined}
            >
              {activating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PlayCircle className="h-3.5 w-3.5" />
              )}
              {t('activate')}
            </Button>
          )}
          <Button
            onClick={() => void save()}
            disabled={saving || activating || !dirty}
            size="sm"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {t(saving ? 'savingChanges' : 'save')}
          </Button>
        </div>
      </div>

      {/* ---- description note (subtle, inline-editable) ---- */}
      <input
        value={state.description}
        onChange={(e) =>
          setState((s) => ({ ...s, description: e.target.value }))
        }
        placeholder={t('descriptionPlaceholder')}
        aria-label={t('descriptionLabel')}
        aria-describedby="flow-inline-save-hint"
        onKeyDown={saveDetailsOnEnter}
        className="text-muted-foreground placeholder:text-muted-foreground/60 hover:bg-muted/50 focus:border-primary focus:text-foreground w-full max-w-[78ch] rounded-md border border-transparent bg-transparent px-2 py-1 text-[13px] transition-colors outline-none focus:bg-transparent"
      />
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-2 pb-2 text-xs">
        <p id="flow-inline-save-hint" className="text-muted-foreground">
          {t('inlineSaveHint')}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1" role="status">
          {savedLabels && (
            <span className="text-muted-foreground">
              {t('savedSections', { sections: savedLabels })}
            </span>
          )}
          {dirty && (
            <span className="font-medium text-amber-700 dark:text-amber-300">
              {t('pendingSections', { sections: pendingLabels })}
            </span>
          )}
        </div>
      </div>
      {saveError && (
        <p role="alert" className="text-destructive px-2 pb-2 text-xs">
          {saveError}
        </p>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: BuilderState['status'] }) {
  // Status labels live with the flows list so the chip and the list
  // badge can never drift apart.
  const t = useTranslations('Flows.list');
  const cfg = {
    draft: {
      // Neutral, not amber — amber is reserved for the adjacent
      // "Edited" dirty signal, so the two don't read as the same alert.
      cls: 'border-border bg-muted text-muted-foreground',
      label: t('statusDraft'),
    },
    active: {
      cls: 'border-emerald-600/40 bg-emerald-500/10 text-emerald-300',
      label: t('statusActive'),
    },
    archived: {
      cls: 'border-border bg-muted/50 text-muted-foreground',
      label: t('statusArchived'),
    },
  }[status];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium',
        cfg.cls
      )}
    >
      <CircleDot className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}
