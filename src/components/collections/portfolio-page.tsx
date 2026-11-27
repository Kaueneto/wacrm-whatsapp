'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowRight,
  Check,
  CheckCheck,
  CircleDollarSign,
  Clock3,
  Columns3,
  FlaskConical,
  GitBranch,
  Info,
  List,
  Loader2,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  UserRound,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import {
  defaultPortfolioSetup,
  parsePortfolioSetup,
  stageForDelay,
  stageRange,
  type PortfolioSetup,
} from '@/lib/collections/setup';
import {
  portfolioExamples,
  type PortfolioExample,
} from '@/lib/collections/demo';
import { PortfolioConfiguration } from './portfolio-configuration';

const money = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    cents / 100
  );
const stageColors = [
  'text-sky-700 dark:text-sky-300',
  'text-amber-700 dark:text-amber-300',
  'text-orange-700 dark:text-orange-300',
  'text-rose-700 dark:text-rose-300',
];
const stageDots = [
  'bg-sky-500',
  'bg-amber-500',
  'bg-orange-500',
  'bg-rose-500',
];
const operationLabels: Record<PortfolioExample['operation'], string> = {
  contact: 'Contato pendente',
  negotiation: 'Em negociação',
  promise: 'Promessa de pagamento',
  legal: 'Equipe jurídica',
  paid: 'Pagamento confirmado',
};

function OperationBadge({
  operation,
}: {
  operation: PortfolioExample['operation'];
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium',
        operation === 'paid'
          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : operation === 'negotiation'
            ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300'
            : operation === 'promise'
              ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300'
              : 'bg-muted text-muted-foreground'
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {operationLabels[operation]}
    </span>
  );
}

function ContractCard({
  contract,
  onSelect,
}: {
  contract: PortfolioExample;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group border-border bg-card hover:border-primary/40 focus-visible:outline-ring w-full rounded-xl border p-4 text-left shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 motion-reduce:transform-none"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold tracking-tight">
          {contract.customer}
        </span>
        <ArrowRight className="text-muted-foreground mt-0.5 size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
      </div>
      <p className="text-muted-foreground mt-1 text-xs">{contract.project}</p>
      <p className="text-muted-foreground mt-0.5 text-[11px]">
        {contract.unit}
      </p>
      <div className="my-4 flex items-end justify-between gap-2">
        <div>
          <p className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">
            {contract.operation === 'paid'
              ? 'Principal recebido'
              : 'Principal em atraso'}
          </p>
          <p className="mt-0.5 text-xl font-semibold tracking-tight tabular-nums">
            {money(
              contract.operation === 'paid'
                ? contract.confirmedPrincipalCents
                : contract.principalCents
            )}
          </p>
        </div>
        {contract.delay > 0 && (
          <span className="bg-muted shrink-0 rounded-md px-2 py-1 text-[11px] font-medium tabular-nums">
            {contract.delay} dias
          </span>
        )}
      </div>
      <OperationBadge operation={contract.operation} />
      <div className="border-border/70 text-muted-foreground mt-4 flex items-center justify-between gap-2 border-t pt-3 text-[11px]">
        <span className="font-mono">Venda {contract.sale}</span>
        <span className="flex items-center gap-1.5">
          <UserRound className="size-3" />
          {contract.agent ?? 'Sem responsável'}
        </span>
      </div>
    </button>
  );
}

