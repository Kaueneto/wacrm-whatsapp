'use client';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  PortfolioCompanyExclusions,
  UauProjectPicker,
} from './uau-project-picker';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { PortfolioSetup, ProjectKey } from '@/lib/collections/setup';

function ProjectList({
  title,
  rows,
  onChange,
}: {
  title: string;
  rows: ProjectKey[];
  onChange: (rows: ProjectKey[]) => void;
}) {
  const [draft, setDraft] = useState<ProjectKey>({ company: '', work: '' });
  const duplicate = rows.some(
    (row) =>
      row.company === draft.company &&
      row.work.toUpperCase() === draft.work.toUpperCase()
  );
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium">
        {title}{' '}
        <span className="text-muted-foreground font-normal">
          ({rows.length})
        </span>
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 grow basis-64">
          <UauProjectPicker value={draft} onChange={setDraft} />
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-10"
          disabled={!draft.company || !draft.work || duplicate}
          onClick={() => {
            if (!draft.company || !draft.work || duplicate) return;
            onChange([...rows, draft]);
            setDraft({ ...draft, work: '' });
          }}
        >
          <Plus className="size-3.5" />
          Adicionar
        </Button>
      </div>
      <div className="h-4">
        {duplicate && (
          <p role="status" className="text-muted-foreground text-xs">
            Esta empresa/obra já foi adicionada.
          </p>
        )}
      </div>
      {
        <div
          role="region"
          aria-label={title}
          tabIndex={0}
          className="border-border h-40 [scrollbar-gutter:stable] overflow-y-auto overscroll-contain rounded-lg border"
        >
          <table className="w-full text-left text-xs">
            <thead className="bg-card sticky top-0">
              <tr>
                <th
                  scope="col"
                  className="text-muted-foreground px-3 py-2 font-medium"
                >
                  Empresa | Obra
                </th>
                <th scope="col" className="w-10">
                  <span className="sr-only">Remover</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={2} className="text-muted-foreground px-3 py-4">
                    Nenhuma empresa/obra adicionada.
                  </td>
                </tr>
              )}
              {rows.map((row, index) => (
                <tr
                  key={`${row.company}|${row.work}|${index}`}
                  className="border-border border-t"
                >
                  <td className="px-3 py-1.5">
                    <code>
                      {row.company}|{row.work}
                    </code>
                  </td>
                  <td className="px-1 py-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remover ${row.company}|${row.work} de ${title}`}
                      onClick={() =>
                        onChange(rows.filter((_, i) => i !== index))
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
    </div>
  );
}
export function PortfolioScope({
  setup,
  onChange,
  disabled,
}: {
  setup: PortfolioSetup;
  onChange: (setup: PortfolioSetup) => void;
  disabled: boolean;
}) {
  return (
    <fieldset
      disabled={disabled}
      className="border-border bg-card @container min-w-0 space-y-4 rounded-xl border p-5"
    >
      <div>
        <h2 className="text-sm font-semibold">Escopo da carteira</h2>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
          Escolha o que importar. As exclusões sempre prevalecem.
        </p>
      </div>
      <div className="grid items-start gap-4 @min-[640px]:grid-cols-2">
        <section className="bg-muted/20 min-w-0 space-y-4 rounded-xl border p-4">
          <div>
            <h4 className="text-sm font-semibold">Incluir na carteira</h4>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="portfolio-scope-mode">Importar</Label>
            <select
              id="portfolio-scope-mode"
              className="border-input bg-background h-10 w-full min-w-0 rounded-xl border px-3 text-sm shadow-sm"
              value={setup.scope.mode}
              onChange={(e) =>
                onChange({
                  ...setup,
                  scope: {
                    ...setup.scope,
                    mode: e.target.value as 'all' | 'selected',
                  },
                })
              }
            >
              <option value="all">Todas as empresas e obras</option>
              <option value="selected">Selecionar empresas e obras</option>
            </select>
          </div>
          {setup.scope.mode === 'selected' && (
            <ProjectList
              title="Selecionadas"
              rows={setup.scope.projects}
              onChange={(projects) =>
                onChange({ ...setup, scope: { ...setup.scope, projects } })
              }
            />
          )}
        </section>
        <section className="min-w-0 space-y-4 rounded-xl border p-4">
          <div>
            <h4 className="text-sm font-semibold">Desconsiderar na cobrança</h4>
          </div>
          <PortfolioCompanyExclusions setup={setup} onChange={onChange} />
          <div className="border-border border-t pt-4">
            <ProjectList
              title="Excluir obras específicas"
              rows={setup.excludedProjects}
              onChange={(excludedProjects) =>
                onChange({ ...setup, excludedProjects })
              }
            />
          </div>
        </section>
      </div>
    </fieldset>
  );
}
