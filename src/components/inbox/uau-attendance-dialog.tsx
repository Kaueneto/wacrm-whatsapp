'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles, Plus, Loader2, IdCard } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import glassStyles from '@/components/ui/morph-menu.module.css';
import { cn } from '@/lib/utils';
import { formatUauDocument } from '@/lib/uau/document-display';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { UauCategoryPicker } from './uau-category-picker';
import type { UauFinance } from '@/lib/uau/finance-types';
import type { UauAttendanceCategory } from '@/lib/uau/attendance-categories';

function startOfDay() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T00:00`;
}
export function UauAttendanceDialog({
  contactId,
  conversationId,
  finance,
  onSaved,
}: {
  contactId: string;
  conversationId?: string;
  finance: UauFinance | null;
  onSaved: () => Promise<void>;
}) {
  const t = useTranslations('UauAttendance');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<'draft' | 'save' | null>(null);
  const [categories, setCategories] = useState<UauAttendanceCategory[]>([]);
  const [categoryError, setCategoryError] = useState('');
  const [showAiPeriod, setShowAiPeriod] = useState(false);
  const [returnToCustomer, setReturnToCustomer] = useState(false);
  const [recurrent, setRecurrent] = useState(false);
  const [category, setCategory] = useState('');
  const [type, setType] = useState('');
  const [description, setDescription] = useState('');
  const [since, setSince] = useState(startOfDay);
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState('');
  const [summaryInfo, setSummaryInfo] = useState('');
  const requestId = useRef('');
  const sent = useRef(false);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const [attempted, setAttempted] = useState(false);
  const contract = finance?.contracts.find(
    (c) => c.key === finance.selectedKey
  );
  const endpoint = `/api/integrations/uau/contacts/${contactId}/attendances`;
  async function loadOptions() {
    const current = ++generation.current;
    setLoading(true);
    setCategoryError('');
    try {
      const response = await fetch(
        '/api/integrations/uau/attendance-categories',
        { cache: 'no-store' }
      );
      const data = await response.json();
      if (current !== generation.current) return;
      if (!response.ok) throw new Error(data.error || t('categoriesFailed'));
      if (!Array.isArray(data)) throw new Error(t('categoriesFailed'));
      setCategories(data);
    } catch (err) {
      if (current === generation.current)
        setCategoryError(
          err instanceof Error ? err.message : t('categoriesFailed')
        );
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }
  function begin() {
    generation.current++;
    setLoading(false);
    setCategoryError('');
    requestId.current = crypto.randomUUID();
    sent.current = false;
    setDescription('');
    setCategory('');
    setType('');
    setReviewed(false);
    setSummaryInfo('');
    setAttempted(false);
    setCategories([]);
    setShowAiPeriod(false);
    setReturnToCustomer(false);
    setRecurrent(false);
    setOpen(true);
    void loadOptions();
  }
  async function draft() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy('draft');
    setError('');
    setReviewed(false);
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'draft',
          conversationId,
          since: new Date(since).toISOString(),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || t('failed'));
      setDescription(data.description);
      setSummaryInfo(
        `${t('summaryInfo', { count: data.messageCount })}${data.truncated ? ` ${t('truncated')}` : ''}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failed'));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }
  async function submit() {
    if (inFlight.current || sent.current || attempted) return;
    inFlight.current = true;
    setBusy('save');
    setError('');
    // Keep the key and freeze edits after dispatch, including if the browser loses the response.
    setAttempted(true);
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          requestId: requestId.current,
          contractKey: contract?.key ?? null,
          category,
          ...(type !== '' ? { type: Number(type) } : {}),
          description,
          reviewed,
          returnToCustomer,
          recurrent,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        if (
          data.code === 'not_sent' ||
          data.code === 'submission_rejected' ||
          r.status === 429
        )
          setAttempted(false);
        if (data.code === 'submission_rejected')
          requestId.current = crypto.randomUUID();
        throw new Error(data.error || t('uncertain'));
      }
      sent.current = true;
      toast.success(
        data.attendanceId
          ? t('savedWithNumber', { number: data.attendanceId })
          : t('saved')
      );
      try {
        await onSaved();
      } catch {
        toast.error(t('refreshFailed'));
      }
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('uncertain'));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }
  const disabled = !!busy || attempted;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3 w-full"
        onClick={begin}
        disabled={!finance}
      >
        <Plus className="size-3" />
        {t('new')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (inFlight.current) return;
          setOpen(value);
          if (!value) generation.current++;
        }}
      >
        <DialogContent
          scrollOutside
          className="gap-3 sm:max-w-5xl"
          showCloseButton={!busy}
        >
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('hint')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-muted/30 rounded-xl border px-4 py-3">
              <p className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
                {t('customer')}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="flex min-w-0 items-baseline gap-3">
                  <span className="text-primary bg-primary/10 shrink-0 rounded-md px-2 py-1 font-mono text-lg font-bold">
                    #{finance?.customer.id}
                  </span>
                  <p className="text-xl font-semibold tracking-tight sm:text-2xl">
                    {finance?.customer.name}
                  </p>
                </div>
                {(finance?.document || finance?.documentMasked) && (
                  <span
                    className="text-muted-foreground inline-flex items-center gap-2 text-sm tabular-nums"
                    title={t('document')}
                  >
                    <IdCard className="size-4" aria-hidden="true" />
                    {formatUauDocument(
                      finance?.document || finance?.documentMasked || ''
                    )}
                  </span>
                )}
              </div>
              {contract ? (
                <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-3 border-t pt-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground text-xs">
                      {t('companyProject')}
                    </dt>
                    <dd className="mt-1 font-medium">
                      {contract.company} — {contract.project}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">
                      {t('saleNumber')}
                    </dt>
                    <dd className="mt-1 font-medium">{contract.sale}</dd>
                  </div>
                  <div className="min-w-0 flex-1">
                    <dt className="text-muted-foreground text-xs">
                      {t('contractUnits')}
                    </dt>
                    <dd className="mt-1 flex flex-wrap gap-x-6 gap-y-2">
                      {(
                        contract.unitDetails ??
                        contract.units.map((identifier) => ({
                          identifier,
                          description: '',
                        }))
                      ).map((unit, index) => (
                        <div key={index} className="min-w-0">
                          <p className="font-medium">
                            {unit.identifier || unit.description}
                          </p>
                          {unit.identifier &&
                            unit.description &&
                            unit.description !== unit.identifier && (
                              <p className="text-muted-foreground mt-0.5 text-xs">
                                {unit.description}
                              </p>
                            )}
                        </div>
                      ))}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-muted-foreground mt-2 text-xs">
                  {t('personOnly')}
                </p>
              )}
            </div>
            <p className="text-muted-foreground text-xs">{t('unitHint')}</p>
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <div className="space-y-1">
                <Label htmlFor="uau-att-category">{t('category')}</Label>
                <UauCategoryPicker
                  categories={categories}
                  value={category}
                  onChange={(value) => {
                    setCategory(value);
                    setType('');
                    setReviewed(false);
                  }}
                  disabled={disabled}
                  loading={loading}
                  error={!!categoryError}
                />
                {categoryError && (
                  <p
                    id="uau-category-error"
                    role="alert"
                    className="text-destructive text-xs"
                  >
                    {categoryError}
                  </p>
                )}
                {!loading && !categoryError && !categories.length && (
                  <p role="status" className="text-muted-foreground text-xs">
                    {t('categoriesEmpty')}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="uau-att-type">{t('optionalType')}</Label>
                <Select
                  value={type}
                  onValueChange={(value) => {
                    setType(value ?? '');
                    setReviewed(false);
                  }}
                  disabled={disabled}
                >
                  <SelectTrigger
                    id="uau-att-type"
                    className={cn(glassStyles.glass, 'h-10 w-full rounded-xl')}
                  >
                    <SelectValue>
                      {type ? t(`type${type}`) : t('noType')}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent
                    alignItemWithTrigger={false}
                    className={cn(glassStyles.glass, 'rounded-xl p-1')}
                  >
                    <SelectItem value="">{t('noType')}</SelectItem>
                    {[0, 1, 2, 3, 4].map((value) => (
                      <SelectItem
                        key={value}
                        value={String(value)}
                        className="min-h-9"
                      >
                        {t(`type${value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <label
                htmlFor="uau-return-customer"
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors',
                  returnToCustomer
                    ? 'border-primary/30 bg-primary/5'
                    : 'border-border bg-muted/20',
                  disabled && 'cursor-not-allowed opacity-60'
                )}
              >
                <Checkbox
                  id="uau-return-customer"
                  checked={returnToCustomer}
                  disabled={disabled}
                  onCheckedChange={(checked) => {
                    setReturnToCustomer(checked === true);
                    setReviewed(false);
                  }}
                />
                {t('returnToCustomer')}
              </label>
              <label
                htmlFor="uau-recurrent"
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors',
                  recurrent
                    ? 'border-primary/30 bg-primary/5'
                    : 'border-border bg-muted/20',
                  disabled && 'cursor-not-allowed opacity-60'
                )}
              >
                <Checkbox
                  id="uau-recurrent"
                  checked={recurrent}
                  disabled={disabled}
                  onCheckedChange={(checked) => {
                    setRecurrent(checked === true);
                    setReviewed(false);
                  }}
                />
                {t('recurrent')}
              </label>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={disabled || !conversationId}
                aria-expanded={showAiPeriod}
                aria-controls="uau-ai-period"
                onClick={() => setShowAiPeriod((value) => !value)}
              >
                <Sparkles className="size-3" />
                {t('generate')}
              </Button>
              {showAiPeriod && (
                <div
                  id="uau-ai-period"
                  className="flex flex-wrap items-end gap-2"
                >
                  <div className="space-y-1">
                    <Label htmlFor="uau-att-since" className="text-xs">
                      {t('since')}
                    </Label>
                    <Input
                      id="uau-att-since"
                      className="h-8 w-auto text-xs"
                      type="datetime-local"
                      value={since}
                      disabled={disabled}
                      onChange={(e) => setSince(e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={disabled || !since}
                    onClick={() => void draft()}
                  >
                    {busy === 'draft' && (
                      <Loader2 className="size-3 animate-spin" />
                    )}
                    {t('generateNow')}
                  </Button>
                </div>
              )}
            </div>
            {showAiPeriod && (
              <p className="text-muted-foreground text-[11px]">
                {t('contextHint')}
              </p>
            )}
            {summaryInfo && (
              <p role="status" className="text-muted-foreground text-xs">
                {summaryInfo}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="uau-att-description">{t('description')}</Label>
              <textarea
                id="uau-att-description"
                className="border-input bg-background h-[clamp(7rem,20vh,13rem)] w-full resize-y rounded-md border p-3 text-sm"
                maxLength={12000}
                value={description}
                disabled={disabled}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setReviewed(false);
                }}
              />
            </div>
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={reviewed}
                disabled={disabled}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              <span>{t('review')}</span>
            </label>
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            {attempted && busy !== 'save' && !sent.current && (
              <p className="text-muted-foreground text-xs">{t('attempted')}</p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={!!busy || attempted}
                onClick={() => {
                  void loadOptions();
                }}
              >
                {t('reload')}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!!busy}
                onClick={() => setOpen(false)}
              >
                {t('close')}
              </Button>
              <Button
                type="button"
                disabled={
                  disabled ||
                  loading ||
                  !!categoryError ||
                  !category ||
                  !description.trim() ||
                  !reviewed
                }
                onClick={() => void submit()}
              >
                {busy === 'save' && <Loader2 className="size-3 animate-spin" />}
                {t('submit')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
