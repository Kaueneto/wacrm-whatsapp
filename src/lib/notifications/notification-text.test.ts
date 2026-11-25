import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import pt from '../../../messages/pt.json';
import { notificationText } from './notification-text';
import type { Translate } from '@/lib/i18n/translate';

const t = createTranslator({
  locale: 'pt',
  messages: pt,
  namespace: 'Notifications',
}) as Translate;
const notification = {
  type: 'conversation_assigned',
  title: 'New conversation assigned',
  body: 'Someone assigned you a conversation',
  contact_name: 'Cliente teste',
} as const;

describe('assignment notification attribution', () => {
  it('identifies automatic routing without a human actor, including older notifications', () => {
    expect(notificationText(notification, {}, t)).toEqual({
      title: 'Atendimento atribuído pelo fluxo automático',
      body: 'O fluxo de atendimento automático encaminhou a conversa com Cliente teste para você.',
    });
  });
  it('preserves the explicit AI handoff origin', () => {
    expect(
      notificationText({ ...notification, assignment_origin: 'ai' }, {}, t).body
    ).toBe('A IA encaminhou a conversa com Cliente teste para você.');
  });
  it('preserves manual actor names for older notifications', () => {
    expect(
      notificationText(
        { ...notification, actor_user_id: 'admin' },
        { actor: 'Administradora' },
        t
      ).body
    ).toBe('Administradora atribuiu a você uma conversa com Cliente teste');
  });
  it('does not classify a manual assignment with a missing actor name as automatic', () => {
    expect(
      notificationText({ ...notification, assignment_origin: 'manual' }, {}, t)
        .body
    ).toBe('Alguém atribuiu a você uma conversa com Cliente teste');
  });
});
