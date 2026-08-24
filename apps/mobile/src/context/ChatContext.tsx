import React, { createContext, useContext, useEffect, useState } from 'react';
import { type Uuid } from '@genzh/shared';

import { useAuth } from './AuthContext';
import { chatSocket, syncSocketBaseUrl } from '../lib/socket';

interface ChatContextType {
  socket: typeof chatSocket;
  isConnected: boolean;
  subscribeRoom: (roomId: Uuid) => void;
  unsubscribeRoom: (roomId: Uuid) => void;
  sendTyping: (roomId: Uuid, isTyping: boolean) => void;
}

const ChatContext = createContext<ChatContextType | null>(null);

/**
 * Connection state for the app's one socket.
 *
 * The socket itself is a module singleton (`lib/socket`) so presence and the
 * notification inbox can attach without being nested under this provider; what
 * lives here is only the connected flag the chrome renders from.
 */
export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    syncSocketBaseUrl();
    return chatSocket.on<string>('status', (status) => {
      setIsConnected(status === 'connected');
    });
  }, []);

  useEffect(() => {
    if (token) {
      chatSocket.setToken(token);
    } else {
      chatSocket.disconnect();
      setIsConnected(false);
    }
  }, [token]);

  return (
    <ChatContext.Provider
      value={{
        socket: chatSocket,
        isConnected,
        subscribeRoom: (roomId: Uuid) => chatSocket.subscribe(roomId),
        unsubscribeRoom: (roomId: Uuid) => chatSocket.unsubscribe(roomId),
        sendTyping: (roomId: Uuid, isTyping: boolean) =>
          chatSocket.sendTyping(roomId, isTyping),
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat(): ChatContextType {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within a ChatProvider');
  return ctx;
}
