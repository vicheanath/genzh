import React from 'react';
import { View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Bell, Home, MessageSquare, Settings, Users } from 'lucide-react-native';

import { LoadingPanel } from '../components/Spinner';
import { useAuth } from '../context/AuthContext';
import { ProfileSheet } from '../features/profile/ProfileSheet';
import { useNotifications } from '../lib/useNotifications';
import { SignInScreen } from '../screens/auth/SignInScreen';
import { RoomChatScreen } from '../screens/chat/RoomChatScreen';
import { CommunitiesScreen } from '../screens/communities/CommunitiesScreen';
import { CommunityDetailScreen } from '../screens/communities/CommunityDetailScreen';
import { CommunitySettingsScreen } from '../screens/communities/CommunitySettingsScreen';
import { ExploreScreen } from '../screens/communities/ExploreScreen';
import { MemberListScreen } from '../screens/communities/MemberListScreen';
import { ExperienceRoomScreen } from '../screens/experiences/ExperienceRoomScreen';
import { FriendsScreen } from '../screens/friends/FriendsScreen';
import { HomeScreen } from '../screens/home/HomeScreen';
import { InfoScreen } from '../screens/info/InfoScreen';
import { NotificationsScreen } from '../screens/notifications/NotificationsScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { VoiceOverlay } from '../components/VoiceOverlay';
import { Colors } from '../theme/tokens';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const { unread } = useNotifications();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          height: 62,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textDim,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
        },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => <Home size={size - 2} color={color} />,
        }}
      />
      <Tab.Screen
        name="CommunitiesTab"
        component={CommunitiesScreen}
        options={{
          tabBarLabel: 'Servers',
          tabBarIcon: ({ color, size }) => <Users size={size - 2} color={color} />,
        }}
      />
      <Tab.Screen
        name="FriendsTab"
        component={FriendsScreen}
        options={{
          tabBarLabel: 'Friends',
          tabBarIcon: ({ color, size }) => <MessageSquare size={size - 2} color={color} />,
        }}
      />
      <Tab.Screen
        name="NotificationsTab"
        component={NotificationsScreen}
        options={{
          tabBarLabel: 'Activity',
          // Driven by the notifications provider, so the badge and the list can
          // never disagree about how many are unread.
          tabBarBadge: unread > 0 ? unread : undefined,
          tabBarBadgeStyle: {
            backgroundColor: Colors.accent,
            color: Colors.accentContrast,
            fontSize: 10,
            fontWeight: '800',
          },
          tabBarIcon: ({ color, size }) => <Bell size={size - 2} color={color} />,
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings size={size - 2} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const { status } = useAuth();

  if (status === 'loading') return <LoadingPanel />;

  const navTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: Colors.bg,
      card: Colors.surface,
      text: Colors.text,
      border: Colors.border,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <View style={{ flex: 1, backgroundColor: Colors.bg }}>
        <Stack.Navigator
          screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
        >
          {status === 'unauthenticated' ? (
            <>
              <Stack.Screen name="SignIn" component={SignInScreen} />
              {/* Reachable without a session, exactly as the web routes are. */}
              <Stack.Screen name="Info" component={InfoScreen} />
            </>
          ) : (
            <>
              <Stack.Screen name="Main" component={MainTabs} />
              <Stack.Screen name="CommunityDetail" component={CommunityDetailScreen} />
              <Stack.Screen name="CommunitySettings" component={CommunitySettingsScreen} />
              <Stack.Screen name="MemberList" component={MemberListScreen} />
              <Stack.Screen name="RoomChat" component={RoomChatScreen} />
              <Stack.Screen name="ExperienceRoom" component={ExperienceRoomScreen} />
              <Stack.Screen name="Explore" component={ExploreScreen} />
              <Stack.Screen name="Info" component={InfoScreen} />
            </>
          )}
        </Stack.Navigator>

        {/* Global chrome: the floating voice bar and the profile card, both of
            which any screen can raise. */}
        {status === 'authenticated' && (
          <>
            <VoiceOverlay />
            <ProfileSheet />
          </>
        )}
      </View>
    </NavigationContainer>
  );
}
