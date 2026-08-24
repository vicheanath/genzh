import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ChatSocket, type ChatServerEvent, type Uuid } from '@genzh/shared';
import { useAuth } from './AuthContext';
import { getApiUrl } from '../api/config';

interface ChatContextType {
  socket: ChatSocket;
  isConnected: boolean;
  subscribeRoom: (roomId: Uuid) => void;
  unsubscribeRoom: (roomId: Uuid) => void;
  sendTyping: (roomId: Uuid, isTyping: boolean) => void;
  unreadNotifications: number;
  setUnreadNotifications: React.Dispatch<React.SetStateAction<number>>;
}

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const socketRef = useRef<ChatSocket>(new ChatSocket(getApiUrl()));
  const [isConnected, setIsConnected] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    const socket = socketRef.current;
    socket.setBaseUrl(getApiUrl());

    const unsubStatus = socket.on('status', (status) => {
      setIsConnected(status === 'connected');
    });

    const unsubNotification = socket.on('notification_created', () => {
      setUnreadNotifications((prev) => prev + 1);
    });

    return () => {
      unsubStatus();
      unsubNotification();
    };
  }, []);

  useEffect(() => {
    const socket = socketRef.current;
    if (token) {
      socket.setToken(token);
    } else {
      socket.disconnect();
      setIsConnected(false);
    }
  }, [token]);

  const subscribeRoom = (roomId: Uuid) => {
    socketRef.current.subscribe(roomId);
  };

  const unsubscribeRoom = (roomId: Uuid) => {
    socketRef.current.unsubscribe(roomId);
  };

  const sendTyping = (roomId: Uuid, isTyping: boolean) => {
    socketRef.current.sendTyping(roomId, isTyping);
  };

  return (
    <ChatContext.Provider
      value={{
        socket: socketRef.current,
        isConnected,
        subscribeRoom,
        unsubscribeRoom,
        sendTyping,
        unreadNotifications,
        setUnreadNotifications,
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
