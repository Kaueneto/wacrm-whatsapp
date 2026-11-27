'use client';

import { useState } from 'react';
import { RuleJourney } from './rule-journey';
import {
  ArrowRight,
  Compass,
  LocateFixed,
  Route,
  Sparkles,
} from 'lucide-react';
import type { CollectionSummary } from '@/lib/collections/portfolio-types';
import {
  stageForDelay,
  stageRange,
  stagesForProject,
  type PortfolioSetup,
} from '@/lib/collections/setup';
import { financialLabels } from '@/lib/collections/analytics';

export function ContractJourney({
  contract,
  setup,
}: {
  contract: CollectionSummary;
  setup: PortfolioSetup;
}) {
  const stages = stagesForProject(setup, contract.company, contract.work);
  const current =
    contract.state === 'overdue' ? stageForDelay(contract.delay, stages) : null;
  const currentIndex = stages.findIndex((stage) => stage.id === current?.id);
  const [preview, setPreview] = useState<string | null>(null);
  const selected =
    stages.find((stage) => stage.id === preview) ?? current ?? stages[0];
  const next = currentIndex < 0 ? stages[0] : stages[currentIndex + 1];
  return (
    <section className="border-primary/15 bg-card relative isolate overflow-hidden rounded-2xl border">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,var(--primary-soft-2),transparent_65%)]"
      />
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <div className="flex items-center gap-2">
          <span className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-xl">
            <Route className="size-4" />
          </span>
          <div>
            <p className="text-muted-foreground text-[9px] font-semibold tracking-[0.16em] uppercase">
              Acompanhamento
            </p>
            <h3 className="text-sm font-semibold">Jornada do contrato</h3>
          </div>
        </div>
        <span className="border-primary/15 bg-primary/5 text-primary rounded-full border px-2.5 py-1 text-[10px] font-medium">
          {contract.ruleName}
        </span>
      </div>
      <div className="grid gap-4 px-5 pt-5 sm:grid-cols-[180px_minmax(0,1fr)]">
        <div>
          <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
            Maior atraso
          </p>
          <p className="mt-1 flex items-baseline gap-2">
            <strong className="text-4xl font-semibold tracking-tighter tabular-nums">
              {contract.delay}
            </strong>
            <span className="text-muted-foreground text-xs">dias</span>
          </p>
          <span className="bg-muted/60 text-muted-foreground mt-2 inline-flex rounded-full px-2 py-1 text-[10px]">
            {financialLabels[contract.state]}
          </span>
        </div>
        <div className="border-primary/15 bg-background/60 rounded-xl border p-4">
          <div className="text-primary flex items-center gap-1.5 text-[10px] font-semibold tracking-wide uppercase">
            <LocateFixed className="size-3.5" />
            {current ? 'Faixa atual' : 'Posição atual'}
          </div>
          <p className="mt-2 text-base font-semibold tracking-tight">
            {current?.name ?? financialLabels[contract.state]}
          </p>
          <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
            {current && <span>{stageRange(stages, currentIndex)}</span>}
            {contract.state === 'overdue' && (
              <span className="flex items-center gap-1">
                <ArrowRight className="size-3" />
                {next
                  ? 'Próximo marco em ' +
                    Math.max(0, next.fromDay - contract.delay) +
                    ' dia(s)'
                  : 'Última faixa configurada'}
              </span>
            )}
          </div>
        </div>
      </div>
      <RuleJourney
        stages={stages}
        currentStageId={current?.id}
        selectedStageId={selected?.id}
        onSelect={setPreview}
      />
      <div className="border-border bg-muted/20 flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
        <div className="flex items-center gap-2">
          <Compass className="text-primary size-4" />
          <div>
            <p className="text-muted-foreground text-[9px] font-medium uppercase">
              {selected?.id === current?.id
                ? 'Enquadramento atual'
                : 'Faixa em visualização'}
            </p>
            <p className="text-xs font-medium">
              {selected?.name}
              {selected && (
                <span className="text-muted-foreground ml-2 font-normal">
                  A partir de {selected.fromDay} dias
                </span>
              )}
            </p>
          </div>
        </div>
        <span className="text-muted-foreground flex items-center gap-1.5 text-[10px]">
          <Sparkles className="size-3" />
          Selecione um marco para explorar
        </span>
      </div>
      {contract.reason && (
        <p className="px-5 pt-3 text-xs text-amber-700 dark:text-amber-300">
          {contract.reason}
        </p>
      )}
      <p className="text-muted-foreground px-5 pt-3 pb-4 text-[10px] leading-relaxed">
        A trilha mostra o enquadramento por atraso. Contatos e encaminhamentos
        realizados são registrados no Histórico.
      </p>
    </section>
  );
}
