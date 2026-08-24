import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './src/lib/queryClient';
import { ToastProvider } from './src/components/Toast';
import { ConfirmProvider } from './src/components/useConfirm';
import { AuthProvider } from './src/context/AuthContext';
import { ChatProvider } from './src/context/ChatContext';
import { VoiceProvider } from './src/context/VoiceContext';
import { NotificationsProvider } from './src/lib/useNotifications';
import { PresenceProvider } from './src/lib/usePresence';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';

/**
 * The status bar follows the ground it sits on.
 *
 * `style` names the *content* colour, not the bar's background, so it is the
 * inverse of the theme: light glyphs on the dark ground, dark on the bone one.
 * It has to be a child of ThemeProvider to read the resolved scheme, which is
 * why this is a component rather than a prop on the element below.
 */
function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;
}

/**
 * The provider stack, in the same order the web app nests it.
 *
 * Auth is outermost because everything below needs a token. Presence and
 * notifications sit above the chat provider but attach to the same module-level
 * socket, so their position here is about who reads their state, not about the
 * connection. Toast and confirm wrap the navigator so any screen can raise one.
 *
 * `GestureHandlerRootView` is outermost of all, and has to be: every gesture in
 * the app — the sheet you drag down, the toast you flick away, the slider —
 * is delivered through it, and a handler mounted outside it silently never
 * fires.
 */
export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <PresenceProvider>
              <NotificationsProvider>
                <ChatProvider>
                  <VoiceProvider>
                    <ToastProvider>
                      <ConfirmProvider>
                        <RootNavigator />
                        <ThemedStatusBar />
                      </ConfirmProvider>
                    </ToastProvider>
                  </VoiceProvider>
                </ChatProvider>
              </NotificationsProvider>
            </PresenceProvider>
          </AuthProvider>
        </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
