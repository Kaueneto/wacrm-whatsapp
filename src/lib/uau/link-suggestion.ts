import { encrypt, decrypt } from '@/lib/whatsapp/encryption';
import { UauError } from './client';

export interface UauLinkSuggestion {
  personId: number;
  personName: string;
  contractKey: string;
}

interface SuggestionContext extends UauLinkSuggestion {
  accountId: string;
  contactId: string;
  revision: string;
}

/** An expiring origin hint, never a saved link or permission to read finances. */
export function createUauLinkSuggestion(context: SuggestionContext, now = Date.now()) {
  return encrypt(JSON.stringify({ ...context, expiresAt: now + 60 * 60 * 1000 }));
}

export function readUauLinkSuggestion(
  token: unknown,
  scope: { accountId: string; contactId: string; revision: string | null },
  now = Date.now(),
): UauLinkSuggestion {
  try {
    if (typeof token !== 'string' || token.length > 4096 || token.split(':').length !== 3) throw Error();
    const value = JSON.parse(decrypt(token));
    if (
      value.accountId !== scope.accountId || value.contactId !== scope.contactId ||
      !scope.revision || value.revision !== scope.revision ||
      !Number.isFinite(value.expiresAt) || value.expiresAt <= now ||
      !Number.isSafeInteger(value.personId) || value.personId < 1 ||
      typeof value.personName !== 'string' || !value.personName.trim() ||
      typeof value.contractKey !== 'string' || !value.contractKey
    ) throw Error();
    return { personId: value.personId, personName: value.personName, contractKey: value.contractKey };
  } catch {
    throw new UauError('A sugestão de vínculo expirou ou mudou. Abra o contato novamente pela carteira ou busque pelo CPF.', 409);
  }
}
