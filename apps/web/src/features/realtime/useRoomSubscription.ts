import { useEffect } from 'react'

import type { Uuid } from '@/lib/api'
import { chatSocket } from '@/lib/ws/ChatSocket'

/**
 * Receive a room's live traffic for as long as the screen is open.
 *
 * Subscribing is the screen's business and the connection is the session's, so
 * this deliberately does not touch the socket's lifecycle: leaving a room drops
 * the subscription and keeps the connection, which is what makes moving between
 * rooms cost a frame instead of a handshake.
 */
export function useRoomSubscription(roomId: Uuid | null | undefined): void {
  useEffect(() => {
    if (!roomId) return
    chatSocket.subscribe(roomId)
    return () => chatSocket.unsubscribe(roomId)
  }, [roomId])

  useRoomAttention(roomId)
}

/**
 * Tell the server this room is being *read*, and stop saying so when it is not.
 *
 * The server suppresses notifications for the room on your screen — being told
 * about a message you are watching arrive is the most irritating thing a chat
 * app does — and that is only right while the screen is actually in front of
 * somebody. So the claim is withdrawn when the tab is hidden and made again
 * when it comes back.
 *
 * Visibility rather than window focus: a tab that is on screen but behind
 * another application is still being read, and treating a click on a different
 * window as leaving would notify people about the conversation they are looking
 * at. A hidden tab is unambiguous.
 */
function useRoomAttention(roomId: Uuid | null | undefined): void {
  useEffect(() => {
    if (!roomId) return

    const report = () => {
      chatSocket.focus(document.visibilityState === 'visible' ? roomId : null)
    }

    report()
    document.addEventListener('visibilitychange', report)

    return () => {
      document.removeEventListener('visibilitychange', report)
      // Leaving the screen is leaving the conversation, whether the tab is
      // still open or not.
      chatSocket.blur(roomId)
    }
  }, [roomId])
}

/** Imperative sends a composer needs: typing pings travel over the socket only. */
export function useRoomTyping(roomId: Uuid | null | undefined) {
  return (isTyping: boolean) => {
    if (roomId) chatSocket.sendTyping(roomId, isTyping)
  }
}

/**
 * Post a message straight down the socket, bypassing the REST endpoint.
 *
 * What the room experiences use to announce themselves — a poll opening, a game
 * turn. There is nothing to wait for and nothing to roll back: the message
 * arrives back through the same bridge as everybody else's, and a refusal comes
 * back as an `error` frame rather than a rejected promise. Anything that needs
 * to know whether it worked should use the send mutation instead.
 */
export function useRoomBroadcast(roomId: Uuid | null | undefined) {
  return (content: string, isAnonymous?: boolean) => {
    if (roomId) chatSocket.sendMessage(roomId, content, isAnonymous)
  }
}
