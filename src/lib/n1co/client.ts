/**
 * Cliente HTTP n1co.
 *
 * Maneja autenticación OAuth (clientId+clientSecret → Bearer token con TTL ~3598s),
 * cachea el token en memoria de proceso, y refresca automáticamente cuando faltan <60s
 * para expirar. Reintenta una vez si recibe 401 (token expirado mid-request).
 *
 * Variables de entorno requeridas:
 *   N1CO_CLIENT_ID
 *   N1CO_CLIENT_SECRET
 *   N1CO_API_BASE_URL  (default: https://api-sandbox.n1co.shop)
 */

import { N1coApiError, type N1coTokenResponse } from './types'

const TOKEN_REFRESH_BUFFER_MS = 60 * 1000

interface CachedToken {
  accessToken: string
  expiresAt: number
}

let tokenCache: CachedToken | null = null

function baseUrl(): string {
  return process.env.N1CO_API_BASE_URL ?? 'https://api-sandbox.n1co.shop'
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Falta variable de entorno: ${name}`)
  return v
}

async function fetchToken(): Promise<CachedToken> {
  const clientId = requireEnv('N1CO_CLIENT_ID')
  const clientSecret = requireEnv('N1CO_CLIENT_SECRET')

  const res = await fetch(`${baseUrl()}/api/v3/Token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new N1coApiError(res.status, body, `Auth fallida: ${res.status}`)
  }

  const json = (await res.json()) as N1coTokenResponse
  return {
    accessToken: json.accessToken,
    expiresAt: Date.now() + json.expiresIn * 1000,
  }
}

async function getToken(forceRefresh = false): Promise<string> {
  if (
    !forceRefresh &&
    tokenCache &&
    tokenCache.expiresAt - Date.now() > TOKEN_REFRESH_BUFFER_MS
  ) {
    return tokenCache.accessToken
  }
  tokenCache = await fetchToken()
  return tokenCache.accessToken
}

export interface N1coRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  path: string
  body?: unknown
  /** Por default usa /api/v3 base; si el path empieza con / se concatena directo. */
}

/**
 * Llama a un endpoint n1co con autenticación automática.
 * Si recibe 401, reintenta una vez con un token nuevo.
 * Lanza N1coApiError en cualquier respuesta no-2xx.
 */
export async function n1coRequest<T = unknown>(opts: N1coRequestOptions): Promise<T> {
  const url = `${baseUrl()}${opts.path}`
  let token = await getToken()

  const doFetch = (t: string) =>
    fetch(url, {
      method: opts.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${t}`,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store',
    })

  let res = await doFetch(token)
  if (res.status === 401) {
    // Token expirado mid-request — refrescar y reintentar una vez.
    token = await getToken(true)
    res = await doFetch(token)
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    let parsed: unknown = body
    try { parsed = JSON.parse(body) } catch { /* keep raw */ }
    throw new N1coApiError(res.status, parsed)
  }

  // Algunos endpoints devuelven body vacío (ej. cancel returns just an id)
  const text = await res.text()
  if (!text) return undefined as T
  try {
    return JSON.parse(text) as T
  } catch {
    return text as unknown as T
  }
}

/** Solo para tests: limpia el cache de token entre tests. */
export function _resetTokenCacheForTests() {
  tokenCache = null
}
