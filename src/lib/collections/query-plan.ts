import {
  withUauReadSession,
  runSavedUauQuery,
  getUauConnectionRevision,
} from '@/lib/uau/connection-store';
import { normalizeQueryParameters } from '@/lib/uau/query-parameters-normalize';
import { UauError } from '@/lib/uau/client';
import {
  queryKinds,
  scopeLiteral,
  exclusionsLiteral,
  type PortfolioSetup,
  type QueryKind,
} from './setup';

export interface ContractKey {
  company: number;
  work: string;
  sale: number;
}
export function contractsLiteral(contracts: ContractKey[]): string {
  if (
    !contracts.length ||
    contracts.length > 50 ||
    contracts.some(
      (c) =>
        !Number.isSafeInteger(c.company) ||
        c.company <= 0 ||
        !Number.isSafeInteger(c.sale) ||
        c.sale <= 0 ||
        !/^[A-Za-z0-9_.-]{1,50}$/.test(c.work)
    )
  )
    throw new UauError('Lista de contratos inválida.', 422);
  return `N'<contratos>${contracts.map((c) => `<contrato empresa="${c.company}" obra="${c.work}" venda="${c.sale}" />`).join('')}</contratos>'`;
}
export async function createPortfolioPlan(
  accountId: string,
  setup: PortfolioSetup
) {
  const plan = await withUauReadSession(accountId, async (read, revision) => {
    const queries = {} as Record<
      QueryKind,
      {
        id: number;
        custom: 0 | 1;
        names: string[];
        supportsExclusions: boolean;
      }
    >;
    for (const kind of queryKinds) {
      const query = setup.queries[kind];
      if (!query.id)
        throw new UauError('Informe os códigos das duas consultas.', 422);
      const definitions = normalizeQueryParameters(
        await read('RotinasGerais/ConsultarParamConsultaGeral', {
          Id: query.id,
          Personalizado: query.custom,
        })
      );
      const names = definitions.map((p) => p.name);
      const required =
        kind === 'open'
          ? ['empresaobra', 'minimodiasatraso', 'pagina', 'tamanhopagina']
          : ['empresaobra', 'contratosxml'];
      if (required.some((name) => !names.some((n) => n.toLowerCase() === name)))
        throw new UauError(
          'Os parâmetros UAU não correspondem às consultas da carteira.',
          422
        );
      const supportsExclusions = names.some(
        (n) => n.toLowerCase() === 'exclusoesxml'
      );
      if (
        !supportsExclusions &&
        (setup.scope.mode === 'all' ||
          setup.excludedCompanies.length ||
          setup.excludedProjects.length)
      )
        throw new UauError(
          'Atualize o SQL das consultas no UAU e cadastre ExclusoesXml como texto nas duas para consultar todas as empresas/obras e aplicar exclusões.',
          409
        );
      queries[kind] = {
        id: query.id,
        custom: query.custom,
        names,
        supportsExclusions,
      };
    }
    return { revision, queries };
  });
  return {
    revision: plan.revision,
    async execute(
      kind: QueryKind,
      options: { page?: number; size?: number; contracts?: ContractKey[] } = {}
    ) {
      if ((await getUauConnectionRevision(accountId)) !== plan.revision)
        throw new UauError('A conexão UAU mudou. Repita a sincronização.', 409);
      const query = plan.queries[kind],
        stored = new Map(
          setup.queries[kind].parameters.map((p) => [
            p.name.toLowerCase(),
            p.value,
          ])
        );
      const automatic: Record<string, string> = {
        empresaobra: scopeLiteral(setup),
        exclusoesxml: exclusionsLiteral(setup),
      };
      if (kind === 'open')
        Object.assign(automatic, {
          minimodiasatraso: String(setup.minimumDays),
          pagina: String(options.page ?? 1),
          tamanhopagina: String(options.size ?? 100),
        });
      else automatic.contratosxml = contractsLiteral(options.contracts ?? []);
      const parameters = query.names.flatMap((name) => {
        const value =
          automatic[name.toLowerCase()] ?? stored.get(name.toLowerCase());
        if (!value?.trim())
          throw new UauError(`Preencha o parâmetro ${name}.`, 422);
        return [name, value];
      });
      const result = await runSavedUauQuery(accountId, {
        Id: query.id,
        Personalizado: query.custom,
        Parameters: parameters,
      });
      if ((await getUauConnectionRevision(accountId)) !== plan.revision)
        throw new UauError(
          'A conexão UAU mudou durante a leitura. Repita a sincronização.',
          409
        );
      return result;
    },
  };
}
