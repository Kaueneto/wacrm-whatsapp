export interface PortfolioRunStatus {
  id?: string;
  state: string;
  started_at?: string;
  expires_at?: string;
  finished_at?: string | null;
  error?: string | null;
  prepared?: number;
  total_contracts?: number | null;
}

/** An expired lease cannot publish its staged data or count as a running job. */
export function portfolioRunStatus<T extends PortfolioRunStatus>(
  run: T | null,
  now = Date.now()
): T | null {
  if (
    run?.state !== 'running' ||
    !run.expires_at ||
    Date.parse(run.expires_at) > now
  )
    return run;
  return {
    ...run,
    state: 'failed',
    error:
      'A importação foi interrompida ou expirou. A carteira anterior foi preservada. Você pode iniciar novamente.',
  };
}
