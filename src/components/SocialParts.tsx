import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import ImageViewer from '@/components/ImageViewer';
import { WorkoutDetailModal } from '@/components/WorkoutView';
import { countRecords, formatDuration, timeAgo } from '@/lib/format';
import {
  addComment,
  deleteComment,
  fetchComments,
  follow,
  getFollowingIds,
  listPeople,
  toggleLike,
  unfollow,
} from '@/lib/social';
import type { CommentRow, Profile, SocialWorkout } from '@/lib/social';

export const BLUE = ['#5AB0FF', '#1F4FFF'] as const;

/* ---------- Avatar ---------- */
export function Avatar({
  url,
  name,
  size = 40,
  zoom = false,
}: {
  url?: string | null;
  name?: string | null;
  size?: number;
  zoom?: boolean; // al tocarla se abre en grande
}) {
  const [open, setOpen] = useState(false);
  if (url) {
    const img = (
      <Image
        source={{ uri: url }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#161616' }}
      />
    );
    if (!zoom) return img;
    return (
      <>
        <Pressable onPress={() => setOpen(true)}>{img}</Pressable>
        <ImageViewer uri={open ? url : null} onClose={() => setOpen(false)} />
      </>
    );
  }
  return (
    <LinearGradient
      colors={BLUE}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.42 }}>
        {(name || '?').slice(0, 1).toUpperCase()}
      </Text>
    </LinearGradient>
  );
}

/* ---------- Botón seguir / siguiendo ---------- */
export function FollowButton({
  me,
  targetId,
  initial,
  onChange,
}: {
  me: string;
  targetId: string;
  initial: boolean;
  onChange?: (following: boolean) => void;
}) {
  const [following, setFollowing] = useState(initial);
  const [busy, setBusy] = useState(false);

  useEffect(() => setFollowing(initial), [initial]);

  const press = async () => {
    if (busy) return;
    setBusy(true);
    const next = !following;
    setFollowing(next);
    try {
      if (next) await follow(me, targetId);
      else await unfollow(me, targetId);
      onChange?.(next);
    } catch {
      setFollowing(!next);
    }
    setBusy(false);
  };

  if (following) {
    return (
      <Pressable onPress={press} style={styles.followingBtn}>
        <Text style={styles.followingText}>Siguiendo</Text>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={press}>
      <LinearGradient
        colors={BLUE}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.followBtn}
      >
        <Text style={styles.followText}>Seguir</Text>
      </LinearGradient>
    </Pressable>
  );
}

