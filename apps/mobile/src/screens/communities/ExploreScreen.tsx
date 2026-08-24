import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Search, Check } from 'lucide-react-native';
import { communities, type Community } from '@genzh/shared';
import { useAuth } from '../../context/AuthContext';
import { Avatar } from '../../components/Avatar';
import { Input } from '../../components/Input';
import { Colors, Radius } from '../../theme/tokens';

export function ExploreScreen({ navigation }: any) {
  const { token } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Community[]>([]);
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const handleSearch = async (text: string) => {
    setQuery(text);
    if (!token || !text.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const all = await communities.list(token);
      const filtered = all.filter(
        (c) =>
          c.name.toLowerCase().includes(text.toLowerCase()) ||
          (c.description && c.description.toLowerCase().includes(text.toLowerCase()))
      );
      setResults(filtered);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (communityId: string) => {
    if (!token) return;
    try {
      await communities.join(token, communityId);
      setJoinedIds((prev) => new Set(prev).add(communityId));
      Alert.alert('Success', 'You have joined the community!');
    } catch (err: any) {
      Alert.alert('Join Failed', err?.message || 'Could not join community');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Explore Communities</Text>
      </View>

      <View style={styles.searchContainer}>
        <Input
          placeholder="Search by name or topic..."
          value={query}
          onChangeText={handleSearch}
          containerStyle={{ marginBottom: 0 }}
        />
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const isJoined = joinedIds.has(item.id);
          return (
            <View style={styles.card}>
              <Avatar name={item.name} url={item.icon_url} size={48} />
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.desc} numberOfLines={2}>
                  {item.description || 'No description provided.'}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.joinBtn, isJoined && styles.joinedBtn]}
                disabled={isJoined}
                onPress={() => handleJoin(item.id)}
              >
                {isJoined ? (
                  <Check size={16} color={Colors.textMuted} />
                ) : (
                  <Text style={styles.joinText}>Join</Text>
                )}
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Search size={40} color={Colors.textDim} style={{ marginBottom: 10 }} />
            <Text style={styles.emptyText}>
              {query ? 'No matching communities found' : 'Type to discover public communities'}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    marginRight: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
  },
  searchContainer: {
    padding: 16,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  info: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 2,
  },
  desc: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  joinBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.pill,
  },
  joinedBtn: {
    backgroundColor: Colors.sunken,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  joinText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.accentContrast,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 14,
  },
});
