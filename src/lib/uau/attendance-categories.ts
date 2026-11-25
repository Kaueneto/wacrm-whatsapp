import { UauError } from './client';
import { uauRows } from './finance-normalize';

export interface UauAttendanceCategory {
  code: string;
  name: string;
  parentCode: string | null;
  workflowLink: number | null;
}

export function attendanceCategories(
  input: unknown,
  { requireWorkflow = false }: { requireWorkflow?: boolean } = {}
): UauAttendanceCategory[] {
  const categories = new Map<string, UauAttendanceCategory>();
  for (const row of uauRows(input)) {
    if (![0, 1, '0', '1'].includes(row.AtInat_cger as number | string))
      throw new UauError('Status de categoria UAU não reconhecido.', 502);
    if (Number(row.AtInat_cger) !== 0) continue;
    const code =
      typeof row.Codigo_cger === 'string' ? row.Codigo_cger.trim() : '';
    const name = typeof row.Desc_cger === 'string' ? row.Desc_cger.trim() : '';
    if (!code || code === 'null' || !name || name === 'null')
      throw new UauError('Formato de categoria UAU não reconhecido.', 502);
    const parent = row.CodCategPai_cger;
    const workflow = Number(row.NumVcwf_CGer);
    categories.set(code, {
      code,
      name,
      parentCode:
        typeof parent === 'string' && parent !== 'null' && parent.trim()
          ? parent.trim()
          : null,
      workflowLink:
        Number.isSafeInteger(workflow) && workflow > 0 ? workflow : null,
    });
  }
  return [...categories.values()]
    .filter((category) => !requireWorkflow || category.workflowLink !== null)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
