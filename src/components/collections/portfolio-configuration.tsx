'use client';

import { useRef, useState } from 'react';
import {
  Clock3,
  Database,
  Loader2,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PortfolioValidation } from './portfolio-validation';
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
        <div className="bg-muted/40 mt-4 grid gap-3 rounded-lg p-3 sm:grid-cols-2">
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
      )}
    </section>
  );
}

export function PortfolioConfiguration({
  setup,
  onChange,
  savedAt,
  onSaved,
  disabled,
}: {
  setup: PortfolioSetup;
  onChange: (setup: PortfolioSetup) => void;
  savedAt: string | null;
  onSaved: () => void;
  disabled: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const exclusionsInput = useRef<HTMLInputElement>(null);
  async function save() {
    setSaving(true);
    try {
      const payload = parsePortfolioSetup({
        ...setup,
        excludedCompanies: (
          exclusionsInput.current?.value ?? setup.excludedCompanies.join(',')
        )
          .split(',')
          .map((code) => code.trim())
          .filter(Boolean),
      });
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
        'Rascunho salvo para sua organização. A sincronização continua desativada.'
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao salvar.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Conecte a carteira ao UAU</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Uma configuração da organização, independente das campanhas de
            disparo.
          </p>
        </div>
        <fieldset
          disabled={disabled || saving}
          className="min-w-0 space-y-4 disabled:opacity-60"
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
        <PortfolioValidation setup={setup} disabled={disabled || saving} />
      </div>
      <div className="space-y-4 xl:sticky xl:top-0">
        <section className="border-border bg-card rounded-xl border p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Clock3 className="text-primary size-4" />
            Sincronização programada
          </h3>
          <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
            Prepare os horários de atualização. A rotina será ativada após a
            validação das consultas.
          </p>
          <fieldset disabled={disabled || saving} className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="portfolio-timezone">Fuso horário</Label>
              <Input
                id="portfolio-timezone"
                value={setup.timezone}
                onChange={(event) =>
                  onChange({ ...setup, timezone: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Horários diários</Label>
              {setup.times.map((time, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    type="time"
                    aria-label={`Horário ${index + 1}`}
                    value={time}
                    onChange={(event) =>
                      onChange({
                        ...setup,
                        times: setup.times.map((item, i) =>
                          i === index ? event.target.value : item
                        ),
                      })
                    }
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Remover horário ${index + 1}`}
                    disabled={setup.times.length === 1}
                    onClick={() =>
                      onChange({
                        ...setup,
                        times: setup.times.filter((_, i) => i !== index),
                      })
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                disabled={setup.times.length >= 12}
                onClick={() =>
                  onChange({ ...setup, times: [...setup.times, '18:00'] })
                }
              >
                <Plus className="size-3.5" />
                Adicionar horário
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="portfolio-min-days">
                Trazer a partir de quantos dias de atraso?
              </Label>
              <Input
                id="portfolio-min-days"
                type="number"
                min={1}
                max={36500}
                value={setup.minimumDays}
                onChange={(event) =>
                  onChange({
                    ...setup,
                    minimumDays: Number(event.target.value),
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="portfolio-exclusions">Excluir empresas</Label>
              <Input
                id="portfolio-exclusions"
                key={setup.excludedCompanies.join(',')}
                ref={exclusionsInput}
                placeholder="Códigos separados por vírgula"
                defaultValue={setup.excludedCompanies.join(', ')}
                onBlur={(event) =>
                  onChange({
                    ...setup,
                    excludedCompanies: event.target.value
                      .split(',')
                      .map((code) => code.trim())
                      .filter(Boolean),
                  })
                }
              />
              <p className="text-muted-foreground text-xs">
                O filtro de empresa e obra também pode ser definido nos
                parâmetros de cada consulta.
              </p>
            </div>
          </fieldset>
          <Button
            className="mt-5 w-full"
            disabled={disabled || saving}
            onClick={() => void save()}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Salvar rascunho
          </Button>
          {savedAt && (
            <p className="text-muted-foreground mt-2 text-center text-xs">
              Salvo em{' '}
              {new Intl.DateTimeFormat('pt-BR', {
                dateStyle: 'short',
                timeStyle: 'short',
                timeZone: 'America/Sao_Paulo',
              }).format(new Date(savedAt))}
            </p>
          )}
        </section>
        <div className="border-primary/20 bg-primary/5 rounded-xl border p-5">
          <ShieldCheck className="text-primary mb-2 size-5" />
          <h3 className="text-sm font-semibold">Primeiro, acompanhar.</h3>
          <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
            Salvar não executa consultas, ativa agendamentos ou envia mensagens.
            Os códigos devem corresponder a consultas já cadastradas no UAU.
          </p>
        </div>
      </div>
    </div>
  );
}
