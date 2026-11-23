'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { DEFAULT_TAG_COLOR, displayTagColor, TAG_COLORS, TAG_NAME_LIMIT, type TagDraft } from '@/lib/contacts/tag-catalog';

export function TagEditor({ initial, busy, submitLabel, onSubmit, onCancel, inline = false }: {
  initial?: TagDraft;
  busy: boolean;
  submitLabel: string;
  onSubmit: (draft: TagDraft) => void;
  onCancel: () => void;
  inline?: boolean;
}) {
  const t = useTranslations('Tags');
  const legacy = useTranslations('Settings.tagsAndFields');
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState(initial ? displayTagColor(initial.color) : DEFAULT_TAG_COLOR);
  return (
    <form className={cn('space-y-3', inline && 'md:grid md:grid-cols-[minmax(10rem,1fr)_auto_auto] md:items-end md:gap-4 md:space-y-0')} onSubmit={(event) => {
      event.preventDefault();
      if (!busy && name.trim()) onSubmit({ name, color });
    }}>
      <label className="block space-y-1 text-sm">
        <span>{t('name')}</span>
        <Input value={name} onChange={event => setName(event.target.value)} maxLength={TAG_NAME_LIMIT} disabled={busy} autoFocus={inline} required />
      </label>
      <fieldset className="flex flex-wrap items-center gap-2" disabled={busy}>
        <legend className="mb-1 text-sm">{t('color')}</legend>
        {TAG_COLORS.map(option => (
          <button
            key={option.value}
            type="button"
            title={legacy(`colors.${option.name}`)}
            aria-label={legacy('useColor', { color: legacy(`colors.${option.name}`) })}
            aria-pressed={color === option.value}
            style={{ backgroundColor: option.value }}
            className={cn('size-5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
              color === option.value && 'ring-2 ring-primary ring-offset-2 ring-offset-popover')}
            onClick={() => setColor(option.value)}
          />
        ))}
        <input type="color" value={color} onChange={event => setColor(event.target.value)}
          className="size-6 rounded border border-border bg-background p-0.5" aria-label={t('customColor')} title={t('customColor')} />
      </fieldset>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>{t('cancel')}</Button>
        <Button type="submit" disabled={busy || !name.trim()}>{submitLabel}</Button>
      </div>
    </form>
  );
}
