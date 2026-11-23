/**
 * CSV parsing for the contacts import modal. Shared + unit-tested so
 * tag-column handling stays aligned with phone/name/email/company.
 */

export interface ParsedContactRow {
  phone: string;
  name?: string;
  email?: string;
  company?: string;
  /** Tag names from the optional `tags` column (comma/semicolon separated). */
  tagNames: string[];
}

const CONTACT_CSV_HEADERS = ['phone', 'name', 'email', 'company', 'tags'] as const;
type CsvDelimiter = ',' | ';';

export function contactCsvTemplate(locale: string): string {
  const decimal = new Intl.NumberFormat(locale).formatToParts(1.1)
    .find((part) => part.type === 'decimal')?.value;
  return `\uFEFF${CONTACT_CSV_HEADERS.join(decimal === ',' ? ';' : ',')}\r\n`;
}

export function decodeContactCsv(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** Split a CSV cell into unique tag names (case-insensitive de-dupe). */
export function parseTagCell(value: string | undefined): string[] {
  if (!value?.trim()) return [];

  const seen = new Set<string>();
  const names: string[] = [];

  for (const part of value.split(/[,;]/)) {
    const name = part.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }

  return names;
}

export interface ParseContactCsvResult {
  rows: ParsedContactRow[];
  /**
   * True when the CSV header includes the required `phone` column.
   * `rows` is empty both when the column is missing and when the file
   * simply has no usable data rows; callers that need to tell those
   * apart (to pick the right error message) read this flag.
   */
  hasPhoneColumn: boolean;
  /** True when the CSV header includes a `tags` column. */
  hasTagsColumn: boolean;
  /** True when the CSV header includes a `company` column. */
  hasCompanyColumn: boolean;
}

export function parseContactCsv(text: string): ParseContactCsvResult {
  const content = text.trimStart();
  const separator = /^sep=([,;])[ \t]*(?:\r\n|\r|\n)/i.exec(content);
  const csv = separator ? content.slice(separator[0].length) : content;
  const header = csv.split(/[\r\n]/, 1)[0] ?? '';
  const headersFor = (delimiter: CsvDelimiter) =>
    (parseCsvRows(header, delimiter)[0] ?? []).map(h => h.toLowerCase().replace(/^'|'$/g, ''));
  const delimiter = separator?.[1] === ';' || (!separator && headersFor(';').includes('phone')) ? ';' : ',';
  const headers = headersFor(delimiter);

  const phoneIdx = headers.indexOf('phone');
  if (phoneIdx === -1) {
    return {
      rows: [],
      hasPhoneColumn: false,
      hasTagsColumn: false,
      hasCompanyColumn: false,
    };
  }

  const nameIdx = headers.indexOf('name');
  const emailIdx = headers.indexOf('email');
  const companyIdx = headers.indexOf('company');
  const tagsIdx = headers.indexOf('tags');

  const rows: ParsedContactRow[] = [];

  for (const values of parseCsvRows(csv, delimiter).slice(1)) {
    // A row with no usable phone is pushed through rather than dropped
    // here — dedupeByPhone (shared with the webhook/manual-form paths)
    // already treats an empty normalized key as invalid, and counting
    // it there means the import result can tell the user "N contacts
    // had no phone" instead of the row just vanishing with the total
    // row count silently short of what's actually in the file.
    const phone = values[phoneIdx]?.replace(/^'/, '').trim() ?? '';

    rows.push({
      phone,
      name: values[nameIdx] || undefined,
      email: values[emailIdx] || undefined,
      company: values[companyIdx] || undefined,
      tagNames: parseTagCell(values[tagsIdx]),
    });
  }

  return {
    rows,
    hasPhoneColumn: true,
    hasTagsColumn: tagsIdx >= 0,
    hasCompanyColumn: companyIdx >= 0,
  };
}

function parseCsvRows(text: string, delimiter: CsvDelimiter): string[][] {
  const rows: string[][] = [];
  let values: string[] = [];
  let current = '';
  let inQuotes = false;
  let hasContent = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      hasContent = true;
      if (inQuotes && text[index + 1] === '"') {
        current += '"';
        index++;
      } else if (inQuotes || !current.trim()) {
        inQuotes = !inQuotes;
      } else {
        current += char;
      }
    } else if (!inQuotes && char === delimiter) {
      hasContent = true;
      values.push(current.trim());
      current = '';
    } else if (!inQuotes && (char === '\r' || char === '\n')) {
      values.push(current.trim());
      if (hasContent || current.trim()) rows.push(values);
      if (char === '\r' && text[index + 1] === '\n') index++;
      values = [];
      current = '';
      hasContent = false;
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  if (hasContent || current.trim()) rows.push(values);
  return rows;
}
