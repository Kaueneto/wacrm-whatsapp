'use client';

import { useState } from 'react';
import { CheckCheck, FlaskConical, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UauProjectPicker } from './uau-project-picker';
import type { PortfolioSetup } from '@/lib/collections/setup';
import type { PortfolioValidationResult } from '@/lib/collections/query-validation';

export function PortfolioValidation({
  setup,
  disabled,
}: {
  setup: PortfolioSetup;
  disabled: boolean;
}) {
  const [manual, setManual] = useState(false);
  const [project, setProject] = useState<{
    company: string;
    work: string;
  } | null>(null);
  const { company, work } = project ??
    (setup.scope.mode === 'selected' ? setup.scope.projects[0] : undefined) ?? {
      company: '',
      work: '',
    };
  const [sale, setSale] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [response, setResponse] = useState<{
    signature: string;
    result: PortfolioValidationResult;
  } | null>(null);
  const signature = JSON.stringify({ setup, manual, company, work, sale });
  const result = response?.signature === signature ? response.result : null;
  async function validate() {
    const testedSignature = signature;
    setLoading(true);
    setError('');
    setResponse(null);
    try {
      const request = await fetch(
        '/api/integrations/uau/portfolio-validation',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            setup,
            ...(manual
              ? {
                  pilot: {
                    company: Number(company),
                    work,
                    ...(sale.trim() ? { sale: Number(sale) } : {}),
                  },
                }
              : {}),
          }),
        }
      );
      const result = await request.json();
      if (!request.ok)
        throw new Error(result.error || 'Falha ao validar as consultas.');
      setResponse({ signature: testedSignature, result });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Falha no teste.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <section className="border-primary/20 bg-primary/5 rounded-xl border p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <FlaskConical className="text-primary size-4" />
        Validar dados reais do UAU
      </h3>
      <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
        {manual
          ? 'Confere a empresa e obra escolhidas. Informe a venda somente se quiser testar um contrato específico.'
          : 'Valida uma amostra real do escopo, sem importar ou alterar dados.'}
      </p>
      <fieldset
        disabled={disabled || loading}
        className={
          manual
            ? 'mt-4 grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]'
            : 'mt-4 flex flex-wrap items-center gap-4'
        }
      >
        <label className="text-muted-foreground flex items-center gap-2 text-xs sm:col-span-4">
          <input
            type="checkbox"
            checked={manual}
            onChange={(event) => {
              setManual(event.target.checked);
              setError('');
            }}
          />
          Escolher empresa e obra
        </label>
        {manual && (
          <>
            <div className="min-w-0 sm:col-span-2">
              <UauProjectPicker
                value={{ company, work }}
                onChange={(value) => {
                  setProject(value);
                  setSale('');
                  setError('');
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pilot-sale">Venda (opcional)</Label>
              <Input
                id="pilot-sale"
                type="number"
                min={1}
                step={1}
                placeholder="Escolher automaticamente"
                value={sale}
                onChange={(event) => setSale(event.target.value)}
              />
            </div>
          </>
        )}
        <Button
          type="button"
          disabled={
            (manual &&
              (!company ||
                !work ||
                (!!sale.trim() &&
                  (!/^[1-9]\d*$/.test(sale) ||
                    !Number.isSafeInteger(Number(sale)) ||
                    Number(sale) > 2147483647)))) ||
            !setup.queries.open.id ||
            !setup.queries.reconciliation.id
          }
          onClick={() => void validate()}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CheckCheck className="size-4" />
          )}
          Validar consultas
        </Button>
      </fieldset>
      <p className="text-muted-foreground mt-3 text-xs">
        {manual
          ? 'Este teste usa apenas a empresa e obra escolhidas, independentemente do escopo e das exclusões da carteira. A configuração salva permanece igual.'
          : 'O contrato é escolhido automaticamente entre os resultados do escopo.'}
      </p>
      {error && (
        <p role="alert" className="text-destructive mt-4 text-sm">
          {error}
        </p>
      )}
      {result && (
        <div className="mt-5 space-y-4" role="status">
          <p className="text-primary text-sm font-medium">
            {result.reconciliation.length
              ? 'As duas consultas responderam no formato esperado.'
              : 'A consulta de inadimplência respondeu sem contratos neste escopo.'}
          </p>
          <p className="text-muted-foreground text-xs">
            Inadimplência: {result.discovery.length} contrato(s) nesta página.{' '}
            {result.possiblyMorePages ? 'Pode haver outras páginas.' : ''}{' '}
            {result.reconciliation.length
              ? `Conciliação: ${result.reconciliation.length} contrato(s) da amostra. Este resultado não comprova quitação.`
              : 'A conciliação não foi testada porque não há contratos na amostra. Você pode escolher um contrato específico para conferi-la.'}
          </p>
          <div className="border-border bg-card overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="bg-muted/40">
                <tr>
                  {[
                    'Consulta',
                    'Contrato',
                    'Parcelas retornadas',
                    'Vencidas',
                    'Principal retornado',
                    'Distratos',
                  ].map((label) => (
                    <th key={label} className="px-3 py-2 font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ...result.discovery.map((row) => ({
                    ...row,
                    source: 'Inadimplência',
                  })),
                  ...result.reconciliation.map((row) => ({
                    ...row,
                    source: 'Conciliação',
                  })),
                ].map((row) => (
                  <tr
                    key={`${row.source}-${row.key}`}
                    className="border-border border-t"
                  >
                    <td className="px-3 py-3">{row.source}</td>
                    <td className="px-3 py-3">
                      <span className="font-mono">
                        {row.company} / {row.work} / {row.sale}
                      </span>
                      <p className="text-muted-foreground mt-1">
                        {row.customer}
                      </p>
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {row.openInstallments}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {row.overdueInstallments}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {new Intl.NumberFormat('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      }).format(row.baseOpen)}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {row.cancellations}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Na inadimplência, o principal corresponde às parcelas vencidas
            retornadas. Na conciliação, inclui também as parcelas futuras. Esses
            valores não devem ser somados entre as duas consultas.
          </p>
        </div>
      )}
    </section>
  );
}
