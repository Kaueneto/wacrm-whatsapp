import { describe, expect, it, vi } from 'vitest';
import { loadContactFinance } from './contact-finance';
import type { UauRead } from './client';

const cpf = '52998224725';
function fixture(fail?: string) {
  return vi.fn(async (operation: string) => {
    if (operation === fail) throw new Error('ERP unavailable');
    switch (operation) {
      case 'Pessoas/ConsultarPessoasPorCPFCNPJ':
        return [{ cod_pes: 7, nome_pes: 'Cliente', cpf_pes: cpf }];
      case 'Atendimento/ConsultarAtendimentoPorPessoa':
        return [{ MyTable: [] }];
      case 'Pessoas/ConsultarTelefones':
        return [{ DDD: '62', Telefone: '999990000' }];
      case 'Venda/ConsultarUnidadesCompradasPorCPFCNPJ':
        return [{ Empresa: 1, Obra: 'ABC', Venda: 12 }];
      case 'Venda/BuscarParcelasAReceber':
        return { MyTable: [] };
      case 'Venda/BuscarParcelasRecebidas':
        return { Table: [] };
      default:
        throw new Error('Unexpected operation');
    }
  });
}
describe('contact finance read orchestration', () => {
  it('uses documented request keys and limits the response to a confirmed person and sale', async () => {
    const read = fixture();
    const result = await loadContactFinance(read as UauRead, cpf, 7);
    expect(result.document).toBe(cpf);
    expect(read).toHaveBeenCalledWith('Pessoas/ConsultarTelefones', {
      Numero: 7,
    });
    expect(read).toHaveBeenCalledWith(
      'Venda/ConsultarUnidadesCompradasPorCPFCNPJ',
      { CpfCnpj: cpf }
    );
    expect(read).toHaveBeenCalledWith('Venda/BuscarParcelasRecebidas', {
      empresa: 1,
      obra: 'ABC',
      num_ven: 12,
    });
    expect(read).toHaveBeenCalledWith(
      'Atendimento/ConsultarAtendimentoPorPessoa',
      { codigo_pessoa: 7 }
    );
    expect(read).toHaveBeenCalledWith('Venda/BuscarParcelasAReceber', {
      empresa: 1,
      obra: 'ABC',
      num_ven: 12,
      data_calculo: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T00:00:00-03:00$/),
      valor_presente: false,
    });
    expect(result.attendances).toEqual([]);
    expect(result.open).toEqual([]);
    expect(result.received).toEqual([]);
    const { document: displayedDocument, ...otherFields } = result;
    expect(displayedDocument).toBe(cpf);
    expect(JSON.stringify(otherFields)).not.toContain(cpf);
  });
  it('does not mistake a failed financial query for a zero balance', async () => {
    const result = await loadContactFinance(
      fixture('Venda/BuscarParcelasAReceber') as UauRead,
      cpf,
      7
    );
    expect(result.open).toBeNull();
    expect(result.warnings).toContain('open');
    expect(result.received).toEqual([]);
  });
  it('keeps financial data usable if only the phone consultation fails', async () => {
    const result = await loadContactFinance(
      fixture('Pessoas/ConsultarTelefones') as UauRead,
      cpf,
      7
    );
    expect(result.phones).toBeNull();
    expect(result.warnings).toEqual(['phones']);
  });
  it('refuses another sale before querying its financial records', async () => {
    const read = fixture();
    await expect(
      loadContactFinance(read as UauRead, cpf, 7, '[1,"ABC",99]')
    ).rejects.toThrow('não pertence');
    expect(
      read.mock.calls.some(
        ([operation]) =>
          operation.includes('AReceber') || operation.includes('Recebidas')
      )
    ).toBe(false);
  });
  it('requires the stored ERP identity to still match the document', async () => {
    const read = fixture();
    await expect(loadContactFinance(read as UauRead, cpf, 8)).rejects.toThrow(
      'não foi encontrado'
    );
    expect(read).toHaveBeenCalledTimes(1);
  });
});

it('keeps finance usable when attendance lookup fails', async () => {
  const result = await loadContactFinance(
    fixture('Atendimento/ConsultarAtendimentoPorPessoa') as UauRead,
    cpf,
    7
  );
  expect(result.attendances).toBeNull();
  expect(result.warnings).toEqual(['attendances']);
  expect(result.open).toEqual([]);
});
