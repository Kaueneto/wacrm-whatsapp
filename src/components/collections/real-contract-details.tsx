'use client';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import glass from '@/components/ui/morph-menu.module.css';
import { contractFinancialView } from '@/lib/collections/contract-finance';
import {
  formatCollectionPhone,
  type CollectionContactOption,
} from '@/lib/collections/contact-options';
import {
  emptyContractDetails,
  type ContractDetailsCache,
} from '@/lib/collections/client-details-cache';
import {
  CalendarDays,
  CircleDollarSign,
  CircleAlert,
  UserRound,
  Mail,
  Phone,
  Loader2,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ContractJourney } from './contract-journey';
import { installmentIdentity } from '@/lib/collections/installments';
import type { PortfolioSetup } from '@/lib/collections/setup';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import type { CollectionSummary } from '@/lib/collections/portfolio-types';
const labels: Record<string, string> = {
  overdue: 'Em atraso',
  current: 'Sem atraso atual',
  paid: 'Regularizado por pagamento',
  cancelled: 'Cancelamento / distrato',
  review: 'Conferência necessária',
  excluded: 'Excluído da carteira',
};
const events: Record<string, string> = {
  first_seen: 'Contrato identificado na carteira',
  state_changed: 'Situação financeira alterada',
  stage_changed: 'Etapa da régua alterada',
  balance_changed: 'Saldo atualizado pelo UAU',
  receipt_confirmed: 'Recebimento confirmado detectado',
  receipt_reversed: 'Recebimento removido ou reduzido no UAU',
  maintenance_detected: 'Manutenção da venda detectada',
};
const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    value / 100
  );
