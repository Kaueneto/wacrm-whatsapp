import { UauError, type UauRead } from './client';
import {
  brazilDate,
  contracts,
  customers,
  maskCpf,
  detailedOpenInstallments,
  phones,
  receivedInstallments,
} from './finance-normalize';
import type { UauCustomer, UauFinance } from './finance-types';
import { normalizeAttendances } from './attendance-normalize';

export async function findUauCustomers(
  read: UauRead,
  cpf: string
): Promise<UauCustomer[]> {
  return customers(
    await read('Pessoas/ConsultarPessoasPorCPFCNPJ', {
      cpf_cnpj: cpf,
      status: 2,
    }),
    cpf
  );
}

export async function loadContactFinance(
  read: UauRead,
  cpf: string,
  personId: number,
  selectedKey?: string
): Promise<UauFinance> {
  const person = (await findUauCustomers(read, cpf)).find(
    (person) => person.id === personId
  );
  if (!person)
    throw new UauError(
      'O cadastro vinculado não foi encontrado no UAU. Confira o vínculo.',
      409
    );
  const [unitData, phoneData, attendanceData] = await Promise.all([
    read('Venda/ConsultarUnidadesCompradasPorCPFCNPJ', { CpfCnpj: cpf }),
    read('Pessoas/ConsultarTelefones', { Numero: person.id })
      .then(phones)
      .then(
        (value) => ({ ok: true as const, value }),
        () => ({ ok: false as const })
      ),
    read('Atendimento/ConsultarAtendimentoPorPessoa', {
      codigo_pessoa: person.id,
    })
      .then(normalizeAttendances)
      .then(
        (value) => ({ ok: true as const, value }),
        () => ({ ok: false as const })
      ),
  ]);
  const sales = contracts(unitData);
  const selected = selectedKey
    ? sales.find((sale) => sale.key === selectedKey)
    : sales[0];
  if (selectedKey && !selected)
    throw new UauError('Esse contrato não pertence ao CPF vinculado.', 403);
  const result: UauFinance = {
    linked: true,
    customer: person,
    documentMasked: maskCpf(cpf),
    document: cpf,
    phones: phoneData.ok ? phoneData.value : null,
    contracts: sales,
    selectedKey: selected?.key ?? null,
    open: null,
    received: null,
    attendances: attendanceData.ok ? attendanceData.value : null,
    warnings: [
      ...(phoneData.ok ? [] : ['phones' as const]),
      ...(attendanceData.ok ? [] : ['attendances' as const]),
    ],
    updatedAt: new Date().toISOString(),
  };
  if (!selected) return result;
  const [open, received] = await Promise.allSettled([
    read('Venda/BuscarParcelasAReceber', {
      empresa: selected.company,
      obra: selected.project,
      num_ven: selected.sale,
      data_calculo: `${brazilDate()}T00:00:00-03:00`,
      valor_presente: false,
    }).then((data) => detailedOpenInstallments(data, selected, brazilDate())),
    read('Venda/BuscarParcelasRecebidas', {
      empresa: selected.company,
      obra: selected.project,
      num_ven: selected.sale,
    }).then((data) => receivedInstallments(data, selected)),
  ]);
  if (open.status === 'fulfilled') result.open = open.value;
  else result.warnings.push('open');
  if (received.status === 'fulfilled') result.received = received.value;
  else result.warnings.push('received');
  result.updatedAt = new Date().toISOString();
  return result;
}
