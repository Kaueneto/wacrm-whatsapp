'use client';
import { useId, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ListFilter,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useUauProjectCatalog } from '@/hooks/use-uau-project-catalog';
export { useUauProjectCatalog } from '@/hooks/use-uau-project-catalog';
import type { ProjectKey, PortfolioSetup } from '@/lib/collections/setup';
import glass from '@/components/ui/morph-menu.module.css';
import { cn } from '@/lib/utils';
const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
interface Choice {
  value: string;
  label: string;
  note?: string;
}
export function UauSearchChoice({
  label,
  placeholder,
  value,
  choices,
  loading = false,
  error = '',
  disabled,
  onOpen = () => {},
  onChange,
  refresh,
}: {
  label: string;
  placeholder: string;
  value: string;
  choices: Choice[];
  loading?: boolean;
  error?: string;
  disabled?: boolean;
  onOpen?: () => void;
  refresh?: () => void;
  onChange: (value: string) => void;
}) {
  const labelId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState('');
  const current = choices.find((c) => c.value === value);
  const filtered = choices.filter((c) =>
    fold(c.value + ' ' + c.label).includes(fold(search))
  );
  return (
    <div className="min-w-0">
      <p id={labelId} className="text-foreground/80 mb-1 text-xs font-medium">
        {label}
      </p>
      {/* Focus guards mount beside the trigger when open. Keep them inside a
          fixed-height slot so sibling spacing cannot move the form controls. */}
      <div className="relative h-10">
        <Popover
          modal={false}
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (next) {
              setSearch('');
              onOpen();
            }
          }}
        >
          <PopoverTrigger
            aria-labelledby={labelId}
            disabled={disabled}
            render={
              <Button
                variant="outline"
                className="border-border bg-background hover:bg-muted/40 disabled:bg-muted/60 h-10 w-full min-w-0 justify-between gap-2 rounded-xl px-3 text-left font-normal shadow-sm transition-colors active:not-aria-[haspopup]:translate-y-0 disabled:shadow-none"
              />
            }
          >
            <ListFilter className="text-muted-foreground size-3.5 shrink-0" />
            <span
              className={cn(
                'min-w-0 flex-1 truncate',
                !value && 'text-muted-foreground'
              )}
            >
              {value && (
                <code className="mr-2 font-mono text-blue-700 dark:text-sky-300">
                  {value}
                </code>
              )}
              {current?.label ??
                (value
                  ? 'Carregar descrição'
                  : loading
                    ? 'Carregando…'
                    : placeholder)}
            </span>
            {loading ? (
              <Loader2 className="text-muted-foreground size-3.5 shrink-0 animate-spin" />
            ) : (
              <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
            )}
          </PopoverTrigger>
          <PopoverContent
            align="start"
            initialFocus={() => {
              searchRef.current?.focus({ preventScroll: true });
              return false;
            }}
            className={cn(
              glass.glass,
              'w-[min(420px,calc(100vw-2rem))] space-y-2 rounded-xl p-2 data-closed:animate-none data-open:animate-none'
            )}
          >
            <div className="relative">
              <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-3.5" />
              <Input
                ref={searchRef}
                aria-label={`Buscar ${label.toLowerCase()}`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Código ou descrição…"
                className={cn('pl-8', refresh && 'pr-10')}
              />
              {refresh && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-0.5 right-0.5"
                  disabled={loading}
                  aria-label="Atualizar empresas e obras"
                  onClick={refresh}
                >
                  <RefreshCw className="size-3.5" />
                </Button>
              )}
            </div>
            {loading ? (
              <p className="text-muted-foreground flex items-center gap-2 p-2 text-xs">
                <Loader2 className="size-3 animate-spin" />
                Consultando UAU…
              </p>
            ) : error ? (
              <p role="alert" className="text-destructive p-2 text-xs">
                {error}
                {refresh && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2 block"
                    onClick={refresh}
                  >
                    Tentar novamente
                  </Button>
                )}
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                {filtered.slice(0, 100).map((choice) => (
                  <button
                    type="button"
                    key={choice.value}
                    onClick={() => {
                      onChange(choice.value);
                      setOpen(false);
                    }}
                    className="hover:bg-muted focus-visible:outline-ring flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm focus-visible:outline-2"
                  >
                    <span className="flex-1">
                      <code className="mr-2 font-mono text-xs text-blue-700 dark:text-sky-300">
                        {choice.value}
                      </code>
                      {choice.label}
                      {choice.note && (
                        <span className="text-muted-foreground mt-0.5 block text-[10px]">
                          {choice.note}
                        </span>
                      )}
                    </span>
                    {value === choice.value && (
                      <Check className="text-primary mt-0.5 size-3.5" />
                    )}
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="text-muted-foreground p-3 text-xs">
                    Nenhum resultado encontrado.
                  </p>
                )}
                {filtered.length > 100 && (
                  <p className="text-muted-foreground p-2 text-xs">
                    Digite mais para refinar os resultados.
                  </p>
                )}
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
export function UauProjectPicker({
  value,
  onChange,
}: {
  value: ProjectKey;
  onChange: (value: ProjectKey) => void;
}) {
  const resource = useUauProjectCatalog();
  return (
    <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
      <UauSearchChoice
        label="Empresa no UAU"
        placeholder="Selecione uma empresa"
        value={value.company}
        choices={
          resource.catalog?.companies.map((c) => ({
            value: c.code,
            label: c.name,
          })) ?? []
        }
        {...resource}
        onOpen={resource.load}
        onChange={(company) => onChange({ company, work: '' })}
      />
      <UauSearchChoice
        label="Obra no UAU"
        placeholder={
          value.company ? 'Selecione uma obra' : 'Selecione a empresa primeiro'
        }
        value={value.work}
        disabled={!value.company}
        choices={
          resource.catalog?.works
            .filter((w) => w.company === value.company)
            .map((w) => ({
              value: w.code,
              label: w.name,
              note:
                w.source === 'portfolio'
                  ? 'Encontrada na carteira importada'
                  : undefined,
            })) ?? []
        }
        {...resource}
        onOpen={resource.load}
        onChange={(work) => onChange({ ...value, work })}
      />
    </div>
  );
}
export function PortfolioCompanyExclusions({
  setup,
  onChange,
}: {
  setup: PortfolioSetup;
  onChange: (setup: PortfolioSetup) => void;
}) {
  const resource = useUauProjectCatalog();
  return (
    <div className="space-y-2">
      <UauSearchChoice
        label="Excluir empresas inteiras"
        placeholder="Selecione uma empresa"
        value=""
        choices={
          resource.catalog?.companies
            .filter((c) => !setup.excludedCompanies.includes(c.code))
            .map((c) => ({ value: c.code, label: c.name })) ?? []
        }
        {...resource}
        onOpen={resource.load}
        onChange={(company) =>
          onChange({
            ...setup,
            excludedCompanies: [...setup.excludedCompanies, company],
          })
        }
      />
      <div className="h-28 [scrollbar-gutter:stable] space-y-1 overflow-y-auto overscroll-contain">
        {setup.excludedCompanies.length === 0 && (
          <p className="text-muted-foreground p-2 text-xs">
            Nenhuma empresa excluída.
          </p>
        )}
        {setup.excludedCompanies.map((company) => (
          <div
            key={company}
            className="border-border flex items-center justify-between gap-2 rounded-lg border px-2 py-1 text-xs"
          >
            <span>
              {company} ·{' '}
              {resource.catalog?.companies.find((c) => c.code === company)
                ?.name ?? 'Empresa excluída'}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remover exclusão da empresa ${company}`}
              onClick={() =>
                onChange({
                  ...setup,
                  excludedCompanies: setup.excludedCompanies.filter(
                    (c) => c !== company
                  ),
                })
              }
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
