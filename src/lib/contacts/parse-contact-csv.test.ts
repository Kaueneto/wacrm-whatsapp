import { describe, expect, it } from 'vitest';
import { contactCsvTemplate, decodeContactCsv, parseContactCsv, parseTagCell } from './parse-contact-csv';

describe('parseTagCell', () => {
  it('splits comma-separated tags and trims whitespace', () => {
    expect(parseTagCell(' VIP , Lead ,  ')).toEqual(['VIP', 'Lead']);
  });

  it('splits semicolon-separated tags', () => {
    expect(parseTagCell('VIP; Lead; Customer')).toEqual([
      'VIP',
      'Lead',
      'Customer',
    ]);
  });

  it('de-dupes case-insensitively', () => {
    expect(parseTagCell('vip, VIP, Lead')).toEqual(['vip', 'Lead']);
  });

  it('returns empty for blank values', () => {
    expect(parseTagCell('')).toEqual([]);
    expect(parseTagCell(undefined)).toEqual([]);
  });
});

describe('parseContactCsv', () => {
  it('round trips the Excel template using the local CSV separator', () => {
    const template = contactCsvTemplate('pt-BR');
    expect(template).toBe('\uFEFFphone;name;email;company;tags\r\n');
    expect(parseContactCsv(template)).toMatchObject({ hasPhoneColumn: true, rows: [] });
    const completed = template + '+5511999999999;João D’Ávila;joao@example.test;São Paulo;"Cliente; Cobrança"\r\n';
    expect(parseContactCsv(completed).rows).toEqual([{
      phone: '+5511999999999',
      name: 'João D’Ávila',
      email: 'joao@example.test',
      company: 'São Paulo',
      tagNames: ['Cliente', 'Cobrança'],
    }]);
    expect(contactCsvTemplate('en-US')).toBe('\uFEFFphone,name,email,company,tags\r\n');
  });

  it('reads a legacy Excel CSV with accents and an explicit separator', () => {
    const bytes = new Uint8Array(Buffer.from('sep=;\r\nphone;name\r\n5511999999999;João', 'latin1'));
    expect(parseContactCsv(decodeContactCsv(bytes.buffer)).rows[0].name).toBe('João');
  });

  it('keeps newlines and escaped quotation marks inside quoted cells', () => {
    const csv = 'phone,name,company\r\n+5511999999999,"Ana ""Nina"" d\'Ávila","Matriz\r\nSão Paulo"';
    expect(parseContactCsv(csv).rows[0]).toMatchObject({
      name: 'Ana "Nina" d\'Ávila',
      company: 'Matriz\r\nSão Paulo',
    });
  });
  it('parses optional tags column', () => {
    const csv = `phone,name,tags
+15551234567,Alice,"VIP, Lead"
+15559876543,Bob,Customer`;

    expect(parseContactCsv(csv)).toEqual({
      hasPhoneColumn: true,
      hasTagsColumn: true,
      hasCompanyColumn: false,
      rows: [
        {
          phone: '+15551234567',
          name: 'Alice',
          email: undefined,
          company: undefined,
          tagNames: ['VIP', 'Lead'],
        },
        {
          phone: '+15559876543',
          name: 'Bob',
          email: undefined,
          company: undefined,
          tagNames: ['Customer'],
        },
      ],
    });
  });

  it('keeps a row with an empty phone cell instead of dropping it silently', () => {
    const csv = `phone,name
+15551234567,Alice
,Bob`;

    const { rows } = parseContactCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({
      phone: '',
      name: 'Bob',
      email: undefined,
      company: undefined,
      tagNames: [],
    });
  });

  it('returns empty tagNames when tags column is absent', () => {
    const csv = `phone,name
+15551234567,Alice`;

    expect(parseContactCsv(csv)).toEqual({
      hasPhoneColumn: true,
      hasTagsColumn: false,
      hasCompanyColumn: false,
      rows: [
        {
          phone: '+15551234567',
          name: 'Alice',
          email: undefined,
          company: undefined,
          tagNames: [],
        },
      ],
    });
  });
});
