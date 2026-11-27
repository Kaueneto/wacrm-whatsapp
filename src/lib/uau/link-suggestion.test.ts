import { describe, expect, it } from 'vitest';
import { createUauLinkSuggestion, readUauLinkSuggestion } from './link-suggestion';

const context = {
  accountId: 'account-a', contactId: 'contact-a', revision: 'revision-a',
  personId: 77, personName: 'Cliente', contractKey: '900_00001_1',
};
const now = Date.parse('2026-11-27T18:00:00Z');

describe('UAU origin suggestions', () => {
  it('only returns the suggested identity for the same account, contact and connection', () => {
    const token = createUauLinkSuggestion(context, now);
    expect(token).not.toContain('Cliente');
    expect(readUauLinkSuggestion(token, context, now)).toEqual({
      personId: 77, personName: 'Cliente', contractKey: '900_00001_1',
    });
  });

  it.each([
    { accountId: 'other-account' }, { contactId: 'other-contact' },
    { revision: 'new-revision' }, { revision: null },
  ])('rejects a suggestion in another scope: %j', (patch) => {
    const token = createUauLinkSuggestion(context, now);
    expect(() => readUauLinkSuggestion(token, { ...context, ...patch }, now)).toThrow(/sugestão/);
  });

  it('rejects expired, malformed and tampered suggestions', () => {
    const token = createUauLinkSuggestion(context, now);
    expect(() => readUauLinkSuggestion(token, context, now + 3_600_000)).toThrow(/expirou/);
    for (const invalid of [null, 'invalid', token.slice(0, -1), token + 'aa']) {
      expect(() => readUauLinkSuggestion(invalid, context, now)).toThrow(/sugestão/);
    }
  });
});
