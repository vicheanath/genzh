import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
  useNavigationContainerRef,
} from '@react-navigation/native';
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
import { useColors, useTheme } from '../theme/ThemeContext';

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
  const c = useColors();
  const { scheme } = useTheme();
  const { status } = useAuth();

  /*
   * Which screen is on top.
   *
   * Read here rather than inside the overlay itself: the floating call bubble
   * is a *sibling* of the navigator, not a screen in it, so the navigation
   * hooks that answer this are unavailable to it — `useNavigationState` throws
   * "is your component inside a navigator?" from there. The container knows,
   * and it is the one place that does.
   */
  // The navigators here are untyped, so the ref's default param list resolves
  // to `never`. An open-ended map is what they actually are.
  const navigationRef = useNavigationContainerRef<Record<string, object | undefined>>();
  const [routeName, setRouteName] = useState<string | undefined>(undefined);

  const readRoute = useCallback(() => {
    setRouteName(navigationRef.getCurrentRoute()?.name);
  }, [navigationRef]);

  if (status === 'loading') return <LoadingPanel />;

  // The base has to switch too, not just the colours: react-navigation reads
  // `dark` for the things it draws itself — the modal scrim and the default
  // card background behind a screen transition.
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;

  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: c.bg,
      card: c.surface,
      text: c.text,
      border: c.border,
    },
  };

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navTheme}
      onReady={readRoute}
      onStateChange={readRoute}
    >
      <View style={{ flex: 1, backgroundColor: c.bg }}>
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

        {/* Global chrome: the floating call bubble and the profile card, both
            of which any screen can raise. The bubble is a shortcut *to* the
            call screen, so it hides once you are on it — otherwise it floats
            over the very thing it opens. */}
        {status === 'authenticated' && (
          <>
            {routeName !== 'Call' && <VoiceOverlay />}
            <ProfileSheet />
          </>
        )}
      </View>
    </NavigationContainer>
  );
}
