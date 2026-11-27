'use client';

import { useState } from 'react';
import { Copy, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { normalizeWhatsAppWebhookUrl, WHATSAPP_WEBHOOK_PATH } from '@/lib/whatsapp/webhook-callback-url';

export function WhatsAppWebhookCallback({
  accountId,
  editable,
  phoneNumberId,
}: {
  accountId: string | null;
  editable: boolean;
  phoneNumberId: string | null;
}) {
  const t = useTranslations('Settings.whatsapp');
  const storageKey = accountId
    ? `whatsapp-webhook-callback:${accountId}`
    : null;
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      const saved = storageKey && window.localStorage.getItem(storageKey);
      if (saved) {
        const normalized = normalizeWhatsAppWebhookUrl(saved);
        if (normalized) return new URL(normalized).origin;
      }
    } catch {
      // The callback can still be prepared when browser storage is unavailable.
    }
    return normalizeWhatsAppWebhookUrl(window.location.origin) ? window.location.origin : '';
  });
  const callbackUrl = normalizeWhatsAppWebhookUrl(value);
  const invalid = Boolean(value.trim() && !callbackUrl);
  const [publishing, setPublishing] = useState(false);
  const [confirmedUrl, setConfirmedUrl] = useState<string | null>(null);

  function rememberCallback() {
    if (!editable || invalid) return;
    if (callbackUrl) setValue(new URL(callbackUrl).origin);
    if (!storageKey) return;
    try {
      if (callbackUrl) window.localStorage.setItem(storageKey, callbackUrl);
      else window.localStorage.removeItem(storageKey);
    } catch {
      // Clipboard access does not depend on browser storage.
    }
  }

  async function copyCallback() {
    if (!callbackUrl) return;
    try {
      await navigator.clipboard.writeText(callbackUrl);
      rememberCallback();
      toast.success(t('webhookCopied'));
    } catch {
      toast.error(t('webhookCopyFailed'));
    }
  }

  async function publishCallback() {
    if (!callbackUrl || !phoneNumberId || !editable || publishing) return;
    setPublishing(true);
    try {
      const response = await fetch('/api/whatsapp/config/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callbackUrl, phoneNumberId }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || t('webhookPublishFailed'));
      setConfirmedUrl(result.callbackUrl);
      rememberCallback();
      toast.success(t('webhookPublished'));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('webhookPublishFailed')
      );
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-foreground">{t('webhookTitle')}</CardTitle>
        <CardDescription className="text-muted-foreground">
          {t('webhookDesc')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Label
          htmlFor="whatsapp-webhook-callback"
          className="text-muted-foreground"
        >
          {t('webhookUrl')}
        </Label>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-col overflow-hidden rounded-lg border border-border focus-within:ring-2 focus-within:ring-ring/50 sm:flex-row sm:items-center">
              <Input
                id="whatsapp-webhook-callback"
                type="url"
                value={value}
                placeholder="https://seu-tunel.trycloudflare.com"
                onChange={(event) => setValue(event.target.value)}
                onPaste={(event) => {
                  const pasted = event.clipboardData.getData('text');
                  const normalized = normalizeWhatsAppWebhookUrl(pasted);
                  // Preserve invalid pasted characters in state; URL inputs may
                  // otherwise silently strip tabs/newlines before onChange.
                  event.preventDefault();
                  setValue(normalized ? new URL(normalized).origin : pasted);
                }}
                onBlur={rememberCallback}
                readOnly={!editable || publishing}
                aria-invalid={invalid}
                aria-describedby="whatsapp-webhook-callback-help"
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-none border-0 font-mono text-sm shadow-none focus-visible:ring-0"
              />
              <span className="shrink-0 border-t border-border bg-muted px-3 py-2 font-mono text-xs text-muted-foreground sm:border-t-0 sm:border-l" aria-hidden="true">{WHATSAPP_WEBHOOK_PATH}</span>
            </div>
            {callbackUrl && <p className="mt-1 break-all font-mono text-xs text-muted-foreground" aria-live="polite">{callbackUrl}</p>}
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => void copyCallback()}
            aria-label={t('webhookCopyAction')}
            title={t('webhookCopyAction')}
            disabled={!callbackUrl}
            className="border-border text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
          >
            <Copy className="size-4" />
          </Button>
        </div>
        <p
          id="whatsapp-webhook-callback-help"
          className={`text-xs ${invalid ? 'text-destructive' : 'text-muted-foreground'}`}
        >
          {t(invalid ? 'webhookInvalidPublicUrl' : 'webhookBrowserHint')}
        </p>
        {editable && (
          <div className="space-y-2 pt-2">
            <Button
              type="button"
              onClick={() => void publishCallback()}
              disabled={!callbackUrl || !phoneNumberId || publishing}
            >
              {publishing && <Loader2 className="size-4 animate-spin" />}
              {t(publishing ? 'webhookPublishing' : 'webhookPublish')}
            </Button>
            <p className="text-muted-foreground text-xs">
              {t('webhookPublishScope')}
            </p>
            {confirmedUrl && confirmedUrl === callbackUrl && (
              <p role="status" className="text-primary text-sm">
                {t('webhookPublished')}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
