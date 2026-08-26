import { useState } from 'react'

import { useConfirm } from '@/components/AlertDialog'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { ItemPreview } from '@/components/Cosmetics'
import { GemIcon, PencilIcon, PlusIcon, TrashIcon } from '@/components/Icons'
import { Input } from '@/components/Input'
import { Select } from '@/components/Select'
import { Skeleton } from '@/components/Skeleton'
import { Switch } from '@/components/Switch'
import { useToast } from '@/components/Toast'
import { useIsPlatformAdmin } from '@/features/api'
import {
  useAdminCatalogQuery,
  useCreateStoreItemMutation,
  useDeleteStoreItemMutation,
  useUpdateStoreItemMutation,
  type CosmeticStyle,
  type ItemRarity,
  type ItemType,
  type StoreItemInput,
  type StoreListing,
} from '@/features/rewards/api'
import { errorText } from '@/lib/errors'

import styles from './panels.module.css'

const SLOT_OPTIONS: Array<{ value: ItemType; label: string }> = [
  { value: 'frame', label: 'Avatar frame' },
  { value: 'badge', label: 'Badge' },
  { value: 'name_color', label: 'Name colour' },
  { value: 'banner', label: 'Profile banner' },
]

const RARITY_OPTIONS: Array<{ value: ItemRarity; label: string }> = [
  { value: 'common', label: 'Common' },
  { value: 'rare', label: 'Rare' },
  { value: 'epic', label: 'Epic' },
  { value: 'legendary', label: 'Legendary' },
]

/** What a fresh form starts from. */
const BLANK: FormState = {
  sku: '',
  name: '',
  description: '',
  item_type: 'frame',
  rarity: 'common',
  price_points: '0',
  asset_url: '',
  style_json: '{\n  "gradient": "linear-gradient(135deg, #a855f7, #ec4899)",\n  "animation": "pulse"\n}',
  is_active: true,
  is_limited: false,
  stock_limit: '',
  sort_order: '0',
}

interface FormState {
  sku: string
  name: string
  description: string
  item_type: ItemType
  rarity: ItemRarity
  /** Kept as text so a half-typed number does not snap back to 0 mid-keystroke. */
  price_points: string
  asset_url: string
  style_json: string
  is_active: boolean
  is_limited: boolean
  stock_limit: string
  sort_order: string
}

/**
 * The cosmetics catalog.
 *
 * This panel *is* the catalog — nothing is seeded, so every item in the store
 * was created here by somebody who chose its name, its look and its price.
 * Admin only, and every write lands in the audit log.
 */
export function StoreItemsPanel() {
  const isAdmin = useIsPlatformAdmin()
  const catalog = useAdminCatalogQuery(isAdmin)
  const [editing, setEditing] = useState<StoreListing | null>(null)
  const [composing, setComposing] = useState(false)

  if (!isAdmin) {
    return <Callout tone="info">Only platform admins can change the store.</Callout>
  }

  const items = catalog.data ?? []

  return (
    <div className={styles.stack}>
      <div className={styles.filterBar}>
        <div style={{ flex: 1 }}>
          <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
            Cosmetics Catalog
          </h2>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null)
            setComposing((open) => !open)
          }}
        >
          <PlusIcon size={15} /> {composing ? 'Close' : 'New Item'}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void catalog.refetch()}
          disabled={catalog.isFetching}
        >
          {catalog.isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {(composing || editing) && (
        <ItemForm
          key={editing?.id ?? 'new'}
          existing={editing}
          onDone={() => {
            setEditing(null)
            setComposing(false)
          }}
        />
      )}

      {catalog.isLoading && <Skeleton height="8rem" />}
      {catalog.error && (
        <Callout tone="danger">{errorText(catalog.error, 'Could not load the catalog')}</Callout>
      )}

      {!catalog.isLoading && items.length === 0 && (
        <p className={styles.empty}>
          The store is empty. Create the first item — the price you set here is what members pay.
        </p>
      )}

      {items.map((item) => (
        <CatalogRow
          key={item.id}
          item={item}
          onEdit={() => {
            setComposing(false)
            setEditing(item)
          }}
        />
      ))}
    </div>
  )
}

