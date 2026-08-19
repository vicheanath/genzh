import { Toast as BaseToast } from '@base-ui/react/toast'
import { useMemo } from 'react'

/**
 * The app's toast vocabulary.
 *
 * Two verbs rather than a free-form `add`, because every toast in this app is
 * either "that worked" or "that did not" — and `type` is what the stylesheet
 * branches on.
 */
export function useToast() {
  const manager = BaseToast.useToastManager()

  return useMemo(
    () => ({
      success: (title: string, description?: string) =>
        manager.add({ title, description, type: 'success', timeout: 3500 }),
      error: (title: string, description?: string) =>
        manager.add({
          title,
          description,
          type: 'error',
          priority: 'high',
          timeout: 6000,
        }),
    }),
    [manager],
  )
}
