import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Compass, Plus, Search } from 'lucide-react-native';
import { ApiError, hueFor, useCommunitiesVM, type Uuid } from '@genzh/shared';

import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Callout } from '../../components/Callout';
import { EmptyState } from '../../components/EmptyState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SkeletonRows } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../context/AuthContext';
import { Radius, Spacing, type Palette } from '../../theme/tokens';
import { useThemedStyles, useColors } from '../../theme/ThemeContext';

import { CreateCommunityModal } from './CreateCommunityModal';

/** Browse public communities, search them, and join. */
export function ExploreScreen({ navigation }: any) {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const { token } = useAuth();
  const toast = useToast();

  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [joiningId, setJoiningId] = useState<Uuid | null>(null);

  const vm = useCommunitiesVM(token);

  async function join(communityId: Uuid, communityName: string) {
    setJoiningId(communityId);
    try {
      await vm.joinCommunity(communityId);
      toast.success('Joined community');
      navigation.navigate('CommunityDetail', { communityId, communityName });
    } catch (cause) {
      // Already a member is not a failure — it just means "go there".
      if (cause instanceof ApiError && cause.code === 'CONFLICT') {
        navigation.navigate('CommunityDetail', { communityId, communityName });
        return;
      }
      toast.error(
        'Could not join community',
        cause instanceof ApiError ? cause.message : undefined,
      );
    } finally {
      setJoiningId(null);
    }
  }

  const needle = query.trim().toLowerCase();
  const filtered = vm.communities.filter((community) => {
    if (!needle) return true;
    return (
      community.name.toLowerCase().includes(needle) ||
      (community.description?.toLowerCase().includes(needle) ?? false)
    );
  });

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScreenHeader
        title="Explore"
        subtitle="Find your community"
        onBack={() => navigation.goBack()}
        actions={
          <Button
            title="Create"
            size="sm"
            variant="secondary"
            onPress={() => setCreateOpen(true)}
            icon={<Plus size={15} color={c.text} />}
          />
        }
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.lede}>
          From gaming and music to tech and art, find a public community — or start your own.
        </Text>

        <View style={styles.searchWrap}>
          <Search size={16} color={c.textDim} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or topic…"
            placeholderTextColor={c.textDim}
          />
        </View>

        {vm.error ? <Callout tone="danger" text="Could not load communities." /> : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Communities</Text>
          {vm.communities.length > 0 ? <Badge text={filtered.length} /> : null}
        </View>

        {vm.isLoading ? <SkeletonRows rows={4} /> : null}

        {!vm.isLoading && filtered.length === 0 ? (
          <EmptyState
            icon={<Compass size={26} color={c.textDim} />}
            title="Nothing found"
            description={
              query ? `No community matched “${query.trim()}”.` : 'No communities yet.'
            }
            actionLabel={query ? 'Clear search' : 'Create a server'}
            onAction={query ? () => setQuery('') : () => setCreateOpen(true)}
          />
        ) : null}

        {filtered.map((community) => (
          <Pressable
            key={community.id}
            onPress={() =>
              navigation.navigate('CommunityDetail', {
                communityId: community.id,
                communityName: community.name,
              })
            }
            style={styles.card}
          >
            <View
              style={[
                styles.banner,
                { backgroundColor: `hsl(${hueFor(community.name)}, 45%, 26%)` },
              ]}
            />

            <View style={styles.cardBody}>
              <View style={styles.avatarWrap}>
                <Avatar name={community.name} url={community.icon_url} size={48} />
              </View>

              <Text style={styles.name} numberOfLines={1}>
                {community.name}
              </Text>
              <Text style={styles.description} numberOfLines={2}>
                {community.description ||
                  'Welcome to this community — join to hang out and chat.'}
              </Text>

              <View style={styles.cardFooter}>
                <Text style={styles.tag}>Public community</Text>
                <Button
                  title="Join"
                  size="sm"
                  loading={joiningId === community.id}
                  onPress={() => void join(community.id, community.name)}
                />
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      <CreateCommunityModal
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          void vm.refresh();
        }}
      />
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: c.bg,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl * 2,
    gap: Spacing.md,
  },
  lede: {
    color: c.textSubtle,
    fontSize: 13,
    lineHeight: 19,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: c.sunken,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: Spacing.lg,
    height: 44,
  },
  searchInput: {
    flex: 1,
    color: c.text,
    fontSize: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  sectionTitle: {
    color: c.text,
    fontSize: 15,
    fontWeight: '800',
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: Radius.xxl,
    borderWidth: 1,
    borderColor: c.border,
    overflow: 'hidden',
  },
  banner: {
    height: 56,
  },
  cardBody: {
    padding: Spacing.lg,
    paddingTop: 0,
  },
  avatarWrap: {
    marginTop: -24,
    marginBottom: Spacing.sm,
    alignSelf: 'flex-start',
    borderRadius: Radius.full,
    borderWidth: 3,
    borderColor: c.surface,
  },
  name: {
    color: c.text,
    fontSize: 16,
    fontWeight: '800',
  },
  description: {
    color: c.textSubtle,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
  },
  tag: {
    color: c.textDim,
    fontSize: 11,
    fontWeight: '700',
  },
});
