import { useForm } from 'react-hook-form'

import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { Input } from '@/components/Input'
import { Spinner } from '@/components/Spinner'
import { UserRow } from '@/components/UserRow'
import { useToast } from '@/components/Toast'
import type { Uuid } from '@/lib/api'
import { useBlockUserMutation, useBlockedUsers, useUnblockUserMutation } from '@/features/api'
import { errorText } from '@/lib/errors'
import { useProfiles } from '@/lib/useProfiles'

import { useSubmission } from './useSubmission'
import styles from './settings.module.css'

interface BlockFormValues {
  userId: string
}

export function BlockedTab() {
  const toast = useToast()
  const submit = useSubmission()
  const form = useForm<BlockFormValues>({ defaultValues: { userId: '' } })

  // The list is fetched, not accumulated. It used to start empty and only grow
  // as you blocked people in that one sitting, so anyone you had blocked before
  // opening this screen was invisible and impossible to undo.
  const blocked = useBlockedUsers()
  const blockUser = useBlockUserMutation()
  const unblockUser = useUnblockUserMutation()

  // No local shadow of the list: both mutations invalidate it, so the query is
  // the only copy and the rows cannot disagree with the server.
  const current = blocked.data ?? []
  const lookup = useProfiles(current)

  async function handleBlock(data: BlockFormValues) {
    const targetId = data.userId.trim()
    if (!targetId) return

    const done = await submit.run(async () => {
      await blockUser.mutateAsync(targetId)
      return true
    })
    if (!done) return

    form.reset()
    toast.success('User blocked', 'They can no longer reach you.')
  }

  async function handleUnblock(userId: Uuid) {
    try {
      await unblockUser.mutateAsync(userId)
      toast.success('User unblocked')
    } catch (cause) {
      toast.error('Could not unblock', errorText(cause))
    }
  }

  return (
    <div>
      <h2 className={styles.panelTitle}>Blocked users</h2>
      <p className={styles.panelDescription}>
        Blocked users cannot send you friend requests or reach you directly.
      </p>

      {submit.error && <Callout tone="danger">{submit.error}</Callout>}
      {blocked.error && <Callout tone="danger">{errorText(blocked.error, 'Could not load blocked users')}</Callout>}

      <form className={styles.formRow} onSubmit={form.handleSubmit(handleBlock)}>
        <Input
          className={styles.grow}
          label="User ID to block"
          {...form.register('userId', { required: true })}
          placeholder="Paste a user ID…"
          required
        />
        <Button type="submit" variant="danger" disabled={submit.busy}>
          {submit.busy && <Spinner />}
          Block
        </Button>
      </form>

      <div className={styles.blockedList}>
        {blocked.isLoading && <Spinner />}

        {!blocked.isLoading && current.length === 0 && (
          <p className={styles.emptyNote}>You haven&apos;t blocked anyone.</p>
        )}

        {current.map((id) => {
          const profile = lookup(id)
          return (
            <UserRow
              key={id}
              name={profile?.display_name ?? id}
              avatarUrl={profile?.avatar_url}
              accentColor={profile?.accent_color}
              secondary={`@${profile?.handle ?? id.slice(0, 8)}`}
              size="sm"
              actions={
                <Button size="sm" variant="secondary" onClick={() => void handleUnblock(id)}>
                  Unblock
                </Button>
              }
            />
          )
        })}
      </div>
    </div>
  )
}