/* ---------- Comentarios ---------- */
export function CommentsSheet({
  visible,
  workoutId,
  me,
  onClose,
  onCountChange,
}: {
  visible: boolean;
  workoutId: string;
  me: string;
  onClose: () => void;
  onCountChange?: (n: number) => void;
}) {
  const [rows, setRows] = useState<CommentRow[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const reload = async () => {
    const r = await fetchComments(workoutId);
    setRows(r);
    onCountChange?.(r.length);
  };

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    reload()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visible, workoutId]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await addComment(workoutId, me, body);
      setText('');
      await reload();
    } catch {}
    setSending(false);
  };

  const remove = async (id: string) => {
    try {
      await deleteComment(id);
      await reload();
    } catch {}
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.commentsSheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Comentarios</Text>
            <Pressable hitSlop={10} onPress={onClose}>
              <Ionicons name="close" size={24} color="#fff" />
            </Pressable>
          </View>

          <View style={styles.commentInputRow}>
            <TextInput
              style={styles.commentInput}
              placeholder="Añade un comentario…"
              placeholderTextColor="#666"
              value={text}
              onChangeText={setText}
              maxLength={500}
              multiline
            />
            <Pressable onPress={send} disabled={!text.trim() || sending} hitSlop={8}>
              <Ionicons
                name="send"
                size={24}
                color={text.trim() ? '#5AB0FF' : '#3a4a5e'}
              />
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator color="#5AB0FF" style={{ marginTop: 24 }} />
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
              {rows.length === 0 && (
                <Text style={[styles.muted, { textAlign: 'center', marginTop: 24 }]}>
                  Todavía no hay comentarios.
                </Text>
              )}
              {rows.map((c) => (
                <View key={c.id} style={styles.commentRow}>
                  <Avatar url={c.profiles?.avatar_url} name={c.profiles?.username} size={34} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.commentName}>
                      {c.profiles?.display_name || c.profiles?.username}{' '}
                      <Text style={styles.muted}>· {timeAgo(c.created_at)}</Text>
                    </Text>
                    <Text style={styles.commentBody}>{c.body}</Text>
                  </View>
                  {c.user_id === me && (
                    <Pressable hitSlop={8} onPress={() => remove(c.id)}>
                      <Ionicons name="trash-outline" size={18} color="#777" />
                    </Pressable>
                  )}
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

/* ---------- Tarjeta de entreno (inicio y perfil) ---------- */
export function WorkoutCard({
  workout,
  me,
  onOpenProfile,
}: {
  workout: SocialWorkout;
  me: string;
  onOpenProfile?: (userId: string) => void;
}) {
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [zoomUri, setZoomUri] = useState<string | null>(null);

  useEffect(() => {
    setLiked((workout.likes ?? []).some((l) => l.user_id === me));
    setLikes((workout.likes ?? []).length);
    setCommentCount(workout.comments?.[0]?.count ?? 0);
  }, [workout, me]);

  const author = workout.profiles;
  const authorName = author?.display_name || author?.username || 'Usuario';

  const toggle = async () => {
    const was = liked;
    setLiked(!was);
    setLikes((n) => n + (was ? -1 : 1));
    try {
      await toggleLike(workout.id, me, was);
    } catch {
      setLiked(was);
      setLikes((n) => n + (was ? 1 : -1));
    }
  };

  const statsLine = [
    workout.duration_sec != null ? `⏱ ${formatDuration(workout.duration_sec)}` : null,
    `${Math.round((workout.volume ?? 0) * 10) / 10} kg`,
    `${workout.series ?? 0} series`,
  ]
    .filter(Boolean)
    .join(' · ');

  const exercises: any[] = Array.isArray(workout.exercises) ? workout.exercises : [];
  const records = countRecords(exercises);
  const shown = exercises.slice(0, 4);

  const share = () =>
    Share.share({
      message:
        `${authorName} ha completado "${workout.name}" en GymApp\n` +
        `${statsLine}\n` +
        shown.map((e) => `${(e.sets ?? []).length} × ${e.name}`).join('\n'),
    }).catch(() => {});

  const media = Array.isArray(workout.media) ? workout.media : [];

  return (
    <View style={styles.card}>
      <Pressable
        style={styles.cardHead}
        onPress={() => onOpenProfile?.(workout.user_id)}
        disabled={!onOpenProfile}
      >
        <Avatar url={author?.avatar_url} name={authorName} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={styles.cardAuthor} numberOfLines={1}>
            {authorName}
          </Text>
          <Text style={styles.muted}>{timeAgo(workout.created_at)}</Text>
        </View>
      </Pressable>

      <Pressable onPress={() => setDetailOpen(true)}>
      <Text style={styles.cardTitle}>{workout.name}</Text>
      {!!workout.description && <Text style={styles.cardDesc}>{workout.description}</Text>}
      <View style={styles.statsRow}>
        <Text style={styles.cardStats}>{statsLine}</Text>
        {records > 0 && (
          <View style={styles.recordPill}>
            <Text style={styles.recordText}>Records {records}</Text>
            <Ionicons name="medal" size={16} color="#FACC15" />
          </View>
        )}
      </View>

      {shown.length > 0 && (
        <View style={{ marginTop: 10 }}>
          {shown.map((e, i) => (
            <Text key={i} style={styles.exLine} numberOfLines={1}>
              {(e.sets ?? []).length} × {e.name}
            </Text>
          ))}
          {exercises.length > shown.length && (
            <Text style={styles.muted}>+{exercises.length - shown.length} más</Text>
          )}
        </View>
      )}
      </Pressable>

      {media.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
          {media.map((m, i) =>
            m.type === 'image' ? (
              <Pressable key={i} onPress={() => setZoomUri(m.uri)}>
                <Image source={{ uri: m.uri }} style={styles.mediaImg} />
              </Pressable>
            ) : (
              <View key={i} style={[styles.mediaImg, styles.mediaVideo]}>
                <Ionicons name="videocam" size={30} color="#9cc9ff" />
                <Text style={styles.mediaVideoText}>Vídeo</Text>
              </View>
            )
          )}
        </ScrollView>
      )}

      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={toggle} hitSlop={8}>
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={24}
            color={liked ? '#F43F5E' : '#cfd8e6'}
          />
          <Text style={styles.actionText}>{likes}</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={() => setCommentsOpen(true)} hitSlop={8}>
          <Ionicons name="chatbubble-outline" size={22} color="#cfd8e6" />
          <Text style={styles.actionText}>{commentCount}</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={share} hitSlop={8}>
          <Ionicons name="share-outline" size={24} color="#cfd8e6" />
        </Pressable>
      </View>

      <ImageViewer uri={zoomUri} onClose={() => setZoomUri(null)} />
      <WorkoutDetailModal workout={detailOpen ? workout : null} onClose={() => setDetailOpen(false)} />
      <CommentsSheet
        visible={commentsOpen}
        workoutId={workout.id}
        me={me}
        onClose={() => setCommentsOpen(false)}
        onCountChange={setCommentCount}
      />
    </View>
  );
}

/* ---------- Lista de seguidores / seguidos ---------- */
export function PeopleSheet({
  visible,
  kind,
  userId,
  me,
  onClose,
  onOpenProfile,
}: {
  visible: boolean;
  kind: 'followers' | 'following';
  userId: string;
  me: string;
  onClose: () => void;
  onOpenProfile: (id: string) => void;
}) {
  const [people, setPeople] = useState<Profile[]>([]);
  const [myFollowing, setMyFollowing] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    Promise.all([listPeople(userId, kind), getFollowingIds(me)])
      .then(([p, f]) => {
        setPeople(p);
        setMyFollowing(new Set(f));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visible, kind, userId, me]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.commentsSheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{kind === 'followers' ? 'Seguidores' : 'Siguiendo'}</Text>
            <Pressable hitSlop={10} onPress={onClose}>
              <Ionicons name="close" size={24} color="#fff" />
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator color="#5AB0FF" style={{ marginTop: 24 }} />
          ) : (
            <FlatList
              data={people}
              keyExtractor={(p) => p.id}
              ListEmptyComponent={
                <Text style={[styles.muted, { textAlign: 'center', marginTop: 24 }]}>
                  {kind === 'followers' ? 'Aún no tiene seguidores.' : 'Aún no sigue a nadie.'}
                </Text>
              }
              renderItem={({ item }) => (
                <View style={styles.personRow}>
                  <Pressable
                    style={styles.personMain}
                    onPress={() => {
                      onClose();
                      onOpenProfile(item.id);
                    }}
                  >
                    <Avatar url={item.avatar_url} name={item.username} size={44} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardAuthor} numberOfLines={1}>
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
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  muted: { color: '#888', fontSize: 13 },

  followBtn: { paddingVertical: 9, paddingHorizontal: 18, borderRadius: 12 },
  followText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  followingBtn: {
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#1b1b1b',
    borderColor: '#2a2a2a',
    borderWidth: 1,
  },
  followingText: { color: '#cfd8e6', fontSize: 14, fontWeight: '600' },

  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  commentsSheet: {
    height: '80%',
    backgroundColor: '#0d0d0d',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderColor: '#222',
    borderWidth: 1,
    padding: 18,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sheetTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },

  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#141414',
    borderColor: '#262626',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 8,
  },
  commentInput: { flex: 1, color: '#fff', fontSize: 15, maxHeight: 100, paddingVertical: 8 },
  commentRow: { flexDirection: 'row', gap: 10, paddingVertical: 12, alignItems: 'flex-start' },
  commentName: { color: '#fff', fontSize: 14, fontWeight: '700' },
  commentBody: { color: '#cfd8e6', fontSize: 14, marginTop: 2 },

  personRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  personMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },

  card: {
    backgroundColor: '#111',
    borderColor: '#222',
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  cardAuthor: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cardTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  cardDesc: { color: '#cfd8e6', fontSize: 14, marginTop: 4 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 4, marginTop: 8 },
  cardStats: { color: '#5AB0FF', fontSize: 13, fontWeight: '600' },
  recordPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  recordText: { color: '#FACC15', fontSize: 13, fontWeight: '700' },
  exLine: { color: '#aab3c2', fontSize: 14, marginTop: 3 },

  mediaImg: { width: 150, height: 150, borderRadius: 14, marginRight: 10, backgroundColor: '#161616' },
  mediaVideo: { alignItems: 'center', justifyContent: 'center', gap: 4 },
  mediaVideoText: { color: '#9cc9ff', fontSize: 12, fontWeight: '600' },

  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 26,
    marginTop: 14,
    paddingTop: 12,
    borderTopColor: '#1c1c1c',
    borderTopWidth: 1,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { color: '#cfd8e6', fontSize: 14, fontWeight: '600' },
});
