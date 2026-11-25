import { UauError } from './client';
import type { UauContract } from './finance-types';
import { normalizeUauLogin } from './user-login';

// Existing UAU communication channel confirmed by the workspace owner: 21 = Telefone.
export const UAU_ATTENDANCE_CHANNEL = 21;

export function attendanceRequest(
  input: {
    personId: number;
    login: string;
    category: string;
    description: string;
    type?: number;
    contract: UauContract | null;
    returnToCustomer?: boolean;
    recurrent?: boolean;
  },
  now = new Date()
) {
  if (
    !input.description.trim() ||
    input.description.length > 12000 ||
    !input.category ||
    (input.type !== undefined &&
      (!Number.isInteger(input.type) || input.type < 0 || input.type > 4))
  )
    throw new UauError(
      'Confira a categoria, o tipo e a descrição do atendimento.',
      400
    );
  // No inferred product/personalization IDs: the current contract API mapping only preserves labels.
  return {
    codpes_atd: input.personId,
    codcateg_atd: input.category,
    descr_atd: input.description.trim(),
    usrrespon_atd: normalizeUauLogin(input.login),
    usrcad_atd: normalizeUauLogin(input.login),
    numccm_atd: UAU_ATTENDANCE_CHANNEL,
    ...(input.type !== undefined ? { tipo_atd: input.type } : {}),
    retoraten_atd: input.returnToCustomer ? 1 : 0,
    reincidente_atd: input.recurrent ?? false,
    datacad_atd:
      new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      })
        .format(now)
        .replace(' ', 'T') + '-03:00',
    ...(input.contract
      ? {
          empresa_atd: input.contract.company,
          obra_atd: input.contract.project,
        }
      : {}),
  };
}
