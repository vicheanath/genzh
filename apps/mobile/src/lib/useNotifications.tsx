import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  queryKeys,
  useNotificationsVM,
  type AppNotification,
  type ChatServerEvent,
  type NotificationPage,
  type Uuid,
} from '@genzh/shared';

import { useAuth } from '../context/AuthContext';
import { chatSocket } from './socket';

interface NotificationsValue {
  items: AppNotification[];
  unread: number;
  loading: boolean;
  markRead: (id: Uuid) => Promise<void>;
  markAllRead: () => Promise<void>;
  reload: () => void;
}

const NotificationsContext = createContext<NotificationsValue | null>(null);

/**
 * The notification inbox.
 *
 * Two sources, as before: the list is fetched so anything that arrived while
 * you were away is there, and the socket appends what happens while you are
 * looking. What changed is where each lands.
 *
 * The fetch is `useNotificationsVM` from `@genzh/shared`, and a live event is
 * written into that query's cache rather than into a second copy in `useState`.
 * The old version kept its own `items`/`unread` state and hand-rolled the
 * optimistic mark-read on top, which meant two lists that had to be corrected
 * in step — and one of them was the only one the mutations knew about.
 *
 * The provider stays because the socket subscription and the badge are app-wide
 * and should exist once, not once per screen that reads the count.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const vm = useNotificationsVM(token);

  const signedIn = Boolean(user);

  useEffect(() => {
    if (!signedIn) return;

    return chatSocket.on<ChatServerEvent>('notification_created', (event) => {
      if (event.type !== 'notification_created') return;

      // Straight into the query cache, so every reader — this badge, the
      // notifications screen — sees it at once and a later refetch replaces it
      // with the server's version rather than merging against a local copy.
      queryClient.setQueryData<NotificationPage>(
        [...queryKeys.notifications.list(), undefined, undefined],
        (page) => {
          if (!page) return page;
          // The server deduplicates, but a reconnect can replay; matching on id
          // keeps a double delivery from doubling the list.
          if (page.notifications.some((item) => item.id === event.notification.id)) {
            return page;
          }
          return {
            ...page,
            notifications: [event.notification, ...page.notifications],
            unread: page.unread + 1,
          };
        },
      );
    });
  }, [signedIn, queryClient]);

  const value = useMemo<NotificationsValue>(
    () => ({
      items: vm.notifications,
      unread: vm.unreadCount,
      loading: vm.isLoading,
      markRead: async (id: Uuid) => {
        await vm.markAsRead(id);
      },
      markAllRead: async () => {
        await vm.markAllAsRead();
      },
      reload: () => void vm.refresh(),
    }),
    [vm],
  );

  return (
    <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsValue {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
}
