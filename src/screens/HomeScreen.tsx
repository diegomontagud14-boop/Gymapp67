import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Avatar, FollowButton, WorkoutCard } from '@/components/SocialParts';
import { errText, fetchFeed, getFollowingIds, searchProfiles } from '@/lib/social';
import type { Profile, SocialWorkout } from '@/lib/social';
import ProfileScreen from './ProfileScreen';

export default function HomeScreen({
  me,
  refreshKey,
  openUserId,
  onOpened,
  onCopyRoutine,
}: {
  me: string;
  refreshKey: number;
  openUserId?: string | null;
  onOpened?: () => void;
  onCopyRoutine?: (r: { name: string; exercises: any[] }) => void;
}) {
  const [query, setQuery] = useState('');
  const [feed, setFeed] = useState<SocialWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [results, setResults] = useState<Profile[]>([]);
  const [myFollowing, setMyFollowing] = useState<Set<string>>(new Set());
  const [viewing, setViewing] = useState<string | null>(null);

  const loadFeed = useCallback(async () => {
    try {
      setFeed(await fetchFeed(me));
      setFeedError('');
    } catch (e) {
      setFeedError(errText(e));
    }
    setLoading(false);
    setRefreshing(false);
  }, [me]);

  // Cargar el feed al entrar, al volver de un perfil, al limpiar la búsqueda o tras publicar
  useEffect(() => {
    if (!query.trim() && !viewing) loadFeed();
  }, [query, viewing, refreshKey, loadFeed]);

  // Búsqueda de perfiles (con una pequeña espera mientras escribes)
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const [r, f] = await Promise.all([searchProfiles(q), getFollowingIds(me)]);
        setResults(r);
        setMyFollowing(new Set(f));
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [query, me]);

  // Abrir un perfil que llega desde un enlace compartido
  useEffect(() => {
    if (openUserId) {
      setQuery('');
      setViewing(openUserId);
      onOpened?.();
    }
  }, [openUserId]);

  if (viewing) {
    return (
      <ProfileScreen
        userId={viewing}
        me={me}
        refreshKey={refreshKey}
        onCopyRoutine={onCopyRoutine}
        onBack={() => setViewing(null)}
      />
    );
  }

  const searching = query.trim().length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Barra de búsqueda de perfiles */}
      <View style={styles.searchBox}>
        <Ionicons name="search" size={20} color="#777" />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar perfiles"
          placeholderTextColor="#666"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searching && (
          <Pressable onPress={() => setQuery('')} hitSlop={10}>
            <Ionicons name="close-circle" size={20} color="#777" />
          </Pressable>
        )}
      </View>

      {searching ? (
        <FlatList
          data={results}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 40 }}
          ListEmptyComponent={
            <Text style={[styles.muted, { textAlign: 'center', marginTop: 30 }]}>
              No se han encontrado perfiles.
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.personRow}>
              <Pressable style={styles.personMain} onPress={() => setViewing(item.id)}>
                <Avatar url={item.avatar_url} name={item.username} size={46} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.personName} numberOfLines={1}>
                    {item.display_name || item.username}
                  </Text>
                  <Text style={styles.muted}>@{item.username}</Text>
                </View>
              </Pressable>
              {item.id !== me && (
                <FollowButton me={me} targetId={item.id} initial={myFollowing.has(item.id)} />
              )}
            </View>
          )}
        />
      ) : loading ? (
        <ActivityIndicator color="#5AB0FF" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={feed}
          keyExtractor={(w) => w.id}
          contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 6, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor="#5AB0FF"
              onRefresh={() => {
                setRefreshing(true);
                loadFeed();
              }}
            />
          }
          ListEmptyComponent={
            <Text style={[styles.muted, { textAlign: 'center', marginTop: 40, lineHeight: 20 }]}>
              {feedError
                ? `No se pudo cargar el inicio:\n${feedError}`
                : 'Aún no hay entrenos por aquí.\nTermina un entreno o busca a alguien para seguirle.'}
            </Text>
          }
          renderItem={({ item }) => (
            <WorkoutCard workout={item} me={me} onOpenProfile={(id) => setViewing(id)} />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { color: '#888', fontSize: 13 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#141414',
    borderColor: '#262626',
    borderWidth: 1,
    borderRadius: 14,
    marginHorizontal: 18,
    marginVertical: 12,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 16, paddingVertical: 12 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  personMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  personName: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
