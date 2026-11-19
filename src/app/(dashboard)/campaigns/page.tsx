'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Plus, RefreshCw } from 'lucide-react';
import type { CampaignSchedule } from '@/lib/campaigns/definition';

interface Campaign {
  id: string;
  name: string;
  description: string;
  active: boolean;
  next_run_at: string | null;
  last_error: string | null;
  schedule: CampaignSchedule;
}
export default function CampaignsPage() {
  const [rows, setRows] = useState<Campaign[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/campaigns');
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      setRows(b.campaigns);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 10000);
    return () => clearInterval(timer);
  }, [load]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Campanhas</h1>
          <p className="text-muted-foreground text-sm">
            Objetivos, público e programação. Cada execução gera um disparo com
            histórico próprio.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => void load()}
            aria-label="Atualizar campanhas"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button render={<Link href="/campaigns/new" />}>
            <Plus className="h-4 w-4" />
            Nova campanha
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-red-400">
          {error}
        </p>
      )}
      {loading ? (
        <p>Carregando campanhas…</p>
      ) : !rows.length ? (
        <div className="border-border text-muted-foreground rounded-xl border p-8 text-center">
          Nenhuma campanha cadastrada. Os disparos existentes continuam
          disponíveis em Disparos.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((c) => (
            <Link
              key={c.id}
              href={`/campaigns/${c.id}`}
              className="border-border bg-card hover:border-primary space-y-3 rounded-xl border p-5"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">{c.name}</h2>
                <span className="text-primary text-xs">
                  {c.active ? 'Programação ativa' : 'Programação pausada'}
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                {c.description || 'Sem descrição'}
              </p>
              <p className="text-sm">
                {c.schedule.kind === 'once'
                  ? 'Envio único'
                  : c.schedule.kind === 'daily'
                    ? 'Diariamente'
                    : `A cada ${c.schedule.days} dias`}{' '}
                · {c.schedule.time} · {c.schedule.timezone}
              </p>
              <p className="text-muted-foreground text-xs">
                Próxima:{' '}
                {c.active && c.next_run_at
                  ? new Date(c.next_run_at).toLocaleString()
                  : 'Sem execução programada'}
              </p>
              {c.last_error && (
                <p className="text-sm text-amber-400">{c.last_error}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
