import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
  useNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Bell, Compass, Gift, Home, MessageSquare, Settings, Users } from 'lucide-react-native';

import { GlobalBroadcastBanner } from '../components/GlobalBroadcastBanner';
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
import { InviteScreen } from '../screens/invite/InviteScreen';
import { PlaygroundFeedScreen } from '../screens/playground/PlaygroundFeedScreen';
import { InfoScreen } from '../screens/info/InfoScreen';
import { NotificationsScreen } from '../screens/notifications/NotificationsScreen';
import { RewardsScreen } from '../screens/rewards/RewardsScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { VoiceOverlay } from '../components/VoiceOverlay';
import { useColors, useTheme } from '../theme/ThemeContext';

import { buildLinking, inviteCodeFromUrl } from './linking';
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

/**
 * Holds an invite link that arrived before there was anybody to accept it.
 *
 * React Navigation's linking resolves a URL against the navigator that is
 * mounted *now*, and the signed-out stack has no `Invite` screen in it — so a
 * link tapped by somebody who is not logged in resolves to nothing and is
 * silently dropped. That is the single most common way an invite arrives:
 * somebody is sent a link precisely because they are not in the community, and
 * often not in the app.
 *
 * So the URL is caught here while signed out, kept, and replayed the moment a
 * session exists. While signed *in* this hook does nothing at all — the
 * navigator's own linking handles those, and handling them twice would push the
 * screen on top of itself.
 */
function usePendingInvite(
  status: 'loading' | 'authenticated' | 'unauthenticated',
  navigate: (code: string) => void,
) {
  const [pending, setPending] = useState<string | null>(null);
  const signedIn = status === 'authenticated';

  // Read in the effect below rather than depended on, so that arriving at a
  // session does not re-subscribe to `Linking` on every render.
  const signedInRef = useRef(signedIn);
  signedInRef.current = signedIn;

  useEffect(() => {
    function capture(url: string | null) {
      if (!url || signedInRef.current) return;
      const code = inviteCodeFromUrl(url);
      if (code) setPending(code);
    }

    // A cold start from a link, and a link that arrives while the app is open.
    void Linking.getInitialURL().then(capture);
    const subscription = Linking.addEventListener('url', ({ url }) => capture(url));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!signedIn || !pending) return;
    // Cleared before navigating, not after: signing out and back in should not
    // walk the reader through the same invite a second time.
    setPending(null);
    navigate(pending);
  }, [signedIn, pending, navigate]);
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

  /*
   * An invite tapped while signed out, replayed once there is a session.
   *
   * `navigate` rather than `replace`: the reader is standing on whatever the
   * app opened them onto after sign-in, and declining the invite should put
   * them back there rather than nowhere.
   */
  const openInvite = useCallback(
    (code: string) => {
      if (navigationRef.isReady()) navigationRef.navigate('Invite', { code });
    },
    [navigationRef],
  );
  usePendingInvite(status, openInvite);

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
      linking={buildLinking()}
      // A deep link is resolved before the first frame, so there is a beat with
      // no UI at all. Without this the app shows a blank ground for it.
      fallback={<LoadingPanel />}
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
              {/* Usually arrived at from outside the app entirely — see
                  `linking.ts` and `usePendingInvite` above. */}
              <Stack.Screen name="Invite" component={InviteScreen} />
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

        {/* Outside the auth gate: an outage notice is most useful to somebody
            who cannot sign in, which is exactly when they cannot see anything
            mounted behind it. Suppressed on the call screen alone, which owns
            its whole surface and is not a place to read an announcement. */}
        {routeName !== 'Call' && <GlobalBroadcastBanner />}
      </View>
    </NavigationContainer>
  );
}
