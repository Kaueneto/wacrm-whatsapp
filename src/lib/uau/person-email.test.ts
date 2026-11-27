import { describe, expect, it, vi } from 'vitest';
import { loadUauPersonEmail } from './person-email';
import { executeUauRead, type UauRead, type UauConnection } from './client';

describe('portfolio customer email', () => {
  it('queries the exact numeric person id and returns only the email field', async () => {
    const read = vi.fn().mockResolvedValue([
      {
        CodigoPessoa: 77,
        EmailPessoa: ' cliente@example.com ',
        CpfPessoa: 'private',
        SenhaLoginPessoa: 'private',
        ListaDadosPessoaEndereco: [{ CodigoPessoa: 77, Endereco: 'private' }],
        ListaDadosPessoFisica: [{ CodigoPessoa: 77, Dados: 'private' }],
        ListaDadosPessoaJuridica: [],
      },
    ]);
    expect(await loadUauPersonEmail(read as UauRead, 77)).toBe(
      'cliente@example.com'
    );
    expect(read).toHaveBeenCalledExactlyOnceWith(
      'Pessoas/ConsultarPessoasPorCondicao',
      { condicaoConsultarPessoa: 'cod_pes = 77' }
    );
  });

  it.each([
    { rows: [] },
    { rows: [{ CodigoPessoa: 78, EmailPessoa: 'other@example.com' }] },
    { rows: [{ CodigoPessoa: 77 }, { CodigoPessoa: 78 }] },
  ])('rejects an unexpected identity or ambiguous result', async ({ rows }) => {
    const read = vi.fn().mockResolvedValue(rows);
    await expect(loadUauPersonEmail(read as UauRead, 77)).rejects.toThrow(
      /cadastro/
    );
  });

  it.each([null, '', 'null', '  '])(
    'keeps a missing email empty (%s)',
    async (email) => {
      const read = vi
        .fn()
        .mockResolvedValue([{ CodigoPessoa: 77, EmailPessoa: email }]);
      expect(await loadUauPersonEmail(read as UauRead, 77)).toBeNull();
    }
  );

  it.each(['cod_pes = 77 OR 1=1', "nome_pes LIKE '%'", 'cod_pes = 2147483648'])(
    'refuses arbitrary query conditions before a network request',
    (condition) => {
      expect(() =>
        executeUauRead(
          {} as UauConnection,
          '',
          'Pessoas/ConsultarPessoasPorCondicao',
          { condicaoConsultarPessoa: condition as `cod_pes = ${number}` }
        )
      ).toThrow(/Código/);
    }
  );
});
