/**
 * Build-time configuration.
 *
 * Vite inlines `import.meta.env.VITE_*` at build time, so these are baked into
 * the bundle. Nothing secret belongs here — the API base URL is public by
 * definition, and the media server URL is deliberately absent because the API
 * returns it per room.
 */

const DEFAULT_API_URL = ''

export const config = {
  apiUrl: (import.meta.env.VITE_API_URL ?? DEFAULT_API_URL).replace(/\/$/, ''),
} as const
