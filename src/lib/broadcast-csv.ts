/**
 * Spreadsheet contacts → broadcast audience.
 *
 * The broadcast wizard's file audience needs a
 * `{ phone, name }[]` list, which is a narrower shape than the
 * contacts importer's. Rather than re-parse, this reuses the shared
 * `parseContactCsv` + `dedupeByPhone` so a CSV that imports cleanly on
 * the Contacts page also broadcasts cleanly (issue #512).
 *
 * De-duplication happens HERE, on the normalized number, because the
 * downstream contact upsert inserts against a UNIQUE index on
 * (account_id, phone_normalized) (migration 022). Two spellings of the
 * same number in one file ("+1 555-0100" and "15550100") would
 * otherwise reach that index as separate inserts and fail the whole
 * broadcast with a constraint error.
 *
 * Pure and unit-tested: the wizard is a client component and
 * `vitest.config.ts` runs `environment: "node"` with no jsdom, so the
 * logic has to live outside the component to be testable.
 */

import { dedupeByPhone } from '@/lib/contacts/dedupe';
import { decodeContactCsv, parseContactCsv } from '@/lib/contacts/parse-contact-csv';

/** The shape the wizard hands to `createAndSendBroadcast`. */
export interface BroadcastCsvContact {
  phone: string;
  name?: string;
}

export type BroadcastCsvError =
  /** No `phone` header — the one column we can't work without. */
  | 'missing_phone_column'
  /** Header was fine, but not one row carried a usable number. */
  | 'no_valid_rows';

export type ParseBroadcastCsvResult =
  | {
      ok: true;
      contacts: BroadcastCsvContact[];
      /** Rows dropped as same-number repeats. */
      duplicates: number;
      /**
       * Rows dropped because the number is blank, incomplete or lacks a
       * clear international prefix.
       */
      invalid: number;
    }
  | { ok: false; error: BroadcastCsvError };

export function parseBroadcastCsv(text: string): ParseBroadcastCsvResult {
  const { rows, hasPhoneColumn } = parseContactCsv(text);
  if (!hasPhoneColumn) return { ok: false, error: 'missing_phone_column' };
  return validateContacts(rows);
}

function validateContacts(rows: BroadcastCsvContact[]): ParseBroadcastCsvResult {
  const normalized = rows.map((row) => {
    const phone = row.phone.replace(/[\s().-]/g, '');
    // A complete Brazilian number with 55 has 12 or 13 digits. A local
    // number starting with DDD 55 is shorter and must not be reinterpreted.
    return /^55[1-9]\d[1-9]\d{7,8}$/.test(phone)
      ? { ...row, phone: '+' + phone }
      : row;
  });
  const { unique, duplicates, invalid } = dedupeByPhone(normalized);
  if (unique.length === 0) return { ok: false, error: 'no_valid_rows' };

  return {
    ok: true,
    // Drop email/company/tags: the broadcast audience only addresses
    // people, and `name` is the sole field template variables can map.
    contacts: unique.map(({ phone, name }) =>
      name ? { phone, name } : { phone }
    ),
    duplicates,
    invalid,
  };
}

export function campaignContactsCsvTemplate(locale: string): string {
  const hasDecimalComma = new Intl.NumberFormat(locale)
    .formatToParts(1.1)
    .some((part) => part.type === 'decimal' && part.value === ',');
  const separator = hasDecimalComma ? ';' : ',';
  return `\uFEFFphone${separator}name\r\n+55 (DDD) XXXXX-XXXX${separator}Alex Silva\r\n`;
}

export async function parseBroadcastAudienceFile(file: File): Promise<
  ParseBroadcastCsvResult | { ok: false; error: 'unsupported_format' | 'unreadable_file' }
> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  try {
    if (extension === 'csv') {
      return parseBroadcastCsv(decodeContactCsv(await file.arrayBuffer()));
    }
    if (extension !== 'xlsx') return { ok: false, error: 'unsupported_format' };

    const { readSheet } = await import('read-excel-file/universal');
    const [header = [], ...data] = await readSheet(file);
    const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
    const columns = header.map((value) => text(value).toLowerCase());
    const phone = columns.indexOf('phone');
    if (phone === -1) return { ok: false, error: 'missing_phone_column' };
    const name = columns.indexOf('name');
    return validateContacts(data
      .filter((row) => row.some((value) => value != null && value !== ''))
      .map((row) => {
        const value = row[phone];
        return {
          phone: typeof value === 'number' && Number.isSafeInteger(value)
            ? String(value)
            : text(value).replace(/^'/, '').trim(),
          name: text(row[name]) || undefined,
        };
      })
    );
  } catch {
    return { ok: false, error: 'unreadable_file' };
  }
}
