'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type {
  CampaignDefinition,
  CampaignSchedule,
} from '@/lib/campaigns/definition';
import type { Broadcast } from '@/types';

interface Campaign {
  id: string;
  name: string;
  description: string;
  active: boolean;
  next_run_at: string | null;
  last_error: string | null;
  definition: CampaignDefinition;
  schedule: CampaignSchedule;
}
export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [runs, setRuns] = useState<Broadcast[]>([]);
  const [templateName, setTemplateName] = useState('');
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
        .select('name')
        .eq('id', c.definition.templateId)
        .maybeSingle();
      setTemplateName(t?.name ?? 'Template removido');
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
  const s = campaign.schedule;
  const unfinished = runs.some((r) => r.status === 'sending');
  return (
    <div className="space-y-6">
      <Link
        href="/campaigns"
        className="text-muted-foreground text-sm underline"
      >
        Voltar às campanhas
      </Link>
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{campaign.name}</h1>
          <p className="text-muted-foreground">
            {campaign.description || 'Sem descrição'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void action(false)}
          >
            {campaign.active ? 'Pausar programação' : 'Ativar programação'}
          </Button>
          <Button
            disabled={busy || unfinished}
            onClick={() => void action(true)}
          >
            Executar agora
          </Button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <section className="border-border bg-card rounded-xl border p-5">
          <h2 className="font-semibold">Template</h2>
          <p className="mt-2 text-sm">{templateName}</p>
          <p className="text-muted-foreground text-xs">
            Variáveis congeladas em cada disparo.
          </p>
        </section>
        <section className="border-border bg-card rounded-xl border p-5">
          <h2 className="font-semibold">Público</h2>
          <p className="mt-2 text-sm">
            {campaign.definition.audience.type === 'all'
              ? 'Todos os contatos'
              : campaign.definition.audience.type === 'tags'
                ? 'Filtrado por etiquetas'
                : campaign.definition.audience.type === 'csv'
                  ? 'Lista importada de CSV'
                  : 'Filtro por campo'}
          </p>
          <p className="text-muted-foreground text-xs">
            Recalculado em cada execução.
          </p>
        </section>
        <section className="border-border bg-card rounded-xl border p-5">
          <h2 className="font-semibold">
            Programação {campaign.active ? 'ativa' : 'pausada'}
          </h2>
          <p className="mt-2 text-sm">
            {s.kind === 'once'
              ? 'Envio único'
              : s.kind === 'daily'
                ? 'Diário'
                : `A cada ${s.days} dias`}{' '}
            · {s.time}
          </p>
          <p className="text-muted-foreground text-xs">{s.timezone}</p>
          <p className="mt-2 text-sm">
            Próxima:{' '}
            {campaign.active && campaign.next_run_at
              ? new Date(campaign.next_run_at).toLocaleString()
              : '—'}
          </p>
        </section>
      </div>
      {unfinished && (
        <p
          role="status"
          className="rounded-lg border border-amber-500/30 p-4 text-sm text-amber-400"
        >
          Há um disparo em andamento ou pausado. A programação aguardará sua
          finalização, sem sobrepor execuções desta campanha.
        </p>
      )}
      {(error || campaign.last_error) && (
        <p role="alert" className="text-amber-400">
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
