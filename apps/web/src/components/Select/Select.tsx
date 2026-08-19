import { Select as BaseSelect } from '@base-ui/react/select'

import { cx } from '@/lib/cx'

import styles from './Select.module.css'

export interface SelectOption<T extends string> {
  value: T
  label: string
  disabled?: boolean
}

export interface SelectProps<T extends string> {
  value: T
  onValueChange: (value: T) => void
  options: ReadonlyArray<SelectOption<T>>
  placeholder?: string
  disabled?: boolean
  className?: string
  'aria-label'?: string
}

/**
 * A single-select dropdown.
 *
 * Generic over the option value so `onValueChange` hands back the union type
 * rather than a bare `string` — the compiler then catches a stale option value
 * at the call site instead of at runtime.
 *
 * The part structure (Portal → Positioner → Popup → List → Item) is the one
 * Base UI documents. `List` is not optional: it owns scroll containment and
 * the roving-focus behaviour, and omitting it leaves the popup mounted but
 * inert.
 */
export function Select<T extends string>({
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  disabled,
  className,
  'aria-label': ariaLabel,
}: SelectProps<T>) {
  return (
    <BaseSelect.Root
      // `items` lets Select.Value render the *label* for the current value
      // without the caller re-deriving it.
      items={options.map(({ value: v, label }) => ({ value: v, label }))}
      value={value}
      onValueChange={(next) => onValueChange(next as T)}
      disabled={disabled}
    >
      <BaseSelect.Trigger
        aria-label={ariaLabel}
        className={cx(styles.trigger, className)}
      >
        <BaseSelect.Value placeholder={placeholder} />
        <BaseSelect.Icon className={styles.icon}>
          <ChevronIcon />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>

      <BaseSelect.Portal>
        <BaseSelect.Positioner className={styles.positioner} sideOffset={6}>
          <BaseSelect.Popup className={styles.popup}>
            <BaseSelect.List className={styles.list}>
              {options.map((option) => (
                <BaseSelect.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className={styles.item}
                >
                  <BaseSelect.ItemIndicator className={styles.itemIndicator}>
                    <CheckIcon />
                  </BaseSelect.ItemIndicator>
                  <BaseSelect.ItemText className={styles.itemText}>
                    {option.label}
                  </BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  )
}

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M2.5 4.5 6 8l3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M2.5 6.5 5 9l4.5-6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
