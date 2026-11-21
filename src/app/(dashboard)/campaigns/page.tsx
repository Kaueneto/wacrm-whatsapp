'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
                    {c.last_error && (
                      <p className="mt-1 break-words text-amber-400">
                        {c.last_error}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        c.active
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {c.active ? 'Programação ativa' : 'Programação pausada'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <p>
                      {c.schedule.kind === 'once'
                        ? 'Envio único'
                        : c.schedule.kind === 'daily'
                          ? 'Diariamente'
                          : `A cada ${c.schedule.days} dias`}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {c.schedule.time} · {c.schedule.timezone}
                    </p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.active && c.next_run_at
                      ? new Date(c.next_run_at).toLocaleString()
                      : 'Sem execução programada'}
                  </TableCell>
                  <TableCell className="px-4 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Ver detalhes da campanha ${c.name}`}
                      render={<Link href={`/campaigns/${c.id}`} />}
                    >
                      Ver detalhes
                    </Button>
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
