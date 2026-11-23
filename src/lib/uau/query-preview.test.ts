import { describe, expect, it } from 'vitest';
import { analyzeUauRows, resolveUauPhone } from './query-preview';

describe('UAU campaign preview', () => {
  it('prefers the WhatsApp column and keeps a separate DDD option', () => {
    const result = analyzeUauRows([
      {
        FoneWhats: '5562999990001',
        DDD: '62',
        FoneCliente: '99999-0001',
        CPF: '12345678901',
        CodCliente: 7,
      },
    ]);
    expect(result.phone).toEqual({
      column: 'FoneWhats',
      mode: 'international',
      identityColumn: 'CodCliente',
    });
    expect(result.suggestions).toContainEqual({
      column: 'FoneCliente',
      mode: 'br-local',
      dddColumn: 'DDD',
      identityColumn: 'CodCliente',
    });
    expect(result.suggestions.every(({ column }) => column !== 'CPF')).toBe(
      true
    );
    expect(result.examples).toEqual([{ phone: '+55 •••• 0001', values: {} }]);
  });

  it('maps names and values by column regardless of SQL field order', () => {
    const rows = [
      { Amount: 300, Phone: '61999990001', Customer: 'Cauê' },
      { Customer: 'Marina', Phone: '62999990002', Amount: '400,50' },
    ];
    const result = analyzeUauRows(
      rows,
      { column: 'Phone', mode: 'br-national' },
      [
        { variable: '1', column: 'Customer', format: 'text' },
        { variable: '2', column: 'Amount', format: 'money' },
      ]
    );
    expect(result.eligible).toBe(2);
    expect(result.examples[0].values).toEqual({
      '1': 'Cauê',
      '2': 'R$\u00a0300,00',
    });
    expect(result.examples[1].values['1']).toBe('Marina');
  });

  it('does not misroute numbers or pick one of multiple identities and amounts', () => {
    const result = analyzeUauRows(
      [
        { Celular: '99999-0001', DDDCelular: 62, Pessoa: 1, Valor: 300 },
        { Celular: '99999-0001', DDDCelular: 62, Pessoa: 2, Valor: 300 },
        { Celular: '99999-0002', DDDCelular: 62, Pessoa: 1, Valor: 300 },
        { Celular: '99999-0002', DDDCelular: 62, Pessoa: 1, Valor: 500 },
        { Celular: '99999-0003', DDDCelular: '', Pessoa: 3, Valor: 200 },
        { Celular: '99999-0004', DDDCelular: 62, Pessoa: 4, Valor: 'Cauê' },
        { Celular: '99999-0005', DDDCelular: 62, Pessoa: 5, Valor: 280 },
        { Celular: '99999-0005', DDDCelular: 62, Pessoa: 5, Valor: 280 },
      ],
      {
        column: 'Celular',
        mode: 'br-local',
        dddColumn: 'DDDCelular',
        identityColumn: 'Pessoa',
      },
      [{ variable: 'valor', column: 'Valor', format: 'money' }]
    );
    expect(result).toMatchObject({
      eligible: 1,
      invalid: 1,
      conflicts: 4,
      incomplete: 1,
      duplicates: 1,
    });
    expect(
      resolveUauPhone(
        { Fone: '+55 (62) 99999-0001' },
        { column: 'Fone', mode: 'br-national' }
      )
    ).toBeNull();
  });

  it('reports schema changes and invalid dates', () => {
    const rows = [{ WhatsApp: '+55 62 99999-0001', Data: '31/02/2026' }];
    const phone = { column: 'WhatsApp', mode: 'international' } as const;
    expect(
      analyzeUauRows(rows, phone, [
        { variable: 'v', column: 'Missing', format: 'text' },
      ]).missingColumns
    ).toEqual(['Missing']);
    expect(
      analyzeUauRows(rows, phone, [
        { variable: 'v', column: 'Data', format: 'date' },
      ]).incomplete
    ).toBe(1);
  });

  it('explains blank and zero phones, duplicate rows and separate conflicts', () => {
    const result = analyzeUauRows(
      [
        { WhatsApp: '', Customer: 'A', Value: 50 },
        { WhatsApp: '5500000000000', Customer: 'A', Value: 50 },
        { WhatsApp: '5562000000000', Customer: 'A', Value: 50 },
        { WhatsApp: '5562999990001', Customer: 'A', Value: 50 },
        { WhatsApp: '5562999990001', Customer: 'A', Value: 50 },
        { WhatsApp: '5562999990002', Customer: 'A', Value: 50 },
        { WhatsApp: '5562999990002', Customer: 'B', Value: 50 },
        { WhatsApp: '5562999990003', Customer: 'C', Value: null },
      ],
      { column: 'WhatsApp', mode: 'international', identityColumn: 'Customer' },
      [{ variable: '1', column: 'Value', format: 'money' }]
    );
    expect(result.assessments.map(({ status }) => status)).toEqual([
      'invalid',
      'invalid',
      'invalid',
      'eligible',
      'duplicates',
      'conflicts',
      'conflicts',
      'incomplete',
    ]);
    expect(result.assessments[0].reason).toContain('vazio');
    expect(result.assessments[2].reason).toContain('zeros');
    expect(result.assessments[4].reason).toContain('linha 4');
    expect(result.assessments[5].reason).toContain('clientes diferentes');
    expect(result.assessments[7].reason).toContain('Value');
  });
});
