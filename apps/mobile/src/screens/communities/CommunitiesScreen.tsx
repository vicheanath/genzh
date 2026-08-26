import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, Compass, Users, ChevronRight } from 'lucide-react-native';
import { useCommunitiesVM, type Community } from '@genzh/shared';
import { useAuth } from '../../context/AuthContext';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { ModeSwitch } from '../../components/ModeSwitch';
import { Radius, type Palette } from '../../theme/tokens';
import { useThemedStyles, useColors } from '../../theme/ThemeContext';
import { CreateCommunityModal } from './CreateCommunityModal';

export function CommunitiesScreen({ navigation }: any) {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const { token } = useAuth();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const vm = useCommunitiesVM(token);
  const list = vm.communities;
  const loading = vm.isLoading;

  const onRefresh = () => void vm.refresh();

  const renderCommunityItem = ({ item }: { item: Community }) => (
    <TouchableOpacity
      style={styles.communityCard}
      activeOpacity={0.8}
      onPress={() =>
        navigation.navigate('CommunityDetail', {
          communityId: item.id,
          communityName: item.name,
        })
      }
    >
      <Avatar name={item.name} url={item.icon_url} size={50} />
      <View style={styles.communityInfo}>
        <Text style={styles.communityName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.communityDesc} numberOfLines={1}>
          {item.description || 'Welcome to our community!'}
        </Text>
      </View>
      <ChevronRight size={18} color={c.textDim} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Servers</Text>
          <Text style={styles.subtitle}>Places you stay</Text>
        </View>
        <View style={styles.headerActions}>
          {/* The way back to the other half of the app. It sits with the
              actions rather than in the title because it is one — leaving. */}
          <ModeSwitch />
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.navigate('Explore')}
            activeOpacity={0.8}
          >
            <Compass size={20} color={c.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, styles.createBtn]}
            onPress={() => setShowCreateModal(true)}
            activeOpacity={0.8}
          >
            <Plus size={20} color={c.accentContrast} />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={c.accent} />
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          renderItem={renderCommunityItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={onRefresh}
              tintColor={c.accent}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Users size={48} color={c.textDim} style={{ marginBottom: 12 }} />
              <Text style={styles.emptyTitle}>No servers yet</Text>
              <Text style={styles.emptySubtitle}>
                Create your first community or explore public servers to get started.
              </Text>
              <Button
                title="Explore Communities"
                icon={<Compass size={18} color={c.accentContrast} />}
                onPress={() => navigation.navigate('Explore')}
              />
            </View>
          }
        />
      )}

      <CreateCommunityModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => {
          setShowCreateModal(false);
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: c.textSubtle,
    marginTop: 1,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: c.text,
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.pill,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: c.border,
  },
  createBtn: {
    backgroundColor: c.accent,
    borderColor: c.accent,
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  communityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: Radius.xl, // Rule 4: Slab containers
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: c.border,
  },
  communityInfo: {
    flex: 1,
    marginLeft: 14,
    marginRight: 8,
  },
  communityName: {
    fontSize: 16,
    fontWeight: '700',
    color: c.text,
    marginBottom: 3,
  },
  communityDesc: {
    fontSize: 13,
    color: c.textMuted,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: c.text,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: c.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
});
