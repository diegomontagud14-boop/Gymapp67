import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AttachBadge from '@/components/AttachBadge';
import { Avatar } from '@/components/SocialParts';
import { ConfirmDialog } from '@/components/ActiveWorkoutBar';
import { countRecords, formatDuration } from '@/lib/format';
import { fetchLive, isFresh, subscribeLive } from '@/lib/live';
import type { LiveRow } from '@/lib/live';
import type { SocialWorkout } from '@/lib/social';

const TYPE_COLOR: Record<string, string> = { N: '#fff', W: '#FBBF24', F: '#F87171', D: '#A78BFA' };
const FIELDS: Record<string, { key: 'weight' | 'reps' | 'seconds'; label: string }[]> = {
  reps: [
    { key: 'weight', label: 'KG' },
    { key: 'reps', label: 'REPS' },
  ],
  time: [{ key: 'seconds', label: 'SEG' }],
  timeWeight: [
    { key: 'weight', label: 'KG' },
    { key: 'seconds', label: 'SEG' },
  ],
};

/* Lista de ejercicios de solo lectura.
   done = entreno terminado · live = entreno en directo (series hechas marcadas) · plan = rutina (sin valores) */
export function ExercisesReadOnly({
  exercises,
  mode,
}: {
  exercises: any[];
  mode: 'done' | 'live' | 'plan';
}) {
  return (
    <>
      {(exercises ?? []).map((ex, xi) => {
        const fields = FIELDS[ex.kind ?? 'reps'] ?? FIELDS.reps;
        let counter = 0;
        return (
          <View key={ex.id ?? xi} style={styles.exBlock}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <Text style={[styles.exTitle, { flex: 1, marginBottom: 0 }]}>{ex.name}</Text>
              <AttachBadge id={ex.attach} size={32} />
            </View>
            {!!ex.note && <Text style={styles.note}>{ex.note}</Text>}

            <View style={styles.head}>
              <Text style={[styles.headText, { width: 44 }]}>SERIE</Text>
              {mode !== 'plan' &&
                fields.map((f) => (
                  <Text key={f.key} style={[styles.headText, { flex: 1 }]}>
                    {f.label}
                  </Text>
                ))}
              {mode === 'live' && <View style={{ width: 34 }} />}
            </View>

            {(ex.sets ?? []).map((s: any, i: number) => {
              const type: string = s.type ?? 'N';
              const isDrop = type === 'D';
              const label = type === 'N' ? String(++counter) : type;
              const isPR = mode !== 'plan' && s.done !== false && !!s.prs?.length;
              const done = mode === 'live' ? !!s.done : true;
              return (
                <View
                  key={i}
                  style={[
                    styles.row,
                    mode === 'live' && done && styles.rowDone,
                    isDrop && styles.dropRow,
                    mode === 'live' && !done && { opacity: 0.55 },
                  ]}
                >
                  {isPR && (
                    <LinearGradient
                      colors={['rgba(250,204,21,0.42)', 'rgba(34,197,94,0.22)']}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={[StyleSheet.absoluteFill, { borderRadius: 12 }]}
                    />
                  )}
                  <View style={styles.numBox}>
                    {isPR ? (
                      <Ionicons name="medal" size={20} color="#FACC15" />
                    ) : isDrop ? (
                      <Ionicons name="return-down-forward" size={20} color={TYPE_COLOR.D} />
                    ) : (
                      <Text style={[styles.num, { color: TYPE_COLOR[type] ?? '#fff' }]}>{label}</Text>
                    )}
                  </View>
                  {mode !== 'plan' &&
                    fields.map((f) => (
                      <Text key={f.key} style={styles.val}>
                        {s[f.key] ? String(s[f.key]) : '—'}
                      </Text>
                    ))}
                  {mode === 'live' && (
                    <View style={[styles.tick, done && styles.tickOn]}>
                      <Ionicons name="checkmark" size={18} color={done ? '#fff' : '#555'} />
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        );
      })}
    </>
  );
}

export function ModalShell({
  visible,
  onClose,
  title,
  right,
  exit = 'left',
  children,
}: {
  exit?: 'left' | 'right'; // lado donde va la flecha de salir
  visible: boolean;
  onClose: () => void;
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.shell, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.shellHead}>
          <View style={{ minWidth: 28 }}>
            {exit === 'left' && (
              <Pressable onPress={onClose} hitSlop={12}>
                <Ionicons name="chevron-back" size={28} color="#fff" />
              </Pressable>
            )}
          </View>
          <Text style={styles.shellTitle} numberOfLines={1}>
            {title}
          </Text>
          <View style={{ minWidth: 28, alignItems: 'flex-end' }}>
            {exit === 'right' ? (
              <Pressable onPress={onClose} hitSlop={12}>
                <Ionicons name="arrow-forward" size={28} color="#fff" />
              </Pressable>
            ) : (
              right
            )}
          </View>
        </View>
        {children}
      </View>
    </Modal>
  );
}

/* ---------- Entreno terminado (sin imágenes) ---------- */
export function WorkoutDetailModal({
  workout,
  onClose,
  exit = 'left',
}: {
  workout: SocialWorkout | null;
  onClose: () => void;
  exit?: 'left' | 'right';
}) {
  const w = workout;
  const author = w?.profiles;
  const exercises: any[] = Array.isArray(w?.exercises) ? (w!.exercises as any[]) : [];
  const records = countRecords(exercises);
  const stats = w
    ? [
        w.duration_sec != null ? `⏱ ${formatDuration(w.duration_sec)}` : null,
        `${Math.round((w.volume ?? 0) * 10) / 10} kg`,
        `${w.series ?? 0} series`,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';
  return (
    <ModalShell visible={!!w} onClose={onClose} title={w?.name ?? ''} exit={exit}>
      {!!w && (
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 60 }}>
          <View style={styles.authorRow}>
            <Avatar url={author?.avatar_url} name={author?.username} size={36} />
            <View style={{ flex: 1 }}>
              <Text style={styles.author}>{author?.display_name || author?.username}</Text>
              <Text style={styles.muted}>
                {new Date(w.created_at).toLocaleDateString('es-ES', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </Text>
            </View>
          </View>
          {!!w.description && <Text style={styles.desc}>{w.description}</Text>}
          <View style={styles.statsRow}>
            <Text style={styles.stats}>{stats}</Text>
            {records > 0 && (
              <View style={styles.recordPill}>
                <Text style={styles.recordText}>Records {records}</Text>
                <Ionicons name="medal" size={16} color="#FACC15" />
              </View>
            )}
          </View>
          <ExercisesReadOnly exercises={exercises} mode="done" />
        </ScrollView>
      )}
    </ModalShell>
  );
}

/* ---------- Rutina (la tuya o la de otra persona) ---------- */
export function RoutineViewModal({
  routine,
  onClose,
  onCopy,
}: {
  routine: { name: string; exercises: any[] } | null;
  onClose: () => void;
  onCopy?: () => void; // si se pasa, sale el icono de copiar arriba a la derecha
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <ModalShell
      visible={!!routine}
      onClose={onClose}
      title={routine?.name ?? ''}
      right={
        onCopy ? (
          <Pressable hitSlop={12} onPress={() => setConfirm(true)}>
            <Ionicons name="copy-outline" size={25} color="#fff" />
          </Pressable>
        ) : undefined
      }
    >
      {!!routine && (
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 60 }}>
          <ExercisesReadOnly exercises={routine.exercises} mode="plan" />
        </ScrollView>
      )}
      <ConfirmDialog
        visible={confirm}
        title="¿Copiar rutina?"
        message="Se añadirá a tus rutinas."
        confirmLabel="Copiar"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          onCopy?.();
        }}
      />
    </ModalShell>
  );
}

/* ---------- Círculo rojo palpitante ---------- */
export function PulsingDot({ size = 12 }: { size?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(v, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <View style={{ width: size * 2, height: size * 2, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: '#EF4444',
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.1] }) }],
        }}
      />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#EF4444' }} />
    </View>
  );
}

