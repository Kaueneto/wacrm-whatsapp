'use client';

import { useState } from 'react';
import { Clock3, Database, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PortfolioValidation } from './portfolio-validation';
import { PortfolioScope } from './portfolio-scope';
import { PortfolioScheduleFields } from './portfolio-schedule';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  mergeQueryParameterValues,
  type UauQueryParameter,
} from '@/lib/uau/query-parameters';
import {
  parsePortfolioSetup,
  isManagedPortfolioParameter,
  queryKinds,
  type PortfolioQuery,
  type PortfolioSetup,
  type QueryKind,
} from '@/lib/collections/setup';

const queryLabels: Record<QueryKind, { title: string; description: string }> = {
  open: {
    title: '1. Inadimplência atual',
    description:
      'Encontra os contratos com parcelas vencidas pelo vencimento original, dentro das empresas e obras escolhidas.',
  },
  reconciliation: {
    title: '2. Conciliação dos contratos acompanhados',
    description:
      'Uma única SQL reúne saldo restante, recebimentos, distratos e manutenções dos contratos solicitados pelo sistema.',
  },
};

function QueryEditor({
  kind,
  query,
  onChange,
}: {
  kind: QueryKind;
  query: PortfolioQuery;
  onChange: (query: PortfolioQuery) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [definitions, setDefinitions] = useState<UauQueryParameter[] | null>(
    null
  );
  async function loadParameters() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/integrations/uau/query-parameters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: query.id, custom: query.custom }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || 'Não foi possível consultar os parâmetros.'
        );
      setDefinitions(result.parameters);
      onChange({
        ...query,
        parameters: mergeQueryParameterValues(
          result.parameters,
          query.parameters
        ),
      });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Falha ao consultar os parâmetros.'
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <section className="border-border bg-card rounded-xl border p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Database className="text-primary size-4" />
        {queryLabels[kind].title}
      </h3>
      <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
        {queryLabels[kind].description}
      </p>
      <div className="mt-4 grid items-end gap-3 sm:grid-cols-[1fr_1.3fr_auto]">
        <div className="space-y-1.5">
          <Label htmlFor={`${kind}-code`}>Código no UAU</Label>
          <Input
            id={`${kind}-code`}
            type="number"
            min={1}
            disabled={loading}
            value={query.id ?? ''}
            placeholder="Ex.: 126"
            onChange={(event) => {
              setDefinitions(null);
              setError('');
              onChange({
                ...query,
                id: event.target.value ? Number(event.target.value) : null,
                parameters: [],
              });
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${kind}-type`}>Tipo de consulta</Label>
          <select
            id={`${kind}-type`}
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            disabled={loading}
            value={query.custom}
            onChange={(event) => {
              setDefinitions(null);
              setError('');
              onChange({
                ...query,
                custom: Number(event.target.value) as 0 | 1,
                parameters: [],
              });
            }}
          >
            <option value={1}>Personalizada</option>
            <option value={0}>Padrão UAU</option>
          </select>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!query.id || loading}
          onClick={() => void loadParameters()}
        >
          {loading && <Loader2 className="size-4 animate-spin" />}Buscar
          parâmetros
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-destructive mt-3 text-xs">
          {error}
        </p>
      )}
      {definitions?.length === 0 && (
        <p role="status" className="text-muted-foreground mt-3 text-xs">
          A consulta não informou parâmetros.
        </p>
      )}
      {query.parameters.length > 0 && (
        <details className="mt-4">
          <summary className="text-muted-foreground cursor-pointer text-xs">
            Parâmetros ({query.parameters.length})
          </summary>
          <div className="bg-muted/40 mt-2 grid gap-3 rounded-lg p-3 sm:grid-cols-2">
            {query.parameters.map((parameter, index) => (
              <div key={parameter.name} className="min-w-0 space-y-1.5">
                <Label
                  htmlFor={`${kind}-param-${index}`}
                  className="font-mono text-xs break-all text-blue-700 dark:text-sky-300"
                >
                  {parameter.name}
                </Label>
                {isManagedPortfolioParameter(kind, parameter.name) ? (
                  <p className="border-border text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-xs">
                    Preenchido automaticamente pelo sistema
                  </p>
                ) : (
                  <Input
                    id={`${kind}-param-${index}`}
                    value={parameter.value}
                    placeholder="Valor para esta carteira"
                    onChange={(event) =>
                      onChange({
                        ...query,
                        parameters: query.parameters.map((item, i) =>
                          i === index
                            ? { ...item, value: event.target.value }
                            : item
                        ),
                      })
                    }
                  />
                )}
                <p className="text-muted-foreground text-xs">
                  {
                    definitions?.find((item) => item.name === parameter.name)
                      ?.description
                  }
                </p>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

export function PortfolioConfiguration({
  setup,
  onChange,
  savedAt,
  running = false,
  onSaved,
  disabled,
}: {
  setup: PortfolioSetup;
  onChange: (setup: PortfolioSetup) => void;
  savedAt: string | null;
  running?: boolean;
  onSaved: () => void;
  disabled: boolean;
}) {
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      const payload = parsePortfolioSetup(setup);
      const response = await fetch('/api/integrations/uau/portfolio-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || 'Falha ao salvar a configuração.');
      onChange(payload);
      onSaved();
      toast.success(
        payload.schedule.enabled
          ? 'Configuração e agendamento salvos.'
          : 'Configuração salva. Atualização manual.'
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao salvar.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <Tabs defaultValue="configuration" className="min-w-0 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-2">
        <TabsList
          aria-label="Sincronização do UAU"
          variant="line"
          className="h-10 justify-start gap-4"
        >
          <TabsTrigger value="configuration" className="px-3">
            Configuração
          </TabsTrigger>
          <TabsTrigger value="schedule" className="px-3">
            <Clock3 className="size-4" />
            Agendamento
          </TabsTrigger>
        </TabsList>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
          {running && (
            <span className="text-muted-foreground text-xs">
              Importação em andamento
            </span>
          )}
          {savedAt && (
            <span className="text-muted-foreground text-xs">
              Salvo em{' '}
              {new Intl.DateTimeFormat('pt-BR', {
                dateStyle: 'short',
                timeStyle: 'short',
                timeZone: setup.timezone,
              }).format(new Date(savedAt))}
            </span>
          )}
          <Button
            className="h-9"
            disabled={disabled || saving}
            onClick={() => void save()}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Salvar configuração
          </Button>
        </div>
      </div>
      <TabsContent value="configuration" className="space-y-4">
        <fieldset
          disabled={disabled || saving}
          className="border-border bg-card flex flex-wrap items-center justify-between gap-4 rounded-xl border p-5"
        >
          <div>
            <h2 className="text-sm font-semibold">Parâmetros da importação</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Aplicados tanto à importação manual quanto à agendada.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="portfolio-min-days">Atraso mínimo (dias)</Label>
            <Input
              id="portfolio-min-days"
              className="h-10 w-24"
              type="number"
              min={1}
              max={36500}
              value={setup.minimumDays}
              onChange={(event) =>
                onChange({ ...setup, minimumDays: Number(event.target.value) })
              }
            />
          </div>
        </fieldset>
        <PortfolioScope
          setup={setup}
          onChange={onChange}
          disabled={disabled || saving}
        />
        <details className="border-border bg-card rounded-xl border p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Consultas do UAU{' '}
            <span className="text-muted-foreground ml-2 text-xs font-normal">
              Configuração técnica
            </span>
          </summary>
          <fieldset
            disabled={disabled || saving}
            className="mt-4 min-w-0 space-y-4 disabled:opacity-60"
          >
            {queryKinds.map((kind) => (
              <QueryEditor
                key={kind}
                kind={kind}
                query={setup.queries[kind]}
                onChange={(query) =>
                  onChange({
                    ...setup,
                    queries: { ...setup.queries, [kind]: query },
                  })
                }
              />
            ))}
          </fieldset>
        </details>
        <PortfolioValidation setup={setup} disabled={disabled || saving} />
      </TabsContent>
      <TabsContent value="schedule">
        <PortfolioScheduleFields
          setup={setup}
          onChange={onChange}
          disabled={disabled || saving}
        />
      </TabsContent>
    </Tabs>
  );
}
