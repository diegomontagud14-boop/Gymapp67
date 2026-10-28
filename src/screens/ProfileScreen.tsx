import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  FlatList,
  ScrollView,
  Share,
  useWindowDimensions,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Avatar, BLUE, FollowButton, PeopleSheet, WorkoutCard } from '@/components/SocialParts';
import ExercisesScreen from '@/screens/ExercisesScreen';
import CalendarScreen from '@/screens/CalendarScreen';
import MeasuresScreen from '@/screens/MeasuresScreen';
import { LiveWorkoutModal, PulsingDot, RoutineViewModal } from '@/components/WorkoutView';
import { startOfWeek } from '@/lib/format';
import { fetchLive, isFresh, subscribeLive } from '@/lib/live';
import type { LiveRow } from '@/lib/live';
import {
  ensureOwnProfile,
  errText,
  fetchUserRoutines,
  fetchUserWorkouts,
  fetchWorkoutDates,
  getCounts,
  getProfile,
  isFollowing,
  updateProfile,
  uploadPublicFile,
} from '@/lib/social';
import type { Profile, RoutineRow, SocialWorkout } from '@/lib/social';
import { supabase } from '@/lib/supabase';

type Week = { start: Date; count: number };
const WEEKS = 13; // ≈ 3 meses

const firstWeekStart = () => {
  const d = startOfWeek(new Date());
  d.setDate(d.getDate() - 7 * (WEEKS - 1));
  return d;
};

const buildWeeks = (dates: string[]): Week[] => {
  const thisWeek = startOfWeek(new Date());
  const weeks: Week[] = Array.from({ length: WEEKS }, (_, i) => {
    const s = new Date(thisWeek);
    s.setDate(s.getDate() - 7 * (WEEKS - 1 - i));
    return { start: s, count: 0 };
  });
  for (const iso of dates) {
    const w = startOfWeek(new Date(iso));
    const diff = Math.round((thisWeek.getTime() - w.getTime()) / (7 * 86400000));
    const k = WEEKS - 1 - diff;
    if (k >= 0 && k < WEEKS) weeks[k].count += 1;
  }
  return weeks;
};

/* ---------- Gráfico de columnas con degradado azul ---------- */
function WeeklyChart({ weeks }: { weeks: Week[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.count));
  return (
    <View>
      <View style={styles.chart}>
        {weeks.map((w, i) => (
          <View key={i} style={styles.barCol}>
            {w.count > 0 && <Text style={styles.barNum}>{w.count}</Text>}
            {w.count > 0 ? (
              <LinearGradient
                colors={BLUE}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={{
                  width: '100%',
                  height: Math.max(8, (w.count / max) * 96),
                  borderRadius: 6,
                }}
              />
            ) : (
              <View style={{ width: '100%', height: 3, backgroundColor: '#222', borderRadius: 2 }} />
            )}
          </View>
        ))}
      </View>
      <View style={styles.chartLabels}>
        <Text style={styles.muted}>
          {weeks[0]?.start.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
        </Text>
        <Text style={styles.muted}>Esta semana</Text>
      </View>
    </View>
  );
}

/* ---------- Rutinas: un solo recuadro que se desliza ---------- */
function RoutinesCarousel({ routines, onOpen }: { routines: RoutineRow[]; onOpen: (r: RoutineRow) => void }) {
  const [w, setW] = useState(0);
  const [idx, setIdx] = useState(0);
  return (
    <View style={styles.carousel} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && (
        <FlatList
          data={routines}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(r) => r.id}
          onMomentumScrollEnd={(e) => setIdx(Math.round(e.nativeEvent.contentOffset.x / w))}
          renderItem={({ item }) => (
            <Pressable style={{ width: w, padding: 16 }} onPress={() => onOpen(item)}>
              <Text style={styles.routineName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.routineSub}>
                {(item.exercises ?? []).length} {(item.exercises ?? []).length === 1 ? 'ejercicio' : 'ejercicios'}
              </Text>
              {(item.exercises ?? []).slice(0, 3).map((e: any, i: number) => (
                <Text key={i} style={styles.routineEx} numberOfLines={1}>
                  {e.name}
                </Text>
              ))}
              {(item.exercises ?? []).length > 3 && (
                <Text style={styles.routineSub}>+{item.exercises.length - 3} más</Text>
              )}
            </Pressable>
          )}
        />
      )}
      {routines.length > 1 && (
        <View style={styles.dots}>
          {routines.map((r, i) => (
            <View key={r.id} style={[styles.dot, i === idx && styles.dotOn]} />
          ))}
        </View>
      )}
    </View>
  );
}

