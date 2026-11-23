'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MessageTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { templateCategoryClasses } from '@/lib/semantic-chip';

interface Step1Props {
  selectedTemplate: MessageTemplate | null;
  onSelect: (template: MessageTemplate) => void;
  onNext?: () => void;
  onBack?: () => void;
  showNavigation?: boolean;
  layout?: 'grid' | 'list';
  title?: string;
  connectedCatalog?: {
    templates: MessageTemplate[];
    loading: boolean;
    error: string | null;
  };
}

export function Step1ChooseTemplate({
  selectedTemplate,
  onSelect,
  onNext,
  onBack,
  showNavigation = true,
  layout = 'grid',
  title,
  connectedCatalog,
}: Step1Props) {
  const t = useTranslations('Broadcasts.wizard');
  const usesConnectedCatalog = Boolean(connectedCatalog);
  const [localTemplates, setLocalTemplates] = useState<MessageTemplate[]>([]);
  const [loadingLocal, setLoadingLocal] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);
  const templates = connectedCatalog?.templates ?? localTemplates;
  const loading = connectedCatalog?.loading ?? loadingLocal;
  const error = connectedCatalog ? connectedCatalog.error : localError;

  useEffect(() => {
    if (usesConnectedCatalog) return;
    async function fetchTemplates() {
      try {
        const supabase = createClient();
        // Only APPROVED templates can be sent via Meta — anything else
        // would 400 at broadcast time. Hide them rather than letting
        // the user pick a template that will fail.
        const { data, error: fetchError } = await supabase
          .from('message_templates')
          .select('*')
          .eq('status', 'APPROVED')
          .order('created_at', { ascending: false });

        if (fetchError) throw fetchError;
        setLocalTemplates(data ?? []);
      } catch (err) {
        setLocalError(
          err instanceof Error ? err.message : t('chooseTemplate.errorLoad')
        );
      } finally {
        setLoadingLocal(false);
      }
    }

    fetchTemplates();
  }, [usesConnectedCatalog, t]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="text-primary h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h2 className="text-foreground text-lg font-semibold">
          {title ?? t('chooseTemplate.title')}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {t(
            usesConnectedCatalog
              ? 'chooseTemplate.connectedSubtitle'
              : 'chooseTemplate.subtitle'
          )}
        </p>
      </div>

      {usesConnectedCatalog &&
        selectedTemplate &&
        !templates.some(({ id }) => id === selectedTemplate.id) && (
          <p
            role="status"
            className="rounded-lg border border-amber-500/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-300"
          >
            {t('chooseTemplate.savedUnavailable', {
              name: selectedTemplate.name,
            })}
          </p>
        )}

      {templates.length === 0 ? (
        <div className="border-border bg-card/50 flex h-48 flex-col items-center justify-center rounded-xl border">
          <FileText className="text-muted-foreground mb-2 h-8 w-8" />
          <p className="text-muted-foreground text-sm">
            {t(
              usesConnectedCatalog
                ? 'chooseTemplate.noConnectedTemplates'
                : 'chooseTemplate.noTemplates'
            )}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {t(
              usesConnectedCatalog
                ? 'chooseTemplate.syncConnected'
                : 'chooseTemplate.createFirst'
            )}
          </p>
        </div>
      ) : (
        <div
          className={
            layout === 'list'
              ? 'grid max-h-[60vh] min-w-0 grid-cols-1 gap-3 overflow-y-auto p-1'
              : 'grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'
          }
        >
          {templates.map((template) => {
            const isSelected = selectedTemplate?.id === template.id;
            const catColor =
              templateCategoryClasses[template.category] ?? templateCategoryClasses.Utility;

            return (
              <button
                type="button"
                aria-pressed={isSelected}
                key={template.id}
                onClick={() => onSelect(template)}
                className={`flex min-w-0 flex-col gap-3 rounded-xl border p-4 text-left transition-all ${
                  isSelected
                    ? 'border-primary bg-primary/5 ring-primary/30 ring-1'
                    : 'border-border bg-card/50 hover:border-border hover:bg-card'
                }`}
              >
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <h3 className="text-foreground min-w-0 flex-1 text-sm font-medium [overflow-wrap:anywhere]">
                    {template.display_name ?? template.name}
                  </h3>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${catColor}`}
                  >
                    {template.category}
                  </span>
                </div>
                <p className="truncate font-mono text-xs text-muted-foreground" title={template.name}>{template.name}</p>
                <p className="text-muted-foreground line-clamp-3 text-xs [overflow-wrap:anywhere]">
                  {template.description ?? template.body_text}
                </p>
                <div className="text-muted-foreground flex items-center gap-2 text-[10px]">
                  <span>{template.language ?? 'en_US'}</span>
                  {/* Status is omitted on purpose — every template
                      shown here is already filtered to APPROVED,
                      so the chip carried no information. */}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showNavigation && (
        <div className="border-border flex items-center justify-between border-t pt-4">
          <Button
            variant="outline"
            onClick={onBack}
            className="border-border text-muted-foreground"
          >
            {t('back')}
          </Button>
          <Button
            onClick={onNext}
            disabled={!selectedTemplate}
            className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {t('next')}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
