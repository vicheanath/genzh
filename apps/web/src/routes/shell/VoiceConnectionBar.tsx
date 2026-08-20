import { useNavigate } from 'react-router-dom'

import { MicIcon, MicOffIcon, PhoneOffIcon } from '@/components/Icons'
import { Tooltip } from '@/components/Tooltip'
import { cx } from '@/lib/cx'
import { useVoice } from '@/lib/media'

import styles from './shell.module.css'

/**
 * "You are still in a call", above the user bar.
 *
 * Renders nothing when there is no call, so a caller can mount it
 * unconditionally in any frame that has room for it.
 */
export function VoiceConnectionBar() {
  const voice = useVoice()
  const navigate = useNavigate()

  if (!voice.activeRoomId || voice.status === 'idle') return null

  const isConnected = voice.status === 'connected'
  const isConnecting = voice.status === 'connecting' || voice.status === 'reconnecting'

  const targetUrl = voice.activeCommunityId
    ? `/c/${voice.activeCommunityId}/r/${voice.activeRoomId}`
    : `/rooms/${voice.activeRoomId}`

  return (
    <div className={styles.voiceBar}>
      <button
        type="button"
        className={styles.voiceBarInfo}
        onClick={() => void navigate(targetUrl)}
        title="Go to the room you are connected to"
      >
        <span className={styles.voiceBarStatus}>
          <span
            className={cx(styles.voiceDot, isConnected && styles.voiceDotConnected)}
            aria-hidden
          />
          <span className={styles.voiceStatusText}>
            {isConnected ? 'Voice connected' : isConnecting ? 'Connecting…' : 'Disconnected'}
          </span>
        </span>
        <span className={styles.voiceRoomName}>
          {voice.activeRoomName || 'Voice channel'}
        </span>
      </button>

      <div className={styles.voiceBarActions}>
        <Tooltip content={voice.muted ? 'Unmute' : 'Mute'}>
          <button
            type="button"
            className={cx(styles.voiceActionBtn, voice.muted && styles.voiceActionMuted)}
            onClick={() => voice.toggleMute()}
            aria-label={voice.muted ? 'Unmute microphone' : 'Mute microphone'}
            aria-pressed={!voice.muted}
          >
            {voice.muted ? <MicOffIcon size={15} /> : <MicIcon size={15} />}
          </button>
        </Tooltip>

        <Tooltip content="Disconnect">
          <button
            type="button"
            className={cx(styles.voiceActionBtn, styles.voiceDisconnectBtn)}
            onClick={() => void voice.leave()}
            aria-label="Disconnect from voice"
          >
            <PhoneOffIcon size={15} />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
