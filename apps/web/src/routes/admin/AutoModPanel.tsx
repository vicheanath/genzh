import { useState } from 'react'

import { useConfirm } from '@/components/AlertDialog'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { Input } from '@/components/Input'
import { Select } from '@/components/Select'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import {
  useAutomodRules,
  useCreateAutomodRuleMutation,
  useDeleteAutomodRuleMutation,
  useIsPlatformAdmin,
  type AutomodRule,
} from '@/features/api'
import { errorText } from '@/lib/errors'
import { formatFull } from '@/lib/time'

import styles from './panels.module.css'

const ACTION_OPTIONS = [
  { value: 'block', label: 'Block Message (Reject)' },
  { value: 'flag_report', label: 'Flag to Support Queue' },
]

/**
 * Automated Keyword Filtering & Auto-Mod Rule Management.
 */
export function AutoModPanel() {
  const isAdmin = useIsPlatformAdmin()
  const rules = useAutomodRules()
  const createRule = useCreateAutomodRuleMutation()
  const deleteRule = useDeleteAutomodRuleMutation()
  const confirm = useConfirm()
  const toast = useToast()

  const [name, setName] = useState('')
  const [pattern, setPattern] = useState('')
  const [isRegex, setIsRegex] = useState(false)
  const [action, setAction] = useState('block')

  const list = rules.data ?? []

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !pattern.trim()) {
      toast.error('Rule name and pattern are required')
      return
    }

    try {
      await createRule.mutateAsync({
        name: name.trim(),
        pattern: pattern.trim(),
        is_regex: isRegex,
        action,
      })
      setName('')
      setPattern('')
      setIsRegex(false)
      toast.success(`AutoMod rule "${name.trim()}" created`)
    } catch (cause) {
      toast.error('Could not create AutoMod rule', errorText(cause))
    }
  }

  async function handleDelete(rule: AutomodRule) {
    const ok = await confirm({
      title: `Delete AutoMod Rule "${rule.name}"?`,
      description: 'The keyword / pattern filter will no longer be enforced.',
      confirmLabel: 'Delete Rule',
      tone: 'danger',
    })
    if (!ok) return

    try {
      await deleteRule.mutateAsync(rule.id)
      toast.success(`AutoMod rule "${rule.name}" deleted`)
    } catch (cause) {
      toast.error('Could not delete rule', errorText(cause))
    }
  }

  return (
    <div className={styles.stack}>
      {isAdmin && (
        <form onSubmit={handleCreate} className={styles.card} style={{ gap: 'var(--space-3)' }}>
          <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
            Create Auto-Mod Rule
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
            <Input
              label="Rule Name"
              placeholder="e.g. Phishing Links, Slur Filter, Discord Invites"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, display: 'block', marginBottom: 'var(--space-1)' }}>
                Enforcement Action
              </label>
              <Select
                aria-label="Action"
                value={action}
                onValueChange={setAction}
                options={ACTION_OPTIONS}
              />
            </div>
          </div>

          <Input
            label="Filter Pattern or Keyword"
            placeholder="Keyword, phrase, or regular expression (e.g. \b(free-nitro|steam-gift)\b)"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            required
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isRegex}
                onChange={(e) => setIsRegex(e.target.checked)}
              />
              Evaluate as Regular Expression (Regex)
            </label>

            <Button type="submit" disabled={createRule.isPending || !name.trim() || !pattern.trim()}>
              Create Rule
            </Button>
          </div>
        </form>
      )}

      <div className={styles.filterBar}>
        <div style={{ flex: 1 }}>
          <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
            Active Moderation Rules ({list.length})
          </h2>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void rules.refetch()}
          disabled={rules.isFetching}
        >
          {rules.isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {rules.isLoading && <Skeleton height="5rem" />}
      {rules.error && <Callout tone="danger">{errorText(rules.error, 'Could not load AutoMod rules')}</Callout>}
      {!rules.isLoading && list.length === 0 && (
        <p className={styles.empty}>No automated moderation rules configured.</p>
      )}

      {list.map((rule) => (
        <article key={rule.id} className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <strong>{rule.name}</strong>
              <span className={styles.rowMeta}> · Pattern: <code>{rule.pattern}</code></span>
            </div>
            <div className={styles.badges}>
              {rule.is_regex && <Badge tone="accent">regex</Badge>}
              <Badge tone={rule.action === 'block' ? 'danger' : 'neutral'}>
                {rule.action === 'block' ? 'blocks' : 'flags'}
              </Badge>
              <Badge tone="success">active</Badge>
            </div>
          </div>

          <p className={styles.rowMeta}>Created {formatFull(rule.created_at)}</p>

          {isAdmin && (
            <div className={styles.cardActions}>
              <Button variant="ghost" size="sm" onClick={() => void handleDelete(rule)}>
                Delete Rule
              </Button>
            </div>
          )}
        </article>
      ))}
    </div>
  )
}
