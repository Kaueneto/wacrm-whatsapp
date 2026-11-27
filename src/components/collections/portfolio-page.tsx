'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import {
  portfolioRunStatus,
  type PortfolioRunStatus,
} from '@/lib/collections/run-status';
import { PortfolioRules } from './portfolio-rules';
import { UauSearchChoice, useUauProjectCatalog } from './uau-project-picker';
import { RealContractDetails } from './real-contract-details';
import { PortfolioAnalytics } from './portfolio-analytics';
import { createContractDetailsCache } from '@/lib/collections/client-details-cache';
import { calculatedPortfolioTotals } from '@/lib/collections/calculated-finance';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type {
  CollectionSummary,
  PortfolioCard,
} from '@/lib/collections/portfolio-types';
import {
  ArrowDownLeft,
  ArrowRight,
  Check,
  CheckCheck,
  CircleDollarSign,
  Columns3,
  FlaskConical,
  Info,
  List,
  Loader2,
  Maximize2,
  Minimize2,
  Search,
  Settings2,
  ShieldCheck,
  UserRound,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import glass from '@/components/ui/morph-menu.module.css';
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
  isExcludedProject,
  stagesForProject,
  type PortfolioSetup,
} from '@/lib/collections/setup';
import { portfolioExamples } from '@/lib/collections/demo';
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
const operationLabels: Record<PortfolioCard['operation'], string> = {
  contact: 'Contato pendente',
  negotiation: 'Em negociação',
  promise: 'Promessa de pagamento',
  legal: 'Equipe jurídica',
  paid: 'Regularizado por pagamento',
  current: 'Sem atraso atual',
  review: 'Conferência necessária',
  cancelled: 'Cancelamento / distrato',
};

