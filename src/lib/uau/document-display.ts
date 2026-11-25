/** Format a document already authorized for display; never recover hidden digits. */
export function formatUauDocument(value: string): string {
  const digits = value.replace(/[.\/\-\s]/g, '');
  if (/^[\d*]{11}$/.test(digits))
    return digits.replace(/^(.{3})(.{3})(.{3})(.{2})$/, '$1.$2.$3-$4');
  if (/^[\d*]{14}$/.test(digits))
    return digits.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5');
  return value;
}
