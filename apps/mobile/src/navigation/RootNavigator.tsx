import React from 'react';
import { Platform, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, Home, MessageSquare, Settings, Users } from 'lucide-react-native';

import { LoadingPanel } from '../components/Spinner';
import { useAuth } from '../context/AuthContext';
import { ProfileSheet } from '../features/profile/ProfileSheet';
import { useNotifications } from '../lib/useNotifications';
import { SignInScreen } from '../screens/auth/SignInScreen';
import { CallScreen } from '../screens/call/CallScreen';
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
  const insets = useSafeAreaInsets();

  // Safely pad above Android system navigation buttons and iOS home indicator
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 16);
  const tabHeight = 56 + bottomInset;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: tabHeight,
          paddingBottom: bottomInset - 4,
          paddingTop: 8,
        },
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textDim,
        tabBarLabelStyle: {
          fontSize: 11.5,
          fontWeight: '700',
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginTop: 2,
        },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => <Home size={22} color={color} />,
        }}
      />
      <Tab.Screen
        name="CommunitiesTab"
        component={CommunitiesScreen}
        options={{
          tabBarLabel: 'Servers',
          tabBarIcon: ({ color }) => <Users size={22} color={color} />,
        }}
      />
      <Tab.Screen
        name="FriendsTab"
        component={FriendsScreen}
        options={{
          tabBarLabel: 'Friends',
          tabBarIcon: ({ color }) => <MessageSquare size={22} color={color} />,
        }}
      />
      <Tab.Screen
        name="NotificationsTab"
        component={NotificationsScreen}
        options={{
          tabBarLabel: 'Activity',
          tabBarBadge: unread > 0 ? unread : undefined,
          tabBarBadgeStyle: {
            backgroundColor: Colors.accent,
            color: Colors.accentContrast,
            fontSize: 10,
            fontWeight: '800',
          },
          tabBarIcon: ({ color }) => <Bell size={22} color={color} />,
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color }) => <Settings size={22} color={color} />,
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
              <Stack.Screen
                name="Call"
                component={CallScreen}
                options={{ animation: 'slide_from_bottom', gestureDirection: 'vertical' }}
              />
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