function ContractDetails({
  contract,
  setup,
  onClose,
}: {
  contract: PortfolioExample | null;
  setup: PortfolioSetup;
  onClose: () => void;
}) {
  const current = contract ? stageForDelay(contract.delay, setup.stages) : null;
  const paid = contract?.operation === 'paid';
  return (
    <Sheet
      open={!!contract}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        <SheetHeader className="border-border border-b p-6 pr-12">
          <span className="mb-3 w-fit rounded-md bg-amber-500/10 px-2 py-1 text-[10px] font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-300">
            Contrato fictício · demonstração
          </span>
          <SheetTitle className="text-2xl font-semibold">
            {contract?.customer}
          </SheetTitle>
          <SheetDescription>
            {contract?.project} · {contract?.unit}
          </SheetDescription>
        </SheetHeader>
        {contract && (
          <div className="space-y-7 p-6">
            <div className="bg-muted/50 grid grid-cols-3 gap-3 rounded-xl p-4">
              {[
                ['Empresa', contract.company],
                ['Obra', contract.work],
                ['Venda', String(contract.sale)],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-muted-foreground text-xs">{label}</p>
                  <p className="mt-1 font-mono text-sm font-medium">{value}</p>
                </div>
              ))}
            </div>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-muted-foreground text-xs">
                  Principal em atraso
                </p>
                <p className="mt-1 text-3xl font-semibold tabular-nums">
                  {money(contract.principalCents)}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {contract.installments} parcela(s) em atraso · juros e multa
                  não incluídos
                </p>
              </div>
              {contract.delay > 0 && (
                <span className="rounded-lg bg-orange-500/10 px-3 py-2 text-sm font-semibold text-orange-700 dark:text-orange-300">
                  {contract.delay} dias
                </span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <OperationBadge operation={contract.operation} />
              <span className="text-muted-foreground text-xs">
                Responsável: {contract.agent ?? 'não atribuído'}
              </span>
            </div>
            <section>
              <h3 className="text-sm font-semibold">Trilha de cobrança</h3>
              <p className="text-muted-foreground mt-1 text-xs">
                O atraso define a faixa financeira. A negociação é acompanhada à
                parte.
              </p>
              <ol className="mt-5 space-y-0">
                {[
                  ...setup.stages.map((stage, index) => ({
                    id: stage.id,
                    name: stage.name,
                    range: stageRange(setup.stages, index),
                    active: !paid && current?.id === stage.id,
                  })),
                  {
                    id: 'paid',
                    name: 'Regularizado',
                    range: 'Após conciliação do saldo',
                    active: paid,
                  },
                ].map((stage, index, all) => (
                  <li
                    key={stage.id}
                    className="relative flex gap-3 pb-5 last:pb-0"
                  >
                    {index < all.length - 1 && (
                      <span className="bg-border absolute top-6 bottom-0 left-3 w-px" />
                    )}
                    <span
                      className={cn(
                        'relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border text-[10px]',
                        stage.active
                          ? 'border-primary bg-primary text-primary-foreground shadow-[0_0_0_4px_var(--background)]'
                          : 'border-border bg-background text-muted-foreground'
                      )}
                    >
                      {stage.active ? <Check className="size-3" /> : index + 1}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p
                          className={cn(
                            'text-sm',
                            stage.active
                              ? 'text-primary font-semibold'
                              : 'text-muted-foreground'
                          )}
                        >
                          {stage.name}
                        </p>
                        {stage.active && (
                          <span className="bg-primary/10 text-primary rounded px-1.5 text-[10px]">
                            Agora
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {stage.range}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
            <section className="border-border rounded-xl border p-4">
              <h3 className="text-sm font-semibold">Histórico ilustrativo</h3>
              <div className="mt-4 space-y-4">
                <div className="flex gap-3">
                  <span className="bg-primary mt-1 size-2 shrink-0 rounded-full" />
                  <div>
                    <p className="text-sm">
                      {paid
                        ? 'Pagamento confirmado e saldo conciliado'
                        : operationLabels[contract.operation]}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Exemplo de evento que será preservado na carteira.
                    </p>
                  </div>
                </div>
                {contract.confirmedPrincipalCents > 0 && (
                  <div className="flex gap-3">
                    <span className="mt-1 size-2 shrink-0 rounded-full bg-emerald-500" />
                    <div>
                      <p className="text-sm">
                        Principal recebido:{' '}
                        {money(contract.confirmedPrincipalCents)}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {paid
                          ? 'Contrato sem saldo vencido neste exemplo.'
                          : 'Pagamento parcial: o saldo restante continua acompanhado.'}
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex gap-3">
                  <span className="bg-muted-foreground/40 mt-1 size-2 shrink-0 rounded-full" />
                  <div>
                    <p className="text-sm">Contrato entrou na carteira</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      As etapas anteriores não representam atendimentos
                      realizados.
                    </p>
                  </div>
                </div>
              </div>
            </section>
            <p className="text-muted-foreground flex gap-2 text-xs leading-relaxed">
              <Info className="size-4 shrink-0" />
              Esta prévia não registra atendimentos, altera contratos ou envia
              mensagens.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function PortfolioPage() {
  const { accountId } = useAuth();
  return <PortfolioWorkspace key={accountId} />;
}

function PortfolioWorkspace() {
  const { accountId, loading: authLoading, canEditSettings } = useAuth();
  const [tab, setTab] = useState<'portfolio' | 'stages' | 'settings'>(
    'portfolio'
  );
  const [demo, setDemo] = useState(true);
  const [view, setView] = useState<'board' | 'list'>('board');
  const [search, setSearch] = useState('');
  const [company, setCompany] = useState('all');
  const [operation, setOperation] = useState('all');
  const [selected, setSelected] = useState<PortfolioExample | null>(null);
  const [setup, setSetup] = useState(defaultPortfolioSetup);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [settingsAccount, setSettingsAccount] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!accountId || !canEditSettings) return;
    const controller = new AbortController();
    void fetch('/api/integrations/uau/portfolio-settings', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || 'Falha ao carregar a configuração.');
        if (controller.signal.aborted) return;
        setSetup(
          result.settings
            ? parsePortfolioSetup(result.settings.setup)
            : defaultPortfolioSetup()
        );
        setSavedAt(result.settings?.updated_at ?? null);
        setSettingsAccount(accountId);
        setLoadError('');
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setLoadError(
            error instanceof Error ? error.message : 'Falha ao carregar.'
          );
          setSettingsAccount(null);
        }
      });
    return () => controller.abort();
  }, [accountId, canEditSettings, reload]);
  const ready = settingsAccount === accountId && !!accountId;
  const visibleSetup = ready ? setup : defaultPortfolioSetup();
  const rows = useMemo(
    () =>
      (demo ? portfolioExamples : []).filter(
        (contract) =>
          (company === 'all' || contract.company === company) &&
          (operation === 'all' || contract.operation === operation) &&
          (contract.operation === 'paid' ||
            contract.delay >= visibleSetup.minimumDays) &&
          !visibleSetup.excludedCompanies.includes(contract.company) &&
          `${contract.customer} ${contract.sale} ${contract.unit} ${contract.project} ${contract.company} ${contract.work}`
            .toLocaleLowerCase('pt-BR')
            .includes(search.toLocaleLowerCase('pt-BR'))
      ),
    [
      demo,
      company,
      operation,
      search,
      visibleSetup.minimumDays,
      visibleSetup.excludedCompanies,
    ]
  );
  const overdue = rows.filter((contract) => contract.operation !== 'paid');
  const totalDue = overdue.reduce(
    (sum, contract) => sum + contract.principalCents,
    0
  );
  const totalReceived = rows.reduce(
    (sum, contract) => sum + contract.confirmedPrincipalCents,
    0
  );
  const columns = [
    ...visibleSetup.stages.map((stage, index) => ({
      id: stage.id,
      name: stage.name,
      range: stageRange(visibleSetup.stages, index),
      color: stageColors[Math.min(index, 3)],
      dot: stageDots[Math.min(index, 3)],
      rows: overdue.filter(
        (contract) =>
          stageForDelay(contract.delay, visibleSetup.stages)?.id === stage.id
      ),
    })),
    {
      id: 'paid',
      name: 'Regularizados',
      range: 'Saldo vencido conciliado',
      color: 'text-emerald-700 dark:text-emerald-300',
      dot: 'bg-emerald-500',
      rows: rows.filter((contract) => contract.operation === 'paid'),
    },
  ];
  if (authLoading)
    return (
      <div className="flex justify-center py-20">
        <Loader2
          className="text-muted-foreground size-6 animate-spin"
          aria-label="Carregando carteira"
        />
      </div>
    );
  if (!canEditSettings)
    return (
      <p className="text-muted-foreground p-6 text-sm">
        A prévia da carteira está disponível para administradores nesta primeira
        versão.
      </p>
    );
  return (
    <div className="mx-auto max-w-[1800px] min-w-0 space-y-6 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-primary mb-2 text-[10px] font-semibold tracking-[0.2em] uppercase">
            Gestão de recebíveis
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Cada contrato, uma trajetória.
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Da identificação do atraso à regularização, acompanhe a carteira em
            um só lugar.
          </p>
        </div>
        <Button
          variant="outline"
          className="rounded-lg"
          onClick={() => setTab('settings')}
        >
          <Settings2 className="size-4" />
          Configurar carteira
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
        <div className="flex items-start gap-3">
          <FlaskConical className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" />
          <div>
            <p className="text-xs font-semibold">
              {demo
                ? 'Demonstração · dados fictícios'
                : 'Carteira real · aguardando sincronização'}
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {demo
                ? 'Explore o quadro e clique em um contrato para conhecer a trilha. Nenhuma cobrança será enviada.'
                : 'As consultas e a rotina de sincronização ainda serão conectadas. Nenhum contrato foi importado.'}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0 text-xs"
          onClick={() => {
            setDemo(!demo);
            setSelected(null);
          }}
        >
          {demo ? 'Ver carteira real' : 'Explorar demonstração'}
          <ArrowRight className="size-3.5" />
        </Button>
      </div>
      <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b">
        <nav className="flex gap-5" aria-label="Seções da carteira">
          {(
            [
              ['portfolio', 'Carteira', Wallet],
              ['stages', 'Régua de cobrança', GitBranch],
              ['settings', 'Sincronização', Clock3],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              type="button"
              key={id}
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => setTab(id)}
              className={cn(
                '-mb-px flex items-center gap-2 border-b-2 py-3 text-xs font-medium transition-colors sm:text-sm',
                tab === id
                  ? 'border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground border-transparent'
              )}
            >
              <Icon className="hidden size-4 sm:block" />
              {label}
            </button>
          ))}
        </nav>
        <span className="text-muted-foreground mb-2 flex items-center gap-1.5 text-[11px]">
          <span className="bg-muted-foreground/50 size-1.5 rounded-full" />
          Sincronização desativada
        </span>
      </div>
      {tab === 'portfolio' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: 'Principal em atraso',
                value: demo ? money(totalDue) : '—',
                detail: 'Sem somar juros ou multa',
                Icon: Wallet,
                tone: 'text-orange-600 dark:text-orange-300',
              },
              {
                label: 'Contratos em atraso',
                value: demo ? String(overdue.length) : '—',
                detail: `${overdue.reduce((sum, c) => sum + c.installments, 0)} parcelas no recorte`,
                Icon: CircleDollarSign,
                tone: 'text-sky-600 dark:text-sky-300',
              },
              {
                label: 'Em negociação',
                value: demo
                  ? String(
                      rows.filter((c) => c.operation === 'negotiation').length
                    )
                  : '—',
                detail: 'Acompanhamento pela equipe',
                Icon: ArrowDownLeft,
                tone: 'text-violet-600 dark:text-violet-300',
              },
              {
                label: 'Principal recebido',
                value: demo ? money(totalReceived) : '—',
                detail: demo
                  ? 'Confirmado · exemplos deste quadro'
                  : 'Aguardando conciliação',
                Icon: CheckCheck,
                tone: 'text-emerald-600 dark:text-emerald-300',
              },
            ].map(({ label, value, detail, Icon, tone }) => (
              <div
                key={label}
                className="border-border bg-card rounded-xl border p-4 sm:p-5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-muted-foreground text-xs">{label}</p>
                  <Icon className={cn('size-4', tone)} />
                </div>
                <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">
                  {value}
                </p>
                <p className="text-muted-foreground mt-2 text-[11px]">
                  {detail}
                </p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-48 flex-1 sm:max-w-sm">
              <Search className="text-muted-foreground absolute top-2.5 left-3 size-4" />
              <Input
                aria-label="Buscar contrato"
                placeholder="Nome, venda, empreendimento ou unidade…"
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <select
              aria-label="Filtrar por empresa"
              className="border-input bg-background h-9 max-w-full rounded-md border px-3 text-xs"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
            >
              <option value="all">Todas as empresas</option>
              {demo && (
                <>
                  <option value="101">101 · Acácias (exemplo)</option>
                  <option value="102">102 · Reserva (exemplo)</option>
                </>
              )}
            </select>
            <select
              aria-label="Filtrar situação operacional"
              className="border-input bg-background h-9 max-w-full rounded-md border px-3 text-xs"
              value={operation}
              onChange={(event) => setOperation(event.target.value)}
            >
              <option value="all">Todas as situações</option>
              {Object.entries(operationLabels).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            <div className="border-border bg-muted/30 ml-auto flex rounded-lg border p-1">
              {(
                [
                  ['board', Columns3, 'Visualizar quadro'],
                  ['list', List, 'Visualizar lista'],
                ] as const
              ).map(([mode, Icon, label]) => (
                <button
                  key={mode}
                  type="button"
                  aria-label={label}
                  aria-pressed={view === mode}
                  onClick={() => setView(mode)}
                  className={cn(
                    'rounded-md px-2.5 py-1.5',
                    view === mode
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="size-4" />
                </button>
              ))}
            </div>
          </div>
          {!demo ? (
            <div className="border-border bg-muted/10 flex min-h-80 flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center">
              <span className="bg-primary/10 mb-4 flex size-12 items-center justify-center rounded-2xl">
                <DatabaseIcon />
              </span>
              <h2 className="text-lg font-semibold">
                Sua carteira começa pela conexão.
              </h2>
              <p className="text-muted-foreground mt-2 max-w-md text-sm leading-relaxed">
                Prepare os códigos das consultas UAU, os parâmetros e os
                horários. Depois da validação, os contratos e o histórico serão
                importados para cá.
              </p>
              <Button className="mt-5" onClick={() => setTab('settings')}>
                Preparar sincronização
                <ArrowRight className="size-4" />
              </Button>
            </div>
          ) : view === 'board' ? (
            <div className="overflow-x-auto pb-4">
              <div
                className="grid items-start gap-3"
                style={{
                  gridTemplateColumns: `repeat(${columns.length}, minmax(245px, 1fr))`,
                }}
              >
                {columns.map((column) => (
                  <section
                    key={column.id}
                    className="border-border/60 bg-muted/30 min-w-0 rounded-xl border p-2.5"
                  >
                    <div className="px-1 pt-1 pb-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'size-2 shrink-0 rounded-full',
                            column.dot
                          )}
                        />
                        <h2
                          className={cn(
                            'min-w-0 text-xs font-semibold',
                            column.color
                          )}
                        >
                          {column.name}
                        </h2>
                        <span className="border-border text-muted-foreground ml-auto rounded-md border px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
                          {column.rows.length}
                        </span>
                      </div>
                      <div className="text-muted-foreground mt-2 flex items-center justify-between gap-1 text-[10px]">
                        <span>{column.range}</span>
                        <span className="font-medium tabular-nums">
                          {money(
                            column.rows.reduce(
                              (sum, c) =>
                                sum +
                                (column.id === 'paid'
                                  ? c.confirmedPrincipalCents
                                  : c.principalCents),
                              0
                            )
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2.5">
                      {column.rows.map((contract) => (
                        <ContractCard
                          key={contract.id}
                          contract={contract}
                          onSelect={() => setSelected(contract)}
                        />
                      ))}
                      {column.rows.length === 0 && (
                        <p className="border-border text-muted-foreground rounded-lg border border-dashed px-4 py-10 text-center text-xs">
                          Nenhum contrato neste recorte
                        </p>
                      )}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          ) : (
            <div className="border-border overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[740px] text-left text-sm">
                <thead className="bg-muted/40 text-muted-foreground text-xs">
                  <tr>
                    {[
                      'Cliente / contrato',
                      'Empreendimento',
                      'Atraso',
                      'Principal em atraso',
                      'Situação',
                      '',
                    ].map((label) => (
                      <th key={label} className="px-4 py-3 font-medium">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((contract) => (
                    <tr
                      key={contract.id}
                      className="border-border hover:bg-muted/20 border-t"
                    >
                      <td className="px-4 py-4">
                        <span className="font-medium">{contract.customer}</span>
                        <p className="text-muted-foreground mt-1 font-mono text-[11px]">
                          {contract.company} / {contract.work} · Venda{' '}
                          {contract.sale}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-xs">
                        {contract.project}
                        <p className="text-muted-foreground mt-1">
                          {contract.unit}
                        </p>
                      </td>
                      <td className="px-4 py-4 tabular-nums">
                        {contract.delay ? `${contract.delay} dias` : 'Em dia'}
                      </td>
                      <td className="px-4 py-4 font-medium tabular-nums">
                        {money(contract.principalCents)}
                      </td>
                      <td className="px-4 py-4">
                        <OperationBadge operation={contract.operation} />
                      </td>
                      <td className="px-4 py-4">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Ver contrato de ${contract.customer}`}
                          onClick={() => setSelected(contract)}
                        >
                          <ArrowRight className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="text-muted-foreground p-10 text-center"
                      >
                        Nenhum contrato encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-muted-foreground flex items-start gap-2 text-[11px] leading-relaxed">
            <ShieldCheck className="size-3.5 shrink-0" />A régua usa o
            vencimento original. Pagamentos parciais, prorrogações e distratos
            precisam ser conciliados antes de qualquer ação automática.
          </p>
        </>
      )}
      {loadError && tab !== 'portfolio' && (
        <div
          role="alert"
          className="border-destructive/30 text-destructive flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-xs"
        >
          {loadError}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setReload((value) => value + 1)}
          >
            Tentar novamente
          </Button>
        </div>
      )}
      {tab === 'settings' && (
        <PortfolioConfiguration
          key={accountId}
          setup={visibleSetup}
          onChange={setSetup}
          savedAt={ready ? savedAt : null}
          onSaved={() => setSavedAt(new Date().toISOString())}
          disabled={!ready}
        />
      )}
      {tab === 'stages' && (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <section className="border-border bg-card rounded-xl border p-5 sm:p-6">
            <h2 className="text-lg font-semibold">
              Uma régua que acompanha o atraso.
            </h2>
            <p className="text-muted-foreground mt-2 max-w-xl text-sm leading-relaxed">
              Defina as faixas por dias desde o vencimento original. A próxima
              faixa encerra a anterior. A situação de negociação não apaga o
              atraso do contrato.
            </p>
            <fieldset disabled={!ready} className="mt-6 space-y-3">
              {visibleSetup.stages.map((stage, index) => (
                <div
                  key={stage.id}
                  className="border-border bg-muted/20 flex flex-wrap items-end gap-3 rounded-xl border p-4"
                >
                  <span className="bg-primary/10 text-primary mb-2.5 flex size-6 items-center justify-center rounded-full text-xs font-semibold">
                    {index + 1}
                  </span>
                  <label className="text-muted-foreground min-w-40 flex-1 space-y-1.5 text-xs">
                    Nome da etapa
                    <Input
                      maxLength={80}
                      value={stage.name}
                      onChange={(event) =>
                        setSetup({
                          ...setup,
                          stages: setup.stages.map((item, i) =>
                            i === index
                              ? { ...item, name: event.target.value }
                              : item
                          ),
                        })
                      }
                    />
                  </label>
                  <label className="text-muted-foreground w-24 space-y-1.5 text-xs">
                    A partir do dia
                    <Input
                      type="number"
                      min={1}
                      value={stage.fromDay}
                      onChange={(event) =>
                        setSetup({
                          ...setup,
                          stages: setup.stages.map((item, i) =>
                            i === index
                              ? { ...item, fromDay: Number(event.target.value) }
                              : item
                          ),
                        })
                      }
                    />
                  </label>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover etapa ${stage.name}`}
                    disabled={setup.stages.length === 1}
                    onClick={() =>
                      setSetup({
                        ...setup,
                        stages: setup.stages.filter((_, i) => i !== index),
                      })
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                disabled={setup.stages.length >= 10}
                onClick={() =>
                  setSetup({
                    ...setup,
                    stages: [
                      ...setup.stages,
                      {
                        id: `stage-${crypto.randomUUID()}`,
                        name: 'Nova etapa',
                        fromDay: (setup.stages.at(-1)?.fromDay ?? 0) + 30,
                      },
                    ],
                  })
                }
              >
                <Plus className="size-4" />
                Adicionar etapa
              </Button>
            </fieldset>
            <p className="text-muted-foreground mt-4 text-xs">
              As alterações aparecem na demonstração. Salve o rascunho na aba
              Sincronização.
            </p>
          </section>
          <div className="space-y-4">
            <div className="border-border bg-card rounded-xl border p-5">
              <GitBranch className="text-primary mb-3 size-5" />
              <h3 className="text-sm font-semibold">
                Faixa financeira + situação operacional
              </h3>
              <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
                Um cliente pode estar há 25 dias em atraso e, ao mesmo tempo, em
                negociação. O quadro mostra a faixa; a etiqueta mostra o
                trabalho da equipe.
              </p>
            </div>
            <div className="border-border bg-card rounded-xl border p-5">
              <CheckCheck className="mb-3 size-5 text-emerald-600" />
              <h3 className="text-sm font-semibold">O histórico continua.</h3>
              <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
                Regularizados terão uma área própria. Sair da consulta de
                inadimplência, sozinho, não será suficiente para classificar um
                contrato como pago.
              </p>
            </div>
            <p className="text-muted-foreground px-1 text-xs leading-relaxed">
              Esta é a régua padrão da organização. Regras por empresa e obra e
              a ligação com categorias UAU serão adicionadas na próxima etapa.
            </p>
          </div>
        </div>
      )}
      <ContractDetails
        contract={selected}
        setup={visibleSetup}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function DatabaseIcon() {
  return <Wallet className="text-primary size-6" />;
}
