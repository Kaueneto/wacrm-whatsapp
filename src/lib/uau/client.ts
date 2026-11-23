import { lookup } from 'node:dns';
import { Agent, request } from 'undici';
import { isPrivateOrReservedIp } from '@/lib/webhooks/ssrf';

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 25_000;
export const UAU_SESSION_MS = 115 * 60_000;

// Resolve and validate the same addresses the socket will actually use.
const dispatcher = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      lookup(
        hostname,
        {
          all: true,
          family:
            options.family === 4 || options.family === 6 ? options.family : 0,
        },
        (error, addresses) => {
          if (
            error ||
            !addresses.length ||
            addresses.some(({ address }) => isPrivateOrReservedIp(address))
          ) {
            callback(error ?? new Error('Endereço UAU indisponível.'), '');
          } else if (options.all) {
            callback(null, addresses);
          } else {
            callback(null, addresses[0].address, addresses[0].family);
          }
        }
      );
    },
  },
});

export interface UauConnection {
  baseUrl: string;
  version: string;
  sessionHeader: string;
  bearer: boolean;
  integrationKey: string;
  login: string;
  password: string;
}

export class UauError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export function normalizeUauBase(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new UauError(
      'Informe a URL base do Web Service, começando com http:// ou https://.',
      400
    );
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !host.includes('.') ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    (/^\d+(?:\.\d+){3}$/.test(host) && isPrivateOrReservedIp(host)) ||
    /(?:\/swagger(?:\/|$)|\/api\/v\d)/i.test(url.pathname)
  ) {
    throw new UauError(
      'Use a URL pública da raiz do Web Service UAU, sem o caminho da consulta.',
      400
    );
  }
  return url.href.replace(/\/+$/, '');
}

export function parseUauConnection(
  value: Record<string, unknown>
): UauConnection {
  const field = (key: string) =>
    typeof value[key] === 'string' ? (value[key] as string) : '';
  const version = field('version').trim().replace(/^v/i, '');
  const sessionHeader = field('sessionHeader').trim() || 'Authorization';
  const integrationKey = field('integrationKey').trim();
  const login = field('login').trim();
  const password = field('password');
  if (
    field('baseUrl').length > 2048 ||
    !/^\d{1,3}\.\d{1,3}$/.test(version) ||
    !integrationKey ||
    integrationKey.length > 4096 ||
    /[^\x21-\x7e]/.test(integrationKey) ||
    !login ||
    login.length > 256 ||
    !password.trim() ||
    password.length > 512 ||
    !/^[a-z][a-z0-9-]{0,63}$/i.test(sessionHeader) ||
    !/^(authorization|token|x-(?:auth|uau|access)[a-z0-9-]*)$/i.test(
      sessionHeader
    )
  ) {
    throw new UauError(
      'Confira a versão, a chave de integração, o usuário e a senha do UAU.',
      400
    );
  }
  return {
    baseUrl: normalizeUauBase(field('baseUrl')),
    version,
    sessionHeader,
    bearer: value.bearer === true,
    integrationKey,
    login,
    password,
  };
}

async function post(
  connection: UauConnection,
  path: string,
  payload: object,
  token?: string
): Promise<unknown> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-INTEGRATION-Authorization': connection.integrationKey,
  };
  if (token)
    headers[connection.sessionHeader] =
      connection.bearer && !/^Bearer /i.test(token) ? `Bearer ${token}` : token;
  try {
    const response = await request(
      `${connection.baseUrl}/api/v${connection.version}/${path}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        dispatcher,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      response.body.destroy();
      throw new UauError(
        `O UAU recusou a requisição (HTTP ${response.statusCode}).`,
        response.statusCode
      );
    }
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > MAX_RESPONSE_BYTES) {
        response.body.destroy();
        throw new UauError(
          'A consulta retornou dados demais. Restrinja o público no UAU e tente novamente.',
          422
        );
      }
      chunks.push(chunk);
    }
    const text = Buffer.concat(chunks).toString('utf8').trim();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch (error) {
    if (error instanceof UauError) throw error;
    throw new UauError(
      'Não foi possível acessar o UAU. Confira a URL, a porta e a disponibilidade do Web Service.',
      502
    );
  }
}

export async function authenticateUau(
  connection: UauConnection
): Promise<string> {
  const result = await post(connection, 'Autenticador/AutenticarUsuario', {
    Login: connection.login,
    Senha: connection.password,
  });
  const fields =
    result && typeof result === 'object'
      ? (result as Record<string, unknown>)
      : {};
  const token =
    typeof result === 'string'
      ? result
      : (fields.Token ??
        fields.token ??
        fields.AccessToken ??
        fields.access_token);
  if (
    typeof token !== 'string' ||
    !/^(?:Bearer )?[A-Za-z0-9._~+\/-]{16,}={0,2}$/.test(token) ||
    token.length > 8192
  ) {
    throw new UauError(
      'O UAU não retornou um token de autenticação. Confira a chave, o usuário e a senha.',
      502
    );
  }
  return token;
}

export interface UauQuery {
  Id: number;
  Personalizado: 0 | 1;
  Parameters: string[];
}

export async function executeUauQuery(
  connection: UauConnection,
  token: string,
  query: UauQuery
) {
  const result = await post(
    connection,
    'RotinasGerais/ExecutarConsultaGeral',
    query,
    token
  );
  if (
    !Array.isArray(result) ||
    !result.every(
      (row) => row && typeof row === 'object' && !Array.isArray(row)
    )
  ) {
    throw new UauError(
      'O UAU retornou um formato diferente de uma lista de registros.',
      422
    );
  }
  return result as Record<string, unknown>[];
}
