import { createContext, use, useCallback, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { AlertDialog } from './AlertDialog'

export interface ConfirmOptions {
  title: ReactNode
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<Confirm | null>(null)

/**
 * `window.confirm`, replaced.
 *
 * Four call sites used the native dialog to guard a destructive action. That
 * dialog cannot be styled, says "localhost:5173 says" above the question, is
 * synchronous — it blocks the main thread and the render loop with it — and on
 * mobile Safari can be suppressed entirely by the browser, in which case the
 * delete goes through with no prompt at all.
 *
 * The shape is kept deliberately identical so the call sites read the same:
 *
 *   if (!(await confirm({ title: 'Delete #general?' }))) return
 *
 * The promise resolves `false` on cancel and on Escape, never rejects, so a
 * caller can only forget to await it — not forget to catch it.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolveRef = useRef<((value: boolean) => void) | null>(null)
  /**
   * Set by the confirm button, read when the dialog reports it has closed.
   *
   * Both fire from the same click — the button's `onClick` and the resulting
   * `onOpenChange(false)` — and Base UI makes no promise about which order a
   * merged handler runs in. Resolving directly from whichever fires first
   * would make the answer depend on that order, so instead the button only
   * records the intent and the single close path resolves.
   */
  const confirmedRef = useRef(false)

  const confirm = useCallback<Confirm>((next) => {
    return new Promise<boolean>((resolve) => {
      // A second request while one is open answers the first with `false`
      // rather than leaving its promise dangling forever.
      resolveRef.current?.(false)
      resolveRef.current = resolve
      confirmedRef.current = false
      setOptions(next)
    })
  }, [])

  const close = useCallback(() => {
    const resolve = resolveRef.current
    resolveRef.current = null
    setOptions(null)
    resolve?.(confirmedRef.current)
    confirmedRef.current = false
  }, [])

  const value = useMemo(() => confirm, [confirm])

  return (
    <ConfirmContext value={value}>
      {children}
      <AlertDialog
        open={options !== null}
        onOpenChange={(open) => !open && close()}
        title={options?.title ?? ''}
        description={options?.description}
        confirmLabel={options?.confirmLabel ?? 'Confirm'}
        cancelLabel={options?.cancelLabel ?? 'Cancel'}
        tone={options?.tone ?? 'default'}
        onConfirm={() => { confirmedRef.current = true }}
      />
    </ConfirmContext>
  )
}

export function useConfirm(): Confirm {
  const confirm = use(ConfirmContext)
  if (!confirm) {
    throw new Error('useConfirm must be used within <ConfirmProvider>')
  }
  return confirm
}
