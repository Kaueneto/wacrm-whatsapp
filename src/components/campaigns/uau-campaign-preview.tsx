'use client';

import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useState, type FormEvent, type ReactNode } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { extractTemplateVariables } from '@/lib/whatsapp/template-validators';
import type {
  PhoneMapping,
  PhoneMode,
  PreviewField,
  UauPreviewResult,
  UauRow,
} from '@/lib/uau/query-preview';
import { analyzeUauRows } from '@/lib/uau/query-preview';
import {
  mergeQueryParameterValues,
  type UauQueryParameter,
} from '@/lib/uau/query-parameters';
import type { UauDraftAudience } from '@/lib/uau/campaign-draft';
import type { MessageTemplate } from '@/types';
import { TemplatePreview } from './template-preview';
import { UauQueryTable } from './uau-query-table';

const selectStyle =
  'bg-background border-border block h-9 w-full min-w-0 rounded-lg border px-2 text-sm';
const initialPhone: PhoneMapping = { column: '', mode: 'br-national' };
const phoneModes: Record<PhoneMode, string> = {
  international: 'Número completo com código do país',
  'br-national': 'Número brasileiro já com DDD',
  'br-local': 'Número brasileiro com DDD em outra coluna',
};

export function UauCampaignPreview({
  template,
  children,
  initialAudience,
  onSave,
  saving,
  templateContainer,
  onNavigate,
}: {
  template: MessageTemplate | null;
  children: ReactNode;
  initialAudience?: UauDraftAudience;
  onSave: (audience: UauDraftAudience) => void;
  saving: boolean;
  templateContainer?: HTMLElement | null;
  onNavigate?: (tab: 'audience' | 'template') => void;
}) {
  const [id, setId] = useState(
    initialAudience ? String(initialAudience.queryId) : ''
  );
  const [custom, setCustom] = useState<0 | 1>(
    initialAudience?.personalized ?? 1
  );
  const [parameters, setParameters] = useState<
    { name: string; value: string }[]
  >(initialAudience?.parameters ?? []);
  const [parameterDefinitions, setParameterDefinitions] = useState<
    UauQueryParameter[] | null
  >(null);
  const [parameterSource, setParameterSource] = useState<string | null>(null);
  const currentParameterSource = Number(id) + ':' + custom;
  const parametersDiscovered =
    parameterSource === currentParameterSource && parameterDefinitions !== null;
  const parameterValuesComplete = parameters.every(
    (parameter) => !!parameter.value.trim()
  );
  const [result, setResult] = useState<
    (UauPreviewResult & { rows: UauRow[] }) | null
  >(null);
  const [phone, setPhone] = useState<PhoneMapping>(
    initialAudience?.phone ?? initialPhone
  );
  const [fieldMappings, setFieldMappings] = useState<
    Record<string, PreviewField>
  >(() =>
    Object.fromEntries(
      (initialAudience?.fields ?? []).map((field) => [
        String(template?.id) + ':' + field.variable,
        field,
      ])
    )
  );
  const [confirmed, setConfirmed] = useState(Boolean(initialAudience));
  const [validatedTemplate, setValidatedTemplate] = useState<string | null>(
    initialAudience ? (template?.id ?? null) : null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const variables = template
    ? extractTemplateVariables(template.body_text)
    : [];

  function invalidateQuery(resetMappings = false) {
    setResult(null);
    if (resetMappings) {
      setPhone(initialPhone);
      setFieldMappings({});
    }
    setConfirmed(false);
    setError('');
  }

  function setParameter(index: number, field: 'name' | 'value', value: string) {
    setParameters((previous) =>
      previous.map((parameter, i) =>
        i === index ? { ...parameter, [field]: value } : parameter
      )
    );
    invalidateQuery();
  }

  async function discoverParameters() {
    const response = await fetch('/api/integrations/uau/query-parameters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ id: Number(id), custom }),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        data.error || 'Não foi possível identificar os parâmetros da consulta.'
      );
    const definitions = data.parameters as UauQueryParameter[];
    const values = mergeQueryParameterValues(definitions, parameters);
    setParameterDefinitions(definitions);
    setParameterSource(currentParameterSource);
    setParameters(values);
    return { definitions, values };
  }
  async function reloadParameters() {
    if (busy) return;
    setBusy(true);
    invalidateQuery();
    setParameterSource(null);
    try {
      await discoverParameters();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível identificar os parâmetros.'
      );
    } finally {
      setBusy(false);
    }
  }
  async function run(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!parametersDiscovered) {
      setError('Busque os parâmetros antes de executar a consulta.');
      return;
    }
    setBusy(true);
    setError('');
    setConfirmed(false);
    try {
      const values = parameters;
      if (values.some((parameter) => !parameter.value.trim()))
        throw new Error(
          'Preencha o valor de todos os parâmetros antes de executar.'
        );
      const response = await fetch('/api/integrations/uau/query-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: Number(id), custom, parameters: values }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const preview = data as UauPreviewResult & { rows: UauRow[] };
      setResult(preview);
      setPhone((previous) =>
        preview.columns.includes(previous.column)
          ? previous
          : (preview.phone ?? initialPhone)
      );
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : 'Não foi possível testar a consulta.'
      );
    } finally {
      setBusy(false);
    }
  }

  const mappedFields = template
    ? variables.map((variable) => fieldMappings[template.id + ':' + variable])
    : [];
  const canValidate =
    !busy && !!phone.column && (phone.mode !== 'br-local' || !!phone.dddColumn);

  function validate(includeTemplate: boolean) {
    if (!result || !canValidate) return;
    if (includeTemplate && mappedFields.some((field) => !field?.column)) {
      setError('Escolha uma coluna do UAU para cada variável da mensagem.');
      return;
    }
    setError('');
    const analysis = analyzeUauRows(
      result.rows,
      phone,
      includeTemplate ? mappedFields : []
    );
    setResult({ ...analysis, rows: result.rows });
    setConfirmed(analysis.missingColumns.length === 0);
    setValidatedTemplate(includeTemplate ? (template?.id ?? null) : null);
  }

  function updatePhone(next: PhoneMapping) {
    setPhone(next);
    setConfirmed(false);
  }

  const currentPreview =
    result && confirmed && validatedTemplate === template?.id;
  const currentAssessments =
    confirmed && (!validatedTemplate || validatedTemplate === template?.id)
      ? result?.assessments
      : undefined;
  const sample = currentPreview && result.examples[0];
  const suggestion = result?.suggestions[0];

  function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (
      !confirmed ||
      !canValidate ||
      !template ||
      validatedTemplate !== template.id ||
      mappedFields.some((field) => !field)
    ) {
      onNavigate?.(!result && !initialAudience ? 'audience' : 'template');
      toast.error(
        'Confira o público em Cadastrar e valide os campos da mensagem na aba Template.'
      );
      return;
    }
    onSave({
      type: 'uau',
      queryId: Number(id),
      personalized: custom,
      parameters,
      phone,
      fields: mappedFields,
    });
  }

  const mappingColumns =
    result?.columns ??
    (Number(id) === initialAudience?.queryId &&
    custom === initialAudience?.personalized
      ? [...new Set(initialAudience.fields.map((field) => field.column))]
      : []);
  const templateSection = (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] lg:items-start">
      <div className="min-w-0 space-y-4">
        {children}
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        {!result && (
          <div className="border-border bg-muted/30 text-muted-foreground rounded-lg border p-3 text-sm">
            <p>
              Execute a consulta na aba Cadastrar para escolher quais colunas
              preenchem os campos da mensagem.
            </p>
            <Button
              type="button"
              variant="link"
              className="mt-1 h-auto p-0"
              onClick={() => onNavigate?.('audience')}
            >
              Ir para Cadastrar
            </Button>
          </div>
        )}
        {variables.length > 0 && template && (
          <div className="bg-card space-y-2 rounded-xl border p-4">
            <h3 className="text-sm font-semibold">Campos da mensagem</h3>
            <p className="text-muted-foreground text-xs">
              Escolha qual coluna preenche cada variável do template.
            </p>
            {variables.map((variable) => {
              const key = `${template.id}:${variable}`;
              const field = fieldMappings[key] ?? {
                variable,
                column: '',
                format: 'text',
              };
              const replace = (next: PreviewField) => {
                setFieldMappings({ ...fieldMappings, [key]: next });
                setConfirmed(false);
              };
              return (
                <div
                  key={key}
                  className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]"
                >
                  <label className="block space-y-1">
                    <span>
                      {/^\d+$/.test(variable)
                        ? `Campo {{${variable}}}`
                        : variable.replaceAll('_', ' ')}
                    </span>
                    <select
                      className={selectStyle}
                      disabled={!result}
                      value={field.column}
                      onChange={(event) =>
                        replace({ ...field, column: event.target.value })
                      }
                    >
                      <option value="">Coluna do UAU</option>
                      {mappingColumns.map((column) => (
                        <option key={column}>{column}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span>Formato</span>
                    <select
                      className={selectStyle}
                      value={field.format}
                      onChange={(event) =>
                        replace({
                          ...field,
                          format: event.target.value as PreviewField['format'],
                        })
                      }
                    >
                      <option value="text">Texto</option>
                      <option value="money">Valor em reais</option>
                      <option value="date">Data</option>
                    </select>
                  </label>
                </div>
              );
            })}
          </div>
        )}
        {template && result && (
          <Button
            type="button"
            variant="outline"
            disabled={!canValidate}
            onClick={() => validate(true)}
          >
            Validar campos e gerar prévia
          </Button>
        )}
      </div>
      {template && (
        <TemplatePreview
          template={{
            ...template,
            sample_values: sample
              ? {
                  ...template.sample_values,
                  body: variables.map((variable) => sample.values[variable]),
                }
              : template.sample_values,
          }}
        />
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <form
        className="bg-card space-y-4 rounded-xl border p-4 sm:p-5"
        onSubmit={(event) => void run(event)}
      >
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Consulta do UAU</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Defina a consulta e os valores usados para selecionar os contatos
              desta campanha.
            </p>
          </div>{' '}
          <Link
            className="text-primary shrink-0 text-xs hover:underline"
            href="/settings?tab=integrations"
          >
            Configurar conexão UAU
          </Link>
        </header>
        <fieldset disabled={!!busy} className="space-y-3">
          <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(8rem,11rem)_minmax(11rem,15rem)_auto] xl:justify-start">
            <label className="block space-y-1.5">
              <span>Código da consulta</span>
              <Input
                type="number"
                min={1}
                step={1}
                required
                value={id}
                onChange={(event) => {
                  setId(event.target.value);
                  setParameterDefinitions(null);
                  setParameterSource(null);
                  setParameters([]);
                  invalidateQuery(true);
                }}
              />
            </label>
            <label className="block space-y-1.5">
              <span>Tipo de consulta</span>
              <select
                className={selectStyle}
                value={custom}
                onChange={(event) => {
                  setCustom(event.target.value === '1' ? 1 : 0);
                  setParameterDefinitions(null);
                  setParameterSource(null);
                  setParameters([]);
                  invalidateQuery(true);
                }}
              >
                <option value={1}>Personalizada</option>
                <option value={0}>Interna do UAU</option>
              </select>
            </label>
            <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-1">
              <Button
                type="button"
                variant="outline"
                className="h-9"
                disabled={busy}
                onClick={() => void reloadParameters()}
              >
                <RefreshCw className="size-3.5" /> Buscar parâmetros
              </Button>
              <Button
                type="submit"
                className="h-9"
                disabled={
                  busy || !parametersDiscovered || !parameterValuesComplete
                }
              >
                {busy ? 'Consultando…' : 'Executar consulta'}
              </Button>
            </div>
          </div>
          <p role="status" className="text-muted-foreground text-xs">
            {!parametersDiscovered
              ? 'Primeiro, busque os parâmetros cadastrados no UAU.'
              : !parameters.length
                ? 'Esta consulta não exige parâmetros. Agora você pode executá-la.'
                : !parameterValuesComplete
                  ? 'Preencha todos os valores abaixo para liberar a execução.'
                  : 'Parâmetros preenchidos. A consulta será executada com esses valores.'}
          </p>
          <div className="space-y-3">
            <section
              className="border-border min-w-0 flex-1 rounded-lg border p-3"
              aria-label="Parâmetros da consulta"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium">Parâmetros da consulta</h3>
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                {parametersDiscovered
                  ? parameters.length
                    ? 'Preencha os valores desta campanha. Eles serão salvos e reutilizados em cada execução, inclusive nas campanhas diárias.'
                    : 'Esta consulta não exige parâmetros.'
                  : 'Informe o código e o tipo. Vamos identificar automaticamente os parâmetros cadastrados no UAU.'}
              </p>
              {!!parameters.length && (
                <div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                  {parameters.map((parameter, i) => {
                    const definition = parametersDiscovered
                      ? parameterDefinitions?.find(
                          (item) => item.name === parameter.name
                        )
                      : undefined;
                    return (
                      <label
                        key={parameter.name}
                        className="block min-w-0 space-y-1.5"
                      >
                        <code
                          className="block truncate font-mono text-[13px] leading-5 font-semibold text-blue-700 dark:text-sky-300"
                          title={parameter.name}
                        >
                          {parameter.name}
                        </code>
                        <span
                          className="text-muted-foreground block h-5 truncate text-xs leading-5"
                          title={definition?.description || parameter.name}
                        >
                          {definition?.description ||
                            'Valor usado nesta consulta'}
                        </span>
                        <Input
                          aria-label={parameter.name}
                          className="font-mono text-[13px] text-foreground"
                          value={parameter.value}
                          maxLength={512}
                          autoComplete="off"
                          placeholder="Valor para esta campanha"
                          onChange={(event) =>
                            setParameter(i, 'value', event.target.value)
                          }
                        />
                        {definition?.multiple && (
                          <span className="text-muted-foreground block text-[11px]">
                            Aceita vários valores. Use o separador e o formato
                            definidos na consulta UAU.
                          </span>
                        )}
                        {definition?.restricted && (
                          <span className="text-muted-foreground block text-[11px]">
                            Use um valor permitido pelas restrições desta
                            consulta no UAU.
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
              {!!parameters.length && (
                <p className="text-muted-foreground mt-3 text-[11px]">
                  Mantenha o formato aceito pela consulta UAU, inclusive aspas
                  em textos ou datas quando exigidas.
                </p>
              )}
            </section>
          </div>
        </fieldset>
      </form>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {result && (
        <div className="space-y-4 rounded-lg border p-4">
          {result.missingColumns.length > 0 && (
            <p role="alert" className="text-destructive text-sm">
              A consulta deixou de retornar: {result.missingColumns.join(', ')}.
              Teste novamente e revise a seleção.
            </p>
          )}
          {result.columns.length > 0 && (
            <fieldset disabled={!!busy} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>Coluna com o número de WhatsApp</span>
                    {suggestion?.column === phone.column && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                        <Sparkles aria-hidden="true" className="size-3" />{' '}
                        Sugestão identificada
                      </span>
                    )}
                  </div>
                  <select
                    className={selectStyle}
                    value={phone.column}
                    onChange={(event) => {
                      const column = event.target.value;
                      updatePhone(
                        result.suggestions.find(
                          (item) => item.column === column
                        ) ?? { ...phone, column }
                      );
                    }}
                  >
                    <option value="">Selecione uma coluna</option>
                    {result.columns.map((column) => (
                      <option key={column}>{column}</option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1.5">
                  <span>Formato do telefone</span>
                  <select
                    className={selectStyle}
                    value={phone.mode}
                    onChange={(event) => {
                      const mode = event.target.value as PhoneMode;
                      updatePhone({
                        ...phone,
                        mode,
                        dddColumn:
                          mode === 'br-local' ? phone.dddColumn : undefined,
                      });
                    }}
                  >
                    {Object.entries(phoneModes).map(([mode, label]) => (
                      <option key={mode} value={mode}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                {phone.mode === 'br-local' && (
                  <label className="block space-y-1.5">
                    <span>Coluna do DDD</span>
                    <select
                      className={selectStyle}
                      value={phone.dddColumn ?? ''}
                      onChange={(event) =>
                        updatePhone({
                          ...phone,
                          dddColumn: event.target.value || undefined,
                        })
                      }
                    >
                      <option value="">Selecione uma coluna</option>
                      {result.columns.map((column) => (
                        <option key={column}>{column}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="block space-y-1.5">
                  <span>Código do cliente (opcional)</span>
                  <select
                    className={selectStyle}
                    value={phone.identityColumn ?? ''}
                    onChange={(event) =>
                      updatePhone({
                        ...phone,
                        identityColumn: event.target.value || undefined,
                      })
                    }
                  >
                    <option value="">Sem código do cliente</option>
                    {result.columns.map((column) => (
                      <option key={column}>{column}</option>
                    ))}
                  </select>
                </label>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={!canValidate}
                onClick={() => validate(false)}
              >
                Confirmar coluna e validar telefones
              </Button>
            </fieldset>
          )}
        </div>
      )}

      <UauQueryTable
        columns={result?.columns}
        rows={result?.rows}
        loading={busy}
        phoneColumn={phone.column}
        assessments={currentAssessments}
      />

      {templateContainer === undefined
        ? templateSection
        : templateContainer
          ? createPortal(templateSection, templateContainer)
          : null}
      <form id="uau-campaign-save" onSubmit={save} />
    </div>
  );
}