/* ---------- Editar perfil ---------- */
function EditProfileView({
  profile,
  onClose,
  onSaved,
}: {
  profile: Profile;
  onClose: () => void;
  onSaved: (p: Profile) => void;
}) {
  const [displayName, setDisplayName] = useState(profile.display_name ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatar_url);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const pickAvatar = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (res.canceled) return;
    setUploading(true);
    try {
      const asset = res.assets[0];
      const mime = asset.mimeType ?? 'image/jpeg';
      const ext = mime.includes('png') ? 'png' : 'jpg';
      const path = `${profile.id}/avatar-${Date.now()}.${ext}`;
      const url = await uploadPublicFile('avatars', path, asset.uri, mime);
      setAvatarUrl(url);
    } catch (e) {
      Alert.alert('No se pudo subir la foto', errText(e));
    }
    setUploading(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      const updated = await updateProfile(profile.id, {
        display_name: displayName.trim(),
        bio: bio.trim(),
        avatar_url: avatarUrl,
      });
      onSaved(updated);
      onClose();
    } catch {
      Alert.alert('No se pudo guardar', 'Inténtalo de nuevo.');
    }
    setSaving(false);
  };

  const signOut = () =>
    Alert.alert('Cerrar sesión', '¿Quieres salir de tu cuenta?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);

  return (
    <View style={styles.editRoot}>
        <View style={styles.editHeader}>
          <Pressable onPress={onClose}>
            <Text style={styles.link}>Cancelar</Text>
          </Pressable>
          <Text style={styles.editTitle}>Editar perfil</Text>
          <Pressable onPress={save} disabled={saving || uploading}>
            <Text style={[styles.link, (saving || uploading) && { color: '#3a4a5e' }]}>Guardar</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
          <Pressable style={{ alignSelf: 'center', alignItems: 'center' }} onPress={pickAvatar}>
            <Avatar url={avatarUrl} name={displayName || profile.username} size={104} />
            <Text style={[styles.link, { marginTop: 10 }]}>
              {uploading ? 'Subiendo…' : 'Cambiar foto'}
            </Text>
          </Pressable>

          <Text style={styles.fieldLabel}>NOMBRE</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Tu nombre"
            placeholderTextColor="#666"
            maxLength={30}
          />

          <Text style={styles.fieldLabel}>DESCRIPCIÓN</Text>
          <TextInput
            style={[styles.input, { height: 110, textAlignVertical: 'top' }]}
            value={bio}
            onChangeText={setBio}
            placeholder="Cuéntanos algo sobre ti"
            placeholderTextColor="#666"
            multiline
            maxLength={160}
          />
          <Text style={styles.muted}>Usuario: @{profile.username}</Text>

          <Pressable onPress={() => Linking.openURL('https://repdb.co').catch(() => {})}>
            <Text style={[styles.muted, { textAlign: 'center', marginTop: 22 }]}>
              Exercise data by RepDB (repdb.co)
            </Text>
          </Pressable>

          <Pressable style={styles.signOut} onPress={signOut}>
            <Text style={styles.signOutText}>Cerrar sesión</Text>
          </Pressable>
        </ScrollView>
    </View>
  );
}

