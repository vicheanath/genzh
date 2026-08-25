import { createContext, use, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/lib/auth'
import { chatSocket } from '@/lib/ws/ChatSocket'

import { useQueryCacheSync } from './useQueryCacheSync'

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

interface RealtimeValue {
  status: ConnectionStatus
  /** True once the socket is carrying live updates. */
  live: boolean
}

const RealtimeContext = createContext<RealtimeValue>({ status: 'disconnected', live: false })

/**
 * Owns the socket for the session.
 *
 * One connection, opened here and nowhere else. It used to be opened in two
 * places — the app shell and the chat view — each setting the token again, so
 * opening a room re-handshook a socket that was already live. Hoisting it means
 * a room screen subscribes to a connection it does not have to establish.
 *
 * The connection is a session-level resource, so it is mounted above the router
 * and outlives any one screen; what a screen owns is its *subscription*, which
 * is `useRoomSubscription`.
 */
export function SocketProvider({ children }: { children: ReactNode }) {
  const { user, getToken } = useAuth()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')

  const signedIn = Boolean(user)

  useEffect(() => {
    const off = chatSocket.on<ConnectionStatus>('status', setStatus)
    return off
  }, [])

  useEffect(() => {
    if (!signedIn) {
      chatSocket.disconnect()
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const token = await getToken()
        if (!cancelled) chatSocket.setToken(token)
      } catch {
        // No usable session: `AuthProvider` is already signing out, and the
        // socket stays closed rather than retrying with a token it cannot get.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [signedIn, getToken])

  // Signing out must not leave the previous account's rooms, friends and
  // notifications sitting in the cache for whoever signs in next.
  //
  // On the *transition* only. Clearing whenever nobody is signed in would also
  // fire on first mount, before the stored session has been restored — and take
  // the sign-in screen's own auth-config query with it.
  const wasSignedIn = useRef(signedIn)
  useEffect(() => {
    if (wasSignedIn.current && !signedIn) queryClient.clear()
    wasSignedIn.current = signedIn
  }, [signedIn, queryClient])

  useQueryCacheSync(signedIn)

  const value = useMemo<RealtimeValue>(
    () => ({ status, live: status === 'connected' }),
    [status],
  )

  return <RealtimeContext value={value}>{children}</RealtimeContext>
}

/** The socket's connection state, for the bits of chrome that show it. */
export function useRealtimeStatus(): RealtimeValue {
  return use(RealtimeContext)
}
