import { useNavigate, useParams } from 'react-router-dom'
import { useState } from 'react'

import { Avatar } from '@/components/Avatar'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { LinkIcon, UsersIcon } from '@/components/Icons'
import { LoadingPanel, Spinner } from '@/components/Spinner'
import { useToast } from '@/components/Toast'
import { useInvitePreview, useRedeemInviteMutation } from '@/features/api'
import { errorText } from '@/lib/errors'

import styles from './InviteRoute.module.css'

export function InviteRoute() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const preview = useInvitePreview(code)
  const redeemInvite = useRedeemInviteMutation()
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (preview.isLoading) {
    return <LoadingPanel />
  }

  if (preview.isError || !preview.data) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.iconCircle}>
            <LinkIcon size={32} className={styles.errorIcon} />
          </div>
          <h1 className={styles.title}>Invalid or Expired Invite</h1>
          <p className={styles.description}>
            This invite link may have expired, reached its maximum number of uses, or been revoked by a moderator.
          </p>
          <Button variant="primary" onClick={() => void navigate('/')}>
            Back to Home
          </Button>
        </div>
      </div>
    )
  }

  const { name, description, icon_url, member_count, expires_at } = preview.data

  async function handleAccept() {
    if (!code) return
    setJoining(true)
    setError(null)
    try {
      const res = await redeemInvite.mutateAsync(code)
      toast.success(`Welcome to ${res.name}!`)
      void navigate(`/c/${res.id}`)
    } catch (cause) {
      setError(errorText(cause, 'Could not join community'))
      setJoining(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <Avatar
          name={name}
          src={icon_url ?? undefined}
          size="lg"
          className={styles.avatar}
        />

        <span className={styles.subheading}>You've been invited to join</span>
        <h1 className={styles.title}>{name}</h1>

        {description && (
          <p className={styles.description}>{description}</p>
        )}

        <div className={styles.metaRow}>
          <div className={styles.metaBadge}>
            <UsersIcon size={15} />
            <span>{member_count} {member_count === 1 ? 'member' : 'members'}</span>
          </div>

          {expires_at && (
            <Badge tone="neutral">
              Expires {new Date(expires_at).toLocaleDateString()}
            </Badge>
          )}
        </div>

        {error && <Callout tone="danger">{error}</Callout>}

        <div className={styles.actions}>
          <Button
            size="lg"
            variant="primary"
            className={styles.acceptButton}
            onClick={() => void handleAccept()}
            disabled={joining}
          >
            {joining && <Spinner />}
            Accept Invite
          </Button>

          <Button
            size="lg"
            variant="ghost"
            onClick={() => void navigate('/')}
            disabled={joining}
          >
            No thanks
          </Button>
        </div>
      </div>
    </div>
  )
}
