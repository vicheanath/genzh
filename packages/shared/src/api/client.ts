import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios'

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

export type TokenProvider = () => string | null | Promise<string | null>

let defaultBaseUrl = ''
let globalToken: string | null = null
let tokenProvider: TokenProvider | null = null

export function setApiBaseUrl(url: string): void {
  defaultBaseUrl = url.replace(/\/$/, '')
  apiClient.defaults.baseURL = defaultBaseUrl
}

export function getApiBaseUrl(): string {
  return defaultBaseUrl || apiClient.defaults.baseURL || ''
}

export function setAuthToken(token: string | null): void {
  globalToken = token
}

export function setTokenProvider(provider: TokenProvider | null): void {
  tokenProvider = provider
}

/**
 * Shared Axios instance for all API calls across web and mobile.
 */
export const apiClient: AxiosInstance = axios.create({
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor: inject base URL & authorization token
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    if (!config.baseURL && defaultBaseUrl) {
      config.baseURL = defaultBaseUrl
    }

    // Don't overwrite explicit authorization header if provided in request config
    if (!config.headers.Authorization) {
      let token = globalToken
      if (!token && tokenProvider) {
        token = await tokenProvider()
      }
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
    }
    return config
  },
  (error) => Promise.reject(error),
)

// Response interceptor: convert errors into typed ApiError
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error?: { code?: string; message?: string } }>) => {
    if (axios.isCancel(error)) {
      return Promise.reject(error)
    }

    if (!error.response) {
      // Network or transport failure
      return Promise.reject(new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server'))
    }

    const status = error.response.status
    const data = error.response.data
    const retryAfterHeader = error.response.headers?.['retry-after']
    const retryAfter = Number(retryAfterHeader)

    const code = data?.error?.code ?? 'UNKNOWN'
    const message = data?.error?.message ?? error.message ?? `Request failed (${status})`

    return Promise.reject(
      new ApiError(
        status,
        code,
        message,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
      ),
    )
  },
)

export interface RequestOptions {
  baseUrl?: string
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  token?: string | null
  signal?: AbortSignal
  params?: Record<string, unknown>
}

/**
 * Unified request function powered by Axios.
 */
export async function request<T>(
  path: string,
  { baseUrl, method = 'GET', body, token, signal, params }: RequestOptions = {},
): Promise<T> {
  const config: AxiosRequestConfig = {
    url: path,
    method,
    data: body,
    signal,
    params,
  }

  if (baseUrl) {
    config.baseURL = baseUrl
  }

  if (token !== undefined) {
    config.headers = {
      ...(config.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
  }

  const response = await apiClient.request<T>(config)
  return response.data
}