function CatalogRow({ item, onEdit }: { item: StoreListing; onEdit: () => void }) {
  const remove = useDeleteStoreItemMutation()
  const update = useUpdateStoreItemMutation()
  const confirm = useConfirm()
  const toast = useToast()

  async function handleDelete() {
    const ok = await confirm({
      title: `Delete ${item.name}?`,
      description:
        'This removes it from the catalog for good. If anybody owns it, deactivate it instead — the server will refuse the delete.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return

    try {
      await remove.mutateAsync(item.id)
      toast.success(`${item.name} deleted`)
    } catch (cause) {
      toast.error('Could not delete that', errorText(cause))
    }
  }

  async function toggleActive() {
    try {
      await update.mutateAsync({ itemId: item.id, input: { is_active: !item.is_active } })
      toast.success(item.is_active ? `${item.name} hidden` : `${item.name} is live`)
    } catch (cause) {
      toast.error('Could not change that', errorText(cause))
    }
  }

  return (
    <div className={styles.card} style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--space-4)' }}>
      <div style={{ width: '7rem', flexShrink: 0 }}>
        <ItemPreview item={item} name="Preview" />
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <strong>{item.name}</strong>
          <Badge tone="neutral">{item.item_type}</Badge>
          <Badge tone="accent">{item.rarity}</Badge>
          {!item.is_active && <Badge tone="danger">Hidden</Badge>}
          {item.is_limited && (
            <Badge tone="mint">
              Limited{item.stock_limit !== null ? ` · ${item.owned_count}/${item.stock_limit}` : ''}
            </Badge>
          )}
        </div>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
          {item.sku} · {item.description || 'No description'}
        </span>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>
          {item.owned_count} owned
        </span>
      </div>

      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700 }}>
        <GemIcon size={14} /> {item.price_points.toLocaleString()}
      </span>

      <div className={styles.cardActions}>
        <Button variant="secondary" size="sm" onClick={onEdit}>
          <PencilIcon size={14} /> Edit
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void toggleActive()}
          disabled={update.isPending}
        >
          {item.is_active ? 'Hide' : 'Publish'}
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={() => void handleDelete()}
          disabled={remove.isPending || item.owned_count > 0}
          title={item.owned_count > 0 ? 'Somebody owns this — hide it instead' : undefined}
        >
          <TrashIcon size={14} />
        </Button>
      </div>
    </div>
  )
}

