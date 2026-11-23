/**
 * Shared status badge config for broadcasts + recipients.
 *
 * Previously `statusConfig` was defined inline in both
 * /broadcasts/page.tsx and /broadcasts/[id]/page.tsx with slight
 * drift risk. One source of truth now.
 *
 * Colors come from the shared semantic palette: dark text on light
 * surfaces and bright text on dark surfaces, independent of brand accent.
 */

import type { BroadcastStatus, RecipientStatus } from "@/types";
import { semanticChip } from "@/lib/semantic-chip";

export interface StatusDisplay {
  label: string;
  classes: string;
  /**
   * Set true for statuses that should pulse in the UI to convey
   * "live / in-flight" — currently only `sending`.
   */
  pulse?: boolean;
}

export const broadcastStatusConfig: Record<BroadcastStatus, StatusDisplay> = {
  completed: { label: 'completed', classes: semanticChip.success },
  cancelled: { label: 'cancelled', classes: semanticChip.neutral },
  draft: {
    label: "draft",
    classes: semanticChip.neutral,
  },
  scheduled: {
    label: "scheduled",
    classes: semanticChip.info,
  },
  sending: {
    label: "sending",
    classes: semanticChip.warning,
    pulse: true,
  },
  sent: {
    label: "sent",
    classes: semanticChip.success,
  },
  failed: {
    label: "failed",
    classes: semanticChip.danger,
  },
};

export const recipientStatusConfig: Record<RecipientStatus, StatusDisplay> = {
  pending: {
    label: "pending",
    classes: semanticChip.neutral,
  },
  sent: {
    label: "sent",
    classes: semanticChip.info,
  },
  delivered: {
    label: "delivered",
    classes: semanticChip.success,
  },
  read: {
    label: "read",
    classes: semanticChip.success,
  },
  replied: {
    label: "replied",
    classes: semanticChip.purple,
  },
  failed: {
    label: "failed",
    classes: semanticChip.danger,
  },
};

/**
 * Tolerant lookup — callers often have a generic string status
 * coming from Supabase. Falls back to the "draft" / "pending"
 * entry so the UI never crashes on an unknown value.
 */
export function getBroadcastStatus(status: string): StatusDisplay {
  return (
    broadcastStatusConfig[status as BroadcastStatus] ??
    broadcastStatusConfig.draft
  );
}

export function getRecipientStatus(status: string): StatusDisplay {
  return (
    recipientStatusConfig[status as RecipientStatus] ??
    recipientStatusConfig.pending
  );
}

export const RECIPIENT_STATUSES: readonly RecipientStatus[] = [
  "pending",
  "sent",
  "delivered",
  "read",
  "replied",
  "failed",
];

const RECIPIENT_SUCCESS_LADDER: readonly RecipientStatus[] = [
  "pending",
  "sent",
  "delivered",
  "read",
  "replied",
];

const RECIPIENT_STATUSES_THAT_CAN_FAIL: readonly RecipientStatus[] = [
  "pending",
  "sent",
];

export function isRecipientStatus(value: string): value is RecipientStatus {
  return (RECIPIENT_STATUSES as readonly string[]).includes(value);
}

export function isValidRecipientTransition(
  current: RecipientStatus,
  incoming: RecipientStatus
): boolean {
  if (incoming === "failed") {
    return RECIPIENT_STATUSES_THAT_CAN_FAIL.includes(current);
  }
  if (current === "failed") return false;
  return (
    RECIPIENT_SUCCESS_LADDER.indexOf(incoming) >
    RECIPIENT_SUCCESS_LADDER.indexOf(current)
  );
}

export function allowedPredecessors(next: RecipientStatus): RecipientStatus[] {
  return RECIPIENT_STATUSES.filter((current) =>
    isValidRecipientTransition(current, next)
  );
}
