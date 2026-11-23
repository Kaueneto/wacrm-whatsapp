'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
  UauRow,
  UauRowAssessment,
  UauRowStatus,
} from '@/lib/uau/query-preview';

const number = new Intl.NumberFormat('pt-BR');
const statuses: { id: UauRowStatus; label: string; cell: string }[] = [
  { id: 'eligible', label: 'Destinatários válidos', cell: 'Válido' },
  { id: 'invalid', label: 'Telefones inválidos', cell: 'Telefone inválido' },
  { id: 'duplicates', label: 'Linhas duplicadas', cell: 'Duplicada' },
  { id: 'conflicts', label: 'Linhas em conflito', cell: 'Conflito' },
  {
    id: 'incomplete',
    label: 'Campos inválidos ou vazios',
    cell: 'Campo inválido ou vazio',
  },
];

function displayCell(value: unknown) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function UauQueryTable({
  columns,
  rows,
  loading,
  phoneColumn,
  assessments,
}: {
  columns?: string[];
  rows?: UauRow[];
  loading: boolean;
  phoneColumn?: string;
  assessments?: UauRowAssessment[];
}) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [filter, setFilter] = useState<UauRowStatus | 'all'>('all');
  const total = rows?.length ?? 0;
  const currentFilter = assessments ? filter : 'all';
  const { indices, counts } = useMemo(() => {
    const indices: number[] = [];
    const counts: Record<UauRowStatus, number> = {
      eligible: 0,
      invalid: 0,
      duplicates: 0,
      conflicts: 0,
      incomplete: 0,
    };
    for (let index = 0; index < total; index++) {
      const status = assessments?.[index]?.status;
      if (status) counts[status]++;
      if (currentFilter === 'all' || currentFilter === status)
        indices.push(index);
    }
    return { indices, counts };
  }, [total, assessments, currentFilter]);
  const pages = Math.max(1, Math.ceil(indices.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const start = currentPage * pageSize;
  const visibleIndices = indices.slice(start, start + pageSize);

  return (
    <section
      aria-label="Resultados da consulta"
      aria-busy={loading}
      className="bg-muted/50 min-w-0 overflow-hidden rounded-xl border"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Table2 className="text-muted-foreground size-4" aria-hidden="true" />{' '}
          Resultados da consulta
        </h3>
        {rows && (
          <span role="status" className="text-muted-foreground text-xs">
            {number.format(total)} registros ·{' '}
            {number.format(columns?.length ?? 0)} colunas
          </span>
        )}
      </header>
      {assessments && (
        <div
          role="group"
          aria-label="Filtrar pelo resultado da validação"
          className="flex flex-wrap gap-2 border-b p-3"
        >
          {[
            { id: 'all' as const, label: 'Todos os registros', count: total },
            ...statuses.map(({ id, label }) => ({
              id,
              label,
              count: counts[id],
            })),
          ].map(({ id, label, count }) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={currentFilter === id ? 'secondary' : 'outline'}
              aria-pressed={currentFilter === id}
              onClick={() => {
                setFilter(id);
                setPage(0);
              }}
            >
              {label}{' '}
              <span className="tabular-nums">{number.format(count)}</span>
            </Button>
          ))}
        </div>
      )}
      {loading && (
        <p
          role="status"
          className="text-muted-foreground flex items-center gap-2 border-b px-4 py-3 text-sm"
        >
          <Loader2
            className="text-primary size-4 motion-safe:animate-spin"
            aria-hidden="true"
          />
          Consultando o UAU…
        </p>
      )}
      {total > 0 && rows && columns?.length ? (
        <>
          <div
            tabIndex={0}
            aria-label="Tabela rolável de registros UAU"
            role="region"
            className="focus-visible:outline-inset focus-visible:outline-ring max-h-[55vh] overflow-auto focus-visible:outline-2"
          >
            <table className="w-max min-w-full border-separate border-spacing-0 text-left text-sm">
              <thead className="bg-muted sticky top-0 z-10">
                <tr>
                  <th
                    scope="col"
                    className="text-muted-foreground border-b px-4 py-2.5 text-xs"
                  >
                    Linha
                  </th>
                  {assessments && (
                    <th scope="col" className="border-b px-4 py-2.5">
                      Validação
                    </th>
                  )}
                  {columns.map((column) => (
                    <th
                      scope="col"
                      key={column}
                      className={cn(
                        'border-b px-4 py-2.5 font-medium whitespace-nowrap',
                        column === phoneColumn &&
                          'bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100'
                      )}
                    >
                      {column}
                      {column === phoneColumn && (
                        <span className="ml-2 text-xs">WhatsApp</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleIndices.length === 0 && (
                  <tr>
                    <td
                      colSpan={columns.length + (assessments ? 2 : 1)}
                      className="text-muted-foreground px-4 py-10"
                    >
                      Nenhum registro neste filtro.
                    </td>
                  </tr>
                )}
                {visibleIndices.map((index) => (
                  <tr key={index} className="bg-card/60 even:bg-card/30">
                    <th
                      scope="row"
                      className="text-muted-foreground border-b px-4 py-2 align-top text-xs font-normal tabular-nums"
                    >
                      {index + 1}
                    </th>
                    {assessments && (
                      <td className="w-72 max-w-80 min-w-64 border-b px-4 py-2 align-top">
                        <span className="block text-xs font-semibold">
                          {
                            statuses.find(
                              ({ id }) => id === assessments[index]?.status
                            )?.cell
                          }
                        </span>
                        <span className="text-muted-foreground block text-xs">
                          {assessments[index]?.reason}
                        </span>
                      </td>
                    )}
                    {columns.map((column) => (
                      <td
                        key={column}
                        className={cn(
                          'max-w-72 border-b px-4 py-2 align-top wrap-anywhere whitespace-pre-wrap',
                          column === phoneColumn &&
                            'bg-emerald-500/12 font-medium'
                        )}
                      >
                        {displayCell(rows[index][column])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="text-muted-foreground flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs">
            <span>
              {indices.length ? (
                <>
                  {number.format(start + 1)}–
                  {number.format(start + visibleIndices.length)} de{' '}
                  {number.format(indices.length)} registros
                </>
              ) : (
                '0 registros neste filtro'
              )}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2">
                Linhas por página
                <select
                  className="bg-background rounded-md border px-2 py-1"
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(0);
                  }}
                >
                  <option>25</option>
                  <option>50</option>
                  <option>100</option>
                </select>
              </label>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Página anterior"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                <ChevronLeft />
              </Button>
              <span>
                {number.format(currentPage + 1)} de {number.format(pages)}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Próxima página"
                disabled={currentPage + 1 >= pages}
                onClick={() => setPage(currentPage + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </footer>
        </>
      ) : (
        <p
          role="status"
          className="text-muted-foreground grid min-h-48 place-items-center px-4 text-center text-sm"
        >
          {loading
            ? null
            : rows
              ? 'A consulta não retornou registros.'
              : 'Execute a consulta para ver os registros aqui.'}
        </p>
      )}
    </section>
  );
}
