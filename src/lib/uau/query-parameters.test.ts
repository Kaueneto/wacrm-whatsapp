import { describe, it, expect } from 'vitest';
import { normalizeQueryParameters } from './query-parameters-normalize';
import { mergeQueryParameterValues } from './query-parameters';
describe('UAU query parameter discovery', () => {
  const row = {
    Parametro: 'DiasAtraso',
    Descricao: 'Dias em atraso',
    Tipo: 1,
    Restrito: 0,
    MultiSelecao: false,
  };
  it('extracts safe metadata from UAU tables and ignores the technical schema row', () => {
    const schema = Object.fromEntries(
      Object.keys(row).map((key) => [
        key,
        'System.String, mscorlib, Version=4.0.0.0',
      ])
    );
    expect(
      normalizeQueryParameters([
        { Table: [schema, { ...row, Sql: 'private', Secret: 'hidden' }] },
      ])
    ).toEqual([
      {
        name: 'DiasAtraso',
        description: 'Dias em atraso',
        type: '1',
        restricted: false,
        multiple: false,
      },
    ]);
  });
  it('accepts serialized tables and empty parameter lists', () => {
    expect(
      normalizeQueryParameters(JSON.stringify({ Table: [row] }))
    ).toHaveLength(1);
    expect(normalizeQueryParameters({ Table: [] })).toEqual([]);
  });
  it('preserves restriction flags without assuming unknown values are false', () => {
    expect(
      normalizeQueryParameters({
        Table: [{ ...row, Restrito: 'True', MultiSelecao: 1 }],
      })[0]
    ).toMatchObject({ restricted: true, multiple: true });
    expect(
      normalizeQueryParameters({
        Table: [{ ...row, Restrito: null, MultiSelecao: {} }],
      })[0]
    ).toMatchObject({ restricted: null, multiple: null });
  });
  it('rejects duplicate names, unsupported formats and excessive metadata', () => {
    expect(() =>
      normalizeQueryParameters({
        Table: [row, { ...row, Parametro: 'diasatraso' }],
      })
    ).toThrow('duplicados');
    expect(() =>
      normalizeQueryParameters({ Table: [{ ...row, Parametro: '; SQL' }] })
    ).toThrow('não reconhecido');
    expect(() =>
      normalizeQueryParameters({
        Table: Array.from({ length: 51 }, (_, i) => ({
          ...row,
          Parametro: 'P' + i,
        })),
      })
    ).toThrow('50');
  });
  it('preserves saved values by name, drops removed fields and leaves new fields blank', () => {
    const defs = normalizeQueryParameters({
      Table: [row, { ...row, Parametro: 'Empresa' }],
    });
    expect(
      mergeQueryParameterValues(defs, [
        { name: 'diasatraso', value: '3' },
        { name: 'Antigo', value: 'unused' },
      ])
    ).toEqual([
      { name: 'DiasAtraso', value: '3' },
      { name: 'Empresa', value: '' },
    ]);
    expect(
      mergeQueryParameterValues(defs, [{ name: 'DiasAtraso', value: '5' }])[0]
        .value
    ).toBe('5');
  });
  it('keeps SQL-specific formatting in existing parameter values unchanged', () => {
    const defs = normalizeQueryParameters({
      Table: [{ ...row, Parametro: 'Obra' }],
    });
    expect(
      mergeQueryParameterValues(defs, [{ name: 'Obra', value: "'ABC'" }])[0]
        .value
    ).toBe("'ABC'");
  });
});
