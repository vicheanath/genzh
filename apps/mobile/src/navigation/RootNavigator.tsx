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
import { Bell, Compass, Gift, Home, MessageSquare, Settings, Users } from 'lucide-react-native';

import { LoadingPanel } from '../components/Spinner';
import { useAppMode } from '../context/AppModeContext';
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
import { PlaygroundFeedScreen } from '../screens/playground/PlaygroundFeedScreen';
import { InfoScreen } from '../screens/info/InfoScreen';
import { NotificationsScreen } from '../screens/notifications/NotificationsScreen';
import { RewardsScreen } from '../screens/rewards/RewardsScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { VoiceOverlay } from '../components/VoiceOverlay';
import { useColors, useTheme } from '../theme/ThemeContext';

import { TabBar } from './TabBar';

const Stack = createNativeStackNavigator();

/*
 * One navigator per half of the product, not one navigator with a filtered set
 * of tabs.
 *
 * The two modes disagree about what the app *is* — a column of rooms you leave
 * versus a list of places you stay — and sharing a navigator would mean sharing
 * a history stack, so switching modes would drop you wherever the other half
 * happened to have been. Two navigators means each half remembers its own
 * place, and the switch is a door rather than a filter.
 */
const PlaygroundTab = createBottomTabNavigator();
const ServersTab = createBottomTabNavigator();

/** Shared by both bars: the bar renders itself, a screen only names its glyph. */
const tabNavigatorProps = {
  screenOptions: { headerShown: false as const },
};

/**
 * The throwaway half. The feed is the app; everything else is one tap away
 * from it.
 */
function PlaygroundTabs() {
  const { unread } = useNotifications();

  return (
    <PlaygroundTab.Navigator
      {...tabNavigatorProps}
      tabBar={(props) => <TabBar {...props} />}
    >
      <PlaygroundTab.Screen
        name="FeedTab"
        component={PlaygroundFeedScreen}
        options={{
          tabBarLabel: 'Feed',
          tabBarIcon: ({ color }) => <Compass size={22} color={color} />,
        }}
      />
      {/* The same rooms, laid out to browse rather than to swipe — for the
          reader who wants to pick rather than be shown. */}
      <PlaygroundTab.Screen
        name="BrowseTab"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Browse',
          tabBarIcon: ({ color }) => <Home size={22} color={color} />,
        }}
      />
      <PlaygroundTab.Screen
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
      <PlaygroundTab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color }) => <Settings size={22} color={color} />,
        }}
      />
    </PlaygroundTab.Navigator>
  );
}

/** The half you belong to: communities, their channels, and the people in them. */
function ServersTabs() {
  const { unread } = useNotifications();

  return (
    <ServersTab.Navigator
      {...tabNavigatorProps}
      tabBar={(props) => <TabBar {...props} />}
    >
      <ServersTab.Screen
        name="CommunitiesTab"
        component={CommunitiesScreen}
        options={{
          tabBarLabel: 'Servers',
          tabBarIcon: ({ color }) => <Users size={22} color={color} />,
        }}
      />
      <ServersTab.Screen
        name="FriendsTab"
        component={FriendsScreen}
        options={{
          tabBarLabel: 'Friends',
          tabBarIcon: ({ color }) => <MessageSquare size={22} color={color} />,
        }}
      />
      <ServersTab.Screen
        name="RewardsTab"
        component={RewardsScreen}
        options={{
          tabBarLabel: 'Rewards',
          tabBarIcon: ({ color }) => <Gift size={22} color={color} />,
        }}
      />
      <ServersTab.Screen
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
      <ServersTab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color }) => <Settings size={22} color={color} />,
        }}
      />
    </ServersTab.Navigator>
  );
}

/** Whichever half the user last chose. */
function MainTabs() {
  const { mode } = useAppMode();
  return mode === 'playground' ? <PlaygroundTabs /> : <ServersTabs />;
}

export function RootNavigator() {
  const c = useColors();
  const { scheme } = useTheme();
  const { status } = useAuth();
  // Which half of the app to open is a stored choice, and reading it is a
  // round-trip to disk. Waiting is right: landing in the feed and jumping to
  // the server list a frame later is worse than a beat of nothing.
  const { ready: modeReady } = useAppMode();

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

  if (status === 'loading' || !modeReady) return <LoadingPanel />;

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
