import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  getUauConnectionRevision,
  withUauReadSession,
} from '@/lib/uau/connection-store';
import { loadPortfolioSetup, projectInScope } from '@/lib/collections/sync';
import { createPortfolioPlan } from '@/lib/collections/query-plan';
import { snapshotFromUau } from '@/lib/collections/reconcile';
import {
  uauRows,
  detailedOpenInstallments,
  brazilDate,
} from '@/lib/uau/finance-normalize';
import { withInstallmentMetadata } from '@/lib/collections/installments';
import type { CollectionSnapshot } from '@/lib/collections/portfolio-types';
export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('admin');
    const key = new URL(request.url).searchParams.get('contract');
    if (!key || key.length > 150)
      return Response.json(
        { error: 'Informe um contrato válido.' },
        { status: 400 }
      );
    const revision = await getUauConnectionRevision(accountId);
    const [snapshot, settings] = await Promise.all([
      supabase
        .from('collection_contracts')
        .select('data')
        .eq('account_id', accountId)
        .eq('source_revision', revision ?? '')
        .eq('contract_key', key)
        .maybeSingle(),
      loadPortfolioSetup(supabase, accountId),
    ]);
    if (snapshot.error)
      return Response.json(
        { error: 'Falha ao carregar o contrato.' },
        { status: 503 }
      );
    if (
      !snapshot.data ||
      !projectInScope(
        settings.setup,
        snapshot.data.data.company,
        snapshot.data.data.work
      )
    )
      return Response.json(
        { error: 'Contrato não encontrado no escopo atual.' },
        { status: 404 }
      );
    if (new URL(request.url).searchParams.get('descriptions') === '1') {
      try {
        const stored = snapshot.data.data as CollectionSnapshot;
        const plan = await createPortfolioPlan(accountId, settings.setup);
        const rows = uauRows(
          await plan.execute('reconciliation', {
            contracts: [
              {
                company: Number(stored.company),
                work: stored.work,
                sale: stored.sale,
              },
            ],
          })
        );
        if (rows.length !== 1)
          throw new Error('Contrato não retornado pela consulta.');
        const fresh = snapshotFromUau(rows[0], settings.setup, stored);
        return Response.json(
          { contract: withInstallmentMetadata(stored, fresh) },
          { headers: { 'Cache-Control': 'no-store' } }
        );
      } catch {
        return Response.json(
          {
            error:
              'Não foi possível consultar as descrições das parcelas no UAU. Os valores da carteira foram preservados.',
          },
          { status: 502, headers: { 'Cache-Control': 'no-store' } }
        );
      }
    }
    if (new URL(request.url).searchParams.get('financial') === '1') {
      try {
        const stored = snapshot.data.data as CollectionSnapshot;
        const referenceDate = brazilDate();
        const positions = await withUauReadSession(
          accountId,
          async (read, currentRevision) => {
            if (currentRevision !== revision)
              throw new Error('Conexão alterada.');
            const raw = await read('Venda/BuscarParcelasAReceber', {
              empresa: Number(stored.company),
              obra: stored.work,
              num_ven: stored.sale,
              data_calculo: `${referenceDate}T00:00:00-03:00`,
              valor_presente: false,
            });
            return detailedOpenInstallments(
              raw,
              {
                key: stored.key,
                company: Number(stored.company),
                project: stored.work,
                sale: stored.sale,
                status: null,
                units: [],
              },
              referenceDate
            );
          }
        );
        if ((await getUauConnectionRevision(accountId)) !== revision)
          throw new Error('Conexão alterada.');
        return Response.json(
          {
            finance: {
              positions,
              referenceDate,
              updatedAt: new Date().toISOString(),
            },
          },
          { headers: { 'Cache-Control': 'no-store' } }
        );
      } catch {
        return Response.json(
          {
            error:
              'Não foi possível consultar os valores reajustados no UAU. O principal importado continua disponível.',
          },
          { status: 502, headers: { 'Cache-Control': 'no-store' } }
        );
      }
    }
    const { data, error } = await supabase
      .from('collection_contract_events')
      .select('id,kind,detail,created_at')
      .eq('account_id', accountId)
      .eq('source_revision', revision ?? '')
      .eq('contract_key', key)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error)
      return Response.json(
        { error: 'Falha ao carregar a trilha.' },
        { status: 503 }
      );
    return Response.json(
      { events: data, contract: snapshot.data.data },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
