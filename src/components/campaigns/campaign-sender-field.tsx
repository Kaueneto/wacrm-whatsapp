'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import type { PhoneHealth } from '@/lib/whatsapp/phone-health';

export function CampaignSenderField() {
  const [sender, setSender] = useState<PhoneHealth | 'unavailable' | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadSender() {
      try {
        const response = await fetch('/api/whatsapp/health', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Sender unavailable');
        const health: PhoneHealth = await response.json();
        if (!controller.signal.aborted) setSender(health);
      } catch {
        if (!controller.signal.aborted) setSender('unavailable');
      }
    }
    void loadSender();
    return () => controller.abort();
  }, []);

  const disconnected = sender !== null && sender !== 'unavailable' && sender.state === 'disconnected';
  const phone = sender && sender !== 'unavailable' && sender.state === 'connected'
    ? sender.displayPhoneNumber
    : null;
  const label = sender === null
    ? 'Consultando número…'
    : disconnected
      ? 'Nenhum número conectado'
      : 'Número indisponível';

  return (
    <div className="min-w-0 space-y-1.5">
      <label className="block space-y-1.5">
        <span>Canal de envio</span>
        <Input
          className="h-9 tabular-nums"
          value={phone || label}
          readOnly
          aria-busy={sender === null}
        />
      </label>
      {disconnected && (
        <Link href="/settings?tab=whatsapp" className="text-primary text-xs hover:underline">
          Conectar número
        </Link>
      )}
    </div>
  );
}
