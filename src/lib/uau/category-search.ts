import type { UauAttendanceCategory } from './attendance-categories';

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
export function matchesAttendanceCategory(
  item: UauAttendanceCategory,
  query: string
): boolean {
  const text = normalize(`${item.code} ${item.name}`);
  return normalize(query)
    .trim()
    .split(/\s+/)
    .every((term) => text.includes(term));
}
