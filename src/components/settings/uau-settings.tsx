'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { SettingsPanelHead } from './settings-panel-head';

const endpoint = '/api/integrations/uau';
const initialForm = {
  baseUrl: '',
  version: '1.0',
  integrationKey: '',
  login: '',
  password: '',
  sessionHeader: 'Authorization',
  bearer: false,
};

export function UauSettings() {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [feedback, setFeedback] = useState<{
    error?: string;
    message?: string;
  }>({});

  useEffect(() => {
    const request = new AbortController();
    void (async () => {
      try {
        const response = await fetch(endpoint, { signal: request.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (data.connection) {
          setConfigured(true);
          setForm({ ...initialForm, ...data.connection });
        }
      } catch {
        if (!request.signal.aborted)
          setFeedback({ error: 'Não foi possível carregar a conexão do UAU.' });
      } finally {
        if (!request.signal.aborted) setLoading(false);
      }
    })();
    return () => request.abort();
  }, []);

  async function submit(action: 'save' | 'test', event?: FormEvent) {
    event?.preventDefault();
    if (busy) return;
    setBusy(action);
    setFeedback({});
    try {
      const response = await fetch(
        endpoint,
        action === 'save'
          ? {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(form),
            }
          : { method: 'POST' }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (action === 'save') {
        setConfigured(true);
        setForm((current) => ({
          ...current,
          login: '',
          password: '',
          integrationKey: '',
        }));
      }
      setFeedback({
        message:
          action === 'save'
            ? 'Conexão autenticada e salva.'
            : 'Autenticação com o UAU concluída.',
      });
    } catch (error) {
      setFeedback({
        error:
          error instanceof Error && error.message
            ? error.message
            : 'Não foi possível testar a conexão.',
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <SettingsPanelHead
        title="Integrações"
        description="Conecte o UAU para usar consultas do ERP como público das campanhas."
      />
      <Card className="max-w-3xl">
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">ERP UAU</h3>
            <span className="text-muted-foreground text-xs">
              {loading
                ? 'Carregando…'
                : configured
                  ? 'Conexão cadastrada'
                  : 'Aguardando configuração'}
            </span>
          </div>
          <form
            className="space-y-4"
            onSubmit={(event) => void submit('save', event)}
          >
            <fieldset
              className="space-y-4 disabled:opacity-70"
              disabled={loading || !!busy}
            >
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
                <label className="block space-y-1.5">
                  <span>URL base do Web Service</span>
                  <Input
                    type="url"
                    required
                    value={form.baseUrl}
                    placeholder="https://uau.empresa.com.br/UAUApi_Integracao"
                    onChange={(e) =>
                      setForm({ ...form, baseUrl: e.target.value })
                    }
                  />
                  <span className="text-muted-foreground block text-xs">
                    Use o endereço HTTP ou HTTPS até a raiz da API, antes do caminho da operação.
                  </span>
                </label>
                <label className="block space-y-1.5">
                  <span>Versão da API</span>
                  <Input
                    required
                    value={form.version}
                    onChange={(e) =>
                      setForm({ ...form, version: e.target.value })
                    }
                  />
                </label>
              </div>
              {/^http:\/\//i.test(form.baseUrl.trim()) && (
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  Em HTTP, o usuário, a senha e os tokens trafegam sem criptografia até o UAU.
                </p>
              )}
              <label className="block space-y-1.5">
                <span>Chave de integração</span>
                <Input
                  type="password"
                  autoComplete="new-password"
                  required
                  value={form.integrationKey}
                  onChange={(e) =>
                    setForm({ ...form, integrationKey: e.target.value })
                  }
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span>Usuário do UAU</span>
                  <Input
                    autoComplete="off"
                    required
                    value={form.login}
                    onChange={(e) =>
                      setForm({ ...form, login: e.target.value })
                    }
                  />
                </label>
                <label className="block space-y-1.5">
                  <span>Senha do UAU</span>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    required
                    value={form.password}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                  />
                </label>
              </div>
              <p className="text-muted-foreground text-xs">
                O CRM usa essas credenciais para obter e renovar o token de
                sessão automaticamente.
                {configured
                  ? ' Para alterar a conexão, informe as credenciais novamente.'
                  : ''}
              </p>
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer font-medium">
                  Formato do token de sessão
                </summary>
                <div className="mt-3 space-y-3">
                  <label className="block space-y-1.5">
                    <span>Cabeçalho usado na consulta do Postman</span>
                    <Input
                      value={form.sessionHeader}
                      onChange={(e) =>
                        setForm({ ...form, sessionHeader: e.target.value })
                      }
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.bearer}
                      onChange={(e) =>
                        setForm({ ...form, bearer: e.target.checked })
                      }
                    />{' '}
                    Usar prefixo Bearer
                  </label>
                </div>
              </details>
            </fieldset>
            {feedback.error && (
              <p role="alert" className="text-destructive text-sm">
                {feedback.error}
              </p>
            )}
            {feedback.message && (
              <p role="status" className="text-primary text-sm">
                {feedback.message}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
              {configured && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading || !!busy}
                  onClick={() => void submit('test')}
                >
                  {busy === 'test' ? 'Testando…' : 'Testar conexão salva'}
                </Button>
              )}
              <Button type="submit" disabled={loading || !!busy}>
                {busy === 'save' ? 'Testando…' : 'Testar e salvar'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
