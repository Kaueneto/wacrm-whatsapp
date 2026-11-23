/**
 * Shared display config for message_templates.status.
 *
 * The DB stores Meta's raw enum (DRAFT / APPROVED / PENDING / REJECTED /
 * PAUSED / DISABLED / IN_APPEAL / PENDING_DELETION) — the UI maps it to
 * a human label + dark-theme badge classes here so the template manager,
 * inbox picker, and broadcast picker stay aligned.
 */

import type { MessageTemplateStatus } from '@/types';
import { semanticChip } from '@/lib/semantic-chip';
import { getT } from '@/lib/i18n/translate';

export interface TemplateStatusDisplay {
  label: string;
  classes: string;
}

const t = getT('TemplateStatus');

export const templateStatusConfig: Record<
  MessageTemplateStatus,
  TemplateStatusDisplay
> = {
  DRAFT: {
    label: t('DRAFT'),
    classes: semanticChip.neutral,
  },
  PENDING: {
    label: t('PENDING'),
    classes: semanticChip.warning,
  },
  APPROVED: {
    label: t('APPROVED'),
    classes: semanticChip.success,
  },
  REJECTED: {
    label: t('REJECTED'),
    classes: semanticChip.danger,
  },
  PAUSED: {
    label: t('PAUSED'),
    classes: semanticChip.orange,
  },
  DISABLED: {
    label: t('DISABLED'),
    classes: semanticChip.danger,
  },
  IN_APPEAL: {
    label: t('IN_APPEAL'),
    classes: semanticChip.info,
  },
  PENDING_DELETION: {
    label: t('PENDING_DELETION'),
    classes: semanticChip.neutral,
  },
};
