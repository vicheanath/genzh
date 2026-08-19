import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

import { media as mediaApi, type Uuid } from '@/lib/api'
import { useAuth } from '@/lib/auth'

import { VoiceClient, type VoiceState } from './VoiceClient'

/**
 * Binds a {@link VoiceClient} to React.
 *
 * `useSyncExternalStore` rather than `useState` + an effect: the client owns the
 * state, and this subscribes to it without duplicating it into React and having
 * to keep the two in step.
 *
 * ## One client per mount
 *
 * The client is created once, lazily, and torn down on unmount. It does **not**
 * react to `roomId` changing — a live call is not something to swap underneath
 * itself. Callers switch rooms by remounting, which React expresses as a `key`:
 *
 * ```tsx
 * <RoomView key={roomId} room={room} />
 * ```
 */
export function useVoiceRoom(roomId: Uuid) {
  const { getToken } = useAuth()

  const [client] = useState(
    () =>
      new VoiceClient(async () => {
        // A fresh media token per (re)connect: they expire in about two minutes.
        const token = await getToken()
        return mediaApi.join(token, roomId)
      }),
  )

  const state = useSyncExternalStore<VoiceState>(
    useCallback((onChange) => client.subscribe(onChange), [client]),
    useCallback(() => client.getState(), [client]),
  )

  // Leaving on unmount is what guarantees the peer connections and the
  // microphone are released when the user navigates away, not just when they
  // press the button.
  useEffect(() => () => void client.leave(), [client])

  const join = useCallback(() => client.join(), [client])
  const leave = useCallback(() => client.leave(), [client])
  const setMuted = useCallback((muted: boolean) => client.setMuted(muted), [client])
  const toggleMute = useCallback(
    () => client.setMuted(!client.getState().muted),
    [client],
  )

  return { ...state, join, leave, setMuted, toggleMute }
}
