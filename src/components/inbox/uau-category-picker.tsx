'use client';

import { useRef, useState } from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import glass from '@/components/ui/morph-menu.module.css';
import type { UauAttendanceCategory } from '@/lib/uau/attendance-categories';
import { matchesAttendanceCategory } from '@/lib/uau/category-search';

export function UauCategoryPicker({
  categories,
  value,
  onChange,
  disabled,
  loading,
  error,
}: {
  categories: UauAttendanceCategory[];
  value: string;
  onChange: (code: string) => void;
  disabled: boolean;
  loading: boolean;
  error: boolean;
}) {
  const t = useTranslations('UauAttendance');
  const [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const selected = categories.find((item) => item.code === value) ?? null;
  return (
    <Combobox.Root<UauAttendanceCategory>
      items={categories}
      value={selected}
      onValueChange={(item) => {
        if (item) onChange(item.code);
      }}
      itemToStringLabel={(item) => `${item.code} — ${item.name}`}
      itemToStringValue={(item) => item.code}
      isItemEqualToValue={(a, b) => a.code === b.code}
      filter={matchesAttendanceCategory}
      inputValue={query}
      onInputValueChange={setQuery}
      onOpenChange={(open) => {
        if (open) setQuery('');
      }}
      disabled={disabled || loading || !categories.length}
      autoHighlight
    >
      <Combobox.Trigger
        id="uau-att-category"
        aria-describedby={error ? 'uau-category-error' : undefined}
        className={cn(
          glass.glass,
          'focus-visible:ring-ring flex h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50'
        )}
      >
        {selected ? (
          <>
            <span className="bg-primary/10 text-primary shrink-0 rounded px-1.5 py-0.5 font-mono text-xs font-semibold">
              {selected.code}
            </span>
            <span className="min-w-0 flex-1 truncate">{selected.name}</span>
          </>
        ) : (
          <span className="text-muted-foreground flex-1">
            {t(loading ? 'loading' : 'choose')}
          </span>
        )}
        <ChevronsUpDown
          className="text-muted-foreground ml-auto size-4 shrink-0"
          aria-hidden="true"
        />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-50"
        >
          <Combobox.Popup
            initialFocus={search}
            className={cn(
              glass.glass,
              'text-popover-foreground w-(--anchor-width) max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl outline-none data-ending-style:opacity-0 data-starting-style:translate-y-1 data-starting-style:opacity-0 motion-safe:transition-[opacity,transform] motion-safe:duration-150'
            )}
          >
            <div className="border-border/60 flex items-center gap-2 border-b px-3 py-2">
              <Search
                className="text-muted-foreground size-4 shrink-0"
                aria-hidden="true"
              />
              <Combobox.Input
                ref={search}
                placeholder={t('searchCategory')}
                aria-label={t('searchCategory')}
                className="placeholder:text-muted-foreground h-8 min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </div>
            <Combobox.Empty className="text-muted-foreground px-4 py-6 text-center text-sm empty:hidden">
              {t('noMatchingCategory')}
            </Combobox.Empty>
            <Combobox.List className="max-h-[min(18rem,var(--available-height))] scroll-py-1 overflow-y-auto p-1">
              {(item: UauAttendanceCategory) => (
                <Combobox.Item
                  key={item.code}
                  value={item}
                  className="data-highlighted:bg-primary/10 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm outline-none"
                >
                  <span className="text-primary bg-primary/10 shrink-0 rounded px-1.5 py-0.5 font-mono text-xs font-semibold">
                    {item.code}
                  </span>
                  <span className="min-w-0 flex-1 break-words">
                    {item.name}
                  </span>
                  <Combobox.ItemIndicator className="text-primary shrink-0">
                    <Check className="size-4" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