/* ---------- Perfil (el tuyo o el de otra persona) ---------- */
export default function ProfileScreen({
  userId,
  me,
  refreshKey,
  onBack,
  onCopyRoutine,
}: {
  userId: string;
  me: string;
  refreshKey: number;
  onBack?: () => void;
  onCopyRoutine?: (r: { name: string; exercises: any[] }) => void;
}) {
  const isMe = userId === me;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [counts, setCounts] = useState({ workouts: 0, followers: 0, following: 0 });
  const [workouts, setWorkouts] = useState<SocialWorkout[]>([]);
  const [weeks, setWeeks] = useState<Week[]>(buildWeeks([]));
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [workoutsError, setWorkoutsError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [people, setPeople] = useState<'followers' | 'following' | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [live, setLive] = useState<LiveRow | null>(null);
  const [liveOpen, setLiveOpen] = useState(false);
  const [routines, setRoutines] = useState<RoutineRow[]>([]);
  const [routineOpen, setRoutineOpen] = useState<RoutineRow | null>(null);
  const [section, setSection] = useState<'calendar' | 'measures' | null>(null);

  const load = useCallback(async () => {
    setErrorMsg('');
    // 1) El perfil: es lo imprescindible, y se muestra en cuanto llega
    try {
      let p: Profile;
      try {
        p = await getProfile(userId);
      } catch (e) {
        if (!isMe) throw e;
        await ensureOwnProfile();
        p = await getProfile(userId);
      }
      setProfile(p);
    } catch (e) {
      setErrorMsg(errText(e));
      setLoading(false);
      setRefreshing(false);
      return;
    }
    // 2) Lo demás se carga por separado: si algo falla, el resto se sigue viendo
    const [c, w, d, f, rt, lv] = await Promise.allSettled([
      getCounts(userId),
      fetchUserWorkouts(userId),
      fetchWorkoutDates(userId, firstWeekStart().toISOString()),
      isMe ? Promise.resolve(false) : isFollowing(me, userId),
      fetchUserRoutines(userId),
      isMe ? Promise.resolve(null) : fetchLive(userId),
    ]);
    if (rt.status === 'fulfilled') setRoutines(rt.value);
    if (lv.status === 'fulfilled') setLive(isFresh(lv.value) ? lv.value : null);
    if (c.status === 'fulfilled') setCounts(c.value);
    if (w.status === 'fulfilled') {
      setWorkouts(w.value);
      setWorkoutsError('');
    } else {
      setWorkoutsError(errText(w.reason));
    }
    if (d.status === 'fulfilled') setWeeks(buildWeeks(d.value));
    if (f.status === 'fulfilled') setFollowing(f.value);
    setLoading(false);
    setRefreshing(false);
  }, [userId, me, isMe]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // Entreno en directo de esa persona (aparece y desaparece solo)
  useEffect(() => {
    if (isMe) return;
    return subscribeLive(userId, setLive);
  }, [userId, isMe]);

  // Entrar al perfil de otra persona (desde seguidores/siguiendo)
  if (viewing) {
    return (
      <ProfileScreen
        userId={viewing}
        me={me}
        refreshKey={refreshKey}
        onCopyRoutine={onCopyRoutine}
        onBack={() => {
          setViewing(null);
          load();
        }}
      />
    );
  }

  const shareProfile = () => {
    if (!profile) return;
    Share.share({
      message:
        `Sígueme en GymApp 💪\n@${profile.username}\n\n` +
        `Abrir mi perfil: gymapp://u/${profile.username}\n` +
        `(Si el enlace no se abre, búscame en la app como @${profile.username})`,
    }).catch(() => {});
  };

  const openEditor = () => {
    if (profile) {
      setEditing(true);
    } else {
      Alert.alert('Perfil no cargado', 'No he podido cargar tu perfil. Inténtalo de nuevo en unos segundos.');
      load();
    }
  };

  if (section === 'exercises' && isMe) {
    return <ExercisesScreen me={me} onExit={() => setSection(null)} />;
  }

  if (section === 'calendar' && isMe) {
    return <CalendarScreen me={me} onExit={() => setSection(null)} />;
  }

  if (section === 'measures' && isMe) {
  return <MeasuresScreen me={me} onExit={() => setSection(null)} />;
}

  if (editing && profile && isMe) {
    return (
      <EditProfileView
        profile={profile}
        onClose={() => setEditing(false)}
        onSaved={setProfile}
      />
    );
  }

  const thisWeek = weeks[weeks.length - 1]?.count ?? 0;
  const name = profile?.display_name || profile?.username || '';

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 60 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor="#5AB0FF"
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
      >
        {/* Nombre + lápiz, compartir y ajustes */}
        <View style={styles.topRow}>
          <View style={styles.topLeft}>
            {onBack && (
              <Pressable onPress={onBack} hitSlop={10}>
                <Ionicons name="chevron-back" size={28} color="#fff" />
              </Pressable>
            )}
            <View style={{ flex: 1 }}>
              <View style={styles.nameRow}>
                <Text style={[styles.name, { flexShrink: 1 }]} numberOfLines={1}>
                  {name}
                </Text>
                {!isMe && !!live && (
                  <Pressable style={styles.livePill} onPress={() => setLiveOpen(true)} hitSlop={6}>
                    <PulsingDot size={9} />
                    <Text style={styles.livePillText} numberOfLines={1}>
                      {live.name}
                    </Text>
                  </Pressable>
                )}
              </View>
              {!!profile && <Text style={styles.handle}>@{profile.username}</Text>}
            </View>
          </View>
          <View style={styles.icons}>
            {isMe && (
              <Pressable onPress={openEditor} hitSlop={8}>
                <Ionicons name="pencil" size={22} color="#fff" />
              </Pressable>
            )}
            <Pressable onPress={shareProfile} hitSlop={8}>
              <Ionicons name="share-outline" size={25} color="#fff" />
            </Pressable>
            {isMe && (
              // Los ajustes de la app todavía no se pueden usar
              <View style={{ opacity: 0.35 }}>
                <Ionicons name="settings-outline" size={25} color="#fff" />
              </View>
            )}
          </View>
        </View>

        {loading && !profile ? (
          <ActivityIndicator color="#5AB0FF" style={{ marginTop: 40 }} />
        ) : !profile ? (
          <View style={{ alignItems: 'center', marginTop: 40, gap: 14, paddingHorizontal: 30 }}>
            <Text style={[styles.muted, { textAlign: 'center' }]}>No se pudo cargar el perfil.</Text>
            {!!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
            <Pressable
              onPress={() => {
                setLoading(true);
                load();
              }}
            >
              <Text style={styles.link}>Reintentar</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Foto + números */}
            <View style={styles.headRow}>
              <Avatar url={profile?.avatar_url} name={name} size={86} zoom />
              <View style={styles.counts}>
                <View style={styles.countBox}>
                  <Text style={styles.countNum}>{counts.workouts}</Text>
                  <Text style={styles.countLabel}>Entrenos</Text>
                </View>
                <Pressable style={styles.countBox} onPress={() => setPeople('followers')}>
                  <Text style={styles.countNum}>{counts.followers}</Text>
                  <Text style={styles.countLabel}>Seguidores</Text>
                </Pressable>
                <Pressable style={styles.countBox} onPress={() => setPeople('following')}>
                  <Text style={styles.countNum}>{counts.following}</Text>
                  <Text style={styles.countLabel}>Siguiendo</Text>
                </Pressable>
              </View>
            </View>

            {/* Descripción */}
            {!!profile?.bio && <Text style={styles.bio}>{profile.bio}</Text>}

            {/* Menú personal (solo lo ves tú) */}
            {isMe && (
              <View style={styles.menuGrid}>
                {(
                  [
                    { k: 'stats', icon: 'stats-chart', label: 'Estadísticas' },
                    { k: 'exercises', icon: 'barbell', label: 'Ejercicios' },
                    { k: 'measures', icon: 'body', label: 'Medidas' },
                    { k: 'calendar', icon: 'calendar', label: 'Calendario' },
                  ] as const
                ).map((b) => (
                  <Pressable
                    key={b.k}
                    style={styles.menuBtn}
                    onPress={() =>
  b.k === 'calendar'
    ? setSection('calendar')
    : b.k === 'measures'
      ? setSection('measures')
      : Alert.alert(b.label, 'Esta sección llegará próximamente.')
}
                  >
                    <Ionicons name={b.icon} size={26} color="#5AB0FF" />
                    <Text style={styles.menuBtnText}>{b.label}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {!isMe && (
              <View style={{ paddingHorizontal: 18, marginTop: 14, alignItems: 'flex-start' }}>
                <FollowButton
                  me={me}
                  targetId={userId}
                  initial={following}
                  onChange={(f) =>
                    setCounts((c) => ({ ...c, followers: c.followers + (f ? 1 : -1) }))
                  }
                />
              </View>
            )}

            {/* Gráfico de los últimos 3 meses */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {thisWeek} {thisWeek === 1 ? 'entreno' : 'entrenos'} esta semana
              </Text>
              <Text style={[styles.muted, { marginBottom: 14 }]}>Últimos 3 meses</Text>
              <WeeklyChart weeks={weeks} />
            </View>

            {/* Rutinas */}
            {routines.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.label}>RUTINAS</Text>
                <RoutinesCarousel routines={routines} onOpen={setRoutineOpen} />
              </View>
            )}

            {/* Entrenos realizados */}
            <View style={styles.section}>
              <Text style={styles.label}>ENTRENOS</Text>
              {!!workoutsError && (
                <Text style={styles.errorText}>
                  No se pudieron cargar los entrenos: {workoutsError}
                </Text>
              )}
              {workouts.length === 0 ? (
                <Text style={[styles.muted, { textAlign: 'center', marginTop: 20 }]}>
                  {isMe ? 'Todavía no has completado ningún entreno.' : 'Aún no tiene entrenos.'}
                </Text>
              ) : (
                workouts.map((w) => (
                  <WorkoutCard key={w.id} workout={w} me={me} />
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>

      <RoutineViewModal
        routine={routineOpen}
        onClose={() => setRoutineOpen(null)}
        onCopy={
          !isMe && onCopyRoutine && routineOpen
            ? () => {
                onCopyRoutine({ name: routineOpen.name, exercises: routineOpen.exercises });
                setRoutineOpen(null);
              }
            : undefined
        }
      />
      <LiveWorkoutModal
        userId={userId}
        personName={name}
        visible={liveOpen && !isMe}
        onClose={() => setLiveOpen(false)}
      />

      {!!people && (
        <PeopleSheet
          visible
          kind={people}
          userId={userId}
          me={me}
          onClose={() => setPeople(null)}
          onOpenProfile={(id) => {
            if (id === userId) return;
            setViewing(id);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { color: '#888', fontSize: 13 },
  errorText: { color: '#ff8a80', fontSize: 12, textAlign: 'center', marginBottom: 8 },
  link: { color: '#5AB0FF', fontSize: 15, fontWeight: '600' },
  label: { color: '#5AB0FF', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 10 },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  topLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 10 },
  name: { color: '#fff', fontSize: 24, fontWeight: '800' },
  handle: { color: '#777', fontSize: 13 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    maxWidth: 150,
    backgroundColor: 'rgba(239,68,68,0.16)',
    borderColor: 'rgba(239,68,68,0.5)',
    borderWidth: 1,
    borderRadius: 14,
    paddingRight: 10,
    paddingLeft: 2,
  },
  livePillText: { color: '#fff', fontSize: 12, fontWeight: '700', flexShrink: 1 },
  carousel: {
    backgroundColor: '#111',
    borderColor: '#222',
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
    paddingBottom: 12,
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 7, marginTop: 4 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#333' },
  dotOn: { backgroundColor: '#5AB0FF', width: 18 },
  routineEx: { color: '#cfd8e6', fontSize: 14, marginTop: 4 },
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 18, marginTop: 16 },
  menuBtn: {
    width: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#111',
    borderColor: '#222',
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  menuBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  routineName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  routineSub: { color: '#8a94a6', fontSize: 12, marginTop: 3 },
  icons: { flexDirection: 'row', alignItems: 'center', gap: 20 },

  headRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 20 },
  counts: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  countBox: { alignItems: 'center' },
  countNum: { color: '#fff', fontSize: 20, fontWeight: '800' },
  countLabel: { color: '#8a94a6', fontSize: 13, marginTop: 2 },
  bio: { color: '#cfd8e6', fontSize: 14, lineHeight: 20, paddingHorizontal: 18, marginTop: 14 },

  section: { paddingHorizontal: 18, marginTop: 26 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 2 },

  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 130, gap: 5 },
  barCol: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center', gap: 4 },
  barNum: { color: '#9cc9ff', fontSize: 10, fontWeight: '700' },
  chartLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },

  editRoot: { flex: 1, backgroundColor: '#000' },
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomColor: '#1c1c1c',
    borderBottomWidth: 1,
  },
  editTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  fieldLabel: { color: '#5AB0FF', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: -6 },
  input: {
    backgroundColor: '#141414',
    borderColor: '#262626',
    borderWidth: 1,
    borderRadius: 12,
    color: '#fff',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  signOut: {
    marginTop: 24,
    backgroundColor: '#161616',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutText: { color: '#ff5b4d', fontSize: 15, fontWeight: '600' },
});