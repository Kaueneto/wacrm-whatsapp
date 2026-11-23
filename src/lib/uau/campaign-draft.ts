import type { PhoneMapping, PreviewField } from './query-preview';
import type { MessageTemplate } from '@/types';
import type { CampaignSchedule } from '@/lib/campaigns/definition';

export interface UauDraftAudience {
  type: 'uau';
  queryId: number;
  personalized: 0 | 1;
  parameters: { name: string; value: string }[];
  phone: PhoneMapping;
  fields: PreviewField[];
  excludeTagIds?: string[];
}

export interface UauCampaignDefinition {
  templateId: string;
  audience: Omit<UauDraftAudience, 'parameters'> & {
    parametersEncrypted?: string;
  };
}

export interface UauCampaignDraft {
  id: string;
  name: string;
  description: string;
  audience: UauDraftAudience;
  template: MessageTemplate | null;
  schedule?: CampaignSchedule | null;
  active?: boolean;
  departmentId?: string | null;
}

export function isUauCampaignDefinition(
  value: unknown
): value is UauCampaignDefinition {
  return (
    (value as { audience?: { type?: string } } | null)?.audience?.type === 'uau'
  );
}

// Early UAU drafts stored a placeholder date even though scheduling was disabled.
export function getUauSchedule(
  schedule: CampaignSchedule | null
): CampaignSchedule | null {
  return schedule?.configured ? schedule : null;
}

export function isUauDraftAudience(value: unknown): value is UauDraftAudience {
  const draft = value as UauDraftAudience | null;
  const column = (name: unknown) =>
    typeof name === 'string' && !!name.trim() && name.length <= 256;
  return (
    !!draft &&
    draft.type === 'uau' &&
    Number.isSafeInteger(draft.queryId) &&
    draft.queryId > 0 &&
    (draft.personalized === 0 || draft.personalized === 1) &&
    Array.isArray(draft.parameters) &&
    draft.parameters.length <= 50 &&
    draft.parameters.every(
      (entry) =>
        entry &&
        typeof entry.name === 'string' &&
        !!entry.name.trim() &&
        entry.name.length <= 80 &&
        typeof entry.value === 'string' &&
        !!entry.value.trim() &&
        entry.value.length <= 512
    ) &&
    !!draft.phone &&
    column(draft.phone.column) &&
    ['international', 'br-national', 'br-local'].includes(draft.phone.mode) &&
    (draft.phone.mode !== 'br-local' || column(draft.phone.dddColumn)) &&
    (!draft.phone.identityColumn || column(draft.phone.identityColumn)) &&
    Array.isArray(draft.fields) &&
    draft.fields.length <= 24 &&
    draft.fields.every(
      (field) =>
        field &&
        typeof field.variable === 'string' &&
        /^[A-Za-z0-9_]{1,64}$/.test(field.variable) &&
        column(field.column) &&
        ['text', 'money', 'date'].includes(field.format)
    )
  );
}
