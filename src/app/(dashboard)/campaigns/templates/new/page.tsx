'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TemplateEditor } from '@/components/campaigns/template-editor';
import { PageNavigation } from '@/components/ui/page-navigation';
import { useAuth } from '@/hooks/use-auth';

const TEMPLATES_PATH = '/campaigns/templates';

export default function NewTemplatePage() {
  const router = useRouter();
  const { accountId, canEditSettings } = useAuth();
  const t = useTranslations('Settings.templates');
  const navigation = useTranslations('Sidebar');
  const tPage = useTranslations('TemplatePages');

  return (
    <section className="min-w-0 space-y-6">
      <PageNavigation
        backHref={TEMPLATES_PATH}
        backLabel={tPage('backToTemplates')}
        items={[
          { label: navigation('campaigns'), href: '/campaigns' },
          { label: navigation('templates'), href: TEMPLATES_PATH },
          { label: t('newTemplate') },
        ]}
      />
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          {t('dialogNewTitle')}
        </h1>
        <p className="text-muted-foreground mt-1 max-w-prose text-sm">
          {t('dialogNewDesc')}
        </p>
      </header>
      <TemplateEditor
        canSubmit={!!accountId && canEditSettings}
        onCancel={() => router.push(TEMPLATES_PATH)}
        onSaved={(id) =>
          router.replace(
            id ? `${TEMPLATES_PATH}/${encodeURIComponent(id)}` : TEMPLATES_PATH
          )
        }
      />
    </section>
  );
}
