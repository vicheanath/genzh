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
