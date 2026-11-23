'use client';

import { useRef, useState } from 'react';
import { Bold, Italic, Strikethrough, Code, Braces, Smile } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  insertText,
  insertTemplateVariable,
  toggleTextFormat,
  type TextEdit,
} from '@/lib/whatsapp/text-editing';

const EMOJIS = [
  '😀',
  '😊',
  '🙂',
  '😉',
  '😍',
  '🥰',
  '😎',
  '🤔',
  '🙌',
  '👏',
  '👍',
  '🤝',
  '👋',
  '🙏',
  '💚',
  '❤️',
  '💙',
  '✨',
  '🎉',
  '🎁',
  '✅',
  '⚠️',
  '❗',
  '❓',
  '📌',
  '📅',
  '⏰',
  '📞',
  '📱',
  '💬',
  '📧',
  '📍',
  '🏠',
  '🏢',
  '🛒',
  '📦',
  '🚚',
  '💳',
  '💰',
  '🧾',
  '📄',
  '🔗',
  '🔒',
  '🛠️',
  '🚀',
  '⭐',
  '☀️',
  '🌷',
];

export function TemplateBodyEditor({
  id,
  value,
  onChange,
  maxLength,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder: string;
}) {
  const t = useTranslations('TemplateBodyEditor');
  const textarea = useRef<HTMLTextAreaElement>(null);
  const selection = useRef({ start: 0, end: 0 });
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const formats = [
    { label: t('bold'), icon: Bold, marker: '*', key: 'b' },
    { label: t('italic'), icon: Italic, marker: '_', key: 'i' },
    { label: t('strikethrough'), icon: Strikethrough, marker: '~', key: null },
    { label: t('monospace'), icon: Code, marker: '```', key: null },
  ];

  function rememberSelection() {
    const field = textarea.current;
    if (field)
      selection.current = {
        start: field.selectionStart,
        end: field.selectionEnd,
      };
  }

  function edit(transform: (start: number, end: number) => TextEdit) {
    const start = Math.min(selection.current.start, value.length);
    const end = Math.min(selection.current.end, value.length);
    const result = transform(start, end);
    if (result.text.length > maxLength) {
      setLimitReached(true);
      return;
    }
    setLimitReached(false);
    onChange(result.text);
    selection.current = { start: result.start, end: result.end };
    requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(result.start, result.end);
    });
  }

  return (
    <div className="border-input bg-muted/40 focus-within:border-ring focus-within:ring-ring/20 overflow-hidden rounded-xl border focus-within:ring-2">
      <div
        role="group"
        aria-label={t('toolbar')}
        className="border-border/60 flex flex-wrap items-center gap-0.5 border-b px-2 py-1.5"
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title={t('variableHint')}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() =>
            edit((start, end) => insertTemplateVariable(value, start, end))
          }
          className="text-primary mr-1 gap-1.5 text-xs"
        >
          <Braces className="size-3.5" aria-hidden="true" />
          {t('variable')}
        </Button>
        <span aria-hidden="true" className="bg-border mx-1 h-4 w-px" />
        {formats.map(({ label, icon: Icon, marker }) => (
          <Button
            key={marker}
            type="button"
            variant="ghost"
            size="icon-sm"
            title={label}
            aria-label={label}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() =>
              edit((start, end) => toggleTextFormat(value, start, end, marker))
            }
            className="text-muted-foreground hover:text-foreground"
          >
            <Icon className="size-3.5" aria-hidden="true" />
          </Button>
        ))}
        <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
          <PopoverTrigger
            render={<Button type="button" variant="ghost" size="icon-sm" />}
            title={t('emojis')}
            aria-label={t('emojis')}
            className="text-muted-foreground hover:text-foreground"
          >
            <Smile className="size-4" aria-hidden="true" />
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-72 max-w-[calc(100vw-2rem)] gap-2"
            finalFocus={() => textarea.current ?? false}
          >
            <PopoverTitle className="text-muted-foreground px-1 text-xs font-medium">
              {t('emojis')}
            </PopoverTitle>
            <div className="grid grid-cols-8 gap-0.5">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`${t('insertEmoji')} ${emoji}`}
                  className="hover:bg-muted focus-visible:outline-ring flex size-8 items-center justify-center rounded-md text-xl focus-visible:outline-2"
                  onClick={() => {
                    edit((start, end) => insertText(value, start, end, emoji));
                    setEmojiOpen(false);
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <Textarea
        ref={textarea}
        id={id}
        required
        value={value}
        placeholder={placeholder}
        rows={5}
        maxLength={maxLength}
        onSelect={rememberSelection}
        onBlur={rememberSelection}
        onChange={(event) => {
          onChange(event.target.value);
          setLimitReached(false);
          rememberSelection();
        }}
        onKeyDown={(event) => {
          if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
          const format = formats.find(
            (format) => format.key === event.key.toLowerCase()
          );
          if (!format) return;
          event.preventDefault();
          rememberSelection();
          edit((start, end) =>
            toggleTextFormat(value, start, end, format.marker)
          );
        }}
        className="text-foreground placeholder:text-muted-foreground resize-y rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <div className="text-muted-foreground flex items-center justify-between gap-2 px-3 pb-2 text-[11px]">
        <span role="status">
          {limitReached ? t('limitReached') : t('formatHint')}
        </span>
        <span className="shrink-0 tabular-nums">
          {value.length}/{maxLength}
        </span>
      </div>
    </div>
  );
}
