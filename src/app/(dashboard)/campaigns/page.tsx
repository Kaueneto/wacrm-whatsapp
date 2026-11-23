'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CampaignStatusBadge } from '@/components/campaigns/campaign-status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LoaderCircle, Play, Plus, RefreshCw } from 'lucide-react';
import type { CampaignSchedule } from '@/lib/campaigns/definition';
import { describeSchedule } from '@/lib/campaigns/schedule';

interface Campaign {
  id: string;
  name: string;
  description: string;
  active: boolean;
  uau: boolean;
  unfinished: boolean;
  next_run_at: string | null;
  last_error: string | null;
  schedule: CampaignSchedule | null;
}
export default function CampaignsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Campaign[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
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
  async function run(campaign: Campaign) {
    if (running || campaign.unfinished) return;
    setRunning(campaign.id);
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}/run`, {
        method: 'POST',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      toast.success(
        `Disparo enfileirado para ${result.total} destinatário(s).`,
        {
          action: {
            label: 'Ver disparo',
            onClick: () => router.push(`/broadcasts/${result.broadcastId}`),
          },
        }
      );
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Falha ao iniciar o disparo.'
      );
    } finally {
      setRunning(null);
    }
  }
  return (
    <div className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-4 space-y-6 motion-safe:duration-300">
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
          <Button
            nativeButton={false}
            className="bg-emerald-700 text-white [a]:hover:bg-emerald-800"
            render={<Link href="/campaigns/new" />}
          >
            <Plus className="h-4 w-4" />
            Nova campanha
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-destructive">
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
        <div className="border-border bg-card overflow-hidden rounded-xl border">
          <Table aria-label="Campanhas cadastradas">
            <TableHeader>
              <TableRow>
                <TableHead className="px-4">Campanha</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Programação</TableHead>
                <TableHead>Próxima execução</TableHead>
                <TableHead className="px-4 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="max-w-96 min-w-56 px-4 py-4 whitespace-normal">
                    <Link
                      href={`/campaigns/${c.id}`}
                      className="hover:text-primary font-semibold break-words hover:underline"
                    >
                      {c.name}
                    </Link>
                    <p className="text-muted-foreground mt-1 break-words">
                      {c.description || 'Sem descrição'}
                    </p>
                    {c.uau && (
                      <p className="text-muted-foreground mt-1 text-xs">
                        Consulta UAU
                      </p>
                    )}
                    {c.last_error && (
                      <p className="mt-1 break-words text-amber-800 dark:text-amber-300">
                        {c.last_error}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <CampaignStatusBadge active={c.active} unfinished={c.unfinished} schedule={c.schedule} />
                  </TableCell>
                  <TableCell>
                    {c.schedule ? (
                      <>
                        <p>{describeSchedule(c.schedule)}</p>
                        <p className="text-muted-foreground mt-1 text-xs">
                          {c.schedule.time} · {c.schedule.timezone}
                        </p>
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        Sem agendamento
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.active && c.next_run_at
                      ? new Date(c.next_run_at).toLocaleString()
                      : 'Sem execução programada'}
                  </TableCell>
                  <TableCell className="px-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        className="border-0 bg-emerald-700 text-white shadow-none hover:bg-emerald-800 focus-visible:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-700/20"
                        size="sm"
                        disabled={Boolean(running) || c.unfinished}
                        onClick={() => void run(c)}
                      >
                        {running === c.id ? (
                          <LoaderCircle className="animate-spin" />
                        ) : (
                          <Play />
                        )}
                        {running === c.id ? 'Preparando…' : 'Executar agora'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        aria-label={`Ver detalhes da campanha ${c.name}`}
                        render={<Link href={`/campaigns/${c.id}`} />}
                      >
                        Ver detalhes
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
