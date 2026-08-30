import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link2Off, Users } from 'lucide-react-native';
import {
  useInvitePreviewQuery,
  useRedeemInviteMutation,
  ApiError,
} from '@genzh/shared';

import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Callout } from '../../components/Callout';
import { LoadingPanel } from '../../components/Spinner';
import { useToast } from '../../components/Toast';
import { useAppMode } from '../../context/AppModeContext';
import { useAuth } from '../../context/AuthContext';
import { Radius, Spacing, type Palette } from '../../theme/tokens';
import { useThemedStyles, useColors } from '../../theme/ThemeContext';

/**
 * The other end of an invite link.
 *
 * Reached by deep link rather than by navigating — see `navigation/linking.ts`.
 * Somebody tapped a URL in a message and the app opened here, which is why the
 * screen has to stand entirely on its own: there is no stack behind it to go
 * back to, and the reader may never have heard of the community they are
 * looking at.
 *
 * So it answers the three questions in order — what is this place, how many
 * people are in it, and do you want in — and both of its buttons lead somewhere
 * rather than one of them leading nowhere.
 */
export function InviteScreen({ route, navigation }: any) {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const { token } = useAuth();
  const { setMode } = useAppMode();
  const toast = useToast();

  const code: string | undefined = route.params?.code;

  const preview = useInvitePreviewQuery(token, code);
  const redeem = useRedeemInviteMutation(token);
  const [error, setError] = useState<string | null>(null);

  /**
   * Where "not this one" goes.
   *
   * `goBack` is wrong here more often than it is right: arriving by deep link
   * means there is usually nothing behind this screen, and a back that does
   * nothing reads as a frozen app.
   */
  function dismiss() {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Main');
  }

  async function accept() {
    if (!code) return;
    setError(null);
    try {
      const community = await redeem.mutateAsync(code);
      toast.success(`Welcome to ${community.name}`);
      // An invite is always to a community, so it lands on the half of the app
      // communities live in — dropping someone into the playground feed after
      // they accepted a server invite is the wrong door.
      setMode('servers');
      navigation.replace('CommunityDetail', {
        communityId: community.id,
        communityName: community.name,
      });
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.message
          ? cause.message
          : 'Could not join this community.',
      );
    }
  }

  if (preview.isLoading) return <LoadingPanel label="Checking invite" />;

  if (preview.isError || !preview.data) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Animated.View entering={FadeIn.duration(240)} style={styles.centre}>
          <View style={[styles.iconCircle, { backgroundColor: c.dangerSubtle }]}>
            <Link2Off size={30} color={c.danger} />
          </View>
          <Text style={styles.title}>This invite is not valid</Text>
          <Text style={styles.body}>
            The link may have expired, run out of uses, or been revoked by a moderator. Ask
            whoever sent it for a fresh one.
          </Text>
          <Button title="Back to GenZH" onPress={dismiss} style={styles.wide} />
        </Animated.View>
      </SafeAreaView>
    );
  }

  const { name, description, icon_url, member_count, expires_at } = preview.data;

  return (
    <SafeAreaView style={styles.safeArea}>
      <Animated.View entering={FadeInDown.duration(280)} style={styles.centre}>
        <Avatar name={name} url={icon_url} size={84} />

        <Text style={styles.kicker}>You've been invited to join</Text>
        <Text style={styles.name}>{name}</Text>

        {description ? <Text style={styles.body}>{description}</Text> : null}

        <View style={styles.meta}>
          <View style={styles.metaPill}>
            <Users size={13} color={c.textSubtle} />
            <Text style={styles.metaText}>
              {member_count} {member_count === 1 ? 'member' : 'members'}
            </Text>
          </View>
          {expires_at ? (
            <Badge text={`Expires ${new Date(expires_at).toLocaleDateString()}`} />
          ) : null}
        </View>

        {error ? <Callout tone="danger" text={error} style={styles.wide} /> : null}

        <View style={styles.actions}>
          <Button
            title="Accept invite"
            size="lg"
            onPress={() => void accept()}
            loading={redeem.isPending}
          />
          <Button
            title="No thanks"
            size="lg"
            variant="ghost"
            onPress={dismiss}
            disabled={redeem.isPending}
          />
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: c.bg,
    },
    centre: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: Spacing.xl,
      gap: Spacing.md,
    },
    iconCircle: {
      width: 72,
      height: 72,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.xs,
    },
    kicker: {
      color: c.textSubtle,
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 0.2,
      marginTop: Spacing.md,
    },
    title: {
      color: c.text,
      fontSize: 22,
      fontWeight: '800',
      letterSpacing: -0.4,
      textAlign: 'center',
    },
    name: {
      color: c.text,
      fontSize: 26,
      fontWeight: '800',
      letterSpacing: -0.6,
      textAlign: 'center',
      marginTop: -Spacing.xs,
    },
    body: {
      color: c.textMuted,
      fontSize: 14,
      lineHeight: 21,
      textAlign: 'center',
      maxWidth: 340,
    },
    meta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginTop: Spacing.xs,
    },
    metaPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      backgroundColor: c.surfaceMuted,
      borderRadius: Radius.full,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: Spacing.md,
      paddingVertical: 5,
    },
    metaText: {
      color: c.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    actions: {
      alignSelf: 'stretch',
      gap: Spacing.sm,
      marginTop: Spacing.lg,
    },
    wide: {
      alignSelf: 'stretch',
      marginTop: Spacing.md,
    },
  });
