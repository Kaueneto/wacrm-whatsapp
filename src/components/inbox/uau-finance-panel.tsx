'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Landmark,
  Loader2,
  RefreshCw,
  Search,
  Phone,
  Mail,
  Link2,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { semanticChip } from '@/lib/semantic-chip';
import type { UauCustomer, UauFinance } from '@/lib/uau/finance-types';
import type { UauLinkSuggestion } from '@/lib/uau/link-suggestion';

type Result = UauFinance | { linked: false; connectionChanged?: boolean };
async function api<T>(
  url: string,
  method: string,
  body: object | undefined,
  signal: AbortSignal
): Promise<T> {
  const response = await fetch(url, {
    method,
    signal,
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
const cpfMask = (value: string) =>
  value
    .replace(/\D/g, '')
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');

/** Always visible. The server checks access and reuses its contact-scoped snapshots. */
export function UauFinancePanel({
  contactId,
  suggestionToken,
  detailed = false,
  onDataChange,
}: {
  contactId: string;
  suggestionToken?: string | null;
  detailed?: boolean;
  onDataChange?: (data: UauFinance | null) => void;
}) {
  const t = useTranslations('UauFinance');
  const locale = useLocale();
  const endpoint = `/api/integrations/uau/contacts/${contactId}/finance`;
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState<UauFinance | null>(null);
  const [suggestion, setSuggestion] = useState<UauLinkSuggestion | null>(null);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
  const [cpf, setCpf] = useState('');
  const [candidates, setCandidates] = useState<UauCustomer[]>([]);
  const [searched, setSearched] = useState(false);
  const [editing, setEditing] = useState(false);
  const suggestedLink = !data && !editing && !suggestionDismissed ? suggestion : null;
  const [connectionChanged, setConnectionChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'overdue' | 'upcoming' | 'received'>(
    'overdue'
  );
  const pending = useRef<AbortController | null>(null);
  const perform = useCallback(
    async (operation: (signal: AbortSignal) => Promise<void>) => {
      pending.current?.abort();
      const request = new AbortController();
      pending.current = request;
      setBusy(true);
      setError('');
      try {
        await operation(request.signal);
      } catch (error) {
        if (!request.signal.aborted)
          setError(error instanceof Error ? error.message : t('requestFailed'));
      } finally {
        if (!request.signal.aborted) setBusy(false);
      }
    },
    [t]
  );
  const update = useCallback((result: Result) => {
    setLoaded(true);
    setData(result.linked ? result : null);
    setConnectionChanged(!result.linked && !!result.connectionChanged);
  }, []);
  const refresh = useCallback(
    () =>
      perform(async (signal) => {
        const result = await api<Result>(endpoint, 'GET', undefined, signal);
        update(result);
        if (!result.linked && suggestionToken) {
          const origin = await api<{ suggestion: UauLinkSuggestion }>(
            endpoint, 'POST', { action: 'suggestion', token: suggestionToken }, signal,
          );
          setSuggestion(origin.suggestion);
        }
      }),
    [endpoint, perform, update, suggestionToken]
  );
  useEffect(() => {
    void refresh();
    return () => pending.current?.abort();
  }, [refresh]);

  useEffect(() => {
    onDataChange?.(data);
  }, [data, onDataChange]);

  const money = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'BRL',
    }).format(value / 100);
  const date = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(locale, {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }).format(new Date(`${value}T12:00:00`))
      : '—';
  const contract = data?.contracts.find(
    (contract) => contract.key === data.selectedKey
  );
  const overdue =
    data?.open?.filter((parcel) => parcel.daysOverdue > 0) ?? null;
  const upcoming =
    data?.open?.filter((parcel) => parcel.daysOverdue === 0) ?? null;
  const rows =
    tab === 'received'
      ? data?.received
      : tab === 'overdue'
        ? overdue
        : upcoming;
  const totals = [
    { id: 'overdue', items: overdue, style: semanticChip.danger },
    { id: 'upcoming', items: upcoming, style: semanticChip.info },
    { id: 'received', items: data?.received, style: semanticChip.success },
  ] as const;

  return (
    <section className="mt-4 space-y-3" aria-label={t('title')}>
      <div className="flex flex-wrap items-center justify-between gap-x-2 px-1">
        <div className="text-muted-foreground flex min-w-0 items-center gap-2 px-1 text-xs font-medium tracking-wider uppercase">
          <Landmark className="size-3" aria-hidden="true" />
          <h3>{t('title')}</h3>
        </div>
        {data && !editing && (
          <div className="flex flex-wrap gap-1">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={busy}
              onClick={() => {
                setEditing(true);
                setCpf('');
                setCandidates([]);
                setSearched(false);
              }}
            >
              {t('changeLink')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={busy}
              onClick={() =>
                void perform(async (signal) => {
                  update(
                    await api<Result>(endpoint, 'DELETE', undefined, signal)
                  );
                  setCpf('');
                })
              }
              className="text-muted-foreground"
            >
              {t('unlink')}
            </Button>
          </div>
        )}
      </div>
      <div id={`uau-${contactId}`} className="space-y-3">
        {error && (
          <p
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-2 text-xs"
          >
            {error}
          </p>
        )}
        {!loaded && (
          <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
            <span>{busy ? t('loading') : t('loadPrompt')}</span>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void refresh()}
              aria-label={t('refresh')}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
            </Button>
          </div>
        )}
        {loaded && (!data || editing) && (
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void perform(async (signal) => {
                const result = await api<{ candidates: UauCustomer[] }>(
                  endpoint,
                  'POST',
                  { action: 'lookup', cpf, ...(suggestedLink ? { suggestionToken } : {}) },
                  signal
                );
                setCandidates(result.candidates);
                setSearched(true);
              });
            }}
          >
            {suggestedLink && (
              <div className="border-primary/30 bg-primary/5 space-y-2 rounded-lg border p-3">
                <p className="text-xs font-medium">{t('suggestedLinkTitle')}</p>
                <p className="text-sm font-semibold break-words">{suggestedLink.personName}</p>
                <p className="text-muted-foreground text-xs">{t('personCode', { code: suggestedLink.personId })}</p>
                <p className="text-muted-foreground text-xs">{t('suggestedLinkOrigin', { contract: suggestedLink.contractKey })}</p>
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => {
                  setSuggestionDismissed(true);
                  setCpf('');
                  setCandidates([]);
                  setSearched(false);
                }}>{t('dismissSuggestion')}</Button>
              </div>
            )}
            <p className="text-muted-foreground text-xs">
              {suggestedLink ? t('suggestedLinkConfirmHint') : connectionChanged ? t('connectionChanged') : t('identifyHint')}
            </p>
            <Label htmlFor={`cpf-${contactId}`} className="text-xs">
              {t('cpf')}
            </Label>
            <div className="flex gap-1.5">
              <Input
                id={`cpf-${contactId}`}
                inputMode="numeric"
                autoComplete="off"
                placeholder="000.000.000-00"
                value={cpf}
                maxLength={14}
                onChange={(event) => {
                  setCpf(cpfMask(event.target.value));
                  setCandidates([]);
                  setSearched(false);
                }}
                disabled={busy}
                className="min-w-0 text-sm"
              />
              <Button
                type="submit"
                size="icon"
                disabled={busy || cpf.replace(/\D/g, '').length !== 11}
                title={t('search')}
                aria-label={t('search')}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
              </Button>
            </div>
            {searched && !candidates.length && (
              <p role="status" className="text-muted-foreground text-xs">
                {t(suggestedLink ? 'suggestedLinkNotFound' : 'notFound')}
              </p>
            )}
            {!!candidates.length && (
              <div className="space-y-2">
                <p className="text-muted-foreground text-xs">
                  {t('confirmHint')}
                </p>
                {candidates.map((person) => (
                  <div
                    key={person.id}
                    className="bg-muted space-y-1.5 rounded-lg p-2.5"
                  >
                    <p className="text-sm font-semibold break-words">
                      {person.name}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {t('personCode', { code: person.id })}
                    </p>
                    {person.email && (
                      <p className="text-muted-foreground text-xs break-all">
                        {person.email}
                      </p>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void perform(async (signal) => {
                          await api(
                            endpoint,
                            'PUT',
                            { cpf, personId: person.id, ...(suggestedLink ? { suggestionToken } : {}) },
                            signal
                          );
                          setEditing(false);
                          setSuggestionDismissed(true);
                          setData(null);
                          setLoaded(false);
                          setCpf('');
                          setCandidates([]);
                          setSearched(false);
                          update(
                            await api<Result>(
                              endpoint,
                              'GET',
                              undefined,
                              signal
                            )
                          );
                        })
                      }
                    >
                      <Link2 className="size-3.5" />
                      {t('confirmLink')}
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {data && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setEditing(false)}
              >
                {t('cancel')}
              </Button>
            )}
          </form>
        )}
        {data && !editing && (
          <>
            <div className="flex items-start gap-1">
              <div className="min-w-0 flex-1">
                <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                  {t('customerFromUau')}
                </p>
                <h4 className="mt-1 flex flex-col gap-0.5 leading-snug">
                  <span className="text-muted-foreground text-xs font-medium tabular-nums">
                    {t('personCode', { code: data.customer.id })}
                  </span>
                  <span className="text-base font-semibold break-words">
                    {data.customer.name}
                  </span>
                </h4>
                <p className="text-muted-foreground mt-1 text-xs">
                  {data.documentMasked}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={busy}
                title={t('refresh')}
                aria-label={t('refresh')}
                onClick={() =>
                  void perform(async (signal) =>
                    update(
                      await api<Result>(
                        endpoint,
                        'POST',
                        {
                          action: 'refresh',
                          contractKey: data.selectedKey ?? undefined,
                        },
                        signal
                      )
                    )
                  )
                }
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
              </Button>
            </div>
            <div className="border-border space-y-2 rounded-lg border p-3">
              <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                {t('erpContacts')}
              </p>
              <div className="flex flex-wrap gap-2">
                {data.customer.email && (
                  <p
                    className={`inline-flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs break-all ${semanticChip.purple}`}
                  >
                    <Mail className="mt-0.5 size-3 shrink-0" />
                    {data.customer.email}
                  </p>
                )}
                {data.phones?.map((phone, index) => (
                  <p
                    key={`${phone.number}-${index}`}
                    className={`inline-flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs break-all ${semanticChip.info}`}
                  >
                    <Phone className="mt-0.5 size-3 shrink-0" />
                    <span className="min-w-0">
                      <span className="block">{phone.number}</span>
                      {phone.complement && (
                        <span className="block text-[11px] text-muted-foreground">{phone.complement}</span>
                      )}
                    </span>
                    {phone.primary && (
                      <span className="bg-background/70 rounded-full px-1.5 py-0.5 text-[9px] font-semibold">
                        {t('primaryPhone')}
                      </span>
                    )}
                  </p>
                ))}
              </div>
              {data.phones?.length === 0 && !data.customer.email && (
                <p className="text-muted-foreground text-xs">
                  {t('noContacts')}
                </p>
              )}
            </div>
            {data.warnings.map((warning) => (
              <p
                key={warning}
                role="status"
                className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-200"
              >
                {t(`warnings.${warning}`)}
              </p>
            ))}
            {data.contracts.length ? (
              <>
                <div className="space-y-1">
                  <Label htmlFor={`contract-${contactId}`} className="text-xs">
                    {t('contract')}
                  </Label>
                  <select
                    id={`contract-${contactId}`}
                    value={data.selectedKey ?? ''}
                    disabled={busy}
                    onChange={(event) => {
                      const key = event.target.value;
                      void perform(async (signal) => {
                        update(
                          await api<Result>(
                            endpoint,
                            'POST',
                            { action: 'select', contractKey: key },
                            signal
                          )
                        );
                        setTab('overdue');
                      });
                    }}
                    className="border-input bg-background text-foreground focus-visible:outline-ring h-9 w-full min-w-0 rounded-lg border px-2 text-xs focus-visible:outline-2"
                  >
                    {data.contracts.map((contract) => (
                      <option key={contract.key} value={contract.key}>
                        {t('contractOption', {
                          company: contract.company,
                          project: contract.project,
                          sale: contract.sale,
                        })}
                      </option>
                    ))}
                  </select>
                  {contract?.units.map((unit) => (
                    <p
                      key={unit}
                      className="text-muted-foreground text-xs break-words"
                    >
                      {unit}
                    </p>
                  ))}
                </div>
                <p className="text-muted-foreground text-[10px]">
                  {t('selectedContractHint')}
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {totals.map((total) => (
                    <div
                      key={total.id}
                      className={`flex min-w-0 flex-col gap-1.5 rounded-lg border px-2 py-2.5 ${total.style}`}
                    >
                      <span className="text-xs">{t(total.id)}</span>
                      <span className="text-xs font-semibold break-all tabular-nums">
                        {total.items
                          ? money(
                              total.items.reduce(
                                (sum, item) => sum + item.amountCents,
                                0
                              )
                            )
                          : '—'}
                      </span>
                    </div>
                  ))}
                </div>
                <div
                  role="group"
                  aria-label={t('installments')}
                  className="flex flex-wrap gap-1"
                >
                  {(['overdue', 'upcoming', 'received'] as const).map(
                    (value) => (
                      <Button
                        key={value}
                        type="button"
                        variant={tab === value ? 'secondary' : 'ghost'}
                        size="xs"
                        aria-pressed={tab === value}
                        disabled={busy}
                        onClick={() => setTab(value)}
                      >
                        {t(value)}
                      </Button>
                    )
                  )}
                </div>
                {busy ? (
                  <div
                    className="flex justify-center py-4"
                    role="status"
                    aria-label={t('loading')}
                  >
                    <Loader2 className="text-muted-foreground size-5 animate-spin" />
                  </div>
                ) : rows === null || rows === undefined ? (
                  <p className="text-muted-foreground text-xs">
                    {t('unavailable')}
                  </p>
                ) : rows.length === 0 ? (
                  <p className="bg-muted/50 text-muted-foreground rounded-lg p-3 text-xs">
                    {t('noInstallments')}
                  </p>
                ) : (
                  <div
                    className={`border-border overflow-auto rounded-lg border ${detailed ? 'max-h-[60vh]' : 'max-h-96'}`}
                    tabIndex={0}
                    role="region"
                    aria-label={t(tab)}
                  >
                    <table
                      className={`w-full min-w-[1000px] text-left text-xs`}
                    >
                      <caption className="sr-only">{t(tab)}</caption>
                      <thead className="bg-muted text-muted-foreground sticky top-0">
                        <tr>
                          <th scope="col" className="px-3 py-2.5 font-medium">
                            {t('columns.installment')}
                          </th>
                          <th scope="col" className="px-3 py-2.5 font-medium">
                            {t('columns.type')}
                          </th>
                          <th scope="col" className="px-3 py-2.5 font-medium">
                            {t('columns.dueDate')}
                          </th>
                          <th scope="col" className="px-3 py-2.5 font-medium">
                            {t(
                              tab === 'received'
                                ? 'columns.paidDate'
                                : 'columns.daysOverdue'
                            )}
                          </th>
                          {(
                            [
                              'principal',
                              'correction',
                              'interest',
                              'lateInterest',
                              'fine',
                              'discount',
                            ] as const
                          )
                            .filter(
                              (column) =>
                                tab !== 'received' || column !== 'principal'
                            )
                            .map((column) => (
                              <th
                                key={column}
                                scope="col"
                                className="px-3 py-2.5 text-right font-medium"
                              >
                                {t(
                                  'columns.' +
                                    (column === 'discount' && tab === 'received'
                                      ? 'receiptDiscount'
                                      : column)
                                )}
                              </th>
                            ))}
                          <th
                            scope="col"
                            className="px-3 py-2.5 text-right font-medium"
                          >
                            {t(
                              tab === 'received'
                                ? 'columns.receivedValue'
                                : 'columns.calculatedValue'
                            )}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-border divide-y">
                        {rows.map((row, index) => (
                          <tr
                            key={row.key + '-' + index}
                            className="hover:bg-muted/50 transition-colors"
                          >
                            <th
                              scope="row"
                              className="px-3 py-3 font-medium tabular-nums"
                            >
                              {row.number}
                            </th>
                            <td
                              className="text-muted-foreground px-3 py-2 whitespace-nowrap"
                              title={[
                                row.description,
                                row.type,
                                row.adjustmentIndex,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            >
                              {row.description || row.type || '—'}
                              {row.description && row.type && (
                                <span className="ml-1.5 text-[10px]">
                                  ({row.type})
                                </span>
                              )}
                              {row.adjustmentIndex && (
                                <span className="ml-1.5 text-[10px]">
                                  · {row.adjustmentIndex}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap tabular-nums">
                              {date(row.dueDate)}
                              {row.originalDueDate &&
                                row.originalDueDate !== row.dueDate && (
                                  <span className="text-muted-foreground mt-1 block text-[10px]">
                                    {t('originalDueDate', {
                                      date: date(row.originalDueDate),
                                    })}
                                  </span>
                                )}
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap tabular-nums">
                              {tab === 'received' ? (
                                date(row.paidDate)
                              ) : row.daysOverdue > 0 ? (
                                <span className="font-medium text-red-800 dark:text-rose-300">
                                  {t('daysOverdue', {
                                    count: row.daysOverdue,
                                  })}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            {(
                              [
                                'principalCents',
                                'correctionCents',
                                'interestCents',
                                'lateInterestCents',
                                'fineCents',
                                'discountCents',
                              ] as const
                            )
                              .filter(
                                (field) =>
                                  tab !== 'received' ||
                                  field !== 'principalCents'
                              )
                              .map((field) => (
                                <td
                                  key={field}
                                  className="px-3 py-3 text-right whitespace-nowrap tabular-nums"
                                >
                                  {row[field] === null ||
                                  row[field] === undefined
                                    ? '—'
                                    : money(row[field])}
                                </td>
                              ))}
                            <td className="px-3 py-3 text-right font-semibold whitespace-nowrap tabular-nums">
                              {money(row.amountCents)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {tab !== 'received' && (
                  <p className="text-muted-foreground text-[10px]">
                    {t('calculationHint')}
                  </p>
                )}
                {tab === 'received' && (
                  <p className="text-muted-foreground text-[10px]">
                    {t('receivedHint')}
                  </p>
                )}
              </>
            ) : (
              <p className="bg-muted text-muted-foreground rounded-lg p-3 text-xs">
                {t('noContracts')}
              </p>
            )}
            <p className="text-muted-foreground text-[10px]">
              {t('updatedAt', {
                time: new Intl.DateTimeFormat(locale, {
                  dateStyle: 'short',
                  timeStyle: 'short',
                }).format(new Date(data.updatedAt)),
              })}
            </p>
            <p className="text-muted-foreground text-[10px]">
              {t('cacheHint')}
            </p>
            <p className="text-muted-foreground text-[10px]" role="status">
              {t(data.cacheStatus === 'hit' ? 'fromCache' : 'fromUau')}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
