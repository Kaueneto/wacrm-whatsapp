'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function CampaignDepartmentSelect({ value, onChange, disabled }: {
  value: string | null;
  onChange: (department: string | null) => void;
  disabled: boolean;
}) {
  const [departments, setDepartments] = useState<{ id: string; name: string }[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void createClient().from('departments').select('id,name').order('name')
      .abortSignal(controller.signal).then(({ data, error }) => {
        if (controller.signal.aborted) return;
        if (error) setFailed(true);
        else setDepartments(data);
      });
    return () => controller.abort();
  }, []);

  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">Departamento dos próximos disparos</span>
      <select
        className="border-input bg-background block h-9 w-full rounded-md border px-2"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        disabled={disabled || !departments}
      >
        <option value="">{departments ? 'Toda a empresa' : failed ? 'Departamentos indisponíveis' : 'Carregando departamentos…'}</option>
        {departments?.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
      </select>
      <span className="block text-xs text-muted-foreground">
        O envio inclui apenas contatos com atendimento no departamento escolhido e aparece para a supervisão desse departamento.
      </span>
    </label>
  );
}
