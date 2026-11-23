'use client';

import { useCan } from '@/hooks/use-can';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

import { useTranslations } from 'next-intl';

import { CustomFieldsSettings } from './custom-fields-settings';
import { SettingsPanelHead } from './settings-panel-head';

export function FieldsAndTagsPanel() {
  const t = useTranslations('Settings.tagsAndFields');
  const tags = useTranslations('Tags');
  const canEditSettings = useCan('edit-settings');

  return (
    <section className="max-w-3xl animate-in fade-in-50 space-y-4 duration-200">
      <SettingsPanelHead
        title={t('title')}
        description={t('description')}
      />
      {canEditSettings && <Link href="/tags" className={buttonVariants({ variant: 'outline' })}>{tags('manage')}</Link>}
      {canEditSettings ? <CustomFieldsSettings /> : null}
    </section>
  );
}
