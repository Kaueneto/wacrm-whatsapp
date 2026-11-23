'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, ChevronRight, LayoutGrid, List } from 'lucide-react';
import { TemplatePreview } from './template-preview';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { templateStatusConfig } from '@/lib/template-status';
import { templateCategoryClasses } from '@/lib/semantic-chip';
import type { MessageTemplate } from '@/types';

function TemplateCategory({ template }: { template: MessageTemplate }) {
  const t = useTranslations('Settings.templates');
  return <Badge variant="outline" className={templateCategoryClasses[template.category]}>
    {t.has(`categoryLabels.${template.category}`) ? t(`categoryLabels.${template.category}`) : template.category}
  </Badge>;
}

function TemplateStatus({ template }: { template: MessageTemplate }) {
  const t = useTranslations('TemplateStatus');
  const status = template.status ?? 'DRAFT';
  return <Badge variant="outline" className={templateStatusConfig[status]?.classes}>
    {t.has(status) ? t(status) : status}
  </Badge>;
}

const qualityColors = {
  GREEN: 'text-emerald-700 dark:text-emerald-400',
  YELLOW: 'text-yellow-700 dark:text-yellow-400',
  RED: 'text-red-700 dark:text-red-400',
};

function TemplateQuality({ score }: { score: MessageTemplate['quality_score'] }) {
  const t = useTranslations('Settings.templates');
  if (!score) return null;
  return <span className={`text-xs font-medium ${qualityColors[score] ?? ''}`} title={t('qualityScoreTitle')}>{score}</span>;
}

function ReviewNotice({ template, compact = false }: { template: MessageTemplate; compact?: boolean }) {
  const issue = template.rejection_reason || template.submission_error;
  if (!issue) return null;
  return (
    <p className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs wrap-break-word text-destructive">
      <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
      <span className={compact ? 'min-w-0 line-clamp-2' : 'min-w-0'}>{issue}</span>
    </p>
  );
}

export function TemplateCatalog({ templates, renderActions }: {
  templates: MessageTemplate[];
  renderActions: (template: MessageTemplate, compact?: boolean) => ReactNode;
}) {
  const t = useTranslations('Settings.templates');
  const tPage = useTranslations('TemplatePages');
  const [view, setView] = useState<'table' | 'cards'>('table');

  if (templates.length === 0) {
    return <Card><CardContent className="py-12 text-center">
      <p className="text-sm font-medium">{t('noTemplates')}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t('createFirst')}</p>
    </CardContent></Card>;
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div role="group" aria-label={tPage('view')} className="inline-flex rounded-lg border bg-muted p-0.5">
          <Button variant={view === 'table' ? 'outline' : 'ghost'} size="sm" aria-pressed={view === 'table'} onClick={() => setView('table')}>
            <List aria-hidden="true" />{tPage('table')}
          </Button>
          <Button variant={view === 'cards' ? 'outline' : 'ghost'} size="sm" aria-pressed={view === 'cards'} onClick={() => setView('cards')}>
            <LayoutGrid aria-hidden="true" />{tPage('cards')}
          </Button>
        </div>
      </div>
      {view === 'table' ? (
        <div className="min-w-0 rounded-xl border bg-card">
          <Table aria-label={t('title')} className="min-w-[39rem] table-fixed">
            <colgroup>
              <col className="w-[33%]" />
              <col className="w-[19%]" />
              <col className="w-[13%]" />
              <col className="w-[16%]" />
              <col />
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead scope="col" className="pl-4">{t('templateName')}</TableHead>
                <TableHead scope="col">{t('category')}</TableHead>
                <TableHead scope="col">{t('language')}</TableHead>
                <TableHead scope="col">{tPage('status')}</TableHead>
                <TableHead scope="col" className="pr-4 text-right">{tPage('actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((template) => (
                <TableRow key={template.id}>
                  <TableCell className="pl-4">
                    <Link href={`/campaigns/templates/${template.id}`} className="block truncate font-medium hover:text-primary hover:underline">
                      {template.display_name ?? template.name}
                    </Link>
                    <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground" title={template.name}>{template.name}</p>
                  </TableCell>
                  <TableCell><TemplateCategory template={template} /></TableCell>
                  <TableCell className="text-muted-foreground">{template.language || '—'}</TableCell>
                  <TableCell><TemplateStatus template={template} /></TableCell>
                  <TableCell className="pr-4"><div className="flex justify-end">{renderActions(template)}</div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id} className="min-w-0 gap-3 py-4">
              <CardContent className="space-y-3">
                <Link href={`/campaigns/templates/${template.id}`} className="group block space-y-2 rounded-md">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="min-w-0 font-semibold wrap-break-word group-hover:text-primary group-hover:underline">{template.display_name ?? template.name}</h2>
                    <ChevronRight aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  </div>
                  <p className="truncate font-mono text-xs text-muted-foreground" title={template.name}>{template.name}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <TemplateCategory template={template} />
                    <TemplateStatus template={template} />
                    {template.language && <span className="text-xs text-muted-foreground">{template.language}</span>}
                    <TemplateQuality score={template.quality_score} />
                  </div>
                  <p className="line-clamp-2 text-sm wrap-break-word text-muted-foreground">{template.description ?? template.body_text}</p>
                  {template.footer_text && <p className="line-clamp-1 text-xs wrap-break-word text-muted-foreground">{template.footer_text}</p>}
                </Link>
                <ReviewNotice template={template} compact />
              </CardContent>
              <div className="mx-4 mt-auto flex justify-end border-t pt-2">{renderActions(template, true)}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function TemplateDetails({ template, actions }: { template: MessageTemplate; actions: ReactNode }) {
  const t = useTranslations('Settings.templates');
  const editable = template.status === 'APPROVED' || template.status === 'REJECTED' || template.status === 'PAUSED';

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] lg:items-start">
      <Card className="min-w-0 py-5">
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <TemplateCategory template={template} />
              <TemplateStatus template={template} />
              {template.language && <span className="text-sm text-muted-foreground">{template.language}</span>}
              <TemplateQuality score={template.quality_score} />
            </div>
            {actions}
          </div>
          {editable && <p className="flex items-start gap-2 rounded-lg border bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />{t('dialogEditDesc')}
          </p>}
          <ReviewNotice template={template} />
          {template.description && <div className="space-y-2 border-t pt-4">
            <h2 className="text-sm font-semibold">{t('localDescription')}</h2>
            <p className="text-sm wrap-break-word whitespace-pre-wrap">{template.description}</p>
          </div>}
          <div className="space-y-2 border-t pt-4">
            <h2 className="text-sm font-semibold">{t('bodyText')}</h2>
            <p className="text-sm wrap-break-word whitespace-pre-wrap">{template.body_text}</p>
          </div>
        </CardContent>
      </Card>
      <TemplatePreview template={template} />
    </div>
  );
}
