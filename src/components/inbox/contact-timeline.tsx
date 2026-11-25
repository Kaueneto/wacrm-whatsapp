'use client';
import { useLocale, useTranslations } from 'next-intl';
import { Building2, StickyNote } from 'lucide-react';
import { contactTimeline } from '@/lib/inbox/contact-timeline';
import type { ContactNote } from '@/types';
import type { UauAttendance } from '@/lib/uau/finance-types';
import { semanticChip } from '@/lib/semantic-chip';

export function ContactTimeline({
  notes,
  attendances,
  erpLoaded,
  erpFailed,
}: {
  notes: ContactNote[];
  attendances: UauAttendance[];
  erpLoaded: boolean;
  erpFailed: boolean;
}) {
  const t = useTranslations('UauWorkspace');
  const locale = useLocale();
  const items = contactTimeline(notes, attendances);
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  return (
    <div className="mt-4 space-y-3">
      <p className="text-muted-foreground text-[11px]">{t('timelineHint')}</p>
      {!erpLoaded && (
        <p className="text-muted-foreground text-xs">{t('loadErpTimeline')}</p>
      )}
      {erpFailed && (
        <p
          role="status"
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-200"
        >
          {t('attendanceError')}
        </p>
      )}
      {!items.length && (
        <p className="text-muted-foreground text-xs">{t('emptyTimeline')}</p>
      )}
      <ol className="space-y-3">
        {items.map((item) => (
          <li key={item.key} className="border-border relative border-l pl-4">
            <span
              aria-hidden="true"
              className={`absolute top-3 -left-1 size-2 rounded-full ${item.origin === 'uau' ? 'bg-sky-500' : 'bg-primary'}`}
            />
            <article className="border-border bg-background/50 space-y-2 rounded-xl border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${item.origin === 'uau' ? semanticChip.info : semanticChip.neutral}`}
                >
                  {item.origin === 'uau' ? (
                    <Building2 className="size-3" aria-hidden="true" />
                  ) : (
                    <StickyNote className="size-3" aria-hidden="true" />
                  )}
                  {t(item.origin === 'uau' ? 'sourceUau' : 'sourceInternal')}
                </span>
                <time
                  dateTime={item.date}
                  className="text-muted-foreground text-[10px] tabular-nums"
                >
                  {date(item.date)}
                </time>
              </div>
              {item.origin === 'internal' ? (
                <p className="text-sm break-words whitespace-pre-wrap">
                  {item.note.note_text}
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold">
                        {t('attendanceNumber', { number: item.attendance.id })}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-xs break-words">
                        {item.attendance.category ||
                          item.attendance.categoryCode}
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${item.attendance.closedAt ? semanticChip.success : semanticChip.warning}`}
                    >
                      {item.attendance.closedAt
                        ? t('closed')
                        : item.attendance.statusCode === 0
                          ? t('open')
                          : t('statusCode', {
                              code: item.attendance.statusCode ?? '—',
                            })}
                    </span>
                  </div>
                  {item.attendance.createdBy && (
                    <p className="text-muted-foreground text-[10px]">
                      {t('createdBy', { user: item.attendance.createdByName || item.attendance.createdBy })}
                    </p>
                  )}
                  {item.attendance.responsible && item.attendance.responsible !== item.attendance.createdBy && (
                    <p className="text-muted-foreground text-[10px]">
                      {t('responsible', { user: item.attendance.responsibleName || item.attendance.responsible })}
                    </p>
                  )}
                  {item.attendance.description && (
                    <details className="group">
                      <summary className="text-primary focus-visible:outline-ring cursor-pointer rounded text-xs focus-visible:outline-2">
                        {t('viewDescription')}
                      </summary>
                      <p className="text-foreground mt-2 text-xs leading-relaxed break-words whitespace-pre-wrap">
                        {item.attendance.description}
                      </p>
                    </details>
                  )}
                  {item.attendance.closedAt && (
                    <p className="text-muted-foreground text-[10px]">
                      {t('closedAt', { date: date(item.attendance.closedAt) })}
                    </p>
                  )}
                </>
              )}
            </article>
          </li>
        ))}
      </ol>
    </div>
  );
}
