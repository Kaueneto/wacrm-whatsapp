'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { AlertCircle, Loader2, Plus, Upload, X } from 'lucide-react';
import {
  uploadAccountMedia,
  MEDIA_MAX_BYTES_BY_KIND,
} from '@/lib/storage/upload-media';
import {
  MEDIA_HEADER_SPECS,
  isMediaHeaderKind,
  type MediaHeaderKind,
} from '@/lib/whatsapp/media-header-types';
import { canEditTemplateCategory } from '@/lib/whatsapp/template-category-edit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { useTranslations } from 'next-intl';
import {
  extractVariableIndices,
  normalizeTemplateName,
  TEMPLATE_LIMITS,
} from '@/lib/whatsapp/template-validators';
import type {
  MessageTemplate,
  TemplateButton,
  TemplateSampleValues,
} from '@/types';
import { TemplatePreview } from './template-preview';
import { TemplateBodyEditor } from './template-body-editor';

const CATEGORIES = ['Marketing', 'Utility', 'Authentication'] as const;
type HeaderFormat = 'none' | 'text' | 'image' | 'video' | 'document';
const HEADER_FORMATS: HeaderFormat[] = [
  'none',
  'text',
  'image',
  'video',
  'document',
];

interface TemplateFormData {
  name: string;
  description: string;
  category: MessageTemplate['category'];
  language: string;
  header_format: HeaderFormat;
  header_content: string;
  header_media_url: string;
  header_sample: string;
  body_text: string;
  body_samples: string[];
  footer_text: string;
  buttons: TemplateButton[];
}

const emptyForm: TemplateFormData = {
  name: '',
  description: '',
  category: 'Marketing',
  language: 'pt_BR',
  header_format: 'none',
  header_content: '',
  header_media_url: '',
  header_sample: '',
  body_text: '',
  body_samples: [],
  footer_text: '',
  buttons: [],
};

const COMMON_LANGUAGE_CODES = [
  'en_US',
  'en_GB',
  'en',
  'es',
  'es_ES',
  'es_MX',
  'fr',
  'fr_FR',
  'de',
  'it',
  'pt_BR',
  'pt_PT',
  'nl',
  'pl',
  'ru',
  'tr',
  'lt',
];

function emptyButton(type: TemplateButton['type']): TemplateButton {
  switch (type) {
    case 'QUICK_REPLY':
      return { type: 'QUICK_REPLY', text: '' };
    case 'URL':
      return { type: 'URL', text: '', url: '' };
    case 'PHONE_NUMBER':
      return { type: 'PHONE_NUMBER', text: '', phone_number: '' };
    case 'COPY_CODE':
      return { type: 'COPY_CODE', text: '', example: '' };
  }
}

function groupTemplateButtons(buttons: TemplateButton[]): TemplateButton[] {
  return [
    ...buttons.filter((button) => button.type === 'QUICK_REPLY'),
    ...buttons.filter((button) => button.type !== 'QUICK_REPLY'),
  ];
}

