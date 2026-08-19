import { useCallback, useEffect, useState } from 'react'

import { ApiError } from '@/lib/api'

export interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
}

/**
 * Run an async function and track its lifecycle.
 *
 * Deliberately small — no cache, no deduplication, no background refetch. This
 * app fetches a handful of resources per screen and pushes everything live over
 * a WebSocket, so a query library would be machinery without a matching
 * problem. If server-state caching becomes the bottleneck, this is the seam to
 * replace.
 */
export function useAsync<T>(
  run: () => Promise<T>,
  deps: React.DependencyList,
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  // `run` is intentionally not a dependency: callers pass an inline closure,
  // and depending on it would refetch on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const callback = useCallback(run, deps)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    callback()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(
          cause instanceof ApiError ? cause.message : 'Something went wrong',
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [callback, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return { data, loading, error, reload }
}