export function RealContractDetails({
  contract,
  setup,
  responsible,
  cache,
  dataVersion,
  onClose,
}: {
  contract: CollectionSummary;
  setup: PortfolioSetup;
  responsible: string | null;
  cache: ContractDetailsCache;
  dataVersion: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [contactBusy, setContactBusy] = useState<string | null>(null);
  const [contactError, setContactError] = useState('');
  async function openContact(option: string) {
    if (contactBusy) return;
    setContactBusy(option);
    setContactError('');
    try {
      const response = await fetch('/api/integrations/uau/portfolio/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contract: contract.key, option }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || 'Não foi possível abrir a conversa.');
      const params = new URLSearchParams({ c: body.conversationId });
      if (body.uauSuggestion) params.set('uauSuggestion', body.uauSuggestion);
      router.push(`/inbox?${params}`);
    } catch (error) {
      setContactError(
        error instanceof Error
          ? error.message
          : 'Não foi possível abrir a conversa.'
      );
    } finally {
      setContactBusy(null);
    }
  }
  const [installmentFilter, setInstallmentFilter] = useState('all');
  const cacheKey = dataVersion + ':' + contract.key;
  const subscribe = useCallback(
    (listener: () => void) => cache.subscribe(cacheKey, listener),
    [cache, cacheKey]
  );
  const read = useCallback(() => cache.read(cacheKey), [cache, cacheKey]);
  const {
    details,
    finance,
    financeLoading,
    financeError,
    contactOptions,
    contactEmail,
    contactEmailUnavailable,
    contactsLoading,
    contactsError,
    history,
    error,
    descriptionLoading,
    descriptionError,
    loading,
  } = useSyncExternalStore(subscribe, read, () => emptyContractDetails);
  useEffect(() => {
    void cache.load(cacheKey, contract.key);
  }, [cache, cacheKey, contract.key]);
  const financial = contractFinancialView(details, finance);
  const amount = (value: number | null | undefined) =>
    value == null ? '—' : money(value);
  const visiblePositions = financial.positions.filter(
    (p) =>
      installmentFilter === 'all' ||
      (installmentFilter === 'overdue'
        ? financial.overdue.includes(p)
        : financial.future.includes(p))
  );
  const uauContacts = (contactOptions ?? []).filter(
    (option) => option.source !== 'CRM'
  );
  const otherContacts = (contactOptions ?? []).filter(
    (option) => option.source === 'CRM'
  );
  const renderContact = (option: CollectionContactOption) => (
    <div
      key={option.id}
      className="hover:bg-muted/30 flex min-w-0 items-center justify-between gap-2 rounded-md px-2 py-2"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium whitespace-nowrap tabular-nums">
          {formatCollectionPhone(option.phone, option.source === 'CRM')}
        </p>
        <p className="text-muted-foreground mt-0.5 text-xs font-light break-words uppercase">
          {[option.primary ? 'Principal' : null, option.note]
            .filter(Boolean)
            .join(' · ') || option.source}
        </p>
        {!option.dialable && (
          <p className="text-muted-foreground text-[10px]">
            Confira o DDD e o número no cadastro.
          </p>
        )}
      </div>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="size-8 shrink-0 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-500 dark:text-emerald-400"
        disabled={!!contactBusy || !option.dialable}
        onClick={() => void openContact(option.id)}
        title={
          'Entrar em contato pelo WhatsApp: ' +
          formatCollectionPhone(option.phone, option.source === 'CRM')
        }
        aria-label={
          'Entrar em contato pelo WhatsApp com ' +
          formatCollectionPhone(option.phone, option.source === 'CRM')
        }
      >
        {contactBusy === option.id ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <WhatsAppIcon className="size-5" />
        )}
      </Button>
    </div>
  );
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="gap-0 overflow-hidden data-[side=right]:w-full data-[side=right]:sm:max-w-[min(1100px,94vw)]">
        <SheetHeader className="border-border shrink-0 border-b p-6 pr-12">
          <span className="text-primary mb-2 text-xs font-medium">
            Contrato real · UAU
          </span>
          <SheetTitle className="text-2xl font-semibold">
            {contract.customer}
          </SheetTitle>
          <SheetDescription>
            {contract.company}|{contract.work} · Venda {contract.sale} ·{' '}
            {contract.project}
            {contract.unit ? ' · ' + contract.unit : ''}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                label: 'Principal base vencido',
                value: amount(
                  financial.overduePrincipal ??
                    (!finance ? contract.overdueCents : null)
                ),
                danger: true,
              },
              {
                label: 'Principal vencido com reajuste',
                value: amount(financial.overdueIndexedPrincipal),
                danger: true,
              },
              {
                label: 'Total vencido com encargos',
                value: amount(financial.overdueAdjusted),
                danger: true,
              },
              {
                label: 'Principal base total em aberto',
                value: amount(
                  financial.openPrincipal ??
                    (!finance ? contract.openCents : null)
                ),
                danger: false,
              },
              {
                label: 'Principal em aberto com reajuste',
                value: amount(financial.openIndexedPrincipal),
                danger: false,
              },
              {
                label: 'Total em aberto com encargos',
                value: amount(financial.openAdjusted),
                danger: false,
              },
            ].map(({ label, value, danger }) => (
              <div
                key={label}
                className={cn(
                  'rounded-xl border p-4',
                  danger
                    ? 'border-red-500/15 bg-red-500/5'
                    : 'border-border bg-muted/20'
                )}
              >
                <p className="text-muted-foreground flex items-center gap-2 text-xs">
                  <CircleDollarSign className="size-3.5" />
                  {label}
                </p>
                <p
                  className={cn(
                    'mt-2 text-lg font-semibold tabular-nums',
                    danger && 'text-red-700 dark:text-red-300'
                  )}
                >
                  {financeLoading && value === '—' ? 'Consultando…' : value}
                </p>
              </div>
            ))}
          </div>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-3.5" />
              {finance ? financial.overdue.length : contract.overdueCount}{' '}
              vencida(s) · Maior atraso:{' '}
              {finance
                ? Math.max(
                    0,
                    ...financial.overdue.map(
                      (p) => p.financial?.daysOverdue ?? 0
                    )
                  )
                : contract.delay}{' '}
              dias
            </span>
            <span>
              Próximo vencimento:{' '}
              {financial.nextDue?.split('-').reverse().join('/') ?? '—'}
            </span>
            <span>Total a vencer: {amount(financial.futureAdjusted)}</span>
            <span className="flex items-center gap-1.5">
              <UserRound className="size-3.5" />
              {responsible ?? 'Sem responsável'}
            </span>
          </div>
          <p className="text-muted-foreground text-xs">
            {finance
              ? 'Valores reajustados consultados no UAU em ' +
                new Intl.DateTimeFormat('pt-BR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                  timeZone: 'America/Sao_Paulo',
                }).format(new Date(finance.updatedAt))
              : 'Principal da última importação · ' +
                contract.referenceDate.split('-').reverse().join('/')}
            .
          </p>
          {financeError && (
            <p
              role="alert"
              className="text-xs text-amber-700 dark:text-amber-300"
            >
              {financeError}
            </p>
          )}
          <section className="border-border rounded-xl border px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-xs font-semibold">
                <Phone className="text-primary size-3.5" />
                Contatos do cliente
              </h3>
            </div>
            {contactsLoading && (
              <p className="text-muted-foreground mt-2 text-xs">
                Consultando telefones…
              </p>
            )}
            {contactsError && (
              <p
                role="status"
                className="mt-2 text-xs text-amber-700 dark:text-amber-300"
              >
                {contactsError}
              </p>
            )}
            {(uauContacts.length > 0 ||
              contactEmail ||
              contactEmailUnavailable) && (
              <div className="mt-1 grid max-h-40 gap-x-4 overflow-y-auto overscroll-y-contain sm:grid-cols-2 lg:grid-cols-3">
                {uauContacts.map(renderContact)}
                <div className="flex min-w-0 items-center justify-between gap-2 rounded-md px-2 py-2 text-amber-700 hover:bg-amber-500/5 dark:text-amber-400">
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-all">
                      {contactEmail ||
                        (contactsLoading
                          ? 'Consultando e-mail…'
                          : contactEmailUnavailable
                            ? 'E-mail indisponível no momento'
                            : 'E-mail não informado no UAU')}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-xs font-light uppercase">
                        E-mail · UAU
                      </p>
                      <span className="rounded-full border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase">
                        Em breve
                      </span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled
                    title="Enviar e-mail — em breve"
                    aria-label="Enviar e-mail — em breve"
                    className="size-8 shrink-0 text-amber-700 disabled:opacity-70 dark:text-amber-400"
                  >
                    <Mail className="size-4" />
                  </Button>
                </div>
              </div>
            )}
            {otherContacts.length > 0 && (
              <details className="border-border mt-2 border-t pt-2">
                <summary className="text-muted-foreground cursor-pointer text-[11px]">
                  Vínculos do CRM — conferir ({otherContacts.length})
                </summary>
                <p className="text-muted-foreground mt-1 text-[10px]">
                  Vinculados ao cadastro no CRM; estes telefones não foram
                  confirmados na consulta do UAU.
                </p>
                <div className="mt-1 grid max-h-28 gap-x-3 overflow-y-auto overscroll-y-contain sm:grid-cols-2">
                  {otherContacts.map(renderContact)}
                </div>
              </details>
            )}
            {!contactsLoading && contactOptions?.length === 0 && (
              <p className="text-muted-foreground mt-2 text-xs">
                Nenhum telefone encontrado para este cliente.
              </p>
            )}
            {contactError && (
              <p role="alert" className="text-destructive mt-2 text-xs">
                {contactError}
              </p>
            )}
          </section>
          <ContractJourney contract={details ?? contract} setup={setup} />
          <Tabs defaultValue="installments" className="gap-4">
            <TabsList
              variant="line"
              aria-label="Detalhes do contrato"
              className="h-10 gap-4"
            >
              <TabsTrigger value="installments">
                Parcelas ({details ? financial.positions.length : '…'})
              </TabsTrigger>
              <TabsTrigger value="history">
                Histórico ({history?.length ?? '…'})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="installments">
              {descriptionError && (
                <p className="mb-3 text-xs text-amber-700 dark:text-amber-300">
                  {descriptionError}
                </p>
              )}
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Parcelas em aberto</h3>
                <Select
                  value={installmentFilter}
                  onValueChange={(value) => {
                    if (value) setInstallmentFilter(value);
                  }}
                  items={[
                    { value: 'all', label: 'Todas as parcelas' },
                    { value: 'overdue', label: 'Somente vencidas' },
                    { value: 'future', label: 'Hoje e a vencer' },
                  ]}
                >
                  <SelectTrigger
                    aria-label="Filtrar parcelas"
                    className={cn(
                      glass.glass,
                      'h-9 min-w-44 rounded-xl text-xs'
                    )}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    align="end"
                    alignItemWithTrigger={false}
                    className={cn(
                      glass.glass,
                      'rounded-xl p-1 duration-200 motion-reduce:animate-none'
                    )}
                  >
                    <SelectItem value="all">Todas as parcelas</SelectItem>
                    <SelectItem value="overdue">Somente vencidas</SelectItem>
                    <SelectItem value="future">Hoje e a vencer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {error && (
                <p role="alert" className="text-destructive mb-3 text-xs">
                  {error}
                </p>
              )}
              {loading && details && (
                <p className="text-muted-foreground mb-2 text-[11px]">
                  Atualizando detalhes…
                </p>
              )}
              {!details && !error && (
                <p className="text-muted-foreground text-xs">
                  Carregando parcelas…
                </p>
              )}
              {details && (
                <div className="border-border max-h-[50vh] overflow-auto rounded-xl border">
                  <table className="w-full min-w-[1180px] text-left text-xs">
                    <thead className="bg-card sticky top-0 z-10">
                      <tr>
                        {[
                          'Tipo',
                          'Parcela / geral',
                          'Vencimento original',
                          'Prorrogação',
                          'Situação',
                          'Principal base',
                          'Total com encargos UAU',
                          'Reajuste por índices',
                          'Correção por atraso',
                          'Juros',
                          'Juros de atraso',
                          'Multa',
                          'Desconto',
                          'Índice',
                        ].map((label) => (
                          <th
                            key={label}
                            className="border-border border-b px-3 py-2 font-medium"
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visiblePositions.map((p) => {
                        const identity = installmentIdentity(p);
                        const overdue = financial.overdue.includes(p);
                        const dueLabel =
                          (p.financial?.amountCents ?? p.cents) <= 0
                            ? 'Sem saldo positivo'
                            : overdue
                              ? 'Vencida'
                              : p.due === financial.reference
                                ? 'Vence hoje'
                                : 'A vencer';
                        return (
                          <tr
                            key={p.key}
                            className={cn(
                              'border-border border-b last:border-b-0',
                              overdue && 'bg-red-500/5'
                            )}
                          >
                            <td className="px-3 py-2 whitespace-nowrap">
                              <span className="font-mono font-medium">
                                {identity.typeCode || '—'}
                              </span>
                              <span className="text-muted-foreground"> — </span>
                              {identity.typeName ??
                                (descriptionLoading
                                  ? 'Carregando…'
                                  : 'Descrição não informada')}
                            </td>
                            <td
                              className="px-3 py-2 font-mono whitespace-nowrap tabular-nums"
                              title={
                                'Parcela ' +
                                identity.number +
                                ' · Número geral UAU ' +
                                identity.generalNumber
                              }
                            >
                              {identity.number}/{identity.generalNumber}
                            </td>
                            <td
                              className={cn(
                                'px-3 py-2 whitespace-nowrap tabular-nums',
                                overdue &&
                                  'font-medium text-red-700 dark:text-red-300'
                              )}
                            >
                              {p.due.split('-').reverse().join('/')}
                            </td>
                            <td className="text-muted-foreground px-3 py-2 whitespace-nowrap tabular-nums">
                              {p.extension?.split('-').reverse().join('/') ??
                                '—'}
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap',
                                  overdue
                                    ? 'bg-red-500/10 text-red-700 dark:text-red-300'
                                    : 'bg-muted text-muted-foreground'
                                )}
                              >
                                {dueLabel}
                                {p.status !== 0 && (
                                  <span
                                    title={
                                      'Status UAU: ' +
                                      (p.status ?? 'não informado') +
                                      ' · conferir'
                                    }
                                  >
                                    <CircleAlert className="size-3 text-amber-600" />
                                  </span>
                                )}
                              </span>
                            </td>
                            <td
                              className={cn(
                                'px-3 py-2 text-right font-medium whitespace-nowrap tabular-nums',
                                overdue && 'text-red-700 dark:text-red-300'
                              )}
                            >
                              {p.financial
                                ? amount(p.financial.principalCents)
                                : money(p.cents)}
                            </td>
                            {(
                              [
                                'amountCents',
                                'correctionCents',
                                'lateCorrectionCents',
                                'interestCents',
                                'lateInterestCents',
                                'fineCents',
                                'discountCents',
                              ] as const
                            ).map((field) => (
                              <td
                                key={field}
                                className={cn(
                                  'px-3 py-2 text-right whitespace-nowrap tabular-nums',
                                  field === 'amountCents' && 'font-semibold',
                                  overdue &&
                                    field === 'amountCents' &&
                                    'text-red-700 dark:text-red-300'
                                )}
                              >
                                {amount(p.financial?.[field])}
                              </td>
                            ))}
                            <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                              {p.financial?.adjustmentIndex ?? '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {visiblePositions.length === 0 && (
                    <p className="text-muted-foreground p-4 text-xs">
                      Nenhuma parcela neste filtro.
                    </p>
                  )}
                </div>
              )}
              <p className="text-muted-foreground mt-3 text-xs">
                O total com encargos é o valor calculado pelo UAU; os
                componentes não devem ser somados novamente. “—” indica dado não
                informado. Parcela/geral corresponde à numeração do UAU, não ao
                total de parcelas. Vencidas em vermelho, conforme vencimento
                original e saldo positivo na data de referência. A prorrogação é
                exibida separadamente.
              </p>
            </TabsContent>
            <TabsContent value="history">
              <section>
                <h3 className="text-sm font-semibold">
                  Trilha registrada na plataforma
                </h3>
                <p className="text-muted-foreground mt-1 text-xs">
                  Eventos observados a partir da primeira importação, sem
                  reconstruir etapas anteriores.
                </p>
                {error ? (
                  <p role="alert" className="text-destructive mt-3 text-xs">
                    {error}
                  </p>
                ) : history === null ? (
                  <p className="text-muted-foreground mt-3 text-xs">
                    Carregando histórico…
                  </p>
                ) : (
                  <ol className="mt-5 space-y-0">
                    {history.map((item) => (
                      <li
                        key={item.id}
                        className="border-border relative ml-2 border-l-2 pb-6 pl-6 last:pb-0"
                      >
                        <span
                          aria-hidden
                          className={cn(
                            'bg-card absolute top-0.5 -left-[7px] size-3 rounded-full border-2',
                            item.kind === 'receipt_confirmed'
                              ? 'border-emerald-500'
                              : item.kind === 'receipt_reversed'
                                ? 'border-red-500'
                                : 'border-primary'
                          )}
                        />
                        <p className="text-sm font-medium">
                          {events[item.kind] ?? item.kind}
                        </p>
                        <p className="text-muted-foreground mt-1 text-xs">
                          {new Intl.DateTimeFormat('pt-BR', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                            timeZone: 'America/Sao_Paulo',
                          }).format(new Date(item.created_at))}
                        </p>
                        {item.kind === 'state_changed' && (
                          <p className="text-muted-foreground mt-1 text-xs">
                            {labels[String(item.detail.from)] ??
                              (item.detail.from as string)}{' '}
                            →{' '}
                            {labels[String(item.detail.to)] ??
                              (item.detail.to as string)}
                          </p>
                        )}
                        {item.kind === 'balance_changed' &&
                          typeof item.detail.toOverdue === 'number' && (
                            <p className="text-muted-foreground mt-1 text-xs">
                              Principal em atraso:{' '}
                              {typeof item.detail.fromOverdue === 'number'
                                ? money(item.detail.fromOverdue) + ' → '
                                : ''}
                              {money(item.detail.toOverdue)}
                            </p>
                          )}
                        {item.kind === 'stage_changed' && (
                          <p className="text-muted-foreground mt-1 text-xs">
                            {[item.detail.from, item.detail.to]
                              .map(
                                (id) =>
                                  [
                                    ...setup.stages,
                                    ...setup.projectRules.flatMap(
                                      (rule) => rule.stages
                                    ),
                                  ].find((stage) => stage.id === id)?.name ??
                                  (id ? String(id) : 'Sem faixa')
                              )
                              .join(' → ')}
                          </p>
                        )}
                        {typeof item.detail.principalDeltaCents ===
                          'number' && (
                          <p className="mt-1 text-xs">
                            Variação do principal confirmado:{' '}
                            {money(item.detail.principalDeltaCents)}
                          </p>
                        )}
                      </li>
                    ))}
                    {history.length === 0 && (
                      <li className="text-muted-foreground text-xs">
                        Nenhum evento registrado.
                      </li>
                    )}
                  </ol>
                )}
              </section>
            </TabsContent>
          </Tabs>
          <p className="text-muted-foreground text-xs">
            Dados financeiros consultados no UAU. Esta carteira não envia
            cobranças automaticamente.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
