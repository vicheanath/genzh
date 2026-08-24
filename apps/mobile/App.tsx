import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from './src/components/Toast';
import { ConfirmProvider } from './src/components/useConfirm';
import { AuthProvider } from './src/context/AuthContext';
import { ChatProvider } from './src/context/ChatContext';
import { VoiceProvider } from './src/context/VoiceContext';
import { NotificationsProvider } from './src/lib/useNotifications';
import { PresenceProvider } from './src/lib/usePresence';
import { RootNavigator } from './src/navigation/RootNavigator';

/**
 * The provider stack, in the same order the web app nests it.
 *
 * Auth is outermost because everything below needs a token. Presence and
 * notifications sit above the chat provider but attach to the same module-level
 * socket, so their position here is about who reads their state, not about the
 * connection. Toast and confirm wrap the navigator so any screen can raise one.
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <PresenceProvider>
          <NotificationsProvider>
            <ChatProvider>
              <VoiceProvider>
                <ToastProvider>
                  <ConfirmProvider>
                    <RootNavigator />
                    <StatusBar style="light" />
                  </ConfirmProvider>
                </ToastProvider>
              </VoiceProvider>
            </ChatProvider>
          </NotificationsProvider>
        </PresenceProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
