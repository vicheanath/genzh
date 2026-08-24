import type { Permission } from './api/types'

/**
 * Does this permission set grant `permission`?
 *
 * The API returns the *resolved* set for the caller, but it does not expand
 * `administrator` into the other thirteen — server-side that one short-circuits
 * every check (`PermissionSet::grants`), so a community owner's room comes back
 * as exactly `["administrator"]`.
 *
 * A client that tests `permissions.includes('send_message')` therefore hides the
 * composer from the person who owns the place. This mirrors the server's rule in
 * the one function every screen asks through, rather than repeating the
 * `|| includes('administrator')` at each call site and eventually missing one.
 */
export function can(permissions: Permission[], permission: Permission): boolean {
  return permissions.includes('administrator') || permissions.includes(permission)
}
