import { useNavigate } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { PhoneIcon, PhoneOffIcon, VideoIcon } from '@/components/Icons'
import { useCall } from '@/lib/useCall'
import { useProfiles } from '@/lib/useProfiles'

import styles from './CallDialogs.module.css'

/**
 * The ring, in both directions.
 *
 * Mounted once for the session rather than by the conversation it belongs to:
 * being called is precisely the situation where you are looking at something
 * else, and a card that only appeared inside the DM would only ever reach
 * people who did not need it.
 */
export function CallDialogs() {
  const { incoming, outgoing } = useCall()

  return (
    <>
      {incoming && <IncomingCard />}
      {!incoming && outgoing && <OutgoingCard />}
    </>
  )
}

function IncomingCard() {
  const { incoming, accept, decline } = useCall()
  const navigate = useNavigate()
  const lookup = useProfiles(incoming ? [incoming.fromUserId] : [])

  if (!incoming) return null
  const profile = lookup(incoming.fromUserId)
  const name = profile?.display_name ?? incoming.fromDisplayName

  return (
    <div className={styles.card} role="alertdialog" aria-label={`Incoming call from ${name}`}>
      <div className={styles.who}>
        <Avatar name={name} src={profile?.avatar_url} color={profile?.accent_color} size="lg" />
        <div className={styles.text}>
          <div className={styles.name}>{name}</div>
          <div className={styles.what}>
            <span className={styles.pulse} aria-hidden="true" />
            {incoming.video ? 'Incoming video call' : 'Incoming call'}
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <Button variant="secondary" onClick={() => void decline()}>
          <PhoneOffIcon size={15} />
          Decline
        </Button>
        {/* Answering navigates as well as joins: the call is the conversation's
            own media session, so the controls for it live in the conversation. */}
        <Button
          onClick={() => {
            const roomId = incoming.roomId
            void accept().then(() => navigate(`/rooms/${roomId}`))
          }}
        >
          {incoming.video ? <VideoIcon size={15} /> : <PhoneIcon size={15} />}
          Accept
        </Button>
      </div>
    </div>
  )
}

function OutgoingCard() {
  const { outgoing, cancel } = useCall()
  const lookup = useProfiles(outgoing ? [outgoing.peerId] : [])

  if (!outgoing) return null
  const profile = lookup(outgoing.peerId)
  const name = profile?.display_name ?? outgoing.peerName

  return (
    <div className={styles.card} role="status" aria-label={`Calling ${name}`}>
      <div className={styles.who}>
        <Avatar name={name} src={profile?.avatar_url} color={profile?.accent_color} size="lg" />
        <div className={styles.text}>
          <div className={styles.name}>{name}</div>
          <div className={styles.what}>
            <span className={styles.pulse} aria-hidden="true" />
            Ringing…
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <Button variant="danger" onClick={() => void cancel()}>
          <PhoneOffIcon size={15} />
          Cancel
        </Button>
      </div>
    </div>
  )
}
