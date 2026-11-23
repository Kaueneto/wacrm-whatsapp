'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface Health {
  connection?: { state: string; checked_at: string };
  counts: {
    pending: number;
    processing: number;
    failed: number;
    needs_review: number;
  };
  worker_online: boolean;
  issues: {
    id: string;
    conversation_id: string | null;
    state: string;
    received_at: string;
    attempts: number;
  }[];
}

export function WhatsAppWebhookHealth() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/whatsapp/webhook/health', {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error();
      setHealth(await response.json());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => clearInterval(timer);
  }, [load]);
  async function update(id: string, action: 'retry_failed' | 'reviewed') {
    setBusy(true);
    try {
      const response = await fetch('/api/whatsapp/webhook/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      if (!response.ok) throw new Error();
      toast.success(
        action === 'retry_failed'
          ? 'Evento recolocado na fila.'
          : 'Revisão registrada.'
      );
      await load();
    } catch {
      toast.error('Não foi possível atualizar o evento.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          Recebimento de mensagens
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void load()}
            aria-label="Atualizar recebimento"
          >
            <RefreshCw className="size-4" />
          </Button>
        </CardTitle>
        <CardDescription>
          Eventos são gravados antes da confirmação à Meta. Falhas de gravação
          são tentadas novamente; interrupções durante automações ficam para
          revisão.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {error && (
          <p role="alert" className="text-destructive">
            Não foi possível consultar o recebimento de mensagens.
          </p>
        )}
        {!health && !error && <p role="status">Carregando…</p>}
        {health && (
          <>
            {health.connection?.state === 'unreachable' && (
              <p role="alert" className="text-destructive">
                O endereço de recebimento registrado na Meta está inacessível.
                Confira o túnel ou a hospedagem; mensagens novas podem não
                chegar à plataforma.
              </p>
            )}
            {health.connection?.state === 'unconfigured' && (
              <p role="alert" className="text-destructive">
                Nenhum endereço de recebimento foi confirmado na Meta.
              </p>
            )}
            {health.connection?.state === 'unknown' && (
              <p role="status" className="text-muted-foreground">
                Não foi possível verificar o endereço de recebimento na Meta
                agora.
              </p>
            )}
            {health.connection?.state === 'reachable' && (
              <p className="text-muted-foreground">
                Endereço de recebimento registrado na Meta acessível na última
                verificação.
              </p>
            )}
            <p>
              Na fila: <strong>{health.counts.pending}</strong> · Em
              processamento: <strong>{health.counts.processing}</strong> ·
              Falhas: <strong>{health.counts.failed}</strong> · Revisão:{' '}
              <strong>{health.counts.needs_review}</strong>
            </p>
            {!health.worker_online && (
              <p
                role="alert"
                className="flex items-start gap-2 text-amber-700 dark:text-amber-300"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />O
                processador de recuperação não está respondendo. Confira o
                serviço em segundo plano para garantir novas tentativas após
                interrupções.
              </p>
            )}
            {!!health.counts.needs_review && (
              <p className="text-muted-foreground">
                Confira o histórico dos atendimentos abaixo antes de repetir uma
                resposta. A revisão evita que uma interrupção gere mensagens
                duplicadas.
              </p>
            )}
            {health.issues.map((issue) => (
              <div
                key={issue.id}
                className="flex flex-wrap items-center gap-2 rounded-md border p-3"
              >
                <span className="flex-1">
                  {issue.state === 'needs_review'
                    ? 'Revisão do atendimento necessária'
                    : 'Falha após várias tentativas'}{' '}
                  · {issue.attempts} tentativa(s)
                </span>
                {issue.conversation_id && (
                  <Link
                    href={`/inbox?c=${issue.conversation_id}`}
                    className="underline"
                  >
                    Ver conversa
                  </Link>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void update(
                      issue.id,
                      issue.state === 'needs_review'
                        ? 'reviewed'
                        : 'retry_failed'
                    )
                  }
                >
                  {issue.state === 'needs_review'
                    ? 'Marcar como revisado'
                    : 'Tentar novamente'}
                </Button>
              </div>
            ))}
            <p className="text-muted-foreground text-xs">
              As cópias dos eventos concluídos são removidas após 7 dias; o
              controle de duplicidade fica por 30 dias. Isso não apaga
              mensagens, conversas ou arquivos do histórico.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