export function TemplateEditor({
  template,
  canSubmit,
  onSaved,
  onCancel,
}: {
  template?: MessageTemplate;
  canSubmit: boolean;
  onSaved: (id?: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations('Settings.templates');
  const tPage = useTranslations('TemplatePages');
  const editingId = template?.id ?? null;
  const categoryLocked =
    !!template && !canEditTemplateCategory(template.status);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState('');
  const [form, setForm] = useState<TemplateFormData>(() =>
    template
      ? {
          name: template.display_name ?? template.name,
          description: template.description ?? '',
          category: template.category,
          language: template.language || 'pt_BR',
          header_format: template.header_type ?? 'none',
          header_content: template.header_content ?? '',
          header_media_url: template.header_media_url ?? '',
          header_sample: template.sample_values?.header?.[0] ?? '',
          body_text: template.body_text,
          body_samples: template.sample_values?.body ?? [],
          footer_text: template.footer_text ?? '',
          buttons: template.buttons ?? [],
        }
      : emptyForm
  );
  const initialForm = useRef(form);

  // Header-media upload (image #230; video/document #562). Uploads to the
  // account-scoped chat-media bucket and stores the public URL in
  // header_media_url; the submit route turns that into a Meta
  // Resumable-Upload handle.
  const [uploadingHeader, setUploadingHeader] = useState(false);
  const headerFileRef = useRef<HTMLInputElement>(null);

  // Body variable indices — `[1, 2, 3]` for "{{1}} {{2}} {{3}}". We
  // re-run the extractor on every render to keep the sample-value rows
  // in sync with what the user typed.
  const bodyVarCount = useMemo(
    () => extractVariableIndices(form.body_text).length,
    [form.body_text]
  );
  const headerVarCount = useMemo(
    () =>
      form.header_format === 'text'
        ? extractVariableIndices(form.header_content).length
        : 0,
    [form.header_format, form.header_content]
  );

  // Resize body_samples so it always has exactly bodyVarCount entries.
  // (We mutate via setForm in an effect so React owns the state.)
  useEffect(() => {
    setForm((prev) => {
      if (prev.body_samples.length === bodyVarCount) return prev;
      const next = prev.body_samples.slice(0, bodyVarCount);
      while (next.length < bodyVarCount) next.push('');
      return { ...prev, body_samples: next };
    });
  }, [bodyVarCount]);

  function buildMetaFields(form: TemplateFormData) {
    const sample_values: TemplateSampleValues = {};
    if (form.body_samples.some((v) => v.trim())) {
      sample_values.body = form.body_samples.map((v) => v.trim());
    }
    if (form.header_format === 'text' && form.header_sample.trim()) {
      sample_values.header = [form.header_sample.trim()];
    }

    return {
      name: template?.name ?? normalizeTemplateName(form.name),
      category: form.category,
      language: form.language.trim() || 'pt_BR',
      header_type:
        form.header_format === 'none' ? undefined : form.header_format,
      header_content:
        form.header_format === 'text' ? form.header_content.trim() : undefined,
      header_media_url:
        form.header_format !== 'none' && form.header_format !== 'text'
          ? form.header_media_url.trim() || undefined
          : undefined,
      body_text: form.body_text.trim(),
      footer_text: form.footer_text.trim() || undefined,
      buttons: form.buttons.length > 0 ? form.buttons : undefined,
      sample_values:
        Object.keys(sample_values).length > 0 ? sample_values : undefined,
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !canSubmit ||
      submitting ||
      uploadingHeader ||
      form.category === 'Authentication'
    )
      return;
    setSubmitError('');
    setSubmitting(true);

    try {
      const isEdit = editingId !== null;
      const fields = buildMetaFields(form);
      if (!fields.name) throw new Error(t('titleNeedsLetters'));
      const metadata = {
        display_name: form.name.trim(),
        description: form.description.trim(),
      };
      const localOnly =
        isEdit &&
        JSON.stringify(fields) ===
          JSON.stringify(buildMetaFields(initialForm.current));
      const res = await fetch(
        isEdit
          ? `/api/whatsapp/templates/${editingId}`
          : '/api/whatsapp/templates/submit',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            localOnly ? metadata : { ...fields, ...metadata }
          ),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data?.error ||
            t(isEdit ? 'editFailedHttp' : 'submitFailedHttp', {
              status: res.status,
            })
        );
      }
      toast.success(
        data.local_only
          ? t('toastSaveLocalDetails')
          : data.dry_run
            ? t(isEdit ? 'toastSaveEditDry' : 'toastSaveNewDry')
            : t(isEdit ? 'toastSubmitEditSuccess' : 'toastSubmitNewSuccess')
      );
      await onSaved(data.template?.id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('toastSubmitFailed');
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  }

  // The patch type unions every field across button variants. The
  // conditional rendering below ensures only fields valid for the
  // current button's `type` reach this function, so the runtime
  // assertion + per-type spread preserves discriminated-union
  // invariants without forcing every call site to thread the type
  // through generics (which TS can't infer from a partial literal).
  type ButtonPatch = {
    text?: string;
    url?: string;
    phone_number?: string;
    example?: string;
  };
  function updateButton(index: number, patch: ButtonPatch) {
    setForm((prev) => {
      const current = prev.buttons[index];
      if (!current) return prev;
      const next = [...prev.buttons];
      // Per-variant spread keeps the discriminant pinned. Switch
      // exhaustiveness is enforced by TypeScript.
      switch (current.type) {
        case 'QUICK_REPLY':
          next[index] = {
            ...current,
            ...(patch.text !== undefined && { text: patch.text }),
          };
          break;
        case 'URL':
          next[index] = {
            ...current,
            ...(patch.text !== undefined && { text: patch.text }),
            ...(patch.url !== undefined && { url: patch.url }),
            ...(patch.example !== undefined && { example: patch.example }),
          };
          break;
        case 'PHONE_NUMBER':
          next[index] = {
            ...current,
            ...(patch.text !== undefined && { text: patch.text }),
            ...(patch.phone_number !== undefined && {
              phone_number: patch.phone_number,
            }),
          };
          break;
        case 'COPY_CODE':
          next[index] = {
            ...current,
            ...(patch.text !== undefined && { text: patch.text }),
            ...(patch.example !== undefined && { example: patch.example }),
          };
          break;
      }
      return { ...prev, buttons: next };
    });
  }

  function changeButtonType(index: number, type: TemplateButton['type']) {
    setForm((prev) => {
      const next = [...prev.buttons];
      next[index] = { ...emptyButton(type), text: next[index].text };
      return { ...prev, buttons: groupTemplateButtons(next) };
    });
  }

  function removeButton(index: number) {
    setForm((prev) => ({
      ...prev,
      buttons: prev.buttons.filter((_, i) => i !== index),
    }));
  }

  function addButton(type: TemplateButton['type']) {
    setForm((prev) =>
      prev.buttons.length >= TEMPLATE_LIMITS.maxButtonsTotal
        ? prev
        : {
            ...prev,
            buttons: groupTemplateButtons([...prev.buttons, emptyButton(type)]),
          }
    );
  }

  const headerNeedsMedia =
    form.header_format !== 'none' && form.header_format !== 'text';
  const headerMediaKind: MediaHeaderKind | null = isMediaHeaderKind(
    form.header_format
  )
    ? form.header_format
    : null;

  // Per-kind copy for the file picker. Kept as explicit key maps (not
  // `t(\`upload${kind}\`)`) so the catalogue scanner can see every key.
  const uploadLabelKey = {
    image: 'uploadImage',
    video: 'uploadVideo',
    document: 'uploadDocument',
  } as const;
  const uploadHintKey = {
    image: 'uploadHint',
    video: 'uploadHintVideo',
    document: 'uploadHintDocument',
  } as const;
  const invalidTypeKey = {
    image: 'toastInvalidImage',
    video: 'toastInvalidVideo',
    document: 'toastInvalidDocument',
  } as const;

  async function handleHeaderMediaFile(file: File, kind: MediaHeaderKind) {
    if (!MEDIA_HEADER_SPECS[kind].mimeTypes.includes(file.type)) {
      toast.error(t(invalidTypeKey[kind]));
      return;
    }
    // The upload lands in the chat-media bucket, whose 16 MB ceiling is
    // below Meta's 100 MB document cap — so this is the bucket-side
    // limit, not Meta's. A larger document can still be pasted as a link.
    const maxBytes = MEDIA_MAX_BYTES_BY_KIND[kind];
    if (file.size > maxBytes) {
      toast.error(
        t('toastMediaTooLarge', {
          size: (file.size / 1024 / 1024).toFixed(1),
          max: Math.round(maxBytes / 1024 / 1024),
        })
      );
      return;
    }
    setUploadingHeader(true);
    try {
      const { publicUrl } = await uploadAccountMedia('chat-media', file);
      setForm((f) => ({ ...f, header_media_url: publicUrl }));
      setMediaPreviewUrl(publicUrl);
      toast.success(t('toastUploadSuccess'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toastUploadFailed'));
    } finally {
      setUploadingHeader(false);
    }
  }

  const headerLabels: Record<HeaderFormat, string> = {
    none: t('headerNone'),
    text: t('headerText'),
    image: t('headerImage'),
    video: t('headerVideo'),
    document: t('headerDocument'),
  };
  const buttonTypeLabels = {
    QUICK_REPLY: t('btnQuickReply'),
    URL: t('btnUrl'),
    PHONE_NUMBER: t('btnPhone'),
    COPY_CODE: t('btnCopyCode'),
  };
  const buttonTypes = Object.keys(buttonTypeLabels) as TemplateButton['type'][];
  const fields = (
    <>
      {form.category === 'Authentication' && (
        <div className="flex items-start gap-2 rounded border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <p>
            {t.rich('authWarning', {
              bold: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
        </div>
      )}

      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <Label htmlFor="template-name" className="text-muted-foreground">
            {t('templateName')}
          </Label>
          <Input
            id="template-name"
            required
            placeholder={t('namePlaceholder')}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            maxLength={512}
            className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
          />
          <p className="text-muted-foreground text-[11px]">
            {editingId ? t('nameFixed') : t('nameHint')}
          </p>
        </div>

        <div className="space-y-2">
          <Label
            htmlFor="template-description"
            className="text-muted-foreground"
          >
            {t('localDescription')}
          </Label>
          <Textarea
            id="template-description"
            rows={2}
            maxLength={1000}
            value={form.description}
            onChange={(event) =>
              setForm({ ...form, description: event.target.value })
            }
            placeholder={t('localDescriptionPlaceholder')}
            className="bg-muted border-border"
          />
          <p className="text-muted-foreground text-[11px]">
            {t('localDescriptionHint')}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label
              htmlFor="template-category"
              className="text-muted-foreground"
            >
              {t('category')}
            </Label>
            <Select
              value={form.category}
              onValueChange={(category) => {
                if (category) setForm({ ...form, category });
              }}
              disabled={categoryLocked}
            >
              <SelectTrigger
                id="template-category"
                className="bg-muted border-border text-foreground w-full"
              >
                <SelectValue>
                  {t(`categoryLabels.${form.category}`)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {CATEGORIES.map((cat) => (
                  <SelectItem
                    key={cat}
                    value={cat}
                    className="text-popover-foreground focus:bg-muted focus:text-popover-foreground"
                  >
                    {t(`categoryLabels.${cat}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {categoryLocked && (
              <p className="text-muted-foreground text-[11px]">
                {t('categoryFixed')}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="template-language"
              className="text-muted-foreground"
            >
              {t('language')}
            </Label>
            <Input
              id="template-language"
              list="template-language-codes"
              placeholder="pt_BR"
              value={form.language}
              onChange={(e) => setForm({ ...form, language: e.target.value })}
              disabled={editingId !== null}
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
            />
            <datalist id="template-language-codes">
              {COMMON_LANGUAGE_CODES.map((code) => (
                <option key={code} value={code} />
              ))}
            </datalist>
            <p className="text-muted-foreground text-[11px]">
              {editingId ? (
                t('langFixed')
              ) : (
                <span>
                  {t.rich('langHint', {
                    code: (chunks) => <code>{chunks}</code>,
                  })}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="template-header" className="text-muted-foreground">
            {t('header')}
          </Label>
          <Select
            value={form.header_format}
            onValueChange={(val) =>
              // Preserve header_content, header_media_url, and
              // header_sample across format switches. The submit
              // payload builder only reads the field that matches
              // the active format, so an orphan value on a hidden
              // field is harmless — and keeping it lets the user
              // switch formats to compare without losing typing.
              setForm({
                ...form,
                header_format: (val || 'none') as HeaderFormat,
              })
            }
          >
            <SelectTrigger
              id="template-header"
              className="bg-muted border-border text-foreground w-full"
            >
              <SelectValue>{headerLabels[form.header_format]}</SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              {HEADER_FORMATS.map((type) => (
                <SelectItem
                  key={type}
                  value={type}
                  className="text-popover-foreground focus:bg-muted focus:text-popover-foreground"
                >
                  {headerLabels[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {form.header_format === 'text' && (
            <div className="mt-2 space-y-2">
              <Input
                id="template-header-text"
                aria-label={t('headerTextLabel')}
                placeholder={t.raw('headerTextPlaceholder')}
                value={form.header_content}
                onChange={(e) =>
                  setForm({ ...form, header_content: e.target.value })
                }
                maxLength={TEMPLATE_LIMITS.headerTextMaxLength}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
              />
              {headerVarCount > 0 && (
                <Input
                  id="template-header-sample"
                  aria-label={t('headerSampleAria')}
                  placeholder={t.raw('headerSamplePlaceholder')}
                  value={form.header_sample}
                  onChange={(e) =>
                    setForm({ ...form, header_sample: e.target.value })
                  }
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                />
              )}
            </div>
          )}

          {headerNeedsMedia && (
            <div className="mt-2 space-y-2">
              {headerMediaKind && (
                <div className="flex items-center gap-2">
                  <input
                    ref={headerFileRef}
                    type="file"
                    accept={MEDIA_HEADER_SPECS[headerMediaKind].mimeTypes.join(
                      ','
                    )}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleHeaderMediaFile(f, headerMediaKind);
                      e.target.value = '';
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploadingHeader}
                    onClick={() => headerFileRef.current?.click()}
                  >
                    {uploadingHeader ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    {t(uploadLabelKey[headerMediaKind])}
                  </Button>
                  <span className="text-muted-foreground text-[11px]">
                    {t(uploadHintKey[headerMediaKind])}
                  </span>
                </div>
              )}
              <Input
                placeholder={t('mediaUrlPlaceholder', {
                  format: form.header_format,
                })}
                value={form.header_media_url}
                onChange={(e) =>
                  setForm({ ...form, header_media_url: e.target.value })
                }
                onBlur={(e) => {
                  const url = e.target.value.trim();
                  setMediaPreviewUrl(/^https?:\/\//i.test(url) ? url : '');
                }}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
              />
              {editingId &&
                form.header_format === 'image' &&
                form.header_media_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={form.header_media_url}
                    alt={t('headerSampleAlt')}
                    className="border-border max-h-28 rounded-md border object-contain"
                  />
                )}
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                {form.header_format === 'image'
                  ? t('imageHint')
                  : t('mediaHint')}
                {form.header_format === 'video' && t('videoHint')}
                {form.header_format === 'document' && t('documentHint')}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="template-body" className="text-muted-foreground">
            {t('bodyText')}
          </Label>
          <TemplateBodyEditor
            id="template-body"
            placeholder={t.raw('bodyPlaceholder')}
            value={form.body_text}
            onChange={(body_text) => setForm(prev => ({ ...prev, body_text }))}
            maxLength={TEMPLATE_LIMITS.bodyMaxLength}
          />
          <p className="text-muted-foreground text-[11px]">
            {t.raw('bodyHint')}
          </p>

          {bodyVarCount > 0 && (
            <div className="space-y-1.5 pt-1">
              <Label className="text-muted-foreground text-[11px]">
                {t('sampleValues')}
              </Label>
              {form.body_samples.map((val, i) => {
                const inputId = `template-body-sample-${i}`;
                return (
                  <Input
                    key={i}
                    id={inputId}
                    aria-label={t('sampleAria', { var: `{{${i + 1}}}` })}
                    placeholder={t('samplePlaceholder', {
                      var: `{{${i + 1}}}`,
                    })}
                    value={val}
                    onChange={(e) => {
                      const next = [...form.body_samples];
                      next[i] = e.target.value;
                      setForm({ ...form, body_samples: next });
                    }}
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                  />
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="template-footer" className="text-muted-foreground">
            {t('footer')}
          </Label>
          <Input
            id="template-footer"
            placeholder={t('footerPlaceholder')}
            value={form.footer_text}
            onChange={(e) => setForm({ ...form, footer_text: e.target.value })}
            maxLength={TEMPLATE_LIMITS.footerMaxLength}
            className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-muted-foreground">{t('buttons')}</Label>
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={
                  form.buttons.length >= TEMPLATE_LIMITS.maxButtonsTotal
                }
                render={<Button type="button" variant="outline" size="sm" />}
              >
                <Plus className="size-3" />
                {t('addButton')}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-40">
                {buttonTypes.map((type) => (
                  <DropdownMenuItem key={type} onClick={() => addButton(type)}>
                    {buttonTypeLabels[type]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {form.buttons.length === 0 ? (
            <p className="text-muted-foreground text-[11px]">
              {t('buttonsLimit', { max: TEMPLATE_LIMITS.maxButtonsTotal })}
            </p>
          ) : (
            <div className="space-y-2">
              {form.buttons.map((btn, i) => (
                <div
                  key={i}
                  className="border-border bg-muted/50 space-y-2 rounded border p-2"
                >
                  <div className="flex items-center gap-2">
                    <Select
                      value={btn.type}
                      onValueChange={(val) => {
                        // Same null guard as the Header Select
                        // (per PR 148): @base-ui Select fires
                        // onValueChange(null) on deselect.
                        if (!val) return;
                        changeButtonType(i, val as TemplateButton['type']);
                      }}
                    >
                      <SelectTrigger
                        aria-label={tPage('buttonType')}
                        className="bg-muted border-border text-foreground h-8 w-36 text-xs"
                      >
                        <SelectValue>{buttonTypeLabels[btn.type]}</SelectValue>
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        {buttonTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {buttonTypeLabels[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder={t('btnLabelPlaceholder')}
                      aria-label={t('btnLabelPlaceholder')}
                      value={btn.text}
                      maxLength={TEMPLATE_LIMITS.buttonTextMaxLength}
                      onChange={(e) =>
                        updateButton(i, { text: e.target.value })
                      }
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-8 flex-1 text-xs"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeButton(i)}
                      aria-label={tPage('removeButton')}
                      className="text-muted-foreground size-7 hover:bg-red-950/30 hover:text-red-400"
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                  {btn.type === 'URL' && (
                    <div className="space-y-1 pl-1">
                      <Input
                        placeholder={t.raw('urlPlaceholder')}
                        aria-label={t('btnUrl')}
                        value={btn.url}
                        onChange={(e) =>
                          updateButton(i, { url: e.target.value })
                        }
                        className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-8 text-xs"
                      />
                      {extractVariableIndices(btn.url).length > 0 && (
                        <Input
                          placeholder={t.raw('urlSamplePlaceholder')}
                          value={btn.example ?? ''}
                          onChange={(e) =>
                            updateButton(i, { example: e.target.value })
                          }
                          className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-8 text-xs"
                        />
                      )}
                    </div>
                  )}
                  {btn.type === 'PHONE_NUMBER' && (
                    <Input
                      placeholder={t('phonePlaceholder')}
                      value={btn.phone_number}
                      onChange={(e) =>
                        updateButton(i, { phone_number: e.target.value })
                      }
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-8 text-xs"
                    />
                  )}
                  {btn.type === 'COPY_CODE' && (
                    <Input
                      placeholder={t('codePlaceholder')}
                      value={btn.example}
                      onChange={(e) =>
                        updateButton(i, { example: e.target.value })
                      }
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-8 text-xs"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );

  const editorForm = (
    <form
      onSubmit={handleSubmit}
      className={
        editingId
          ? 'min-w-0 space-y-4'
          : 'bg-card min-w-0 space-y-4 rounded-xl border p-4 sm:p-5'
      }
    >
      {fields}
      {submitError && (
        <p role="alert" className="text-destructive text-sm wrap-break-word">
          {submitError}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={submitting}
        >
          {t('cancel')}
        </Button>
        <Button
          type="submit"
          disabled={
            !canSubmit ||
            submitting ||
            uploadingHeader ||
            form.category === 'Authentication'
          }
        >
          {submitting && <Loader2 className="size-4 animate-spin" />}
          {t(
            submitting
              ? editingId
                ? 'saving'
                : 'submitting'
              : editingId
                ? 'saveResubmit'
                : 'submitApproval'
          )}
        </Button>
      </div>
    </form>
  );

  if (editingId) return editorForm;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] lg:items-start">
      {editorForm}
      <TemplatePreview
        template={{
          body_text: form.body_text,
          header_type:
            form.header_format === 'none' ? undefined : form.header_format,
          header_content: form.header_content,
          header_media_url: headerNeedsMedia ? mediaPreviewUrl : undefined,
          footer_text: form.footer_text,
          sample_values: {
            body: form.body_samples.map((sample) => sample.trim()),
            header: [form.header_sample.trim()],
          },
          buttons: form.buttons.map((button) => ({
            ...button,
            text: button.text.trim() || buttonTypeLabels[button.type],
          })),
        }}
        emptyText={tPage('emptyPreview')}
      />
    </div>
  );
}
