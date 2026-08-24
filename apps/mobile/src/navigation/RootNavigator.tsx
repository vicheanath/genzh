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

import { TabBar } from './TabBar';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const { unread } = useNotifications();

  return (
    // The bar renders itself — colours, the active wash and the badge all live
    // in TabBar, so a screen only has to say which glyph and which word it is.
    <Tab.Navigator tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
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
          tabBarAccessibilityLabel:
            unread > 0 ? `Activity, ${unread} unread` : 'Activity',
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
