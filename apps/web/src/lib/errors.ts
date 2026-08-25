import { ApiError } from '@/lib/api'

/**
 * What to show a person when something failed.
 *
 * The API's `message` is written for humans and is the best text available, so
 * it is preferred whenever the failure came from the API at all. Anything else
 * — a bug in a handler, a parse failure — gets the fallback, because its
 * message is written for whoever is reading a stack trace.
 */
export function errorText(cause: unknown, fallback = 'Something went wrong'): string {
  if (cause instanceof ApiError) return cause.message
  return fallback
}
