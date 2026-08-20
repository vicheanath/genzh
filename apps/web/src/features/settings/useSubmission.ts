import { useCallback, useState } from 'react'

import { ApiError } from '@/lib/api'

export interface Submission {
  /** True while a request is in flight. */
  busy: boolean
  /** The last failure, or null. Cleared when a new attempt starts. */
  error: string | null
  /** Clear the error without running anything. */
  reset: () => void
  /** Run a request, returning its result or null if it failed. */
  run: <T>(task: () => Promise<T>) => Promise<T | null>
}

/**
 * The busy/error pair every settings form needs.
 *
 * Each tab submits one request at a time and has to show a spinner while it is
 * in flight and a message if it fails. Written out per tab that is three
 * `useState`s and a try/finally, repeated six times and drifting; here it is
 * one hook that cannot forget to clear the flag.
 */
export function useSubmission(): Submission {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => setError(null), [])

  const run = useCallback(async <T,>(task: () => Promise<T>): Promise<T | null> => {
    setError(null)
    setBusy(true)
    try {
      return await task()
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Something went wrong')
      return null
    } finally {
      setBusy(false)
    }
  }, [])

  return { busy, error, reset, run }
}
