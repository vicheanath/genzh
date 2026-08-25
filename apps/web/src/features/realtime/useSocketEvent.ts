import { useEffect, useRef } from 'react'

import { chatSocket, type ChatServerEvent } from '@/lib/ws/ChatSocket'

type EventOfType<T extends ChatServerEvent['type']> = Extract<ChatServerEvent, { type: T }>

/**
 * Subscribe to one kind of socket frame.
 *
 * For the events a *view* reacts to rather than caches — a typing indicator, an
 * incoming call — where there is nothing to store and the component that
 * renders it is the only thing that cares. Anything that represents server
 * state belongs in `useQueryCacheSync` instead, so it survives the component
 * unmounting.
 *
 * The handler is held in a ref, so passing an inline closure does not tear the
 * subscription down and rebuild it on every render.
 */
export function useSocketEvent<T extends ChatServerEvent['type']>(
  type: T,
  handler: (event: EventOfType<T>) => void,
  enabled = true,
): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!enabled) return
    return chatSocket.on<ChatServerEvent>(type, (event) => {
      if (event.type !== type) return
      handlerRef.current(event as EventOfType<T>)
    })
  }, [type, enabled])
}
