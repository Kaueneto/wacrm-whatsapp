'use client';

import { MessageSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { MessageBubble } from '@/components/inbox/message-bubble';
import { renderTemplateBody } from '@/lib/whatsapp/template-body';
import type { TemplateMessageContent } from '@/lib/whatsapp/template-message-view';
import type { MessageTemplate } from '@/types';

export function TemplatePreview({
  template,
  emptyText,
}: {
  template: TemplateMessageContent &
    Pick<MessageTemplate, 'body_text' | 'sample_values'> & { name?: string };
  emptyText?: string;
}) {
  const t = useTranslations('TemplatePages');
  const title = t('preview');
  const hasContent =
    template.body_text.trim() ||
    template.footer_text?.trim() ||
    template.buttons?.length ||
    (template.header_type === 'text'
      ? template.header_content?.trim()
      : template.header_type);

  return (
    <section
      aria-label={title}
      className="bg-card min-w-0 overflow-hidden rounded-xl border lg:sticky lg:top-6"
    >
      <h2 className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
        <MessageSquare className="size-4 text-sky-700" aria-hidden="true" />
        {title}
      </h2>
      <div className="relative isolate min-h-64 bg-[#f0ebe2] px-5 py-6 scheme-light [--background:#f8fafc] [--border:#e0e6eb] [--foreground:#17212a] [--muted-foreground:#525b64] [--muted:#eef2f5] [--primary:#066aa2] before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:bg-[url('/inbox-doodle.svg')] before:bg-repeat before:opacity-45 [&_a]:text-sky-800">
        {!hasContent && emptyText ? (
          <p className="rounded-lg bg-white/90 px-3 py-2 text-sm text-slate-600 shadow-xs">
            {emptyText}
          </p>
        ) : (
          <MessageBubble
            key={template.header_media_url ?? 'preview'}
            templatePreview
            message={{
              id: 'template-preview',
              conversation_id: 'template-preview',
              sender_type: 'customer',
              content_type: 'template',
              template_name: template.name,
              content_text: renderTemplateBody(
                template.body_text,
                template.sample_values?.body?.map(
                  (sample) => sample || undefined
                ) ?? []
              ),
              status: 'delivered',
              created_at: '2000-01-01T12:00:00',
            }}
            template={{
              ...template,
              header_content: template.header_content
                ? renderTemplateBody(
                    template.header_content,
                    template.sample_values?.header?.map(
                      (sample) => sample || undefined
                    ) ?? []
                  )
                : undefined,
            }}
          />
        )}
      </div>
    </section>
  );
}
