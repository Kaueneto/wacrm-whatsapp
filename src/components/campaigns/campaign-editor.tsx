'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import type { MessageTemplate } from '@/types';
import type { AudienceConfig } from '@/lib/broadcast-audience';
import type {
  CampaignSchedule,
  CrmCampaignDraft,
  VariableMapping,
} from '@/lib/campaigns/definition';
import { Step1ChooseTemplate } from '@/components/broadcasts/step1-choose-template';
import { Step2SelectAudience } from '@/components/broadcasts/step2-select-audience';
import { Step3Personalize } from '@/components/broadcasts/step3-personalize';
import { CampaignDepartmentSelect } from '@/components/broadcasts/campaign-department-select';
import { CampaignScheduleFields } from '@/components/campaigns/campaign-schedule-fields';
import { CampaignSenderField } from '@/components/campaigns/campaign-sender-field';
import { UauCampaignPreview } from '@/components/campaigns/uau-campaign-preview';
import { Button } from '@/components/ui/button';
import { PageNavigation } from '@/components/ui/page-navigation';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { validateDefinition } from '@/lib/campaigns/definition';
import { validateSchedule } from '@/lib/campaigns/schedule';
import { extractTemplateVariables } from '@/lib/whatsapp/template-validators';
import type {
  UauCampaignDraft,
  UauDraftAudience,
} from '@/lib/uau/campaign-draft';

