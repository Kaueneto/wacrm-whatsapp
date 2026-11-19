'use client';
import { useRef, useState } from 'react';
import type { AudienceConfig } from '@/lib/broadcast-audience';
import type { MessageTemplate } from '@/types';
import type { VariableMapping } from '@/lib/campaigns/definition';
export { resolveVariables } from '@/lib/campaigns/definition';
export type { VariableMapping } from '@/lib/campaigns/definition';
export type {
  AudienceConfig,
  CustomFieldFilter,
  CustomFieldOperator,
} from '@/lib/broadcast-audience';
export type BroadcastSendInterruption = 'lease_lost' | 'lease_error';
export interface BroadcastSendOutcome {
  broadcastId: string;
  interruption: BroadcastSendInterruption | null;
}
interface BroadcastPayload {
  name: string;
  template: MessageTemplate;
  audience: AudienceConfig;
  variables: Record<string, VariableMapping>;
  headerMediaUrl?: string;
}

// The browser only submits the definition. Recipient snapshots, queue creation,
// Meta calls and persistence all happen on the server, independently of this tab.
export function useBroadcastSending() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const busy = useRef(false);
  const requestKey = useRef<string | null>(null);
  async function createAndSendBroadcast(
    payload: BroadcastPayload
  ): Promise<BroadcastSendOutcome> {
    if (busy.current) throw new Error('O disparo já está sendo preparado.');
    busy.current = true;
    setIsProcessing(true);
    setProgress(5);
    try {
      const response = await fetch('/api/whatsapp/broadcast/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestKey:
            requestKey.current ?? (requestKey.current = crypto.randomUUID()),
          name: payload.name,
          definition: {
            templateId: payload.template.id,
            audience: payload.audience,
            variables: payload.variables,
            headerMediaUrl: payload.headerMediaUrl,
          },
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error ?? 'Não foi possível enfileirar o disparo.'
        );
      setProgress(100);
      return { broadcastId: result.broadcastId, interruption: null };
    } finally {
      busy.current = false;
      setIsProcessing(false);
    }
  }
  return { createAndSendBroadcast, isProcessing, progress };
}
