/**
 * Real-time WebSocket client for chat interactions.
 * Provides instant sub-millisecond message delivery, live reactions,
 * typing indicators, and presence updates.
 */

import type {
  AppNotification,
  CallEndReason,
  Message,
  ReactionSummary,
  RoomAnonymousIdentity,
  Uuid,
} from '../api/types'
import { getApiBaseUrl } from '../api/client'

export type ChatServerEvent =
  | {
      type: 'authenticated'
      user_id: Uuid
    }
  | {
      type: 'subscribed'
      room_id: Uuid
    }
  | {
      type: 'unsubscribed'
      room_id: Uuid
    }
  | {
      type: 'message_created'
      room_id: Uuid
      message: Message
      reactions: ReactionSummary[]
      anonymous_author?: RoomAnonymousIdentity
    }
  | {
      type: 'message_updated'
      room_id: Uuid
      message: Message
      reactions: ReactionSummary[]
      anonymous_author?: RoomAnonymousIdentity
    }
  | {
      type: 'message_deleted'
      room_id: Uuid
      message_id: Uuid
    }
  | {
      type: 'reactions_updated'
      room_id: Uuid
      message_id: Uuid
      reactions: ReactionSummary[]
    }
  | {
      type: 'notification_created'
      user_id: Uuid
      notification: AppNotification
      /**
       * False when this updates a row the client already has.
       *
       * A second message in a conversation folds into the notification the
       * first one opened, so this frame doubles as "that row changed". Treating
       * a fold as a new arrival would count one conversation twice in the
       * badge.
       */
      is_new: boolean
    }
  | {
      type: 'call_ringing'
      user_id: Uuid
      room_id: Uuid
      from_user_id: Uuid
      from_display_name: string
      video: boolean
    }
  | {
      type: 'call_ended'
      user_id: Uuid
      room_id: Uuid
      from_user_id: Uuid
      reason: CallEndReason
    }
  | {
      type: 'presence_changed'
      user_id: Uuid
      online: boolean
    }
  | {
      type: 'direct_room_opened'
      user_id: Uuid
      room_id: Uuid
    }
  | {
      type: 'typing'
      room_id: Uuid
      user_id: Uuid
      display_name: string
      is_typing: boolean
    }
  | {
      type: 'pong'
    }
  | {
      type: 'error'
      message: string
    }

type EventListener<T = unknown> = (data: T) => void

export class ChatSocket {
  private socket: WebSocket | null = null
  private token: string | null = null
  private baseUrl: string | null = null
  private listeners = new Map<string, Set<EventListener<any>>>()
  private subscribedRooms = new Set<Uuid>()
  private focusedRoom: Uuid | null = null
  private messageQueue: object[] = []
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private isExplicitlyClosed = false
  private retryCount = 0

  constructor(baseUrl?: string) {
    if (baseUrl) this.baseUrl = baseUrl
    this.connect = this.connect.bind(this)
    this.handleMessage = this.handleMessage.bind(this)
    this.handleOpen = this.handleOpen.bind(this)
    this.handleClose = this.handleClose.bind(this)
  }

  public setBaseUrl(url: string) {
    this.baseUrl = url
  }

  public setToken(token: string) {
    // CONNECTING counts as live. The shell opens the socket for the session and
    // a room screen then sets the same token again; treating a half-open socket
    // as absent would drop the handshake and reconnect on every room you open.
    const live =
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)

