/**
 * Join class names, dropping anything falsy.
 *
 * Deliberately not `clsx`: composing CSS Module class names needs exactly this
 * and nothing more, and a dependency that ships an object/array DSL invites
 * conditional-class soup at call sites.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