/** Create or edit one item, with a live preview of what shoppers will see. */
function ItemForm({ existing, onDone }: { existing: StoreListing | null; onDone: () => void }) {
  const create = useCreateStoreItemMutation()
  const update = useUpdateStoreItemMutation()
  const toast = useToast()

  const [form, setForm] = useState<FormState>(() =>
    existing
      ? {
          sku: existing.sku,
          name: existing.name,
          description: existing.description,
          item_type: existing.item_type,
          rarity: existing.rarity,
          price_points: String(existing.price_points),
          asset_url: existing.asset_url ?? '',
          style_json: JSON.stringify(existing.style_config ?? {}, null, 2),
          is_active: existing.is_active,
          is_limited: existing.is_limited,
          stock_limit: existing.stock_limit === null ? '' : String(existing.stock_limit),
          sort_order: String(existing.sort_order),
        }
      : BLANK,
  )

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }))

  // Parsed once per render and reused by both the preview and the submit, so
  // what staff are looking at is exactly what would be saved.
  const parsedStyle = parseStyle(form.style_json)
  const price = Number.parseInt(form.price_points, 10)
  const priceValid = Number.isFinite(price) && price >= 0

  async function submit(event: React.FormEvent) {
    event.preventDefault()

    if (parsedStyle === null) {
      toast.error('The style config is not valid JSON')
      return
    }
    if (!priceValid) {
      toast.error('Enter a price of 0 or more')
      return
    }

    const input: StoreItemInput = {
      name: form.name.trim(),
      description: form.description.trim(),
      item_type: form.item_type,
      rarity: form.rarity,
      price_points: price,
      asset_url: form.asset_url.trim() || null,
      style_config: parsedStyle,
      is_active: form.is_active,
      is_limited: form.is_limited,
      stock_limit: form.stock_limit.trim() ? Number.parseInt(form.stock_limit, 10) : null,
      sort_order: Number.parseInt(form.sort_order, 10) || 0,
    }

    try {
      if (existing) {
        await update.mutateAsync({ itemId: existing.id, input })
        toast.success(
          `${input.name} saved`,
          existing.price_points !== price
            ? `Now ${price} points. What people already paid is unchanged.`
            : undefined,
        )
      } else {
        // The SKU is the one field that cannot be changed later, so it is only
        // ever sent on create.
        await create.mutateAsync({ ...input, sku: form.sku.trim() })
        toast.success(`${input.name} added to the store`)
      }
      onDone()
    } catch (cause) {
      toast.error('Could not save that item', errorText(cause))
    }
  }

  const pending = create.isPending || update.isPending

  return (
    <form onSubmit={submit} className={styles.card} style={{ gap: 'var(--space-3)' }}>
      <h3 className={styles.sectionTitle} style={{ margin: 0 }}>
        {existing ? `Edit ${existing.name}` : 'New cosmetic item'}
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 12rem', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', minWidth: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <Input
              label="Display name"
              placeholder="Cyber Neon Ring"
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              maxLength={64}
              required
            />
            <Input
              label="SKU"
              placeholder="frame-neon-cyber"
              value={form.sku}
              onChange={(event) => set('sku', event.target.value)}
              maxLength={64}
              required={!existing}
              disabled={Boolean(existing)}
              description={existing ? 'The SKU is permanent' : "Letters, digits, - and _"}
            />
          </div>

          <Input
            label="Description"
            placeholder="What a shopper sees under the name."
            value={form.description}
            onChange={(event) => set('description', event.target.value)}
            maxLength={200}
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)' }}>
            <Field label="Slot">
              <Select
                aria-label="Slot"
                value={form.item_type}
                onValueChange={(value) => set('item_type', value)}
                options={SLOT_OPTIONS}
              />
            </Field>
            <Field label="Rarity">
              <Select
                aria-label="Rarity"
                value={form.rarity}
                onValueChange={(value) => set('rarity', value)}
                options={RARITY_OPTIONS}
              />
            </Field>
            <Input
              label="Price (points)"
              inputMode="numeric"
              value={form.price_points}
              onChange={(event) => set('price_points', event.target.value.replace(/[^\d]/g, ''))}
              description={price === 0 ? 'Free' : undefined}
            />
          </div>

          <Input
            label="Artwork URL"
            placeholder="/assets/frames/neon.webp — leave empty to draw from the style below"
            value={form.asset_url}
            onChange={(event) => set('asset_url', event.target.value)}
          />

          <Field
            label="Style config (JSON)"
            hint="gradient · color · glow · animation (pulse, spin, aurora, shimmer) · icon"
          >
            <textarea
              aria-label="Style config"
              value={form.style_json}
              onChange={(event) => set('style_json', event.target.value)}
              rows={6}
              spellCheck={false}
              style={{
                width: '100%',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-xs)',
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: 'var(--radius-md, 0.5rem)',
                border: `1px solid ${parsedStyle === null ? 'var(--color-danger)' : 'var(--color-border)'}`,
                background: 'var(--color-sunken)',
                color: 'var(--color-text)',
                resize: 'vertical',
              }}
            />
          </Field>
          {parsedStyle === null && <Callout tone="danger">That is not valid JSON.</Callout>}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-3)' }}>
            <Input
              label="Sort order"
              inputMode="numeric"
              value={form.sort_order}
              onChange={(event) => set('sort_order', event.target.value.replace(/[^\d-]/g, ''))}
              description="Lower shows first"
            />
            <Input
              label="Stock limit"
              inputMode="numeric"
              placeholder="Unlimited"
              value={form.stock_limit}
              onChange={(event) => set('stock_limit', event.target.value.replace(/[^\d]/g, ''))}
              description="How many may ever be owned"
            />
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-5)', flexWrap: 'wrap' }}>
            <Toggle
              label="Visible in the store"
              checked={form.is_active}
              onChange={(value) => set('is_active', value)}
            />
            <Toggle
              label="Mark as limited"
              checked={form.is_limited}
              onChange={(value) => set('is_limited', value)}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>Preview</span>
          {/* The same component the store renders, so nothing is a surprise
              once it is published. */}
          <ItemPreview
            item={{
              id: existing?.id ?? 'preview',
              sku: form.sku,
              name: form.name || 'Untitled',
              description: form.description,
              item_type: form.item_type,
              rarity: form.rarity,
              price_points: priceValid ? price : 0,
              asset_url: form.asset_url.trim() || null,
              style_config: parsedStyle ?? {},
              is_active: form.is_active,
              is_limited: form.is_limited,
              stock_limit: null,
              sort_order: 0,
              created_by: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }}
            name="Member"
          />
        </div>
      </div>

      <div className={styles.cardActions} style={{ justifyContent: 'flex-end' }}>
        <Button variant="secondary" type="button" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !form.name.trim() || (!existing && !form.sku.trim())}>
          {pending ? 'Saving…' : existing ? 'Save changes' : 'Add to store'}
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', minWidth: 0 }}>
      <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>{label}</label>
      {children}
      {hint && (
        <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--color-text-subtle)' }}>{hint}</span>
      )}
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
      <Switch checked={checked} onCheckedChange={onChange} />
      {label}
    </label>
  )
}

/** Parse the style box, returning null for text that is not an object. */
function parseStyle(raw: string): CosmeticStyle | null {
  const trimmed = raw.trim()
  if (!trimmed) return {}
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as CosmeticStyle
  } catch {
    return null
  }
}
