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
} from '@/lib/api'
import { config } from '@/lib/config'

/** Which console list a `console_changed` frame refers to. */
export type ConsoleTopic =
  | 'support_queue'
  | 'live_media'
  | 'broadcasts'
  | 'users'
  | 'audit_log'

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
      /**
       * A list the platform console shows has changed.
       *
       * Only reaches staff sockets, and deliberately carries no payload: the
       * console reacts by refetching over REST, where staff authority is
       * re-checked per request. See `ConsoleTopic` in the API.
       */
      type: 'console_changed'
      topic: ConsoleTopic
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
  private listeners = new Map<string, Set<EventListener<any>>>()
  private subscribedRooms = new Set<Uuid>()
  private focusedRoom: Uuid | null = null
  private messageQueue: object[] = []
  private reconnectTimer: number | null = null
  private pingTimer: number | null = null
  private isExplicitlyClosed = false
  private retryCount = 0

  constructor() {
    this.connect = this.connect.bind(this)
    this.handleMessage = this.handleMessage.bind(this)
    this.handleOpen = this.handleOpen.bind(this)
    this.handleClose = this.handleClose.bind(this)
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
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return
    }
    this.isExplicitlyClosed = false

    // Derive ws/wss endpoint from config.apiUrl
    const base = (config.apiUrl || window.location.origin).replace(/^http/, 'ws')
    const url = `${base}/api/v1/ws${this.token ? `?token=${encodeURIComponent(this.token)}` : ''}`

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
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  private startPing() {
    this.stopPing()
    this.pingTimer = window.setInterval(() => {
      this.send({ type: 'ping' })
    }, 25000)
  }

  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
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
    this.emit('status', 'disconnected')
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
   * Say which room the reader is actually looking at, or `null` for none.
   *
   * Deliberately separate from `subscribe`: a tab subscribes to every room it
   * wants live traffic from and reads at most one of them. The server suppresses
   * notifications for the room being read, so this has to go quiet the moment
   * the tab is hidden — otherwise a chat left open behind another window
   * silences itself.
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

  public sendMessage(roomId: Uuid, content: string, isAnonymous?: boolean) {
    this.send({ type: 'send_message', room_id: roomId, content, is_anonymous: isAnonymous })
  }

  public react(roomId: Uuid, messageId: Uuid, reaction: string) {
    this.send({ type: 'react', room_id: roomId, message_id: messageId, reaction })
  }

  public unreact(roomId: Uuid, messageId: Uuid, reaction: string) {
    this.send({ type: 'unreact', room_id: roomId, message_id: messageId, reaction })
  }

  private send(data: object) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data))
    } else if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
      this.messageQueue.push(data)
    }
  }

  public on<T = any>(event: string, listener: EventListener<T>) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(listener)
    return () => this.off(event, listener)
  }

  public off<T = any>(event: string, listener: EventListener<T>) {
    const set = this.listeners.get(event)
    if (set) {
      set.delete(listener)
      if (set.size === 0) {
        this.listeners.delete(event)
      }
    }
  }

  private emit(event: string, data?: unknown) {
    const set = this.listeners.get(event)
    if (set) {
      for (const listener of set) {
        try {
          listener(data)
        } catch (err) {
          console.error(`Error in WebSocket listener for ${event}:`, err)
        }
      }
    }
  }
}

/** Global chat socket instance */
export const chatSocket = new ChatSocket()
