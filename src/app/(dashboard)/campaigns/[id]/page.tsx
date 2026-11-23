'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { CampaignDepartmentSelect } from '@/components/broadcasts/campaign-department-select';
import { CampaignStatusBadge } from '@/components/campaigns/campaign-status-badge';
import { TemplatePreview } from '@/components/campaigns/template-preview';
import { Button } from '@/components/ui/button';
import { PageNavigation } from '@/components/ui/page-navigation';
import {
  isUauCampaignDefinition,
  type UauCampaignDefinition,
} from '@/lib/uau/campaign-draft';
import { campaignScheduleCanActivate, describeSchedule, getCampaignSchedule } from '@/lib/campaigns/schedule';
import { toast } from 'sonner';
import type {
  CampaignDefinition,
  CampaignSchedule,
} from '@/lib/campaigns/definition';
import type { Broadcast, MessageTemplate } from '@/types';

const templateCategoryLabels: Record<MessageTemplate['category'], string> = {
  Marketing: 'Marketing',
  Utility: 'Utilidade',
  Authentication: 'Autenticação',
};

interface Campaign {
  id: string;
  name: string;
  description: string;
  active: boolean;
  next_run_at: string | null;
  last_error: string | null;
  department_id: string | null;
  definition: CampaignDefinition | UauCampaignDefinition;
  schedule: CampaignSchedule | null;
}
export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [runs, setRuns] = useState<Broadcast[]>([]);
  const [template, setTemplate] = useState<MessageTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const db = createClient();
      const { data: c, error: e } = await db
        .from('campaigns')
        .select('*')
        .eq('id', id)
        .single();
      if (e) throw e;
      setCampaign(c);
      const { data: t } = await db
        .from('message_templates')
        .select('*')
        .eq('id', c.definition.templateId)
        .maybeSingle();
      setTemplate(t);
      const { data: b, error: be } = await db
        .from('broadcasts')
        .select('*')
        .eq('campaign_id', id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (be) throw be;
      setRuns(b ?? []);
      setError('');
    } catch {
      setError('Não foi possível carregar a campanha.');
    }
  }, [id]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [load]);
  async function setDepartment(departmentId: string | null) {
    setBusy(true);
    try {
      const response = await fetch(`/api/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ departmentId }),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      await load();
      toast.success('Departamento atualizado para os próximos disparos.');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Falha ao salvar o departamento.'
      );
    } finally {
      setBusy(false);
    }
  }
  async function action(run: boolean) {
    if (!campaign) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/campaigns/${id}${run ? '/run' : ''}`, {
        method: run ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: run ? undefined : JSON.stringify({ active: !campaign.active }),
      });
      const b = await r.json();
      if (!run && b.code === 'schedule_needs_edit') {
        router.push(`/campaigns/${id}/edit?tab=schedule`);
        return;
      }
      if (!r.ok) throw new Error(b.error);
      if (b.broadcastId) router.push(`/broadcasts/${b.broadcastId}`);
      else await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha na ação.');
    } finally {
      setBusy(false);
    }
  }
  if (!campaign) return <p role="status">{error || 'Carregando campanha…'}</p>;
  const uau = isUauCampaignDefinition(campaign.definition)
    ? campaign.definition.audience
    : null;
  const s = getCampaignSchedule(campaign.definition, campaign.schedule);
  const unfinished = runs.some((r) => r.status === 'sending');
  const needsScheduleEdit = s && !campaign.active && !campaignScheduleCanActivate(s);
  const editHref = `/campaigns/${campaign.id}/edit`;
  const previewMedia = 'headerMediaUrl' in campaign.definition ? campaign.definition.headerMediaUrl : undefined;
  return (
    <div className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-4 space-y-6 motion-safe:duration-300">
      <PageNavigation
        backHref="/campaigns"
        backLabel="Voltar às campanhas"
        items={[
          { label: 'Campanhas', href: '/campaigns' },
          { label: campaign.name },
        ]}
      />
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{campaign.name}</h1>
          <p className="text-muted-foreground">
            {campaign.description || 'Sem descrição'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href={editHref} />}>
            Editar campanha
          </Button>
          {(!s || needsScheduleEdit) ? (
            <Button variant="outline" nativeButton={false} render={<Link href={`${editHref}?tab=schedule`} />}>
              {s ? 'Reprogramar' : 'Configurar agendamento'}
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void action(false)}
            >
              {campaign.active ? 'Pausar programação' : 'Ativar programação'}
            </Button>
          )}
          <Button
            className="border-0 bg-emerald-700 text-white shadow-none hover:bg-emerald-800 focus-visible:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-700/20"
            disabled={busy || unfinished}
            onClick={() => void action(true)}
          >
            Executar agora
          </Button>
        </div>
      </div>
      <div className={`grid items-start gap-4 ${template ? 'xl:grid-cols-[minmax(0,1fr)_minmax(20rem,.6fr)]' : ''}`}>
        <div className="grid gap-4 sm:grid-cols-2">
        <section className="border-border bg-card rounded-xl border p-5">
          <h2 className="font-semibold">Template</h2>
          <p className="mt-2 text-sm">
            {template?.display_name ?? template?.name ?? 'Template removido'}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            Categoria:{' '}
            {template?.category
              ? (templateCategoryLabels[template.category] ?? template.category)
              : 'Não disponível'}
          </p>
          <p className="text-muted-foreground text-xs">
            Variáveis congeladas em cada disparo.
          </p>
        </section>
        <section className="border-border bg-card rounded-xl border p-5">
          <h2 className="font-semibold">Público</h2>
          <p className="mt-2 text-sm">
            {uau
              ? `Consulta ${uau.queryId} · ${uau.personalized ? 'Personalizada' : 'Interna do UAU'}`
              : campaign.definition.audience.type === 'all'
                ? 'Todos os contatos'
                : campaign.definition.audience.type === 'tags'
                  ? 'Filtrado por etiquetas'
                  : campaign.definition.audience.type === 'csv'
                    ? 'Lista importada'
                    : 'Filtro por campo'}
          </p>
          {uau && (
            <p className="text-muted-foreground text-xs">
              Coluna do WhatsApp {uau.phone.column}
            </p>
          )}
          <p className="text-muted-foreground text-xs">
            Recalculado em cada execução.
          </p>
          <div className="mt-4">
            <CampaignDepartmentSelect
              value={campaign.department_id}
              onChange={(value) => void setDepartment(value)}
              disabled={busy}
            />
          </div>
        </section>
        <section className="border-border bg-card rounded-xl border p-5 sm:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Programação</h2>
            <CampaignStatusBadge active={campaign.active} unfinished={unfinished} schedule={s} />
          </div>
          <p className="mt-2 text-sm">
            {s ? `${describeSchedule(s)} · ${s.time}` : 'Sem agendamento'}
          </p>
          {s && <p className="text-muted-foreground text-xs">{s.timezone}</p>}
          {s && (
            <p className="text-muted-foreground mt-1 text-xs">
              Início {new Date(`${s.startDate}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
              {s.endDate && ` · Término ${new Date(`${s.endDate}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}`}
            </p>
          )}
          <p className="mt-2 text-sm">
            Próxima:{' '}
            {campaign.active && campaign.next_run_at
              ? new Date(campaign.next_run_at).toLocaleString()
              : '—'}
          </p>
          {s && !needsScheduleEdit && (
            <Link href={`${editHref}?tab=schedule`} className="text-primary mt-3 inline-block text-sm hover:underline">
              Editar agendamento
            </Link>
          )}
        </section>
        </div>
        {template && <TemplatePreview template={{
          ...template,
          header_media_url: previewMedia || template.header_media_url,
        }} />}
      </div>
      {unfinished && (
        <p
          role="status"
          className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-300"
        >
          Há um disparo em andamento ou pausado. A programação aguardará sua
          finalização, sem sobrepor execuções desta campanha.
        </p>
      )}
      {(error || campaign.last_error) && (
        <p role="alert" className="text-amber-800 dark:text-amber-300">
          {error || campaign.last_error}
        </p>
      )}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Histórico de disparos</h2>
        <p className="text-muted-foreground text-xs">
          Últimas 100 execuções. Todos os disparos continuam disponíveis na
          seção Disparos.
        </p>
        {!runs.length ? (
          <p className="border-border text-muted-foreground rounded-xl border p-6">
            Nenhum disparo executado ainda.
          </p>
        ) : (
          runs.map((b) => (
            <Link
              href={`/broadcasts/${b.id}`}
              key={b.id}
              className="border-border bg-card hover:border-primary flex flex-wrap justify-between gap-3 rounded-xl border p-4"
            >
              <div>
                <p className="font-medium">{b.name}</p>
                <p className="text-muted-foreground text-xs">
                  {new Date(b.created_at).toLocaleString()} ·{' '}
                  {b.total_recipients} destinatários
                </p>
                {b.template_name && <p className="text-muted-foreground text-xs">Template {b.template_name}</p>}
              </div>
              <p className="text-sm">
                {b.sent_count} enviados · {b.delivered_count} entregues ·{' '}
                {b.read_count} lidos · {b.failed_count} falhas
              </p>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
