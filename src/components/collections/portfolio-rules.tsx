'use client';

import { useMemo, useState } from 'react';
import { GitBranch, Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  parsePortfolioSetup,
  stageRange,
  type PortfolioSetup,
} from '@/lib/collections/setup';
import {
  newRuleDraft,
  removeRule,
  ruleDraft,
  saveRuleDraft,
  type RuleDraft,
} from '@/lib/collections/rules';
import { UauProjectPicker, useUauProjectCatalog } from './uau-project-picker';
import { RuleJourney } from './rule-journey';

const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');

export function PortfolioRules({
  setup,
  onSaved,
  disabled,
}: {
  setup: PortfolioSetup;
  onSaved: (setup: PortfolioSetup) => void;
  disabled: boolean;
}) {
  const catalog = useUauProjectCatalog();
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState('all');
  const [page, setPage] = useState(0);
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [selectedStage, setSelectedStage] = useState('');
  const [deleting, setDeleting] = useState<RuleDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const rows = useMemo(
    () =>
      disabled
        ? []
        : [
            ruleDraft(setup),
            ...[...setup.projectRules]
              .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
              .map((rule) => ruleDraft(setup, rule)),
          ],
    [disabled, setup]
  );
  const companyNames = useMemo(
    () =>
      new Map(
        catalog.catalog?.companies.map((company) => [
          company.code,
          company.name,
        ]) ?? []
      ),
    [catalog.catalog]
  );
  const workNames = useMemo(
    () =>
      new Map(
        catalog.catalog?.works.map((work) => [
          `${work.company}|${work.code.toUpperCase()}`,
          work.name,
        ]) ?? []
      ),
    [catalog.catalog]
  );
  const matches = rows.filter((rule) => {
    const company = companyNames.get(rule.company) ?? '';
    const work =
      workNames.get(`${rule.company}|${rule.work.toUpperCase()}`) ?? '';
    return (
      (scope === 'all' ||
        (scope === 'default' ? rule.isDefault : !rule.isDefault)) &&
      fold(
        `${rule.name} ${rule.company}|${rule.work} ${company} ${work}`
      ).includes(fold(search))
    );
  });
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(matches.length / 20) - 1)
  );
  function open(rule: RuleDraft) {
    setError('');
    setDraft(rule);
    setSelectedStage(rule.stages[0]?.id ?? '');
  }
  function update(patch: Partial<RuleDraft>) {
    setDraft((previous) => (previous ? { ...previous, ...patch } : null));
    setError('');
  }
  const invalidStages =
    !!draft &&
    draft.stages.some(
      (stage, index) =>
        !stage.name.trim() ||
        !Number.isInteger(stage.fromDay) ||
        stage.fromDay < 1 ||
        stage.fromDay > 36500 ||
        (index > 0 && stage.fromDay <= draft.stages[index - 1].fromDay)
    );
  const activeStage = draft?.stages.find((stage) => stage.id === selectedStage);
  async function persist(change: (latest: PortfolioSetup) => PortfolioSetup) {
    setSaving(true);
    setError('');
    try {
      // Merge the edited rule into the latest settings, preserving scope,
      // queries, schedules and unrelated rules saved by another administrator.
      const current = await fetch('/api/integrations/uau/portfolio-settings', {
        cache: 'no-store',
      });
      const body = await current.json();
      if (!current.ok)
        throw new Error(body.error || 'Falha ao carregar as réguas salvas.');
      const latest = body.settings
        ? parsePortfolioSetup(body.settings.setup)
        : setup;
      const payload = change(latest);
      const response = await fetch('/api/integrations/uau/portfolio-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || 'Não foi possível salvar a régua.');
      onSaved(payload);
      setDraft(null);
      setDeleting(null);
      toast.success('Réguas atualizadas.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Falha ao salvar.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap gap-3">
            <div className="relative min-w-52 flex-1 sm:max-w-sm">
              <Search className="text-muted-foreground absolute top-3 left-3 size-4" />
              <Input
                aria-label="Buscar régua por nome, empresa ou obra"
                placeholder="Buscar régua, empresa ou obra…"
                className="h-10 pl-9"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
              />
            </div>
            <select
              aria-label="Filtrar abrangência das réguas"
              className="border-input bg-background h-10 rounded-xl border px-3 text-sm"
              value={scope}
              onChange={(e) => {
                setScope(e.target.value);
                setPage(0);
              }}
            >
              <option value="all">Todas as abrangências</option>
              <option value="default">Padrão geral</option>
              <option value="project">Empresa e obra</option>
            </select>
          </div>
          <Button
            className="h-10"
            disabled={disabled}
            onClick={() => open(newRuleDraft(setup))}
          >
            <Plus className="size-4" />
            Nova régua
          </Button>
        </div>
        <section className="border-border bg-card overflow-hidden rounded-xl border">
          <div className="border-border flex items-center justify-between gap-3 border-b px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-medium">
              <GitBranch className="text-primary size-4" />
              Réguas salvas
            </span>
            <span className="text-muted-foreground text-xs">
              {disabled ? 'Carregando…' : `${rows.length} régua(s)`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-muted/30 text-muted-foreground text-xs">
                <tr>
                  {[
                    'Nome',
                    'Abrangência',
                    'Empresa | Obra',
                    'Etapas',
                    'Início',
                    '',
                  ].map((title) => (
                    <th key={title} className="px-4 py-3 font-medium">
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matches
                  .slice(currentPage * 20, currentPage * 20 + 20)
                  .map((rule) => (
                    <tr
                      key={rule.id}
                      tabIndex={0}
                      aria-label={`Detalhes de ${rule.name}`}
                      onClick={() => open(rule)}
                      onKeyDown={(event) => {
                        if (
                          event.target === event.currentTarget &&
                          ['Enter', ' '].includes(event.key)
                        ) {
                          event.preventDefault();
                          open(rule);
                        }
                      }}
                      className="border-border hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:ring-primary/40 cursor-pointer border-t outline-none focus-visible:ring-2 focus-visible:ring-inset"
                    >
                      <td className="px-4 py-4 font-medium">{rule.name}</td>
                      <td className="px-4 py-4">
                        <span
                          className={
                            rule.isDefault
                              ? 'bg-primary/10 text-primary rounded-full px-2 py-1 text-[11px]'
                              : 'bg-muted text-muted-foreground rounded-full px-2 py-1 text-[11px]'
                          }
                        >
                          {rule.isDefault ? 'Padrão geral' : 'Empresa e obra'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-xs">
                        {rule.isDefault ? (
                          <span className="text-muted-foreground">
                            Sem régua específica
                          </span>
                        ) : (
                          <>
                            <code>
                              {rule.company}|{rule.work}
                            </code>
                            <p className="text-muted-foreground mt-1 max-w-64 truncate">
                              {catalog.catalog?.works.find(
                                (item) =>
                                  item.company === rule.company &&
                                  item.code.toUpperCase() ===
                                    rule.work.toUpperCase()
                              )?.name ?? ''}
                            </p>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-4 tabular-nums">
                        {rule.stages.length}
                      </td>
                      <td className="px-4 py-4 text-xs whitespace-nowrap">
                        Dia {rule.stages[0]?.fromDay}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Editar ${rule.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              open(rule);
                            }}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          {!rule.isDefault && (
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`Excluir ${rule.name}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                setError('');
                                setDeleting(rule);
                              }}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                {!matches.length && (
                  <tr>
                    <td
                      colSpan={6}
                      className="text-muted-foreground p-10 text-center text-sm"
                    >
                      {disabled ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="size-4 animate-spin" />
                          Carregando réguas salvas…
                        </span>
                      ) : (
                        'Nenhuma régua encontrada para esses filtros.'
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="border-border flex items-center justify-between gap-3 border-t px-4 py-3 text-xs">
            <span className="text-muted-foreground">
              {matches.length} resultado(s)
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                Anterior
              </Button>
              <span className="text-muted-foreground">
                {currentPage + 1} /{' '}
                {Math.max(1, Math.ceil(matches.length / 20))}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={(currentPage + 1) * 20 >= matches.length}
                onClick={() => setPage(currentPage + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </section>
      </div>
      <Dialog
        open={!!draft}
        onOpenChange={(next) => {
          if (!next && !saving) setDraft(null);
        }}
      >
        <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1160px,94vw)]">
          <DialogHeader className="border-border shrink-0 border-b px-6 py-5 pr-12">
            <DialogTitle>
              {draft?.isNew ? 'Nova régua' : 'Detalhes da régua'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Edite as etapas e acompanhe a prévia visual antes de salvar.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="grid min-h-0 gap-5 overflow-y-auto p-5 lg:grid-cols-2">
              <fieldset disabled={saving} className="min-w-0 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="rule-name">Nome da régua</Label>
                  <Input
                    id="rule-name"
                    value={draft.name}
                    maxLength={80}
                    disabled={draft.isDefault}
                    placeholder="Ex.: Cobrança Porto Seguro"
                    onChange={(e) => update({ name: e.target.value })}
                  />
                </div>
                {!draft.isDefault && (
                  <UauProjectPicker
                    value={{ company: draft.company, work: draft.work }}
                    onChange={(project) => update(project)}
                  />
                )}
                <div className="flex items-center justify-between gap-2 pt-2">
                  <h3 className="text-sm font-semibold">
                    Etapas{' '}
                    <span className="text-muted-foreground font-normal">
                      ({draft.stages.length}/10)
                    </span>
                  </h3>
                  <span className="text-muted-foreground text-[10px]">
                    Dias em ordem crescente
                  </span>
                </div>
                <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
                  {draft.stages.map((stage, index) => (
                    <div
                      key={stage.id}
                      className={
                        selectedStage === stage.id
                          ? 'border-primary/30 bg-primary/5 rounded-xl border p-3'
                          : 'border-border bg-muted/10 rounded-xl border p-3'
                      }
                    >
                      <div className="flex items-end gap-2">
                        <span className="text-muted-foreground mb-2 text-xs tabular-nums">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <div className="min-w-0 flex-1 space-y-1">
                          <Label
                            className="text-[11px]"
                            htmlFor={`rule-stage-${stage.id}`}
                          >
                            Nome da etapa
                          </Label>
                          <Input
                            id={`rule-stage-${stage.id}`}
                            maxLength={80}
                            value={stage.name}
                            onFocus={() => setSelectedStage(stage.id)}
                            onChange={(e) =>
                              update({
                                stages: draft.stages.map((item) =>
                                  item.id === stage.id
                                    ? { ...item, name: e.target.value }
                                    : item
                                ),
                              })
                            }
                          />
                        </div>
                        <div className="w-24 shrink-0 space-y-1">
                          <Label
                            className="text-[11px]"
                            htmlFor={`rule-day-${stage.id}`}
                          >
                            A partir do dia
                          </Label>
                          <Input
                            id={`rule-day-${stage.id}`}
                            type="number"
                            min={1}
                            max={36500}
                            value={stage.fromDay || ''}
                            onFocus={() => setSelectedStage(stage.id)}
                            onChange={(e) =>
                              update({
                                stages: draft.stages.map((item) =>
                                  item.id === stage.id
                                    ? {
                                        ...item,
                                        fromDay: Number(e.target.value),
                                      }
                                    : item
                                ),
                              })
                            }
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remover etapa ${stage.name}`}
                          disabled={draft.stages.length === 1}
                          onClick={() => {
                            const stages = draft.stages.filter(
                              (item) => item.id !== stage.id
                            );
                            update({ stages });
                            if (selectedStage === stage.id)
                              setSelectedStage(stages[0].id);
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={draft.stages.length >= 10}
                  onClick={() => {
                    const stage = {
                      id: `stage-${crypto.randomUUID()}`,
                      name: 'Nova etapa',
                      fromDay: (draft.stages.at(-1)?.fromDay ?? 0) + 10,
                    };
                    update({ stages: [...draft.stages, stage] });
                    setSelectedStage(stage.id);
                  }}
                >
                  <Plus className="size-3.5" />
                  Adicionar etapa
                </Button>
                {invalidStages && (
                  <p
                    role="status"
                    className="text-xs text-amber-700 dark:text-amber-300"
                  >
                    Preencha os nomes e informe dias diferentes em ordem
                    crescente.
                  </p>
                )}
              </fieldset>
              <section className="border-primary/15 bg-card relative min-w-0 self-start overflow-hidden rounded-2xl border lg:sticky lg:top-0">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,var(--primary-soft-2),transparent_70%)]"
                />
                <div className="relative px-5 pt-5">
                  <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.15em] uppercase">
                    Prévia do fluxo
                  </p>
                  <h3 className="mt-2 text-lg font-semibold">
                    {draft.name || 'Nova régua'}
                  </h3>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {draft.isDefault
                      ? 'Padrão geral'
                      : draft.company && draft.work
                        ? `${draft.company}|${draft.work}`
                        : 'Selecione a empresa e a obra'}
                  </p>
                </div>
                <RuleJourney
                  stages={draft.stages}
                  mode="editor"
                  currentStageId={selectedStage}
                  selectedStageId={selectedStage}
                  onSelect={setSelectedStage}
                />
                {activeStage && (
                  <div className="border-border bg-muted/20 border-t px-5 py-4">
                    <p className="text-primary text-[10px] font-semibold uppercase">
                      Etapa em edição
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {activeStage.name || 'Nova etapa'}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {invalidStages
                        ? 'Ajuste os dias para concluir o fluxo.'
                        : stageRange(
                            draft.stages,
                            draft.stages.findIndex(
                              (stage) => stage.id === activeStage.id
                            )
                          )}
                    </p>
                  </div>
                )}
              </section>
            </div>
          )}
          <div className="border-border bg-muted/20 shrink-0 border-t px-5 py-4">
            {error && (
              <p role="alert" className="text-destructive mb-3 text-xs">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => setDraft(null)}
              >
                Cancelar
              </Button>
              <Button
                disabled={
                  saving ||
                  disabled ||
                  invalidStages ||
                  !draft ||
                  (!draft.isDefault &&
                    (!draft.name.trim() || !draft.company || !draft.work))
                }
                onClick={() => {
                  if (draft)
                    void persist((latest) => saveRuleDraft(latest, draft));
                }}
              >
                {saving && <Loader2 className="size-4 animate-spin" />}Salvar
                régua
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deleting}
        onOpenChange={(next) => {
          if (!next && !saving) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir régua?</DialogTitle>
            <DialogDescription>
              {deleting?.name}. A empresa e obra passarão a seguir a régua
              padrão.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-destructive text-xs">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => setDeleting(null)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={saving}
              onClick={() => {
                if (deleting)
                  void persist((latest) => removeRule(latest, deleting));
              }}
            >
              {saving && <Loader2 className="size-4 animate-spin" />}Excluir
              régua
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
