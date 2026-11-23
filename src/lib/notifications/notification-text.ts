import type { Notification } from '@/types';
import type { Translate } from '@/lib/i18n/translate';

/** Localize system notifications without rewriting stored text or personal names. */
export function notificationText(
  notification: Pick<Notification, 'type' | 'title' | 'body' | 'assignment_origin' | 'actor_name' | 'contact_name'>,
  names: { actor?: string | null; contact?: string | null },
  t: Translate
): { title: string; body: string | undefined } {
  if (notification.type !== 'conversation_assigned') {
    return { title: notification.title, body: notification.body };
  }
  const contact = notification.contact_name || names.contact || t('unknownContact');
  if (notification.assignment_origin === 'ai') {
    return {
      title: t('aiAssignedTitle'),
      body: t('aiAssignedBody', { contact }),
    };
  }
  return {
    title: t('assignedTitle'),
    body: t('assignedBody', {
      actor: notification.actor_name || names.actor || t('unknownActor'),
      contact,
    }),
  };
}
