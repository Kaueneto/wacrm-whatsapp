'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { CampaignEditor } from '@/components/campaigns/campaign-editor';
import type { CrmCampaignDraft } from '@/lib/campaigns/definition';
import type { UauCampaignDraft } from '@/lib/uau/campaign-draft';

export default function EditCampaignPage() {
  return (
    <Suspense fallback={<p role="status">Carregando campanha…</p>}>
      <EditCampaign />
    </Suspense>
  );
}

function EditCampaign() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const [draft, setDraft] = useState<CrmCampaignDraft | UauCampaignDraft | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const options = { signal: controller.signal, cache: 'no-store' } as const;
        const response = await fetch(`/api/campaigns/${encodeURIComponent(id)}`, options);
        let data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (data.source === 'uau') {
          const uau = await fetch(`/api/campaigns/uau-draft?id=${encodeURIComponent(id)}`, options);
          data = await uau.json();
          if (!uau.ok) throw new Error(data.error);
        }
        if (!controller.signal.aborted) setDraft(data);
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Não foi possível recuperar a campanha.'
          );
      }
    })();
    return () => controller.abort();
  }, [id]);

  if (error) return <p role="alert">{error}</p>;
  if (draft?.id !== id) return <p role="status">Carregando campanha…</p>;
  return <CampaignEditor key={id} draft={draft} initialTab={search.get('tab') === 'schedule' ? 'schedule' : 'audience'} />;
}
