import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { AlertDialog } from './AlertDialog';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/**
 * `Alert.alert`, replaced.
 *
 * The platform alert is callback-shaped, cannot be styled, and renders its
 * buttons in an order that differs between iOS and Android — so a destructive
 * action ends up under a different thumb on each. This keeps the shape the web
 * app uses, which reads the same at every call site:
 *
 *   if (!(await confirm({ title: 'Delete #general?', tone: 'danger' }))) return
 *
 * The promise resolves `false` on cancel, never rejects, so a caller can only
 * forget to await it — not forget to catch it.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);
  /**
   * Set by the confirm button, read when the dialog reports it has closed.
   *
   * Both fire from the same press, and resolving directly from whichever runs
   * first would make the answer depend on that order. The button records the
   * intent; the single close path resolves.
   */
  const confirmedRef = useRef(false);

  const confirm = useCallback<Confirm>((next) => {
    return new Promise<boolean>((resolve) => {
      // A second request while one is open answers the first with `false`
      // rather than leaving its promise dangling forever.
      resolveRef.current?.(false);
      resolveRef.current = resolve;
      confirmedRef.current = false;
      setOptions(next);
    });
  }, []);

  const close = useCallback(() => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setOptions(null);
    resolve?.(confirmedRef.current);
    confirmedRef.current = false;
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={options !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        title={options?.title ?? ''}
        description={options?.description}
        confirmLabel={options?.confirmLabel ?? 'Confirm'}
        cancelLabel={options?.cancelLabel ?? 'Cancel'}
        tone={options?.tone ?? 'default'}
        onConfirm={() => {
          confirmedRef.current = true;
        }}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) {
    throw new Error('useConfirm must be used within <ConfirmProvider>');
  }
  return confirm;
}
