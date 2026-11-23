import type { AudienceConfig } from '@/lib/broadcast-audience';
import type { Contact, MessageTemplate } from '@/types';

export type VariableMapping = {
  type: 'static' | 'field' | 'custom_field';
  value: string;
};
export interface CampaignDefinition {
  templateId: string;
  audience: AudienceConfig;
  variables: Record<string, VariableMapping>;
  headerMediaUrl?: string;
}
export interface CampaignSchedule {
  kind: 'once' | 'daily' | 'interval' | 'weekly' | 'monthly';
  days: number;
  time: string;
  timezone: string;
  startDate: string;
  endDate?: string;
  weekdays?: number[];
  monthDay?: number;
  configured?: boolean;
}

export interface CrmCampaignDraft {
  source: 'crm';
  id: string;
  name: string;
  description: string;
  definition: CampaignDefinition;
  template: MessageTemplate | null;
  schedule: CampaignSchedule | null;
  active: boolean;
  departmentId: string | null;
}

export function resolveVariables(
  variables: Record<string, VariableMapping>,
  contact: Contact,
  customValues: Map<string, string> = new Map()
): string[] {
  return Object.keys(variables)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((key) => {
      const mapping = variables[key];
      if (mapping.type === 'static') return mapping.value;
      if (mapping.type === 'custom_field')
        return customValues.get(mapping.value) ?? '';
      const fields: Record<string, string | undefined> = {
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        company: contact.company,
      };
      return fields[mapping.value] ?? '';
    });
}

export function validateDefinition(
  value: unknown
): asserts value is CampaignDefinition {
  const d = value as CampaignDefinition | null;
  if (
    !d ||
    typeof d.templateId !== 'string' ||
    !d.audience ||
    !['all', 'tags', 'custom_field', 'csv'].includes(d.audience.type) ||
    !d.variables ||
    typeof d.variables !== 'object' ||
    Array.isArray(d.variables)
  )
    throw new Error('Definição de campanha inválida.');
  if (d.audience.type === 'tags' && !d.audience.tagIds?.length)
    throw new Error('Selecione ao menos uma etiqueta.');
  if (d.audience.type === 'custom_field' && !d.audience.customField?.fieldId)
    throw new Error('Escolha um campo para filtrar.');
  if (d.audience.type === 'csv' && !d.audience.csvContacts?.length)
    throw new Error('Importe os contatos de um arquivo CSV ou XLSX.');
  for (const mapping of Object.values(d.variables)) {
    if (
      !mapping ||
      !['static', 'field', 'custom_field'].includes(mapping.type) ||
      typeof mapping.value !== 'string'
    ) {
      throw new Error('Mapeamento de variável inválido.');
    }
  }
}
