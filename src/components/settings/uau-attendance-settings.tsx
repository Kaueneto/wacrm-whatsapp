'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/hooks/use-auth';
import { canSendMessages } from '@/lib/auth/roles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { normalizeUauLogin } from '@/lib/uau/user-login';

export function UauAttendanceSettings() {
  const t = useTranslations('UauAttendance');
  const { accountRole } = useAuth();
  const allowed = !!accountRole && canSendMessages(accountRole);
  const [login, setLogin] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const r = await fetch('/api/integrations/uau/attendance-settings', {
          signal: controller.signal,
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || t('failed'));
        setLogin(normalizeUauLogin(data?.uau_login ?? ''));
      } catch (error) {
        if (!controller.signal.aborted)
          setFeedback(error instanceof Error ? error.message : t('failed'));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [allowed, t]);
  if (!allowed) return null;
  async function save() {
    setBusy(true);
    setFeedback('');
    try {
      const r = await fetch('/api/integrations/uau/attendance-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: normalizeUauLogin(login) }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || t('failed'));
      setFeedback(t('settingsSaved'));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="mt-4">
      <CardContent className="space-y-4">
        <h3 className="font-semibold">{t('settingsTitle')}</h3>
        <p className="text-muted-foreground text-xs">{t('settingsHint')}</p>
        <div className="space-y-2">
          <Label htmlFor="uau-user-login">{t('login')}</Label>
          <Input
            id="uau-user-login"
            value={login}
            onChange={(e) => setLogin(e.target.value.toUpperCase())}
            maxLength={256}
            disabled={loading || busy}
            autoComplete="off"
          />
        </div>
        {feedback && (
          <p role="status" className="text-sm">
            {feedback}
          </p>
        )}
        <Button
          type="button"
          onClick={() => void save()}
          disabled={busy || loading || !login.trim()}
        >
          {t(busy ? 'saving' : 'saveSettings')}
        </Button>
      </CardContent>
    </Card>
  );
}
