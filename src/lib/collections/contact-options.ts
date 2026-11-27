export interface CollectionContactOption {
  id: string;
  phone: string;
  dialable: string | null;
  source: 'UAU' | 'CRM' | 'UAU + CRM';
  primary: boolean;
  note: string | null;
  contactId?: string;
}

/** Presentation only: preserve every digit, including older eight-digit
 * mobile numbers. Never insert a ninth digit or change the chat destination. */
export function formatCollectionPhone(
  value: string,
  international = false
): string {
  let digits = value.replace(/\D/g, '');
  if (/^55\d{10,11}$/.test(digits)) digits = digits.slice(2);
  else if (international) return value;
  else if (value.trim().startsWith('+') && !value.trim().startsWith('+55'))
    return value;
  if (!/^[1-9]\d{9,10}$/.test(digits)) return value;
  const local = digits.slice(2);
  return `(${digits.slice(0, 2)}) ${local.slice(0, -4)}-${local.slice(-4)}`;
}

/** A CPF/person link is not proof that a CRM phone belongs to the sale.
 * Merge exact telephone matches only; retain other links for explicit review. */
export function reconcileContactOptions(
  options: CollectionContactOption[]
): CollectionContactOption[] {
  const crm = options.filter((option) => option.source === 'CRM');
  const matched = new Set<string>();
  const uau = new Map<string, CollectionContactOption>();
  for (const option of options.filter((option) => option.source !== 'CRM')) {
    const match = option.dialable
      ? crm.find((candidate) => candidate.dialable === option.dialable)
      : undefined;
    if (match) matched.add(match.id);
    const key = option.dialable ?? option.phone;
    const previous = uau.get(key);
    uau.set(key, {
      ...option,
      ...(previous ?? {}),
      primary: option.primary || !!previous?.primary,
      source: match ? 'UAU + CRM' : 'UAU',
      contactId: match?.contactId,
    });
  }
  return [...uau.values()]
    .sort((a, b) => Number(b.primary) - Number(a.primary))
    .concat(crm.filter((option) => !matched.has(option.id)));
}

/** UAU's DDD + local Brazilian numbers need their explicit country code.
 * Incomplete local numbers remain visible but cannot open a WhatsApp chat. */
export function uauDialablePhone(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (value.trim().startsWith('+') && /^[1-9]\d{7,14}$/.test(digits))
    return digits;
  if (/^[1-9]\d{9,10}$/.test(digits)) return '55' + digits;
  if (/^55[1-9]\d{9,10}$/.test(digits)) return digits;
  return null;
}
