import type { OpenPosition, CollectionSnapshot } from './portfolio-types';

export function installmentIdentity(position: OpenPosition) {
  const parts = position.key.split('_');
  return {
    typeCode: position.typeCode ?? parts.slice(0, -2).join('_'),
    typeName: position.typeName || null,
    number: position.number ?? parts.at(-2) ?? '—',
    generalNumber: position.generalNumber ?? parts.at(-1) ?? '—',
  };
}
export function installmentOverdue(position: OpenPosition, reference: string) {
  return position.cents > 0 && position.due < reference;
}

/** Add labels to older snapshots without changing their financial position. */
export function withInstallmentMetadata<
  T extends Pick<CollectionSnapshot, 'key' | 'positions'>,
>(stored: T, fresh: Pick<CollectionSnapshot, 'key' | 'positions'>): T {
  if (stored.key !== fresh.key)
    throw new Error('A consulta retornou outro contrato.');
  const byKey = new Map(
    fresh.positions.map((position) => [position.key, position])
  );
  return {
    ...stored,
    positions: stored.positions.map((position) => {
      const metadata = byKey.get(position.key);
      if (!metadata) return position;
      return {
        ...position,
        typeCode: metadata.typeCode ?? position.typeCode,
        typeName: metadata.typeName ?? position.typeName ?? null,
        number: metadata.number ?? position.number,
        generalNumber: metadata.generalNumber ?? position.generalNumber,
      };
    }),
  };
}
