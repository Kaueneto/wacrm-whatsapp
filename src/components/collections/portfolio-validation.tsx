'use client';

import { useState } from 'react';
import { CheckCheck, FlaskConical, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { PortfolioSetup } from '@/lib/collections/setup';
import type { PortfolioValidationResult } from '@/lib/collections/query-validation';

export function PortfolioValidation({
  setup,
  disabled,
}: {
  setup: PortfolioSetup;
  disabled: boolean;
}) {
  const [company, setCompany] = useState('900');
  const [work, setWork] = useState('00001');
  const [sale, setSale] = useState('1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [response, setResponse] = useState<{
    signature: string;
    result: PortfolioValidationResult;
  } | null>(null);
  const signature = JSON.stringify({ setup, company, work, sale });
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
            pilot: { company: Number(company), work, sale: Number(sale) },
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
        Consulta a primeira página de inadimplência do escopo configurado e
        concilia uma venda de teste. O resultado fica nesta tela; nenhum dado
        financeiro é importado ou alterado.
      </p>
      <fieldset
        disabled={disabled || loading}
        className="mt-4 grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
      >
        <div className="space-y-1.5">
          <Label htmlFor="pilot-company">Empresa do teste</Label>
          <Input
            id="pilot-company"
            type="number"
            min={1}
            value={company}
            onChange={(event) => setCompany(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pilot-work">Obra</Label>
          <Input
            id="pilot-work"
            value={work}
            onChange={(event) => setWork(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pilot-sale">Venda</Label>
          <Input
            id="pilot-sale"
            type="number"
            min={1}
            value={sale}
            onChange={(event) => setSale(event.target.value)}
          />
        </div>
        <Button
          type="button"
          disabled={!setup.queries.open.id || !setup.queries.reconciliation.id}
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
        Em EmpresaObra, use o mesmo escopo nas duas consultas. Para o piloto:{' '}
        <code className="font-mono">{"'900|00001'"}</code>. A lista XML e a
        paginação são montadas automaticamente.
      </p>
      {error && (
        <p role="alert" className="text-destructive mt-4 text-sm">
          {error}
        </p>
      )}
      {result && (
        <div className="mt-5 space-y-4" role="status">
          <p className="text-primary text-sm font-medium">
            As duas consultas responderam no formato esperado.
          </p>
          <p className="text-muted-foreground text-xs">
            Inadimplência: {result.discovery.length} contrato(s) nesta página.{' '}
            {result.possiblyMorePages ? 'Pode haver outras páginas.' : ''}{' '}
            Conciliação: {result.reconciliation.length} contrato(s) de teste.
            Este resultado não comprova quitação.
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
