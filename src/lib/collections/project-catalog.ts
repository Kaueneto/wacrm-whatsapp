import {
  withUauReadSession,
  getUauConnectionRevision,
} from '@/lib/uau/connection-store';
import { uauRows } from '@/lib/uau/finance-normalize';
import { supabaseAdmin } from '@/lib/ai/admin-client';
import { readPortfolioCards } from './sync';
export interface CatalogCompany {
  code: string;
  name: string;
}
export interface CatalogWork {
  company: string;
  code: string;
  name: string;
  source: 'uau' | 'portfolio';
}
export interface ProjectCatalog {
  companies: CatalogCompany[];
  works: CatalogWork[];
}
const cache = new Map<
  string,
  { until: number; value: Promise<ProjectCatalog> }
>();
const get = (row: Record<string, unknown>, name: string) =>
  row[
    Object.keys(row).find((k) => k.toLowerCase() === name.toLowerCase()) ?? name
  ];
export function normalizeProjectCatalog(
  companies: unknown,
  works: unknown
): ProjectCatalog {
  const companyMap = new Map<string, CatalogCompany>(),
    workMap = new Map<string, CatalogWork>();
  for (const row of uauRows(companies)) {
    const code = String(get(row, 'Codigo_emp') ?? '');
    const name = get(row, 'Desc_emp');
    if (!/^[1-9]\d*$/.test(code) || typeof name !== 'string')
      throw Error('A API de empresas retornou um formato desconhecido.');
    companyMap.set(code, { code, name: name.trim() });
  }
  for (const row of uauRows(works)) {
    const company = String(get(row, 'Empresa_obr') ?? '');
    const code = get(row, 'Cod_obr'),
      name = get(row, 'Descr_obr');
    if (
      !/^[1-9]\d*$/.test(company) ||
      typeof code !== 'string' ||
      !code.trim() ||
      typeof name !== 'string'
    )
      throw Error('A API de obras retornou um formato desconhecido.');
    const work = {
      company,
      code: code.trim(),
      name: name.trim(),
      source: 'uau' as const,
    };
    workMap.set(`${company}|${work.code.toUpperCase()}`, work);
    if (!companyMap.has(company))
      companyMap.set(company, { code: company, name: `Empresa ${company}` });
  }
  return {
    companies: [...companyMap.values()].sort(
      (a, b) => Number(a.code) - Number(b.code)
    ),
    works: [...workMap.values()].sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR')
    ),
  };
}
export async function loadProjectCatalog(
  accountId: string
): Promise<ProjectCatalog> {
  const revision = await getUauConnectionRevision(accountId);
  if (!revision) throw Error('Cadastre a conexão UAU primeiro.');
  const key = accountId + ':' + revision,
    stored = cache.get(key);
  if (stored && stored.until > Date.now()) return stored.value;
  const value = withUauReadSession(accountId, async (read, actualRevision) => {
    if (actualRevision !== revision)
      throw Error('A conexão UAU mudou. Tente novamente.');
    const companies = await read('Empresa/ObterEmpresasAtivas', {}),
      works = await read('Obras/ObterObrasAtivas', {});
    const catalog = normalizeProjectCatalog(companies, works);
    const portfolio = await readPortfolioCards(
      supabaseAdmin(),
      accountId,
      revision
    );
    for (const card of portfolio) {
      if (!catalog.companies.some((c) => c.code === card.company))
        catalog.companies.push({
          code: card.company,
          name: `Empresa ${card.company} · encontrada na carteira`,
        });
      if (
        !catalog.works.some(
          (w) =>
            w.company === card.company &&
            w.code.toUpperCase() === card.work.toUpperCase()
        )
      )
        catalog.works.push({
          company: card.company,
          code: card.work,
          name: card.project,
          source: 'portfolio',
        });
    }
    if ((await getUauConnectionRevision(accountId)) !== revision)
      throw Error('A conexão UAU mudou. Atualize a busca.');
    return catalog;
  });
  if (cache.size >= 50) {
    for (const [k, entry] of cache)
      if (entry.until < Date.now()) cache.delete(k);
    if (cache.size >= 50) cache.delete(cache.keys().next().value!);
  }
  cache.set(key, { until: Date.now() + 300000, value });
  try {
    return await value;
  } catch (error) {
    if (cache.get(key)?.value === value) cache.delete(key);
    throw error;
  }
}
