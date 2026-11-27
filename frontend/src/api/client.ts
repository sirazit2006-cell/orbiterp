import type { User } from './types'

/**
 * Small fetch wrapper for the Laravel API.
 * - Access token (JWT, 15 min) lives in memory only.
 * - Refresh token lives in sessionStorage so a page reload keeps the counter signed in,
 *   but closing the tab signs out. The server rotates it on every refresh.
 */
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'
const REFRESH_KEY = 'orbit.refresh'

let accessToken: string | null = null
let onSessionEnd: (() => void) | null = null

export class ApiError extends Error {
  status: number
  body: Record<string, unknown>
  constructor(status: number, body: Record<string, unknown>) {
    super((body.message as string) || `Request failed (${status})`)
    this.status = status
    this.body = body
  }
  /** Laravel validation errors: field -> first message */
  get fieldErrors(): Record<string, string> {
    const errs = (this.body.errors ?? {}) as Record<string, string[]>
    return Object.fromEntries(Object.entries(errs).map(([k, v]) => [k, v[0]]))
  }
}

function storedRefresh(): string | null {
  try { return sessionStorage.getItem(REFRESH_KEY) } catch { return null }
}
function storeRefresh(token: string | null) {
  try {
    if (token) sessionStorage.setItem(REFRESH_KEY, token)
    else sessionStorage.removeItem(REFRESH_KEY)
  } catch { /* private mode: stays in memory only */ }
}

export interface TokenPair { access_token: string; refresh_token: string; user: User }

export function setSession(pair: TokenPair | null) {
  accessToken = pair?.access_token ?? null
  storeRefresh(pair?.refresh_token ?? null)
}

export function onSessionEnded(cb: () => void) { onSessionEnd = cb }

export function hasStoredSession() { return !!storedRefresh() }

let refreshInFlight: Promise<User | null> | null = null

/** Refresh tokens are single-use, so concurrent callers must share one request. */
export function refreshSession(): Promise<User | null> {
  refreshInFlight ??= doRefresh().finally(() => { refreshInFlight = null })
  return refreshInFlight
}

async function doRefresh(): Promise<User | null> {
  const token = storedRefresh()
  if (!token) return null
  const res = await fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ refresh_token: token }),
  })
  if (!res.ok) { setSession(null); return null }
  const pair = (await res.json()) as TokenPair
  setSession(pair)
  return pair.user
}

async function tryRefresh(): Promise<boolean> {
  return !!(await refreshSession())
}

async function raw(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await tryRefresh()) return raw(path, init, false)
    setSession(null)
    onSessionEnd?.()
  }
  return res
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await raw(path, init)
  const body = res.status === 204 ? {} : await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, body)
  return body as T
}

export async function apiBlob(path: string): Promise<Blob> {
  const res = await raw(path)
  if (!res.ok) throw new ApiError(res.status, {})
  return res.blob()
}

export const get = <T>(path: string) => api<T>(path)
export const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) })
export const put = <T>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body: JSON.stringify(body) })

export async function login(username: string, password: string): Promise<User> {
  const pair = await api<TokenPair>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })
  setSession(pair)
  return pair.user
}

export async function logout(reason?: string) {
  const token = storedRefresh()
  setSession(null)
  if (token) {
    await fetch(`${BASE}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refresh_token: token, reason }),
    }).catch(() => undefined)
  }
}