/* ---------- Ver un entreno en directo ---------- */
export function LiveWorkoutModal({
  userId,
  personName,
  visible,
  onClose,
}: {
  userId: string;
  personName: string;
  visible: boolean;
  onClose: () => void;
}) {
  const [row, setRow] = useState<LiveRow | null>(null);
  const [ended, setEnded] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!visible) return;
    setEnded(false);
    fetchLive(userId)
      .then((r) => (isFresh(r) ? setRow(r) : (setRow(null), setEnded(true))))
      .catch(() => {});
    const off = subscribeLive(userId, (r) => {
      if (r) {
        setRow(r);
        setEnded(false);
      } else {
        setRow(null);
        setEnded(true);
      }
    });
    const iv = setInterval(() => tick((n) => n + 1), 1000);
    return () => {
      off();
      clearInterval(iv);
    };
  }, [visible, userId]);

  const elapsed = row ? Math.max(0, Math.floor((Date.now() - new Date(row.started_at).getTime()) / 1000)) : 0;
  const exs: any[] = row?.exercises ?? [];
  const done = exs.reduce((n, e) => n + (e.sets ?? []).filter((s: any) => s.done).length, 0);
  const total = exs.reduce((n, e) => n + (e.sets ?? []).length, 0);

  return (
    <ModalShell
      visible={visible}
      onClose={onClose}
      title={`${personName} · en directo`}
      right={!ended && row ? <PulsingDot size={10} /> : undefined}
    >
      {ended || !row ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 }}>
          <Text style={[styles.muted, { textAlign: 'center', fontSize: 15 }]}>
            {ended ? 'Este entreno ya ha terminado.' : 'Cargando…'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 60 }}>
          <Text style={styles.liveName}>{row.name}</Text>
          <Text style={styles.stats}>
            ⏱ {formatDuration(elapsed)} · {done}/{total} series
          </Text>
          <View style={{ height: 8 }} />
          <ExercisesReadOnly exercises={exs} mode="live" />
        </ScrollView>
      )}
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  muted: { color: '#888', fontSize: 13 },
  shell: { flex: 1, backgroundColor: '#000' },
  shellHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomColor: '#1c1c1c',
    borderBottomWidth: 1,
  },
  shellTitle: { flex: 1, color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center' },

  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  author: { color: '#fff', fontSize: 15, fontWeight: '700' },
  desc: { color: '#cfd8e6', fontSize: 14, marginBottom: 6 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, marginBottom: 8 },
  stats: { color: '#5AB0FF', fontSize: 13, fontWeight: '600' },
  recordPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  recordText: { color: '#FACC15', fontSize: 13, fontWeight: '700' },
  liveName: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 2 },

  exBlock: { marginTop: 18 },
  exTitle: { color: '#5AB0FF', fontSize: 17, fontWeight: '700', marginBottom: 6 },
  note: { color: '#aab3c2', fontSize: 13, marginBottom: 6 },
  head: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  headText: { color: '#666', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 12,
    overflow: 'hidden',
  },
  rowDone: { backgroundColor: 'rgba(34,197,94,0.16)' },
  dropRow: { marginLeft: 22, borderLeftWidth: 2, borderLeftColor: 'rgba(167,139,250,0.55)' },
  numBox: { width: 44, alignItems: 'center' },
  num: { fontSize: 16, fontWeight: '800' },
  val: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  tick: {
    width: 34,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
    marginRight: 4,
  },
  tickOn: { backgroundColor: '#22C55E' },
});
