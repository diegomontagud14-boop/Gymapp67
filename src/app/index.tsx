import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { Session } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ActiveWorkoutBar, { ConfirmDialog } from '@/components/ActiveWorkoutBar';
import type { ActiveInfo } from '@/components/ActiveWorkoutBar';
import { onPendingProfile, takePendingProfile } from '@/lib/deeplink';
import { clearLive, pushLive } from '@/lib/live';
import { getProfileByUsername, syncRoutines, uploadWorkout } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import AuthScreen from '@/screens/AuthScreen';
import GymScreen from '@/screens/GymScreen';
import type { GymHandle, Workout } from '@/screens/GymScreen';
import HomeScreen from '@/screens/HomeScreen';
import ProfileScreen from '@/screens/ProfileScreen';

const BLUE = ['#5AB0FF', '#1F4FFF'] as const;
const TAB_GAP = 8;

/* Barra de pestañas: el degradado azul se desliza de una a otra */
function TabBar({ tab, onChange }: { tab: TabKey; onChange: (t: TabKey) => void }) {
  const [w, setW] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const idx = TABS.findIndex((t) => t.key === tab);
  const tabW = w > 0 ? (w - TAB_GAP * (TABS.length - 1)) / TABS.length : 0;

  useEffect(() => {
    if (!tabW) return;
    Animated.spring(x, {
      toValue: idx * (tabW + TAB_GAP),
      useNativeDriver: true,
      damping: 18,
      stiffness: 190,
      mass: 0.8,
    }).start();
  }, [idx, tabW]);

  return (
    <View style={styles.tabBar} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {tabW > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[styles.pill, { width: tabW, transform: [{ translateX: x }] }]}
        >
          <LinearGradient
            colors={BLUE}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
      {TABS.map((t) => (
        <Pressable key={t.key} style={styles.tabWrap} onPress={() => onChange(t.key)}>
          <View style={styles.tab}>
            <Ionicons name={t.icon} size={18} color={tab === t.key ? '#fff' : '#aab3c2'} />
            <Text style={tab === t.key ? styles.tabTextActive : styles.tabText}>{t.label}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

type TabKey = 'inicio' | 'entrenos' | 'perfil';
const TABS: { key: TabKey; label: string; icon: 'home' | 'barbell' | 'person' }[] = [
  { key: 'inicio', label: 'Inicio', icon: 'home' },
  { key: 'entrenos', label: 'Entrenos', icon: 'barbell' },
  { key: 'perfil', label: 'Perfil', icon: 'person' },
];

function MainApp({ userId }: { userId: string }) {
  const [tab, setTab] = useState<TabKey>('inicio');
  const [gymView, setGymView] = useState('home');
  const [refreshKey, setRefreshKey] = useState(0);
  const gymRef = useRef<GymHandle>(null);

  // Entreno en curso (para la barra de abajo) y perfil abierto desde un enlace
  const [active, setActive] = useState<ActiveInfo | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  // Entreno en directo: se sube lo que llevas (con un pequeño retardo) y un latido cada minuto
  const liveRef = useRef<{ name: string; start: number; exercises: any[] } | null>(null);
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleLive = (live: { name: string; start: number; exercises: any[] } | null) => {
    liveRef.current = live;
    if (liveTimer.current) clearTimeout(liveTimer.current);
    if (!live) {
      clearLive(userId).catch(() => {});
      return;
    }
    liveTimer.current = setTimeout(() => pushLive(userId, live).catch(() => {}), 1200);
  };
  useEffect(() => {
    const iv = setInterval(() => {
      if (liveRef.current) pushLive(userId, liveRef.current).catch(() => {});
    }, 60000);
    return () => {
      clearInterval(iv);
      if (liveTimer.current) clearTimeout(liveTimer.current);
    };
  }, [userId]);

  // Rutinas en la nube (para que se vean en tu perfil)
  const routinesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleRoutines = (routines: { id: string; name: string; exercises: any[] }[]) => {
    if (routinesTimer.current) clearTimeout(routinesTimer.current);
    routinesTimer.current = setTimeout(() => {
      syncRoutines(userId, routines)
        .then(() => setRefreshKey((k) => k + 1))
        .catch(() => {});
    }, 1500);
  };

  const handleCopyRoutine = (r: { name: string; exercises: any[] }) => {
    gymRef.current?.addRoutine(r);
    Alert.alert('Rutina copiada', `"${r.name}" se ha añadido a tus rutinas.`);
  };

  // Al guardar un entreno se publica en tu perfil (y en el inicio de quien te sigue)
  const handleWorkoutSaved = async (w: Workout) => {
    try {
      await uploadWorkout(userId, w);
      setRefreshKey((k) => k + 1);
    } catch {
      Alert.alert(
        'No se pudo publicar el entreno',
        'Se ha guardado en tu móvil, pero no se ha subido. Revisa tu conexión.'
      );
    }
  };

  // Enlaces gymapp://u/usuario -> abrir ese perfil
  useEffect(() => {
    let cancelled = false;
    const handle = async () => {
      const username = takePendingProfile();
      if (!username) return;
      try {
        const p = await getProfileByUsername(username);
        if (cancelled) return;
        if (p.id === userId) {
          setTab('perfil');
        } else {
          setTab('inicio');
          setOpenUserId(p.id);
        }
      } catch {
        if (!cancelled) Alert.alert('Perfil no encontrado', `No existe ningún usuario @${username}.`);
      }
    };
    handle();
    const off = onPendingProfile(handle);
    return () => {
      cancelled = true;
      off();
    };
  }, [userId]);

  // Mientras entrenas dentro del entreno se oculta la barra de arriba para tener toda la pantalla
  const showTabs = !(tab === 'entrenos' && gymView !== 'home');
  // La barra del entreno en curso se ve en todas partes menos dentro del propio entreno
  const showBar = !!active && (tab !== 'entrenos' || gymView === 'home');

  return (
    <View style={{ flex: 1 }}>
      {showTabs && <TabBar tab={tab} onChange={setTab} />}

      {/* Las tres pantallas siguen montadas para no perder un entreno en curso al cambiar de pestaña */}
      <View style={[styles.pane, tab !== 'inicio' && styles.hidden]}>
        <HomeScreen
          me={userId}
          refreshKey={refreshKey}
          openUserId={openUserId}
          onOpened={() => setOpenUserId(null)}
          onCopyRoutine={handleCopyRoutine}
        />
      </View>
      <View style={[styles.pane, tab !== 'entrenos' && styles.hidden]}>
        <GymScreen
          ref={gymRef}
          onViewChange={setGymView}
          onWorkoutSaved={handleWorkoutSaved}
          onActiveChange={setActive}
          onLiveChange={handleLive}
          onRoutinesChange={handleRoutines}
        />
      </View>
      <View style={[styles.pane, tab !== 'perfil' && styles.hidden]}>
        <ProfileScreen userId={userId} me={userId} refreshKey={refreshKey} />
      </View>

      {showBar && active && (
        <ActiveWorkoutBar
          info={active}
          onOpen={() => {
            setTab('entrenos');
            gymRef.current?.openWorkout();
          }}
          onDelete={() => setConfirmDelete(true)}
        />
      )}

      <ConfirmDialog
        visible={confirmDelete}
        title="BORRAR ENTRENO EN CURSO"
        message="¿Seguro que quieres borrar el entreno en curso?"
        confirmLabel="Borrar entreno"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          gymRef.current?.discardWorkout();
        }}
      />
    </View>
  );
}

export default function Root() {
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {!ready ? (
        <View style={styles.center}>
          <ActivityIndicator color="#5AB0FF" size="large" />
        </View>
      ) : session ? (
        <MainApp key={session.user.id} userId={session.user.id} />
      ) : (
        <AuthScreen />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  tabBar: {
    flexDirection: 'row',
    gap: TAB_GAP,
    marginHorizontal: 18,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 14,
    backgroundColor: '#141414',
  },
  pill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 14, overflow: 'hidden' },
  tabWrap: { flex: 1 },
  tab: { paddingVertical: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  tabText: { color: '#aab3c2', fontSize: 15, fontWeight: '700' },
  tabTextActive: { color: '#fff', fontSize: 15, fontWeight: '700' },

  pane: { flex: 1 },
  hidden: { display: 'none' },
});
