import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { PinIcon, PinOffIcon, XIcon } from '@/components/Icons'
import { Spinner } from '@/components/Spinner'
import { useToast } from '@/components/Toast'
import { useRoomPinsQuery, useUnpinMessageMutation } from '@/features/api'
import type { Uuid } from '@/lib/api'
import { formatClock, formatDayDivider } from '@/lib/time'
import { useProfiles } from '@/lib/useProfiles'
import styles from './PinnedMessagesDialog.module.css'

export interface PinnedMessagesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  roomId: Uuid
  canModerate?: boolean
  onJumpToMessage?: (messageId: Uuid) => void
}

export function PinnedMessagesDialog({
  open,
  onOpenChange,
  roomId,
  canModerate = false,
  onJumpToMessage,
}: PinnedMessagesDialogProps) {
  const toast = useToast()
  const pinsQuery = useRoomPinsQuery(open ? roomId : undefined)
  const unpinMutation = useUnpinMessageMutation(roomId)

  const pins = pinsQuery.data ?? []
  const userIds = [...new Set(pins.map((p) => p.author_id))]
  const lookup = useProfiles(userIds)

  async function handleUnpin(messageId: Uuid) {
    try {
      await unpinMutation.mutateAsync(messageId)
      toast.success('Message unpinned')
    } catch {
      toast.error('Failed to unpin message')
    }
  }

  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={styles.backdrop} />
        <BaseDialog.Popup className={styles.popup}>
          <div className={styles.header}>
            <div className={styles.headerTitle}>
              <PinIcon size={18} className={styles.headerIcon} />
              <h2>Pinned Messages</h2>
              <Badge tone="accent">{pins.length}</Badge>
            </div>
            <button
              type="button"
              className={styles.closeButton}
              onClick={() => onOpenChange(false)}
              aria-label="Close"
            >
              <XIcon size={16} />
            </button>
          </div>

          <div className={styles.content}>
            {pinsQuery.isLoading ? (
              <div className={styles.loading}>
                <Spinner />
                <span>Loading pinned messages...</span>
              </div>
            ) : pins.length === 0 ? (
              <div className={styles.empty}>
                <PinIcon size={32} className={styles.emptyIcon} />
                <p className={styles.emptyTitle}>No pinned messages</p>
                <p className={styles.emptyText}>
                  Important messages pinned by moderators will appear here for everyone to reference.
                </p>
              </div>
            ) : (
              <div className={styles.list}>
                {pins.map((msg) => {
                  const author = lookup(msg.author_id)
                  const name = msg.anonymous_author
                    ? msg.anonymous_author.alias_name
                    : (author?.display_name ?? 'Unknown')

                  return (
                    <div key={msg.id} className={styles.item}>
                      <div className={styles.itemHeader}>
                        <div className={styles.itemMeta}>
                          <span className={styles.author}>{name}</span>
                          <span className={styles.time}>
                            {formatDayDivider(msg.created_at)} at {formatClock(msg.created_at)}
                          </span>
                        </div>
                        <div className={styles.itemActions}>
                          {onJumpToMessage && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                onJumpToMessage(msg.id)
                                onOpenChange(false)
                              }}
                            >
                              Jump
                            </Button>
                          )}
                          {canModerate && (
                            <Button
                              size="sm"
                              variant="ghost"
                              iconOnly
                              onClick={() => void handleUnpin(msg.id)}
                              aria-label="Unpin message"
                              title="Unpin message"
                            >
                              <PinOffIcon size={15} />
                            </Button>
                          )}
                        </div>
                      </div>
                      <p className={styles.messageText}>{msg.content}</p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}
