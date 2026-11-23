  'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface Progress {
  state: string;
  total: number;
  processed: number;
  accepted: number;
  unknown: number;
  cancelled: number;
  failed: number;
  worker_online: boolean;
}
const labels: Record<string, string> = {
  queued: 'Na fila',
  running: 'Processando no servidor',
  paused: 'Pausado',
  completed: 'Processamento concluído',
  cancelled: 'Cancelado',
};
export function BroadcastQueuePanel({
  id,
  campaignId,
  startedAt,
  onRefresh,
}: {
  id: string;
  campaignId?: string | null;
  startedAt?: string | null;
  onRefresh: () => void;
}) {
  const [data, setData] = useState<Progress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/whatsapp/broadcast/${id}/queue`);
      if (!r.ok) throw new Error('Não foi possível consultar a fila.');
      setData(await r.json());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao consultar fila.');
    }
  }, [id]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
      onRefresh();
    }, 4000);
    return () => clearInterval(timer);
  }, [refresh, onRefresh]);
  async function action(action: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/whatsapp/broadcast/${id}/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const result = await r.json();
      if (!r.ok)
        throw new Error(result.error ?? 'Não foi possível executar a ação.');
      if (result.broadcastId) router.push(`/broadcasts/${result.broadcastId}`);
      else {
        await refresh();
        onRefresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha na ação.');
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return error ? (
      <p role="alert" className="text-sm text-amber-400">
        {error}
      </p>
    ) : null;
  const pct = data.total ? Math.round((data.processed / data.total) * 100) : 0;
  const active = ['queued', 'running', 'paused'].includes(data.state);
  const elapsed = startedAt ? Math.max(1, (Date.now() - Date.parse(startedAt)) / 1000) : null;
  const remainingSeconds =
    elapsed !== null && data.processed >= 5 && data.state === 'running'
      ? (data.total - data.processed) / (data.processed / elapsed)
      : null;
  return (
    <section
      className="border-border bg-card space-y-4 rounded-xl border p-5"
      aria-label="Processamento no servidor"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">{labels[data.state] ?? data.state}</h2>
          <p className="text-muted-foreground text-sm">
            Pode fechar o navegador. O worker continua enquanto o servidor
            estiver ligado.
          </p>
          {campaignId && (
            <Link
              className="text-primary text-sm underline"
              href={`/campaigns/${campaignId}`}
            >
              Ver campanha de origem
            </Link>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {active && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                action(data.state === 'paused' ? 'resume' : 'pause')
              }
            >
              {data.state === 'paused' ? 'Retomar' : 'Pausar'}
            </Button>
          )}
          {active && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    'Cancelar os destinatários ainda não enviados? Mensagens já aceitas podem ser entregues.'
                  )
                )
                  void action('cancel');
              }}
            >
              Cancelar pendentes
            </Button>
          )}
          {!active && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => action('repeat')}
            >
              Executar novamente
            </Button>
          )}
          {!active && data.failed > 0 && (
            <Button disabled={busy} onClick={() => action('retry')}>
              Novo disparo com as falhas ({data.failed})
            </Button>
          )}
        </div>
      </div>
      {!data.worker_online && active && (
        <p role="status" className="text-sm text-amber-400">
          Worker sem atividade recente. Os destinatários permanecem salvos;
          inicie o worker para continuar.
        </p>
      )}
      <div className="flex justify-between text-sm">
        <span>
          {data.processed.toLocaleString()} de {data.total.toLocaleString()}{' '}
          processados
        </span>
        <strong>{pct}%</strong>
      </div>
      <div
        role="progressbar"
        aria-label="Destinatários processados"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="bg-muted h-2 overflow-hidden rounded"
      >
        <div
          className="bg-primary h-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        Aceitos pela Meta: {data.accepted} · Incertos: {data.unknown} ·
        Cancelados: {data.cancelled}. Processamento concluído não significa
        entrega confirmada; acompanhe os cartões abaixo.
      </p>
      {remainingSeconds !== null && (
        <p className="text-muted-foreground text-xs">
          Estimativa pelo ritmo médio desde o início do processamento: cerca de{' '}
          {Math.max(1, Math.ceil(remainingSeconds / 60))} minuto(s). Pausas e
          limites da Meta podem alterar esse tempo.
        </p>
      )}
      {data.unknown > 0 && (
        <p className="text-sm text-amber-400">
          Há resultados incertos. Esses envios não serão repetidos
          automaticamente para evitar duplicidade.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-amber-400">
          {error}
        </p>
      )}
    </section>
  );
}
