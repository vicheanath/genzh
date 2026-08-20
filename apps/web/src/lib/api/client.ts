import { config } from '@/lib/config'

/**
 * A failure the API reported, in its documented envelope:
 * `{ "error": { "code": "…", "message": "…" } }`.
 *
 * `code` is stable and safe to branch on; `message` is written for humans and
 * is what the UI shows.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  /**
   * How long to wait, from `Retry-After`.
   *
   * Only a refusal that is about *timing* carries one — a rate limit, an
   * anti-spam refusal — which is exactly when a UI has something better to say
   * than "that failed": it can say when to try again.
   */
  readonly retryAfterSeconds?: number

  constructor(status: number, code: string, message: string, retryAfterSeconds?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.retryAfterSeconds = retryAfterSeconds
  }

  /** The caller's credentials are missing, expired or revoked. */
  get isAuthFailure(): boolean {
    return this.status === 401
  }

  /** The caller is going too fast, whether by budget or by anti-spam rule. */
  get isThrottled(): boolean {
    return this.status === 429
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  token?: string | null
  signal?: AbortSignal
}

/**
 * One request against the API.
 *
 * Everything goes through here so that the error envelope is decoded in exactly
 * one place; callers see either a typed result or an `ApiError`, never a raw
 * `Response`.
 */
export async function request<T>(
  path: string,
  { method = 'GET', body, token, signal }: RequestOptions = {},
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${config.apiUrl}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    })
  } catch (cause) {
    // fetch only rejects on transport failure, which is worth distinguishing
    // from a 500: one means "the server said no", the other "we never reached
    // the server".
    if (signal?.aborted) throw cause
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server')
  }

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  const payload: unknown = text ? safeParse(text) : null

  if (!response.ok) {
    const envelope = payload as
      | { error?: { code?: string; message?: string } }
      | null
    const retryAfter = Number(response.headers.get('retry-after'))
    throw new ApiError(
      response.status,
      envelope?.error?.code ?? 'UNKNOWN',
      envelope?.error?.message ?? `Request failed (${response.status})`,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    )
  }

  return payload as T
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
