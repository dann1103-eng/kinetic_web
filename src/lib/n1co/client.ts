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

/**
 * CheckoutLink API tiene base URL distinta a Integration API.
 *  - sandbox:   https://api-pay-sandbox.n1co.shop/api
 *  - producción: https://api-pay.n1co.shop/api
 * Override con N1CO_PAY_BASE_URL si fuera necesario.
 */
function payBaseUrl(): string {
  if (process.env.N1CO_PAY_BASE_URL) return process.env.N1CO_PAY_BASE_URL
  return process.env.N1CO_ENVIRONMENT === 'production'
    ? 'https://api-pay.n1co.shop/api'
    : 'https://api-pay-sandbox.n1co.shop/api'
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
 *
 * Routing y auth:
 *   - paths `/paymentlink/*` → CheckoutLink API (api-pay-sandbox|api-pay.n1co.shop/api)
 *     + auth: secret estático en `N1CO_CHECKOUT_LINK_SECRET` (Bearer)
 *   - resto → Integration API (api-sandbox|api.n1co.com)
 *     + auth: OAuth dinámico (clientId+clientSecret → Bearer con TTL ~3598s)
 *
 * Para Integration API: si recibe 401, reintenta una vez con token refrescado.
 * Lanza N1coApiError en cualquier respuesta no-2xx.
 */
export async function n1coRequest<T = unknown>(opts: N1coRequestOptions): Promise<T> {
  const isCheckoutLink = opts.path.startsWith('/paymentlink/')
  const url = `${isCheckoutLink ? payBaseUrl() : baseUrl()}${opts.path}`

  const buildHeaders = (token: string): HeadersInit => ({
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  })

  const doFetch = (t: string) =>
    fetch(url, {
      method: opts.method,
      headers: buildHeaders(t),
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store',
    })

  // CheckoutLink: secret estático, sin retry de auth.
  if (isCheckoutLink) {
    const secret = requireEnv('N1CO_CHECKOUT_LINK_SECRET')
    const res = await doFetch(secret)
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      let parsed: unknown = body
      try { parsed = JSON.parse(body) } catch { /* keep raw */ }
      throw new N1coApiError(res.status, parsed)
    }
    const text = await res.text()
    if (!text) return undefined as T
    try { return JSON.parse(text) as T } catch { return text as unknown as T }
  }

  // Integration API: OAuth dinámico con retry.
  let token = await getToken()
  let res = await doFetch(token)
  if (res.status === 401) {
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