    if (this.token === token && live) {
      return
    }
    this.token = token
    if (this.socket) {
      this.disconnect()
    }
    this.connect()
  }

  public connect() {
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return
    }
    this.isExplicitlyClosed = false

    // Derive ws/wss endpoint from baseUrl or global api base url
    let base = this.baseUrl || getApiBaseUrl()
    if (!base && typeof window !== 'undefined') {
      base = window.location.origin
    }
    const wsBase = base.replace(/^http/, 'ws')
    const url = `${wsBase}/api/v1/ws${this.token ? `?token=${encodeURIComponent(this.token)}` : ''}`

    try {
      this.socket = new WebSocket(url)
      this.socket.onopen = this.handleOpen
      this.socket.onmessage = this.handleMessage
      this.socket.onclose = this.handleClose
      this.socket.onerror = () => {
        this.emit('status', 'error')
      }
      this.emit('status', 'connecting')
    } catch {
      this.scheduleReconnect()
    }
  }

  private handleOpen() {
    this.retryCount = 0
    this.emit('status', 'connected')

    // Re-subscribe to all active rooms on reconnect
    for (const roomId of this.subscribedRooms) {
      this.send({ type: 'subscribe', room_id: roomId })
    }

    // And say again what is being read: the server forgot when the socket did,
    // and a reconnect while a room is open would otherwise start notifying
    // somebody about the conversation on their screen.
    if (this.focusedRoom) {
      this.send({ type: 'focus', room_id: this.focusedRoom })
    }

    // Flush any queued messages
    while (this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift()
      if (msg) this.send(msg)
    }

    this.startPing()
  }

  private handleMessage(event: MessageEvent) {
    try {
      const data = JSON.parse(event.data) as ChatServerEvent
      if (data.type === 'pong') return

      this.emit(data.type, data)
      this.emit('*', data)
    } catch {
      // Ignore unparseable frames
    }
  }

  private handleClose() {
    this.emit('status', 'disconnected')
    this.stopPing()
    if (!this.isExplicitlyClosed) {
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return
    const delay = Math.min(1000 * 2 ** this.retryCount, 10000)
    this.retryCount += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  private startPing() {
    this.stopPing()
    this.pingTimer = setInterval(() => {
      this.send({ type: 'ping' })
    }, 25000)
  }

  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  public subscribe(roomId: Uuid) {
    this.subscribedRooms.add(roomId)
    this.send({ type: 'subscribe', room_id: roomId })
  }

  public unsubscribe(roomId: Uuid) {
    this.subscribedRooms.delete(roomId)
    if (this.focusedRoom === roomId) this.focusedRoom = null
    this.send({ type: 'unsubscribe', room_id: roomId })
  }

  /**
   * Say which room the person is actually looking at, or `null` for none.
   *
   * Deliberately separate from `subscribe`: a client subscribes to every room
   * it wants live traffic from and reads at most one of them. The server
   * suppresses notifications for the room being read, so this has to go quiet
   * the moment the window is hidden or the screen is left — otherwise a chat
   * left open in a background tab silences itself.
   */
  public focus(roomId: Uuid | null) {
    if (this.focusedRoom === roomId) return
    this.focusedRoom = roomId
    this.send({ type: 'focus', room_id: roomId })
  }

  /**
   * Stop claiming to read `roomId` — but only if that is still the claim.
   *
   * Leaving one room for another is two screens tearing down and setting up in
   * an order neither of them controls, and a plain `focus(null)` from the one
   * on its way out would wipe the claim the new one just made.
   */
  public blur(roomId: Uuid) {
    if (this.focusedRoom !== roomId) return
    this.focus(null)
  }

  public sendTyping(roomId: Uuid, isTyping: boolean) {
    this.send({ type: 'typing', room_id: roomId, is_typing: isTyping })
  }

  public send(data: object) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data))
    } else {
      this.messageQueue.push(data)
    }
  }

  public on<T = unknown>(event: string, callback: EventListener<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback)

    return () => {
      this.listeners.get(event)?.delete(callback)
    }
  }

  private emit(event: string, data: unknown) {
    const handlers = this.listeners.get(event)
    if (handlers) {
      for (const handler of handlers) {
        handler(data)
      }
    }
  }

  public disconnect() {
    this.isExplicitlyClosed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.stopPing()
    if (this.socket) {
      this.socket.onopen = null
      this.socket.onmessage = null
      this.socket.onclose = null
      this.socket.onerror = null
      this.socket.close()
      this.socket = null
    }
  }
}
