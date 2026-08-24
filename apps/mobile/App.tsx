import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { ChatProvider } from './src/context/ChatContext';
import { VoiceProvider } from './src/context/VoiceContext';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ChatProvider>
          <VoiceProvider>
            <RootNavigator />
            <StatusBar style="light" />
          </VoiceProvider>
        </ChatProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
