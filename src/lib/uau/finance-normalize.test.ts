import { describe, expect, it } from 'vitest';
import {
  brazilDate,
  contracts,
  customers,
  maskCpf,
  normalizeCpf,
  openInstallments,
  phones,
  receivedInstallments,
  uauRows,
} from './finance-normalize';

const cpf = '52998224725'; // Test fixture only; never sent to the live ERP.
const contract = {
  key: '[1,"ABC",12]',
  company: 1,
  project: 'ABC',
  sale: 12,
  status: 0,
  units: [],
};
describe('UAU finance normalization', () => {
  it('validates CPF check digits and does not accept truncated or arbitrary identifiers', () => {
    expect(normalizeCpf('529.982.247-25')).toBe(cpf);
    for (const invalid of [
      '11111111111',
      '52998224724',
      '529982247',
      '529982247250',
      'x52998224725',
      null,
    ])
      expect(() => normalizeCpf(invalid)).toThrow('CPF');
    expect(maskCpf(cpf)).toBe('***.***.247-25');
  });
  it('whitelists customer fields and never forwards portal credentials', () => {
    const result = customers(
      JSON.stringify({
        Table: [
          {
            cod_pes: 7,
            nome_pes: 'Cliente exemplo',
            cpf_pes: cpf,
            email: 'cliente@example.com',
            login: 'portal',
            senha: 'do-not-forward',
          },
        ],
      }),
      cpf
    );
    expect(result).toEqual([
      { id: 7, name: 'Cliente exemplo', email: 'cliente@example.com' },
    ]);
    expect(JSON.stringify(result)).not.toContain('do-not-forward');
  });
  it('reads namespaced DataSets and XML entities without executing DTDs', () => {
    expect(
      customers(
        `<NewDataSet><Table><cod_pes>7</cod_pes><nome_pes>Ana &amp; Cia</nome_pes><cpf_pes>${cpf}</cpf_pes><email /></Table></NewDataSet>`,
        cpf
      )
    ).toEqual([{ id: 7, name: 'Ana & Cia', email: null }]);
    expect(uauRows('<NewDataSet />')).toEqual([]);
    expect(() =>
      uauRows('<!DOCTYPE doc [<!ENTITY file SYSTEM "file:///secret">]><doc/>')
    ).toThrow();
    expect(() => uauRows('<root><unclosed>')).toThrow();
  });
  it('groups units by company, project and sale without merging repeated sale numbers', () => {
    const result = contracts([
      { Empresa: 1, Obra: 'ABC', Venda: 12, IdentificadorUnid: 'Lote 1' },
      { Empresa: 1, Obra: 'ABC', Venda: 12, IdentificadorUnid: 'Lote 2' },
      { Empresa: 2, Obra: 'ABC', Venda: 12 },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].units).toEqual(['Lote 1', 'Lote 2']);
    expect(result[1].key).not.toBe(result[0].key);
  });
  it('preserves personalization description separately from the unit identifier', () => {
    const [contract] = contracts([
      {
        Empresa: 1,
        Obra: 'PSG01',
        Venda: 12,
        DescPerson: 'Residencial Porto Seguro',
        IdentificadorUnid: 'Quadra 18 Lote 14',
      },
    ]);
    expect(contract.unitDetails).toEqual([
      {
        description: 'Residencial Porto Seguro',
        identifier: 'Quadra 18 Lote 14',
      },
    ]);
    expect(contract.units).toEqual([
      'Residencial Porto Seguro · Quadra 18 Lote 14',
    ]);
  });
  it('distinguishes yesterday, today and future due dates in Brazil without rounding money totals', () => {
    expect(brazilDate(new Date('2026-11-24T01:00:00Z'))).toBe('2026-11-23');
    const result = openInstallments(
      {
        Vendas: [
          {
            Empresa: 1,
            Obra: 'ABC',
            Venda: 12,
            ParcelasVenda: [
              {
                NumParcela: 1,
                NumGeralParcela: 1,
                TipoParcela: 'P',
                ValorParcela: '1.234,56',
                DataVencimento: '2026-11-23T00:00:00',
              },
              {
                NumParcela: 2,
                NumGeralParcela: 2,
                TipoParcela: 'P',
                ValorParcela: 10.01,
                DataVencimento: '2026-11-24',
              },
              {
                NumParcela: 3,
                NumGeralParcela: 3,
                TipoParcela: 'P',
                ValorParcela: 20,
                DataVencimento: '2026-12-01',
              },
            ],
          },
        ],
      },
      contract,
      '2026-11-24'
    );
    expect(result.map((row) => row.daysOverdue)).toEqual([1, 0, 0]);
    expect(result.map((row) => row.amountCents)).toEqual([123456, 1001, 2000]);
    expect(openInstallments({ Vendas: [] }, contract, '2026-11-24')).toEqual(
      []
    );
    expect(() =>
      openInstallments({ unexpected: [] }, contract, '2026-11-24')
    ).toThrow();
  });
  it('preserves separate partial receipts, verifies the sale and rejects unknown schemas', () => {
    const row = {
      Empresa_rec: 1,
      Obra_rec: 'ABC',
      NumVend_rec: 12,
      NumParc_rec: 1,
      NumParcGer_rec: 10,
      Tipo_rec: 'P',
      Valor_rec: 25,
      DataRec: '2026-11-24',
    };
    expect(
      receivedInstallments(
        {
          Table: [
            { ...row, NumReceb_rec: 1 },
            { ...row, NumReceb_rec: 2 },
          ],
        },
        contract
      )
    ).toHaveLength(2);
    expect(() =>
      receivedInstallments([{ ...row, NumVend_rec: 99 }], contract)
    ).toThrow();
    expect(() =>
      receivedInstallments({ Table: [{ UnknownValue: 10 }] }, contract)
    ).toThrow();
    expect(
      phones([{ DDD: '62', Telefone: '99999-0000', Tipo: 2, Principal: 1 }])[0]
        .number
    ).toBe('(62) 99999-0000');
  });
});

it('reads the installed UAU Email_pes field without exposing other person fields', () => {
  expect(
    customers(
      [
        {
          cod_pes: 7,
          nome_pes: 'Exemplo',
          cpf_pes: cpf,
          Email_pes: 'contato@example.com',
          senha_pes: 'secret',
        },
      ],
      cpf
    )
  ).toEqual([{ id: 7, name: 'Exemplo', email: 'contato@example.com' }]);
  expect(
    customers(
      [{ cod_pes: 7, nome_pes: 'Exemplo', cpf_pes: cpf, Email_pes: 'null' }],
      cpf
    )[0].email
  ).toBeNull();
  expect(
    customers(
      [
        {
          cod_pes: 7,
          nome_pes: 'Exemplo',
          cpf_pes: cpf,
          Email_pes: '',
          email: 'fallback@example.com',
        },
      ],
      cpf
    )[0].email
  ).toBe('fallback@example.com');
});
