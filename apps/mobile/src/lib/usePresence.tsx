import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { presence as presenceApi, type ChatServerEvent, type Uuid } from '@genzh/shared';

import { useAuth } from '../context/AuthContext';
import { chatSocket } from './socket';

/**
 * Who is online.
 *
 * Two sources, and both are needed. The socket carries *changes*, so a screen
 * that only listened would show everyone offline until they happened to
 * reconnect; the endpoint carries the starting point, so a screen that only
 * fetched would go stale the moment somebody closed their laptop. This holds
 * the fetch once per session and applies the deltas on top.
 */
interface PresenceValue {
  isOnline: (userId: Uuid) => boolean;
  onlineIds: ReadonlySet<Uuid>;
}

const PresenceContext = createContext<PresenceValue | null>(null);

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user, getToken } = useAuth();
  const [onlineIds, setOnlineIds] = useState<ReadonlySet<Uuid>>(() => new Set());

  const signedIn = Boolean(user);

  useEffect(() => {
    if (!signedIn) {
      setOnlineIds(new Set());
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const { online } = await presenceApi.online(await getToken());
        if (!cancelled) setOnlineIds(new Set(online));
      } catch {
        // An unreachable presence endpoint should not blank the app; everyone
        // simply reads as offline until the next event arrives.
      }
    })();

    // Updated functionally rather than from a ref, so the listener is attached
    // once for the session instead of being replaced on every change.
    const off = chatSocket.on<ChatServerEvent>('presence_changed', (event) => {
      if (event.type !== 'presence_changed') return;

      setOnlineIds((current) => {
        const next = new Set(current);
        if (event.online) {
          next.add(event.user_id);
        } else {
          next.delete(event.user_id);
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
      off();
    };
  }, [signedIn, getToken]);

  const value = useMemo<PresenceValue>(
    () => ({
      onlineIds,
      isOnline: (userId: Uuid) => onlineIds.has(userId),
    }),
    [onlineIds],
  );

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

/**
 * Presence lookup.
 *
 * Returns a permanently-offline reader when no provider is mounted, so a
 * component can ask without every screen needing the provider above it.
 */
export function usePresence(): PresenceValue {
  const context = useContext(PresenceContext);
  const fallback = useMemo<PresenceValue>(
    () => ({ isOnline: () => false, onlineIds: new Set<Uuid>() }),
    [],
  );
  return context ?? fallback;
}