export function CampaignEditor({
  draft,
  initialTab = 'audience',
}: {
  draft?: UauCampaignDraft | CrmCampaignDraft;
  initialTab?: 'audience' | 'schedule';
}) {
  const router = useRouter();
  const crmDraft = draft && 'source' in draft ? draft : undefined;
  const uauDraft = draft && !('source' in draft) ? draft : undefined;
  const [tab, setTab] = useState<string>(initialTab);
  const [exclusionsContainer, setExclusionsContainer] =
    useState<HTMLElement | null>(null);
  const [name, setName] = useState(draft?.name ?? '');
  const [description, setDescription] = useState(draft?.description ?? '');
  const [departmentId, setDepartmentId] = useState<string | null>(
    draft?.departmentId ?? null
  );
  const [template, setTemplate] = useState<MessageTemplate | null>(
    draft?.template ?? null
  );
  const [catalog, setCatalog] = useState<{
    templates: MessageTemplate[];
    loading: boolean;
    error: string | null;
  }>({ templates: [], loading: true, error: null });
  useEffect(() => {
    const controller = new AbortController();
    async function loadCatalog() {
      try {
        const response = await fetch('/api/campaigns/templates', {
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (!controller.signal.aborted)
          setCatalog({
            templates: data.templates,
            loading: false,
            error: null,
          });
      } catch (error) {
        if (!controller.signal.aborted)
          setCatalog({
            templates: [],
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : 'Falha ao carregar os templates do canal.',
          });
      }
    }
    void loadCatalog();
    return () => controller.abort();
  }, []);
  const selectedTemplateAvailable = catalog.templates.some(
    ({ id }) => id === template?.id
  );
  const [audience, setAudience] = useState<AudienceConfig>(crmDraft?.definition.audience ?? {
    type: 'all',
    excludeTagIds: uauDraft?.audience.excludeTagIds,
  });
  const [audienceSource, setAudienceSource] = useState<'crm' | 'uau'>(
    uauDraft ? 'uau' : 'crm'
  );
  const [variables, setVariables] = useState<Record<string, VariableMapping>>(
    crmDraft?.definition.variables ?? {}
  );
  const [media, setMedia] = useState(crmDraft?.definition.headerMediaUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(draft?.active ?? false);
  const [scheduleEnabled, setScheduleEnabled] = useState(
    Boolean(draft?.schedule)
  );
  const [schedule, setSchedule] = useState<CampaignSchedule>(
    draft?.schedule ?? {
      kind: 'once',
      days: 1,
      time: '09:00',
      timezone: 'America/Sao_Paulo',
      startDate: new Date().toLocaleDateString('en-CA'),
    }
  );
  async function saveUauCampaign(uauAudience: UauDraftAudience) {
    if (busy) return;
    if (!name.trim() || !template) {
      toast.error('Informe o título e escolha o template.');
      return;
    }
    if (template.id !== uauDraft?.template?.id && !selectedTemplateAvailable) {
      setTab('audience');
      toast.error(
        'Escolha um template aprovado disponível para o canal conectado.'
      );
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/campaigns/uau-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: uauDraft?.id,
          name,
          description,
          templateId: template.id,
          departmentId,
          audience: { ...uauAudience, excludeTagIds: audience.excludeTagIds },
          schedule: scheduleEnabled ? schedule : null,
          active: scheduleEnabled && active,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      toast.custom(
        () => (
          <div className="bg-popover text-popover-foreground flex w-full items-center gap-3 rounded-xl border border-l-4 border-emerald-500/40 border-l-emerald-500 p-4 shadow-xl">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
              <Check className="size-5" aria-hidden="true" />
            </span>
            <p className="min-w-0 text-sm font-semibold wrap-anywhere">
              Consulta {name.trim()} salva com sucesso.
            </p>
          </div>
        ),
        { duration: 5000 }
      );
      router.replace(`/campaigns/${data.id}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Falha ao salvar a campanha.'
      );
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (audienceSource === 'uau') return;
    const templateId = template?.id ?? crmDraft?.definition.templateId;
    if (!name.trim() || !templateId) {
      toast.error('Informe o título e escolha o template.');
      return;
    }
    if (templateId !== crmDraft?.definition.templateId && !selectedTemplateAvailable) {
      setTab('audience');
      toast.error(
        'Escolha um template aprovado disponível para o canal conectado.'
      );
      return;
    }
    try {
      validateDefinition({
        templateId,
        audience,
        variables,
        headerMediaUrl: media,
      });
    } catch (error) {
      setTab('audience');
      toast.error(
        error instanceof Error ? error.message : 'Confira o público.'
      );
      return;
    }
    const missing = extractTemplateVariables(template?.body_text ?? '').filter(
      (placeholder) =>
        !variables[placeholder.replace(/^\{\{|\}\}$/g, '')]?.value.trim()
    );
    if (missing.length) {
      setTab('audience');
      toast.error('Preencha as variáveis: ' + missing.join(', '));
      return;
    }
    if (['image', 'video', 'document'].includes(template?.header_type ?? '')) {
      try {
        const url = new URL(media);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      } catch {
        setTab('audience');
        toast.error('Informe uma URL válida para a mídia do template.');
        return;
      }
    }
    try {
      if (scheduleEnabled) validateSchedule(schedule);
    } catch (error) {
      setTab('schedule');
      toast.error(
        error instanceof Error ? error.message : 'Confira a programação.'
      );
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(crmDraft ? `/api/campaigns/${crmDraft.id}` : '/api/campaigns', {
        method: crmDraft ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          departmentId,
          active: scheduleEnabled && active,
          schedule: scheduleEnabled ? schedule : null,
          definition: {
            templateId,
            audience,
            variables,
            headerMediaUrl: media,
          },
        }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      if (crmDraft) {
        toast.success('Campanha atualizada.');
        router.replace(`/campaigns/${b.id}`);
      } else {
        router.push(`/campaigns/${b.id}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar.');
    } finally {
      setBusy(false);
    }
  }
  const templatePicker = (
    <section
      aria-label="Template da campanha"
      className="bg-card min-w-0 rounded-xl border p-4 sm:p-5"
    >
      <Step1ChooseTemplate
        connectedCatalog={catalog}
        title="Template"
        layout={audienceSource === 'uau' ? 'list' : 'grid'}
        selectedTemplate={template}
        onSelect={(next) => {
          if (next.id !== template?.id) {
            setVariables({});
            setMedia(next.header_media_url ?? '');
          }
          setTemplate(next);
        }}
        showNavigation={false}
      />
    </section>
  );

  return (
    <div className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-4 mx-auto w-full min-w-0 space-y-6 motion-safe:duration-300">
      <PageNavigation
        backHref={draft ? `/campaigns/${draft.id}` : '/campaigns'}
        backLabel={draft ? 'Voltar à campanha' : 'Voltar às campanhas'}
        backDisabled={busy}
        items={[
          { label: 'Campanhas', href: '/campaigns' },
          ...(draft ? [{ label: draft.name, href: `/campaigns/${draft.id}` }] : []),
          { label: draft ? 'Editar campanha' : 'Nova campanha' },
        ]}
      />
      <h1 className="text-2xl font-bold">
        {draft ? 'Editar campanha' : 'Cadastrar nova campanha'}
      </h1>
      {draft && <p className="text-muted-foreground text-sm">As alterações valem para os próximos disparos. O histórico mantém os dados de cada envio.</p>}

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(String(value))}
        className="min-w-0 gap-0"
      >
        <div className="min-w-0 overflow-x-auto border-b pb-1">
          <TabsList
            aria-label="Configurações da campanha"
            variant="line"
            className="h-10 justify-start gap-4"
          >
            <TabsTrigger value="audience" className="px-3">
              Cadastrar
            </TabsTrigger>
            <TabsTrigger value="schedule" className="px-3">
              Agendamento
            </TabsTrigger>
            <TabsTrigger value="exceptions" className="px-3">
              Exceções
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="audience" keepMounted className="min-w-0">
          <div className="space-y-5 pt-5">
            <section
              aria-label="Identificação da campanha"
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(10rem,1fr)_minmax(10rem,1fr)_minmax(12rem,1.6fr)_minmax(7rem,.55fr)]"
            >
              <label className="block min-w-0 space-y-1.5">
                <span>Origem da integração</span>
                <select
                  className="border-border bg-background block h-9 w-full rounded-lg border px-3"
                  value={audienceSource}
                  disabled={!!draft}
                  onChange={(event) =>
                    setAudienceSource(
                      event.target.value === 'uau' ? 'uau' : 'crm'
                    )
                  }
                >
                  <option value="crm">Contatos do CRM ou arquivo (CSV ou Excel)</option>
                  <option value="uau">Consulta do UAU</option>
                </select>
              </label>
              <label className="block min-w-0 space-y-1.5">
                <span>Título</span>
                <Input
                  className="h-9"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Cobrança — Empreendimento A"
                />
              </label>
              <label className="block min-w-0 space-y-1.5">
                <span>Descrição e objetivo</span>
                <textarea
                  rows={1}
                  className="border-border bg-background min-h-9 w-full rounded-lg border px-3 py-2 text-sm"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
              <CampaignSenderField />
            </section>
            <div hidden={audienceSource !== 'uau'}>
              <UauCampaignPreview
                template={template}
                initialAudience={uauDraft?.audience}
                onSave={(value) => void saveUauCampaign(value)}
                saving={busy}
              >
                {audienceSource === 'uau' && templatePicker}
              </UauCampaignPreview>
            </div>
            <div hidden={audienceSource !== 'crm'}>
              <div className="space-y-5">
                <section
                  aria-label="Público da campanha"
                  className="bg-card rounded-xl border p-4 sm:p-5"
                >
                  <Step2SelectAudience
                    audience={audience}
                    onUpdate={setAudience}
                    showNavigation={false}
                    exclusionsContainer={exclusionsContainer}
                  />
                </section>
                {audienceSource === 'crm' && templatePicker}
                {template && (
                  <section
                    aria-label="Personalização da mensagem"
                    className="bg-card min-w-0 rounded-xl border p-4 sm:p-5"
                  >
                    <Step3Personalize
                      key={template.id}
                      template={template}
                      variables={variables}
                      onUpdate={setVariables}
                      headerMediaUrl={media}
                      onHeaderMediaUrlChange={setMedia}
                      showNavigation={false}
                    />
                  </section>
                )}
              </div>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="schedule" keepMounted className="min-w-0">
          <section className="bg-card mt-5 space-y-5 rounded-xl border p-4 sm:p-5">
            <header>
              <h2 className="text-lg font-semibold">Agendamento</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Ative o envio automático ou execute a campanha manualmente pela
                lista.
              </p>
            </header>
            <fieldset disabled={busy} className="space-y-5">
              <CampaignDepartmentSelect
                value={departmentId}
                onChange={setDepartmentId}
                disabled={busy}
              />
              <CampaignScheduleFields
                enabled={scheduleEnabled}
                active={active}
                disabled={busy}
                schedule={schedule}
                onEnabledChange={(enabled) => {
                  setScheduleEnabled(enabled);
                  setActive(enabled);
                }}
                onActiveChange={setActive}
                onScheduleChange={setSchedule}
              />
            </fieldset>
          </section>
        </TabsContent>
        <TabsContent value="exceptions" keepMounted className="min-w-0">
          <section className="mt-5 space-y-4">
            <h2 className="text-lg font-semibold">Exceções</h2>
            {audienceSource === 'uau' && (
              <p className="bg-card text-muted-foreground rounded-xl border p-4 text-sm">
                As etiquetas excluem contatos do disparo. A prévia mostra os
                registros retornados pelo UAU.
              </p>
            )}
            <div ref={setExclusionsContainer} />
          </section>
        </TabsContent>
      </Tabs>

      {audienceSource === 'uau' ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-muted-foreground text-sm">
            {active && scheduleEnabled
              ? 'Envios automáticos conforme o agendamento.'
              : 'Execução manual pela lista de campanhas.'}
          </p>
          <Button type="submit" form="uau-campaign-save" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar campanha'}
          </Button>
        </div>
      ) : (
        <section
          aria-label="Resumo da campanha"
          className="bg-card min-w-0 space-y-4 rounded-xl border p-4 sm:p-5"
        >
          <div className="space-y-1 text-sm wrap-anywhere">
            <p>
              Template <strong>{template?.display_name ?? template?.name ?? 'Não selecionado'}</strong>
            </p>
            <p>
              Público{' '}
              {audience.type === 'csv'
                ? `${audience.csvContacts?.length ?? 0} contatos importados`
                : audience.type === 'tags'
                  ? 'Etiquetas selecionadas'
                  : audience.type === 'custom_field'
                    ? 'Filtro de campo'
                    : 'Todos os contatos'}
            </p>
            <p>
              Programação{' '}
              {scheduleEnabled && active
                ? 'ativa ao salvar'
                : 'desativada, com execução manual disponível'}
            </p>
            <p className="text-muted-foreground">
              O público será recalculado em cada execução, com lista e variáveis
              preservadas no disparo.
            </p>
          </div>
          <div className="flex justify-end border-t pt-4">
            <Button onClick={() => void save()} disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar campanha'}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
