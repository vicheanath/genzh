import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Hand, Mic, MicOff, Video } from 'lucide-react-native';

import { Avatar } from '../../components/Avatar';
import { Sheet } from '../../components/Sheet';
import { Radius, Spacing, Stage } from '../../theme/tokens';
import { useColors } from '../../theme/ThemeContext';

import type { CallTile } from './useCallRoster';

/**
 * Who is in the call.
 *
 * On the app's own `Sheet` rather than a raw `Modal`, which is what this was:
 * a hand-rolled slide-up with its own scrim, its own radius and no drag to
 * dismiss — the one gesture people try first on a sheet. Everything else in the
 * app got that for free; the call screen had opted out of it by accident.
 */
export function CallRoster({
  open,
  onOpenChange,
  members,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: CallTile[];
}) {
  const c = useColors();
  return (
    <Sheet open={open} onOpenChange={onOpenChange} maxHeightRatio={0.8} style={styles.sheet}>
      <View style={styles.header}>
        <Text style={styles.title}>In this call</Text>
        <Text style={styles.subtitle}>
          {members.length} {members.length === 1 ? 'person' : 'people'} connected
        </Text>
      </View>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {members.map((member) => (
          <View key={member.id} style={styles.row}>
            <Avatar
              url={member.avatarUrl}
              name={member.name}
              speaking={member.speaking}
              size={42}
              ringColor={Stage.surface}
            />

            <View style={styles.info}>
              <Text style={styles.name} numberOfLines={1}>
                {member.name}
                {member.isSelf ? ' (You)' : ''}
              </Text>
              <Text style={styles.role}>
                {member.role === 'owner' ? 'Host' : 'Speaker'}
              </Text>
            </View>

            <View style={styles.badges}>
              {member.handRaised ? (
                <Badge background="rgba(250, 173, 20, 0.18)">
                  <Hand size={14} color={c.warning} />
                </Badge>
              ) : null}
              {member.cameraOn ? (
                <Badge background={c.accentSubtle}>
                  <Video size={14} color={c.accentText} />
                </Badge>
              ) : null}
              {member.muted ? (
                <Badge background={c.dangerSubtle}>
                  <MicOff size={14} color={c.danger} />
                </Badge>
              ) : (
                <Badge background={c.accentSubtle}>
                  <Mic size={14} color={c.accentText} />
                </Badge>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
    </Sheet>
  );
}

function Badge({ background, children }: { background: string; children: React.ReactNode }) {
  return <View style={[styles.badge, { backgroundColor: background }]}>{children}</View>;
}

const styles = StyleSheet.create({
  // The sheet keeps the stage's ground rather than the page's: it is opened
  // from inside the call and should still feel like the call.
  sheet: {
    backgroundColor: Stage.surface,
    borderColor: Stage.border,
    paddingHorizontal: Spacing.lg,
  },
  header: {
    paddingBottom: Spacing.md,
    marginBottom: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Stage.border,
  },
  title: {
    color: Stage.text,
    fontSize: 18,
    fontWeight: '800',
  },
  subtitle: {
    color: Stage.textSubtle,
    fontSize: 12,
    marginTop: 2,
  },
  list: {
    marginVertical: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  info: {
    flex: 1,
  },
  name: {
    color: Stage.text,
    fontSize: 14,
    fontWeight: '700',
  },
  role: {
    color: Stage.textSubtle,
    fontSize: 12,
    marginTop: 2,
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badge: {
    padding: 6,
    borderRadius: Radius.full,
  },
});
