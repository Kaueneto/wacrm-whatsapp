import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { encrypt, decrypt } from '@/lib/whatsapp/encryption';
import {
  authenticateUau,
  executeUauQuery,
  UauError,
  UAU_SESSION_MS,
  type UauConnection,
  type UauQuery,
} from './client';

interface ConnectionRow {
  base_url: string;
  api_version: string;
  session_header: string;
  bearer: boolean;
  credentials_encrypted: string;
  session_encrypted: string | null;
  session_expires_at: string | null;
  revision: string;
}

function connectionTable() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  ).from('uau_connections');
}

export async function getUauConnectionSettings(accountId: string) {
  const { data, error } = await connectionTable()
    .select('base_url,api_version,session_header,bearer')
    .eq('account_id', accountId)
    .maybeSingle();
  if (error) throw error;
  return data
    ? {
        baseUrl: data.base_url,
        version: data.api_version,
        sessionHeader: data.session_header,
        bearer: data.bearer,
      }
    : null;
}

function encryptedSession(token: string) {
  return {
    session_encrypted: encrypt(token),
    session_expires_at: new Date(Date.now() + UAU_SESSION_MS).toISOString(),
  };
}

export async function saveUauConnection(
  accountId: string,
  connection: UauConnection
) {
  const token = await authenticateUau(connection);
  const { integrationKey, login, password } = connection;
  const { error } = await connectionTable().upsert({
    account_id: accountId,
    base_url: connection.baseUrl,
    api_version: connection.version,
    session_header: connection.sessionHeader,
    bearer: connection.bearer,
    credentials_encrypted: encrypt(
      JSON.stringify({ integrationKey, login, password })
    ),
    revision: randomUUID(),
    updated_at: new Date().toISOString(),
    ...encryptedSession(token),
  });
  if (error) throw error;
}

async function loadConnection(accountId: string) {
  const { data, error } = await connectionTable()
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle<ConnectionRow>();
  if (error) throw error;
  if (!data)
    throw new UauError(
      'Cadastre a conexão em Configurações → Integrações antes de testar a consulta.',
      409
    );
  const credentials = JSON.parse(decrypt(data.credentials_encrypted)) as Pick<
    UauConnection,
    'integrationKey' | 'login' | 'password'
  >;
  return {
    row: data,
    connection: {
      ...credentials,
      baseUrl: data.base_url,
      version: data.api_version,
      sessionHeader: data.session_header,
      bearer: data.bearer,
    },
  };
}

const refreshes = new Map<string, Promise<string>>();

async function refreshSession(
  accountId: string,
  row: ConnectionRow,
  connection: UauConnection
) {
  const key = `${accountId}:${row.revision}`;
  const pending = refreshes.get(key);
  if (pending) return pending;
  const refresh = (async () => {
    const token = await authenticateUau(connection);
    const { data, error } = await connectionTable()
      .update(encryptedSession(token))
      .eq('account_id', accountId)
      .eq('revision', row.revision)
      .select('revision')
      .maybeSingle();
    if (error) throw error;
    if (!data)
      throw new UauError('A configuração do UAU mudou. Tente novamente.', 409);
    return token;
  })();
  refreshes.set(key, refresh);
  try {
    return await refresh;
  } finally {
    refreshes.delete(key);
  }
}

export async function testSavedUauConnection(accountId: string) {
  const { row, connection } = await loadConnection(accountId);
  await refreshSession(accountId, row, connection);
}

export async function runSavedUauQuery(accountId: string, query: UauQuery) {
  const { row, connection } = await loadConnection(accountId);
  const cached =
    row.session_encrypted &&
    row.session_expires_at &&
    Date.parse(row.session_expires_at) > Date.now();
  const token = cached
    ? decrypt(row.session_encrypted!)
    : await refreshSession(accountId, row, connection);
  try {
    return await executeUauQuery(connection, token, query);
  } catch (error) {
    if (!cached || !(error instanceof UauError) || error.status !== 401)
      throw error;
    return executeUauQuery(
      connection,
      await refreshSession(accountId, row, connection),
      query
    );
  }
}