function OperationBadge({
  operation,
}: {
  operation: PortfolioCard['operation'];
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
  contract: PortfolioCard;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group border-border bg-card hover:border-primary/40 focus-visible:outline-ring w-full min-w-0 rounded-xl border p-4 text-left shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 motion-reduce:transform-none"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold tracking-tight">
          {contract.customer}
        </span>
        <ArrowRight className="text-muted-foreground mt-0.5 size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
      </div>
      <p className="text-muted-foreground mt-1 text-xs">{contract.project}</p>
      <p className="text-primary mt-1 font-mono text-xs font-medium">
        {contract.company}|{contract.work}
      </p>
      <p className="text-muted-foreground mt-0.5 text-[11px]">
        {contract.unit}
      </p>
      <div className="my-4 flex min-w-0 flex-col items-start gap-2">
        <div className="w-full min-w-0">
          <p className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">
            {contract.operation === 'paid' && !contract.snapshot
              ? 'Principal recebido'
              : contract.snapshot?.calculated
                ? 'Principal com reajuste'
                : 'Principal base em atraso'}
          </p>
          <p className="mt-0.5 text-xl font-semibold tracking-tight wrap-break-word tabular-nums">
            {money(
              contract.operation === 'paid' && !contract.snapshot
                ? contract.confirmedPrincipalCents
                : (contract.snapshot?.calculated?.overduePrincipalCents ??
                    contract.principalCents)
            )}
          </p>
          {contract.snapshot?.calculated && (
            <p className="text-muted-foreground mt-1 text-[10px]">
              Base: {money(contract.principalCents)} · Com encargos:{' '}
              {money(contract.snapshot.calculated.overdueTotalCents)}
            </p>
          )}
        </div>
        {contract.delay > 0 && (
          <span className="max-w-full rounded-md bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-700 tabular-nums dark:text-red-300">
            {contract.delay} dias em atraso
          </span>
        )}
      </div>
      <OperationBadge operation={contract.operation} />
      <div className="border-border/70 text-muted-foreground mt-4 flex items-center justify-between gap-2 border-t pt-3 text-[11px]">
        <span className="font-mono">Venda {contract.sale}</span>
        <span
          className="flex min-w-0 items-center gap-1.5"
          title={`Responsável pelo contato: ${contract.agent ?? 'Não atribuído'}`}
        >
          <UserRound className="size-3" />
          <span className="truncate">
            {contract.agent ?? 'Sem responsável'}
          </span>
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
  contract: PortfolioCard | null;
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
      <SheetContent className="gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-[min(1100px,94vw)]">
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

type PortfolioSection = 'portfolio' | 'settings' | 'stages';
export function PortfolioPage({
  section = 'portfolio',
}: {
  section?: PortfolioSection;
}) {
  const { accountId } = useAuth();
  return (
    <PortfolioWorkspace key={(accountId ?? '') + section} section={section} />
  );
}

function PortfolioWorkspace({ section }: { section: PortfolioSection }) {
  const projectCatalog = useUauProjectCatalog();
  const router = useRouter();
  const { accountId, loading: authLoading, canEditSettings } = useAuth();
  const tab = section;
  const setTab = (next: PortfolioSection) =>
    router.push(
      next === 'portfolio'
        ? '/collections'
        : next === 'settings'
          ? '/collections/sync'
          : '/collections/rules'
    );
  const [detailsCache] = useState(() => createContractDetailsCache());
  const [demo, setDemo] = useState(false);
  const [realContracts, setRealContracts] = useState<CollectionSummary[]>([]);
  const [portfolioError, setPortfolioError] = useState('');
  const [portfolioLoaded, setPortfolioLoaded] = useState(false);
  const [importing, setImporting] = useState(false);
  const [run, setRun] = useState<PortfolioRunStatus | null>(null);
  const [view, setView] = useState<'board' | 'list'>('board');
  const [expanded, setExpanded] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const previousBounds = useRef<DOMRect | null>(null);
  const resizeAnimation = useRef<Animation | null>(null);
  const resizeWorkspace = useCallback((next: boolean) => {
    resizeAnimation.current?.cancel();
    previousBounds.current =
      workspaceRef.current?.getBoundingClientRect() ?? null;
    setExpanded(next);
  }, []);
  useLayoutEffect(() => {
    const element = workspaceRef.current;
    const before = previousBounds.current;
    previousBounds.current = null;
    if (
      !element ||
      !before ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    const after = element.getBoundingClientRect();
    if (!after.width || !after.height) return;
    resizeAnimation.current = element.animate(
      [
        {
          transformOrigin: 'top left',
          transform: `translate(${before.left - after.left}px, ${before.top - after.top}px) scale(${before.width / after.width}, ${before.height / after.height})`,
          borderRadius: '16px',
        },
        {
          transformOrigin: 'top left',
          transform: 'none',
          borderRadius: expanded ? '0px' : '16px',
        },
      ],
      { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
    );
  }, [expanded]);
  useEffect(() => {
    if (!expanded) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const siblings: { element: HTMLElement; inert: boolean }[] = [];
    let element: HTMLElement | null = workspaceRef.current;
    while (element && element !== document.body) {
      for (const sibling of element.parentElement?.children ?? []) {
        if (sibling !== element && sibling instanceof HTMLElement) {
          siblings.push({ element: sibling, inert: sibling.inert });
          sibling.inert = true;
        }
      }
      element = element.parentElement;
    }
    return () => {
      document.body.style.overflow = overflow;
      for (const sibling of siblings) sibling.element.inert = sibling.inert;
    };
  }, [expanded]);
  const [portfolioView, setPortfolioView] = useState<'board' | 'analytics'>(
    'board'
  );
  const [columnLimit, setColumnLimit] = useState<Record<string, number>>({});
  const [listPage, setListPage] = useState(0);
  const [search, setSearch] = useState('');
  const [company, setCompany] = useState('all');
  const [operation, setOperation] = useState('all');
  const [selected, setSelected] = useState<PortfolioCard | null>(null);
  useEffect(() => {
    if (!expanded || selected) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented)
        resizeWorkspace(false);
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [expanded, selected, resizeWorkspace]);
  const [setup, setSetup] = useState(defaultPortfolioSetup);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [savedSignature, setSavedSignature] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
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
        const loaded = result.settings
          ? parsePortfolioSetup(result.settings.setup)
          : defaultPortfolioSetup();
        setSetup(loaded);
        setSavedSignature(result.settings ? JSON.stringify(loaded) : '');
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
  const loadPortfolio = useCallback(
    async (signal?: AbortSignal) => {
      if (!accountId || !canEditSettings) return;
      try {
        const response = await fetch('/api/integrations/uau/portfolio', {
          cache: 'no-store',
          signal,
        });
        const body = await response.json();
        if (!response.ok)
          throw Error(body.error || 'Falha ao carregar a carteira.');
        if (signal?.aborted) return;
        setRealContracts(body.contracts);
        setPortfolioLoaded(true);
        setRun(portfolioRunStatus(body.run));
        setPortfolioError('');
      } catch (error) {
        if (signal?.aborted) return;
        setPortfolioError(
          error instanceof Error ? error.message : 'Falha ao ler a carteira.'
        );
      }
    },
    [accountId, canEditSettings]
  );
  useEffect(() => {
    const controller = new AbortController();
    if (ready && section === 'portfolio') void loadPortfolio(controller.signal);
    return () => controller.abort();
  }, [ready, loadPortfolio, reload, section]);
  useEffect(() => {
    if (run?.state !== 'running') return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch(
          '/api/integrations/uau/portfolio?status=1',
          { cache: 'no-store', signal: controller.signal }
        );
        const body = await response.json();
        if (!response.ok)
          throw Error(body.error || 'Falha ao ler o progresso.');
        if (controller.signal.aborted) return;
        const current = portfolioRunStatus(body.run);
        setRun(current);
        if (current?.state !== 'running') {
          void loadPortfolio();
          return;
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setPortfolioError(
          error instanceof Error ? error.message : 'Falha ao ler o progresso.'
        );
        setRun((current) => portfolioRunStatus(current));
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 5000);
    }
    timer = setTimeout(poll, 1000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [run?.id, run?.state, loadPortfolio]);
  const running = portfolioRunStatus(run)?.state === 'running';
  async function importContracts() {
    setImporting(true);
    setPortfolioError('');
    try {
      const response = await fetch('/api/integrations/uau/portfolio', {
        method: 'POST',
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || 'Falha ao importar.');
      setDemo(false);
      setRun({
        id: body.runId,
        state: 'running',
        expires_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
      });
      toast.success(
        'Importação iniciada. A carteira será atualizada após concluir todos os lotes.'
      );
    } catch (error) {
      setPortfolioError(
        error instanceof Error ? error.message : 'Falha ao importar.'
      );
    } finally {
      setImporting(false);
    }
  }
  const actualCards: PortfolioCard[] = realContracts.map((snapshot) => ({
    id: snapshot.key,
    customer: snapshot.customer,
    company: snapshot.company,
    work: snapshot.work,
    sale: snapshot.sale,
    project: snapshot.project,
    unit: snapshot.unit,
    delay: snapshot.delay,
    principalCents: snapshot.overdueCents,
    confirmedPrincipalCents: 0,
    installments: snapshot.overdueCount,
    operation:
      snapshot.state === 'overdue'
        ? 'contact'
        : snapshot.state === 'excluded'
          ? 'review'
          : snapshot.state,
    agent: null,
    snapshot,
  }));
  const settingsSaved = ready && savedSignature === JSON.stringify(setup);
  const rows = (demo ? portfolioExamples : actualCards).filter(
    (contract) =>
      (company === 'all' || contract.company === company) &&
      (projectFilter === 'all' ||
        contract.company + '|' + contract.work === projectFilter) &&
      (operation === 'all' || contract.operation === operation) &&
      (!contract.snapshot || contract.snapshot.state !== 'excluded') &&
      !isExcludedProject(visibleSetup, contract.company, contract.work) &&
      (contract.snapshot ||
        contract.operation === 'paid' ||
        contract.delay >= visibleSetup.minimumDays) &&
      (visibleSetup.scope.mode === 'all' ||
        demo ||
        visibleSetup.scope.projects.some(
          (p) =>
            p.company === contract.company &&
            p.work.toUpperCase() === contract.work.toUpperCase()
        )) &&
      `${contract.customer} ${contract.sale} ${contract.unit} ${contract.project} ${contract.company} ${contract.work}`
        .toLocaleLowerCase('pt-BR')
        .includes(search.toLocaleLowerCase('pt-BR'))
  );
  const overdue = rows.filter((contract) =>
    contract.snapshot
      ? contract.snapshot.state === 'overdue'
      : contract.operation !== 'paid'
  );
  const totalDue = overdue.reduce(
    (sum, contract) => sum + contract.principalCents,
    0
  );
  const totalReceived = rows.reduce(
    (sum, contract) => sum + contract.confirmedPrincipalCents,
    0
  );
  const calculated = demo
    ? null
    : calculatedPortfolioTotals(rows.map((row) => row.snapshot!));
  const ruleSets = [
    { id: 'default', name: 'Régua padrão', stages: visibleSetup.stages },
    ...visibleSetup.projectRules,
  ];
  const columns = [
    {
      id: 'observation',
      name: 'Em observação',
      range: 'Antes da primeira etapa da régua',
      color: 'text-muted-foreground',
      dot: 'bg-muted-foreground',
      rows: overdue.filter(
        (c) =>
          !stageForDelay(
            c.delay,
            stagesForProject(visibleSetup, c.company, c.work)
          )
      ),
    },
    ...ruleSets.flatMap((rule) =>
      rule.stages.map((stage, index) => ({
        id: rule.id + ':' + stage.id,
        name: ruleSets.length > 1 ? rule.name + ' · ' + stage.name : stage.name,
        range: stageRange(rule.stages, index),
        color: stageColors[Math.min(index, 3)],
        dot: stageDots[Math.min(index, 3)],
        rows: overdue.filter((contract) => {
          const match = visibleSetup.projectRules.find(
            (r) =>
              r.company === contract.company &&
              r.work.toUpperCase() === contract.work.toUpperCase()
          );
          return (
            (match?.id ?? 'default') === rule.id &&
            stageForDelay(
              contract.delay,
              stagesForProject(visibleSetup, contract.company, contract.work)
            )?.id === stage.id
          );
        }),
      }))
    ),
    ...(['paid', 'current', 'review', 'cancelled'] as const).map((state) => ({
      id: state,
      name: operationLabels[state],
      range:
        state === 'paid'
          ? 'Pagamento conciliado'
          : state === 'current'
            ? 'Saldo futuro ou reprogramado'
            : state === 'cancelled'
              ? 'Cobrança bloqueada'
              : 'Requer conferência',
      color:
        state === 'paid'
          ? 'text-emerald-700 dark:text-emerald-300'
          : 'text-muted-foreground',
      dot: state === 'paid' ? 'bg-emerald-500' : 'bg-muted-foreground',
      rows: rows.filter((c) => c.operation === state),
    })),
  ];
  const contractColumns = new Map(
    columns.flatMap((column) =>
      column.rows.map((contract) => [contract.id, column] as const)
    )
  );
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
  if (section === 'portfolio' && (!ready || !portfolioLoaded))
    return (
      <div
        className="w-full min-w-0 space-y-5 pb-6"
        aria-busy={!portfolioError && !loadError}
      >
        <h1 className="text-2xl font-semibold">Carteira de cobrança</h1>
        {portfolioError || loadError ? (
          <div
            role="alert"
            className="border-border bg-card rounded-xl border p-6"
          >
            <p className="text-destructive text-sm">
              {portfolioError || loadError}
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                setPortfolioError('');
                setLoadError('');
                setReload((value) => value + 1);
              }}
            >
              Tentar novamente
            </Button>
          </div>
        ) : (
          <>
            <p
              role="status"
              className="text-muted-foreground flex items-center gap-2 text-sm"
            >
              <Loader2 className="size-4 animate-spin" />
              Carregando a carteira salva…
            </p>
            <div aria-hidden className="grid gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <div
                  key={index}
                  className="bg-muted/40 h-28 animate-pulse rounded-xl"
                />
              ))}
            </div>
            <div aria-hidden className="grid min-h-80 grid-cols-3 gap-3">
              {Array.from({ length: 3 }, (_, index) => (
                <div
                  key={index}
                  className="bg-muted/30 animate-pulse rounded-xl"
                />
              ))}
            </div>
          </>
        )}
      </div>
    );
  return (
    <div
      ref={workspaceRef}
      className={cn(
        'mx-auto min-w-0',
        expanded
          ? 'bg-background fixed inset-0 z-40 flex flex-col gap-4 overflow-auto p-4 sm:p-6'
          : 'space-y-6 pb-6',
        tab === 'portfolio' ? 'w-full max-w-none' : 'max-w-[1800px]'
      )}
    >
      {tab === 'portfolio' && !expanded && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-primary mb-2 text-[10px] font-semibold tracking-[0.2em] uppercase">
              Gestão de recebíveis
            </p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Carteira de cobrança
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              Contratos reais, posição financeira e trilha de acompanhamento.
            </p>
          </div>
          {tab === 'portfolio' && (
            <Button
              variant="outline"
              className="rounded-lg"
              onClick={() => setTab('settings')}
            >
              <Settings2 className="size-4" />
              Configurar carteira
            </Button>
          )}
        </div>
      )}
      {tab === 'portfolio' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <div className="flex items-start gap-3">
            <FlaskConical className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" />
            <div>
              <p className="text-xs font-semibold">
                {demo
                  ? 'Demonstração · dados fictícios'
                  : 'Carteira real · UAU'}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {demo
                  ? 'Explore o quadro e clique em um contrato para conhecer a trilha. Nenhuma cobrança será enviada.'
                  : running
                    ? 'Importação em andamento. A posição anterior será preservada até concluir.'
                    : realContracts.length
                      ? 'Contratos importados e histórico preservado na plataforma. Nenhuma mensagem automática é enviada.'
                      : 'Use Importar contratos para carregar a carteira configurada.'}
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
      )}
      {portfolioError && (
        <p
          role="alert"
          className="border-destructive/30 text-destructive rounded-lg border p-3 text-sm"
        >
          {portfolioError}
        </p>
      )}
      {run?.error && (
        <p
          role="alert"
          className="rounded-lg border border-amber-500/30 p-3 text-sm text-amber-700 dark:text-amber-300"
        >
          Última importação: {run.error}
        </p>
      )}
      {tab === 'portfolio' && (
        <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-3 text-xs">
          <span>
            Escopo salvo:{' '}
            {visibleSetup.scope.mode === 'all'
              ? 'todas as empresas e obras'
              : visibleSetup.scope.projects
                  .map((p) => p.company + ' / ' + p.work)
                  .join(', ')}
            {run?.finished_at
              ? (run.state === 'succeeded'
                  ? ' · Última atualização concluída: '
                  : ' · Última tentativa: ') +
                new Intl.DateTimeFormat('pt-BR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                  timeZone: 'America/Sao_Paulo',
                }).format(new Date(run.finished_at))
              : ''}
          </span>
          <Button
            variant="outline"
            disabled={!settingsSaved || running || importing}
            onClick={() => void importContracts()}
          >
            {running || importing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ArrowDownLeft className="size-4" />
            )}
            {running
              ? run?.total_contracts
                ? 'Importando ' +
                  (run.prepared ?? 0) +
                  '/' +
                  run.total_contracts
                : 'Consultando UAU…'
              : 'Importar / atualizar contratos'}
          </Button>
        </div>
      )}
      {tab === 'portfolio' && (
        <Tabs
          value={portfolioView}
          onValueChange={(value) =>
            setPortfolioView(value as 'board' | 'analytics')
          }
          className={cn('min-w-0 gap-5', expanded && 'min-h-0 flex-1')}
        >
          <div className={cn('border-border border-b', expanded && 'hidden')}>
            <TabsList
              variant="line"
              aria-label="Visões da carteira de cobrança"
              className="h-10 justify-start gap-4"
            >
              <TabsTrigger value="board" className="px-3">
                Carteira
              </TabsTrigger>
              <TabsTrigger value="analytics" className="px-3">
                Análises
              </TabsTrigger>
            </TabsList>
          </div>
          <div
            className={cn(
              'grid gap-3 sm:grid-cols-2',
              expanded && 'hidden',
              demo ? 'xl:grid-cols-4' : 'xl:grid-cols-5'
            )}
          >
            {[
              {
                label: calculated
                  ? 'Principal vencido com reajuste'
                  : 'Principal base vencido',
                value: money(calculated?.overduePrincipalCents ?? totalDue),
                detail: calculated
                  ? `Base: ${money(totalDue)} · Sem juros ou multa`
                  : demo
                    ? 'Sem reajustes, juros ou multa'
                    : 'Reimporte para consultar os reajustes no UAU',
                Icon: Wallet,
                tone: 'text-orange-600 dark:text-orange-300',
              },
              ...(!demo
                ? [
                    {
                      label: 'Total vencido a pagar',
                      value: calculated
                        ? money(calculated.overdueTotalCents)
                        : '—',
                      detail: calculated
                        ? 'Reajuste e encargos calculados pelo UAU'
                        : 'Disponível após nova sincronização',
                      Icon: CircleDollarSign,
                      tone: 'text-red-600 dark:text-red-300',
                    },
                  ]
                : []),
              {
                label: 'Contratos em atraso',
                value: String(overdue.length),
                detail: `${overdue.reduce((sum, c) => sum + c.installments, 0)} parcelas no recorte`,
                Icon: CircleDollarSign,
                tone: 'text-sky-600 dark:text-sky-300',
              },
              {
                label: demo ? 'Em negociação' : 'Em conferência',
                value: demo
                  ? String(
                      rows.filter((c) => c.operation === 'negotiation').length
                    )
                  : String(
                      rows.filter((contract) => contract.operation === 'review')
                        .length
                    ),
                detail: demo
                  ? 'Acompanhamento pela equipe'
                  : 'Revisar antes de cobrar',
                Icon: ArrowDownLeft,
                tone: 'text-violet-600 dark:text-violet-300',
              },
              {
                label: demo
                  ? 'Principal recebido'
                  : calculated
                    ? 'Saldo total atualizado'
                    : 'Saldo base total aberto',
                value: demo
                  ? money(totalReceived)
                  : money(
                      calculated?.openTotalCents ??
                        rows.reduce(
                          (sum, c) => sum + (c.snapshot?.openCents ?? 0),
                          0
                        )
                    ),
                detail: demo
                  ? 'Confirmado · exemplos deste quadro'
                  : calculated
                    ? 'Vencidas e futuras · Inclui reajuste e encargos'
                    : 'Vencidas e futuras · Sem reajustes e encargos',
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
          <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.4fr)_minmax(360px,2fr)_minmax(170px,1fr)_auto]">
            <div className="min-w-0 space-y-1">
              <label
                htmlFor="portfolio-search"
                className="text-foreground/80 text-xs font-medium"
              >
                Buscar contrato
              </label>
              <div className="relative">
                <Search className="text-muted-foreground absolute top-2.5 left-3 size-4" />
                <Input
                  id="portfolio-search"
                  placeholder="Nome, venda, empreendimento ou unidade…"
                  className="h-10 pl-9"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <UauSearchChoice
                label="Empresa no UAU"
                placeholder="Todas as empresas"
                value={company === 'all' ? '' : company}
                choices={[
                  { value: '', label: 'Todas as empresas' },
                  ...[
                    ...new Set(
                      (demo ? portfolioExamples : actualCards).map(
                        (c) => c.company
                      )
                    ),
                  ]
                    .sort()
                    .map((code) => ({
                      value: code,
                      label:
                        projectCatalog.catalog?.companies.find(
                          (c) => c.code === code
                        )?.name ?? 'Empresa ' + code,
                    })),
                ]}
                onChange={(value) => {
                  setCompany(value || 'all');
                  setProjectFilter('all');
                }}
              />
              <UauSearchChoice
                label="Obra no UAU"
                placeholder={
                  company === 'all'
                    ? 'Selecione a empresa primeiro'
                    : 'Todas as obras'
                }
                value={projectFilter === 'all' ? '' : projectFilter}
                disabled={company === 'all'}
                choices={[
                  { value: '', label: 'Todas as obras' },
                  ...new Map(
                    (demo ? portfolioExamples : actualCards)
                      .filter((c) => c.company === company)
                      .map((c) => [
                        c.company + '|' + c.work,
                        {
                          value: c.company + '|' + c.work,
                          label: c.project,
                        },
                      ])
                  ).values(),
                ]}
                onChange={(value) => setProjectFilter(value || 'all')}
              />
            </div>
            <div className="min-w-0 space-y-1">
              <label
                htmlFor="portfolio-operation"
                className="text-foreground/80 text-xs font-medium"
              >
                Situação
              </label>
              <Select
                value={operation}
                onValueChange={(value) => {
                  if (value) setOperation(value);
                }}
                items={[
                  { value: 'all', label: 'Todas as situações' },
                  ...Object.entries(operationLabels).map(([value, label]) => ({
                    value,
                    label,
                  })),
                ]}
              >
                <SelectTrigger
                  id="portfolio-operation"
                  className={cn(glass.glass, 'h-10 w-full rounded-xl')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  alignItemWithTrigger={false}
                  align="start"
                  className={cn(
                    glass.glass,
                    'rounded-xl p-1 duration-200 motion-reduce:animate-none'
                  )}
                >
                  <SelectItem value="all">Todas as situações</SelectItem>
                  {Object.entries(operationLabels).map(([id, label]) => (
                    <SelectItem key={id} value={id}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div
              className={cn(
                'border-border bg-muted/30 flex h-10 items-center justify-self-end rounded-lg border p-1',
                portfolioView === 'analytics' && 'hidden'
              )}
            >
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
                  onClick={() => {
                    setView(mode);
                    if (mode === 'list' && expanded) resizeWorkspace(false);
                  }}
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
              {view === 'board' && (
                <button
                  type="button"
                  onClick={() => resizeWorkspace(!expanded)}
                  aria-label={
                    expanded
                      ? 'Recolher Kanban'
                      : 'Expandir Kanban para tela cheia'
                  }
                  title={expanded ? 'Recolher Kanban (Esc)' : 'Expandir Kanban'}
                  aria-pressed={expanded}
                  className="text-muted-foreground hover:text-foreground focus-visible:outline-ring rounded-md px-2.5 py-1.5 focus-visible:outline-2"
                >
                  {expanded ? (
                    <Minimize2 className="size-4" />
                  ) : (
                    <Maximize2 className="size-4" />
                  )}
                </button>
              )}
            </div>
          </div>
          <TabsContent value="analytics">
            <PortfolioAnalytics
              rows={rows}
              demo={demo}
              onViewContracts={(company, work) => {
                setCompany(company);
                setProjectFilter(company + '|' + work);
                setPortfolioView('board');
                setView('board');
              }}
            />
          </TabsContent>
          <TabsContent
            value="board"
            className={
              expanded ? 'flex min-h-0 flex-1 flex-col gap-3' : 'space-y-5'
            }
          >
            {!demo && realContracts.length === 0 ? (
              <div className="border-border bg-muted/10 flex min-h-80 flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center">
                <span className="bg-primary/10 mb-4 flex size-12 items-center justify-center rounded-2xl">
                  <DatabaseIcon />
                </span>
                <h2 className="text-lg font-semibold">
                  {running
                    ? 'Importando contratos…'
                    : 'Sua carteira está pronta para importar.'}
                </h2>
                <p className="text-muted-foreground mt-2 max-w-md text-sm leading-relaxed">
                  A importação usa o escopo salvo na tela de Sincronização.
                  Todas as empresas e obras entram por padrão; exclusões e
                  réguas específicas são aplicadas por empreendimento.
                </p>
                <Button
                  className="mt-5"
                  disabled={!settingsSaved || running || importing}
                  onClick={() => void importContracts()}
                >
                  Importar contratos reais
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            ) : view === 'board' ? (
              <div
                aria-label="Quadro de cobrança"
                className={cn(
                  'w-full min-w-0 overflow-x-auto overflow-y-hidden pb-3',
                  expanded
                    ? 'min-h-0 flex-1'
                    : 'h-[max(22rem,calc(100dvh-24rem))]'
                )}
              >
                <div
                  className="grid h-full min-h-0 items-stretch gap-3"
                  style={{
                    gridTemplateColumns: `repeat(${columns.length}, minmax(245px, 1fr))`,
                  }}
                >
                  {columns.map((column) => (
                    <section
                      key={column.id}
                      className="border-border/60 bg-muted/30 flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border p-2.5"
                    >
                      <div className="shrink-0 px-1 pt-1 pb-4">
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
                                    : (c.snapshot?.calculated
                                        ?.overduePrincipalCents ??
                                      c.principalCents)),
                                0
                              )
                            )}
                          </span>
                        </div>
                      </div>
                      <div
                        role="region"
                        aria-label={`Contratos em ${column.name}`}
                        tabIndex={0}
                        className="focus-visible:outline-ring min-h-0 flex-1 [scrollbar-gutter:stable] space-y-2.5 overflow-y-auto overscroll-y-contain rounded-lg px-0.5 pt-1 pb-1 focus-visible:outline-2"
                      >
                        {column.rows
                          .slice(0, columnLimit[column.id] ?? 30)
                          .map((contract) => (
                            <ContractCard
                              key={contract.id}
                              contract={contract}
                              onSelect={() => setSelected(contract)}
                            />
                          ))}
                        {column.rows.length >
                          (columnLimit[column.id] ?? 30) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-xs"
                            onClick={() =>
                              setColumnLimit((current) => ({
                                ...current,
                                [column.id]: (current[column.id] ?? 30) + 30,
                              }))
                            }
                          >
                            Mostrar mais (
                            {column.rows.length -
                              (columnLimit[column.id] ?? 30)}
                            )
                          </Button>
                        )}
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
                <table className="w-full min-w-[1300px] text-left text-sm">
                  <thead className="bg-muted/40 text-muted-foreground text-xs">
                    <tr>
                      {[
                        'Cliente',
                        'Empresa | Obra',
                        'Empreendimento / unidade',
                        'Venda',
                        'Atraso',
                        'Principal / reajuste',
                        'Situação',
                        'Etapa do Kanban',
                        'Responsável pelo contato',
                        '',
                      ].map((label) => (
                        <th key={label} className="px-4 py-3 font-medium">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows
                      .slice(
                        Math.min(
                          listPage,
                          Math.max(0, Math.ceil(rows.length / 50) - 1)
                        ) * 50,
                        Math.min(
                          listPage,
                          Math.max(0, Math.ceil(rows.length / 50) - 1)
                        ) *
                          50 +
                          50
                      )
                      .map((contract) => (
                        <tr
                          key={contract.id}
                          className="border-border hover:bg-muted/20 border-t"
                        >
                          <td className="px-4 py-4">
                            <span className="font-medium">
                              {contract.customer}
                            </span>
                          </td>
                          <td className="text-primary px-4 py-4 font-mono text-xs whitespace-nowrap">
                            {contract.company}|{contract.work}
                          </td>
                          <td className="px-4 py-4 text-xs">
                            {contract.project}
                            <p className="text-muted-foreground mt-1">
                              {contract.unit}
                            </p>
                          </td>
                          <td className="px-4 py-4 font-mono text-xs tabular-nums">
                            {contract.sale}
                          </td>
                          <td className="px-4 py-4 tabular-nums">
                            {contract.delay > 0 ? (
                              <span className="inline-flex rounded-md bg-red-500/10 px-2 py-1 text-[11px] font-medium whitespace-nowrap text-red-700 dark:text-red-300">
                                {contract.delay} dias em atraso
                              </span>
                            ) : (
                              'Em dia'
                            )}
                          </td>
                          <td className="px-4 py-4 font-medium tabular-nums">
                            {money(
                              contract.operation === 'paid' &&
                                !contract.snapshot
                                ? contract.confirmedPrincipalCents
                                : (contract.snapshot?.calculated
                                    ?.overduePrincipalCents ??
                                    contract.principalCents)
                            )}
                            <p className="text-muted-foreground mt-1 text-[10px] font-normal">
                              {contract.operation === 'paid' &&
                              !contract.snapshot
                                ? 'Recebido'
                                : contract.snapshot?.state === 'paid' ||
                                    contract.snapshot?.state === 'current'
                                  ? 'Sem atraso atual'
                                  : contract.snapshot?.calculated
                                    ? 'Com reajuste · Sem juros ou multa'
                                    : 'Principal base'}
                            </p>
                          </td>
                          <td className="px-4 py-4">
                            <OperationBadge operation={contract.operation} />
                          </td>
                          <td className="px-4 py-4 text-xs">
                            <span
                              className={cn(
                                'font-medium',
                                contractColumns.get(contract.id)?.color
                              )}
                            >
                              {contractColumns.get(contract.id)?.name ?? '—'}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-xs">
                            <span className="flex items-center gap-1.5">
                              <UserRound className="text-muted-foreground size-3.5 shrink-0" />
                              {contract.agent ?? 'Sem responsável'}
                            </span>
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
                          colSpan={10}
                          className="text-muted-foreground p-10 text-center"
                        >
                          Nenhum contrato encontrado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <div className="border-border text-muted-foreground flex items-center justify-between gap-3 border-t p-3 text-xs">
                  <span>{rows.length} contrato(s) · 50 por página</span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={listPage === 0}
                      onClick={() =>
                        setListPage((page) => Math.max(0, page - 1))
                      }
                    >
                      Anterior
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={(listPage + 1) * 50 >= rows.length}
                      onClick={() => setListPage((page) => page + 1)}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              </div>
            )}
            <p className="text-muted-foreground flex items-start gap-2 text-[11px] leading-relaxed">
              <ShieldCheck className="size-3.5 shrink-0" />A régua usa o
              vencimento original. Pagamentos parciais, prorrogações e distratos
              precisam ser conciliados antes de qualquer ação automática.
            </p>
          </TabsContent>
        </Tabs>
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
          running={running}
          key={accountId}
          setup={visibleSetup}
          onChange={setSetup}
          savedAt={ready ? savedAt : null}
          onSaved={() => {
            setSavedAt(new Date().toISOString());
            setReload((v) => v + 1);
          }}
          disabled={!ready}
        />
      )}
      {tab === 'stages' && (
        <PortfolioRules
          setup={visibleSetup}
          disabled={!ready}
          onSaved={(payload) => {
            setSetup(payload);
            setSavedSignature(JSON.stringify(payload));
            setSavedAt(new Date().toISOString());
          }}
        />
      )}
      {selected?.snapshot ? (
        <RealContractDetails
          key={selected.id}
          contract={
            realContracts.find((snapshot) => snapshot.key === selected.id) ??
            selected.snapshot
          }
          setup={visibleSetup}
          responsible={selected.agent}
          cache={detailsCache}
          dataVersion={[run?.id, run?.state, run?.finished_at, savedAt].join(
            ':'
          )}
          onClose={() => setSelected(null)}
        />
      ) : (
        <ContractDetails
          contract={selected}
          setup={visibleSetup}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function DatabaseIcon() {
  return <Wallet className="text-primary size-6" />;
}
