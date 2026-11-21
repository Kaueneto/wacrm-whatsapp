'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { MessageTemplate } from '@/types';
import type { AudienceConfig } from '@/lib/broadcast-audience';
import type {
  CampaignSchedule,
  VariableMapping,
} from '@/lib/campaigns/definition';
import { Step1ChooseTemplate } from '@/components/broadcasts/step1-choose-template';
import { Step2SelectAudience } from '@/components/broadcasts/step2-select-audience';
import { Step3Personalize } from '@/components/broadcasts/step3-personalize';
import { Button } from '@/components/ui/button';
import { PageNavigation } from '@/components/ui/page-navigation';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { validateDefinition } from '@/lib/campaigns/definition';
import { validateSchedule } from '@/lib/campaigns/schedule';
import { extractTemplateVariables } from '@/lib/whatsapp/template-validators';

export default function NewCampaignPage() {
  const router = useRouter();
  const [tab, setTab] = useState('audience');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [template, setTemplate] = useState<MessageTemplate | null>(null);
  const [audience, setAudience] = useState<AudienceConfig>({ type: 'all' });
  const [variables, setVariables] = useState<Record<string, VariableMapping>>(
    {}
  );
  const [media, setMedia] = useState('');
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(false);
  const [schedule, setSchedule] = useState<CampaignSchedule>({
    kind: 'once',
    days: 1,
    time: '09:00',
    timezone: 'America/Sao_Paulo',
    startDate: new Date().toLocaleDateString('en-CA'),
  });
  async function save() {
    if (!name.trim() || !template) {
      toast.error('Informe o título e escolha o template.');
      return;
    }
    try {
      validateDefinition({
        templateId: template.id,
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
    const missing = extractTemplateVariables(template.body_text ?? '').filter(
      (placeholder) =>
        !variables[placeholder.replace(/^\{\{|\}\}$/g, '')]?.value.trim()
    );
    if (missing.length) {
      setTab('personalization');
      toast.error('Preencha as variáveis: ' + missing.join(', '));
      return;
    }
    if (['image', 'video', 'document'].includes(template.header_type ?? '')) {
      try {
        const url = new URL(media);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      } catch {
        setTab('personalization');
        toast.error('Informe uma URL válida para a mídia do template.');
        return;
      }
    }
    try {
      validateSchedule(schedule);
    } catch (error) {
      setTab('schedule');
      toast.error(
        error instanceof Error ? error.message : 'Confira a programação.'
      );
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          active,
          schedule,
          definition: {
            templateId: template.id,
            audience,
            variables,
            headerMediaUrl: media,
          },
        }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      router.push(`/campaigns/${b.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-4 mx-auto w-full max-w-7xl min-w-0 space-y-6 motion-safe:duration-300">
      <PageNavigation
        backHref="/campaigns"
        backLabel="Voltar às campanhas"
        backDisabled={busy}
        items={[
          { label: 'Campanhas', href: '/campaigns' },
          { label: 'Nova campanha' },
        ]}
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Nova campanha</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Escolha o template e configure as abas na ordem que preferir.
          </p>
        </div>
      </div>
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <aside
          aria-label="Template da campanha"
          className="border-border bg-card min-w-0 rounded-xl border p-5 xl:sticky xl:top-4"
        >
          <Step1ChooseTemplate
            selectedTemplate={template}
            onSelect={(next) => {
              if (next.id !== template?.id) {
                setVariables({});
                setMedia(next.header_media_url ?? '');
              }
              setTemplate(next);
            }}
            showNavigation={false}
            layout="list"
          />
        </aside>
        <div className="min-w-0 space-y-5">
          <section
            aria-label="Identificação da campanha"
            className="border-border bg-card space-y-5 rounded-xl border p-5"
          >
            <label className="block space-y-2">
              <span>Título</span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Cobrança — Empreendimento A"
              />
            </label>
            <label className="block space-y-2">
              <span>Descrição e objetivo</span>
              <textarea
                className="border-border bg-background min-h-24 w-full rounded-md border p-3 text-sm"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
          </section>
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(String(value))}
            className="border-border bg-card min-w-0 gap-0 rounded-xl border"
          >
            <div className="border-border min-w-0 overflow-x-auto border-b p-3">
              <TabsList
                aria-label="Configurações da campanha"
                variant="line"
                className="w-full min-w-max justify-start gap-2"
              >
                <TabsTrigger value="audience" className="px-4 py-2">
                  Público
                </TabsTrigger>
                <TabsTrigger value="personalization" className="px-4 py-2">
                  Personalização
                </TabsTrigger>
                <TabsTrigger value="schedule" className="px-4 py-2">
                  Programação
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="audience" keepMounted className="min-w-0 p-5">
              <Step2SelectAudience
                audience={audience}
                onUpdate={setAudience}
                showNavigation={false}
              />
            </TabsContent>
            <TabsContent
              value="personalization"
              keepMounted
              className="min-w-0 p-5"
            >
              {template ? (
                <Step3Personalize
                  key={template.id}
                  template={template}
                  variables={variables}
                  onUpdate={setVariables}
                  headerMediaUrl={media}
                  onHeaderMediaUrlChange={setMedia}
                  showNavigation={false}
                />
              ) : (
                <p className="border-border text-muted-foreground rounded-lg border border-dashed p-6 text-sm">
                  Escolha um template para configurar as variáveis e visualizar
                  a mensagem.
                </p>
              )}
            </TabsContent>
            <TabsContent
              value="schedule"
              keepMounted
              className="min-w-0 space-y-5 p-5"
            >
              <div>
                <h2 className="text-lg font-semibold">Programação</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Defina quando a campanha será executada.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span>Frequência</span>
                  <select
                    className="border-border bg-background block h-10 w-full rounded border px-3"
                    value={schedule.kind}
                    onChange={(e) =>
                      setSchedule({
                        ...schedule,
                        kind: e.target.value as CampaignSchedule['kind'],
                      })
                    }
                  >
                    <option value="once">Envio único</option>
                    <option value="daily">Diário</option>
                    <option value="interval">A cada N dias</option>
                  </select>
                </label>
                {schedule.kind === 'interval' && (
                  <label className="space-y-2">
                    <span>Intervalo em dias</span>
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      value={schedule.days}
                      onChange={(e) =>
                        setSchedule({
                          ...schedule,
                          days: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                )}
                <label className="space-y-2">
                  <span>Data inicial</span>
                  <Input
                    type="date"
                    value={schedule.startDate}
                    onChange={(e) =>
                      setSchedule({ ...schedule, startDate: e.target.value })
                    }
                  />
                </label>
                <label className="space-y-2">
                  <span>Horário</span>
                  <Input
                    type="time"
                    value={schedule.time}
                    onChange={(e) =>
                      setSchedule({ ...schedule, time: e.target.value })
                    }
                  />
                </label>
                <label className="space-y-2">
                  <span>Fuso horário (IANA)</span>
                  <Input
                    value={schedule.timezone}
                    onChange={(e) =>
                      setSchedule({ ...schedule, timezone: e.target.value })
                    }
                  />
                </label>
              </div>

              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  Ativar programação ao salvar. A campanha enviará
                  automaticamente nas datas configuradas.
                </span>
              </label>
            </TabsContent>
          </Tabs>
          <section
            aria-label="Resumo da campanha"
            className="border-border bg-card min-w-0 space-y-4 rounded-xl border p-5"
          >
            <div className="min-w-0 text-sm [overflow-wrap:anywhere]">
              <p>
                Template: <strong>{template?.name ?? 'Não selecionado'}</strong>
              </p>
              <p className="mt-1">
                Público:{' '}
                {audience.type === 'csv'
                  ? (audience.csvContacts?.length ?? 0) + ' linhas do CSV'
                  : audience.type === 'tags'
                    ? 'Etiquetas selecionadas'
                    : audience.type === 'custom_field'
                      ? 'Filtro de campo'
                      : 'Todos os contatos'}
              </p>
              <p className="mt-1">
                Programação:{' '}
                {active
                  ? 'Ativa ao salvar'
                  : 'Desativada — execução manual disponível após salvar'}
              </p>
              <p className="text-muted-foreground mt-2">
                O público será recalculado em cada execução, com lista e
                variáveis preservadas no disparo. Consultas UAU serão uma fonte
                futura.
              </p>
            </div>
            <div className="border-border flex justify-end border-t pt-4">
              <Button onClick={() => void save()} disabled={busy}>
                {busy ? 'Salvando…' : 'Salvar campanha'}
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
