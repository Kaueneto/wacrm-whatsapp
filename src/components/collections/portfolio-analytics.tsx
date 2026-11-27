'use client';

import { useMemo, useState } from 'react';
import {
  ArrowRight,
  ChartNoAxesCombined,
  CircleAlert,
  Layers3,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { BarChart } from '@/components/tremor/bar-chart';
import { Button } from '@/components/ui/button';
import { portfolioAnalytics } from '@/lib/collections/analytics';
import type {
  FinancialState,
  PortfolioCard,
} from '@/lib/collections/portfolio-types';

const money = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    cents / 100
  );
const percent = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value);
const stateColors: Record<FinancialState, string> = {
  overdue: '#f97316',
  current: '#38bdf8',
  paid: '#10b981',
  review: '#f59e0b',
  cancelled: '#a78bfa',
  excluded: '#94a3b8',
};
const panel = 'border-border bg-card min-w-0 rounded-xl border p-5';

export function PortfolioAnalytics({
  rows,
  demo,
  onViewContracts,
}: {
  rows: PortfolioCard[];
  demo: boolean;
  onViewContracts: (company: string, work: string) => void;
}) {
  const analysis = useMemo(() => portfolioAnalytics(rows), [rows]);
  const [metric, setMetric] = useState('amount');
  const [grouping, setGrouping] = useState('project');
  const moneyMetric = metric === 'amount';
  const category = moneyMetric ? 'Principal vencido' : 'Contratos em atraso';
  const format = moneyMetric ? money : (value: number) => String(value);
  const aging = analysis.aging.map((bucket) => ({
    label: bucket.label,
    [category]: moneyMetric ? bucket.amountCents : bucket.contracts,
  }));
  const ranked =
    grouping === 'project'
      ? analysis.projects.map((project) => ({
          label: project.key,
          [category]: moneyMetric
            ? project.overdueCents
            : project.overdueContracts,
        }))
      : analysis.companies.map((company) => ({
          label: `Empresa ${company.key}`,
          [category]: moneyMetric ? company.amountCents : company.contracts,
        }));
  ranked.sort((a, b) => Number(b[category]) - Number(a[category]));
  const top = analysis.projects[0];
  if (!analysis.contracts)
    return (
      <section className={`${panel} py-14 text-center`}>
        <ChartNoAxesCombined className="text-muted-foreground mx-auto mb-3 size-8" />
        <h2 className="font-semibold">Nenhum contrato no recorte atual</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          Ajuste os filtros para analisar a carteira importada.
        </p>
      </section>
    );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Análises da cobrança</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            {demo
              ? 'Dados fictícios da demonstração.'
              : 'Posição da carteira importada.'}{' '}
            Os gráficos e a conferência seguem os filtros acima.
          </p>
        </div>
        <label className="text-muted-foreground space-y-1 text-xs">
          <span className="block">Medida dos gráficos</span>
          <select
            className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
          >
            <option value="amount">Principal vencido</option>
            <option value="contracts">Quantidade de contratos</option>
          </select>
        </label>
      </div>
      {analysis.references.length > 1 && (
        <p
          role="status"
          className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300"
        >
          O recorte contém posições de datas diferentes. Confira as últimas
          sincronizações antes de comparar os empreendimentos.
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="border-border bg-muted/20 rounded-xl border p-4">
          <p className="text-muted-foreground flex items-center gap-2 text-xs">
            <Layers3 className="size-4" />
            Concentração por obra
          </p>
          <p className="mt-2 text-lg font-semibold">
            {top && analysis.overdueCents > 0
              ? `${top.key} · ${percent(top.share)}`
              : 'Sem principal vencido'}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {top && analysis.overdueCents > 0
              ? `${top.project} concentra ${money(top.overdueCents)} do vencido operacional.`
              : 'Nenhuma obra com saldo vencido operacional no recorte.'}
          </p>
        </div>
        <div className="rounded-xl border border-red-500/15 bg-red-500/5 p-4">
          <p className="text-muted-foreground text-xs">
            Contratos com 55+ dias de atraso
          </p>
          <p className="mt-2 text-lg font-semibold text-red-700 dark:text-red-300">
            {money(analysis.lateCents)}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {analysis.lateContracts} contrato(s) ·{' '}
            {percent(
              analysis.overdueCents
                ? analysis.lateCents / analysis.overdueCents
                : 0
            )}{' '}
            do principal vencido.
          </p>
        </div>
        <div className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-4">
          <p className="text-muted-foreground flex items-center gap-2 text-xs">
            <CircleAlert className="size-4" />
            Atenção antes da cobrança
          </p>
          <p className="mt-2 text-lg font-semibold">
            {analysis.review} em conferência · {analysis.cancelled} cancelado(s)
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {money(analysis.reviewCents)} de principal em conferência. Esses
            contratos e os cancelados ficam fora do vencido operacional.
          </p>
        </div>
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <section className={panel}>
          <h3 className="text-sm font-semibold">Distribuição por atraso</h3>
          <p className="text-muted-foreground mt-1 text-xs">
            Cada contrato entra na faixa do seu maior atraso.
          </p>
          <BarChart
            className="mt-5 h-64"
            data={aging}
            index="label"
            categories={[category]}
            colors={['amber']}
            valueFormatter={format}
            showLegend={false}
            yAxisWidth={moneyMetric ? 110 : 40}
            allowDecimals={moneyMetric}
            highlightBars
          />
          <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            {analysis.aging
              .filter((bucket) => bucket.contracts > 0)
              .map((bucket) => (
                <span key={bucket.label}>
                  {bucket.label}: {bucket.contracts} contrato(s) ·{' '}
                  {money(bucket.amountCents)}
                </span>
              ))}
          </div>
        </section>
        <section className={panel}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Maiores concentrações</h3>
              <p className="text-muted-foreground mt-1 text-xs">
                Até 10 grupos com maior{' '}
                {moneyMetric ? 'principal vencido' : 'quantidade em atraso'}.
              </p>
            </div>
            <select
              aria-label="Agrupar concentração por"
              className="border-input bg-background h-8 rounded-lg border px-2 text-xs"
              value={grouping}
              onChange={(e) => setGrouping(e.target.value)}
            >
              <option value="project">Empresa e obra</option>
              <option value="company">Empresa</option>
            </select>
          </div>
          <BarChart
            className="mt-5 h-64"
            data={ranked
              .filter((entry) => Number(entry[category]) > 0)
              .slice(0, 10)}
            index="label"
            categories={[category]}
            colors={['blue']}
            layout="vertical"
            valueFormatter={format}
            showLegend={false}
            yAxisWidth={100}
            allowDecimals={moneyMetric}
            highlightBars
          />
        </section>
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(280px,1fr)_minmax(0,2fr)]">
        <section className={panel}>
          <h3 className="text-sm font-semibold">Situação dos contratos</h3>
          <p className="text-muted-foreground mt-1 text-xs">
            Quantidade por situação financeira conciliada.
          </p>
          <div className="relative mt-3 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart accessibilityLayer>
                <Pie
                  data={analysis.states}
                  dataKey="count"
                  nameKey="label"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                  isAnimationActive={false}
                >
                  {analysis.states.map((state) => (
                    <Cell
                      key={state.state}
                      fill={stateColors[state.state]}
                      stroke="var(--card)"
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => `${value} contrato(s)`}
                  contentStyle={{
                    background: 'var(--popover)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    color: 'var(--popover-foreground)',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <strong className="text-2xl tabular-nums">
                {analysis.contracts}
              </strong>
              <span className="text-muted-foreground text-[10px]">
                contratos
              </span>
            </div>
          </div>
          <ul className="space-y-2">
            {analysis.states.map((state) => (
              <li
                key={state.state}
                className="flex items-center justify-between gap-3 text-xs"
              >
                <span className="flex items-center gap-2">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: stateColors[state.state] }}
                  />
                  {state.label}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {state.count} · {percent(state.count / analysis.contracts)}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className={panel}>
          <h3 className="text-sm font-semibold">
            Conferência por empresa e obra
          </h3>
          <p className="text-muted-foreground mt-1 text-xs">
            Compare o principal vencido com o saldo aberto, que inclui parcelas
            futuras.
          </p>
          <div
            role="region"
            aria-label="Conferência por empresa e obra"
            tabIndex={0}
            className="border-border mt-4 max-h-[440px] overflow-auto rounded-lg border"
          >
            <table className="w-full min-w-[850px] text-left text-xs">
              <thead className="bg-card sticky top-0">
                <tr>
                  {[
                    'Empresa | Obra',
                    'Contratos',
                    'Em atraso',
                    'Principal vencido',
                    'Saldo aberto',
                    'Participação',
                    'Maior atraso',
                    'Alertas',
                    '',
                  ].map((label) => (
                    <th
                      key={label}
                      className="border-border border-b px-3 py-3 font-medium whitespace-nowrap"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {analysis.projects.map((project) => (
                  <tr
                    key={project.key}
                    className="border-border hover:bg-muted/20 border-b last:border-b-0"
                  >
                    <td className="px-3 py-3">
                      <code className="font-medium">{project.key}</code>
                      <p
                        className="text-muted-foreground mt-1 max-w-48 truncate"
                        title={project.project}
                      >
                        {project.project}
                      </p>
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {project.contracts}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {project.overdueContracts}
                    </td>
                    <td className="px-3 py-3 font-medium whitespace-nowrap tabular-nums">
                      {money(project.overdueCents)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap tabular-nums">
                      {money(project.openCents)}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {percent(project.share)}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {project.maxDelay ? `${project.maxDelay} dias` : '—'}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {project.review || project.cancelled
                        ? `${project.review} conferir · ${project.cancelled} cancelados`
                        : '—'}
                    </td>
                    <td className="px-3 py-3">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Ver contratos de ${project.key}`}
                        onClick={() =>
                          onViewContracts(project.company, project.work)
                        }
                      >
                        <ArrowRight className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <p className="text-muted-foreground text-[11px]">
        Os indicadores representam o recorte importado e filtrado, não toda a
        base do UAU. Os valores desta aba usam o principal base, sem reajustes
        ou encargos. O principal vencido operacional considera contratos em
        atraso; pagamentos conciliados, cancelamentos e conferências são
        exibidos separadamente.
      </p>
    </div>
  );
}
