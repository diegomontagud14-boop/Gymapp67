import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  Vibration,
  View,
  useWindowDimensions,
} from 'react-native';

import { CATALOG, EQUIPMENT, EQUIPMENT_LABEL, GROUPS } from '@/data/exercises';
import type { CatalogExercise, Equipment, Group, Kind } from '@/data/exercises';
import AttachBadge from '@/components/AttachBadge';
import AttachmentPicker from '@/components/AttachmentPicker';
import { ATTACH_BY_ID, attachmentsFor } from '@/data/attachments';
import { cancelRestNotifications, scheduleRestEnd, setupNotifications } from '@/lib/notifications';

/* ---------- Tipos ---------- */
type FieldKey = 'reps' | 'weight' | 'seconds';
type SetType = 'N' | 'W' | 'F' | 'D'; // normal, calentamiento, fallo, dropset
type PRType = 'weight' | 'volume' | 'reps';
type SetT = {
  reps: string;
  weight: string;
  seconds: string;
  done: boolean;
  type: SetType;
  prs?: PRType[]; // récords que batió esta serie al completarla
};
type Exercise = {
  id: string;
  name: string;
  group?: string;
  exId?: string; // id del ejercicio en el catálogo (RepDB)
  grip?: string; // agarre elegido (Prono, Supino, Abierto...)
  attach?: string; // enganche de polea elegido (id de data/attachments)
  kind?: Kind;
  rest?: number; // descanso propio del ejercicio, en segundos
  note?: string;
  sets: SetT[];
};
type Routine = { id: string; name: string; exercises: Exercise[]; folderId?: string };
type Folder = { id: string; name: string; open: boolean };
type MediaItem = { uri: string; type: 'image' | 'video' };
export type Workout = {
  id: string;
  name: string;
  description: string;
  date: string;
  durationSec?: number;
  volume?: number;
  series?: number;
  media?: MediaItem[];
  exercises: Exercise[];
};
type Rest = { startAt: number; duration: number; loop: boolean } | null;
type Stopwatch = { acc: number; startedAt: number | null };
type Best = { weight: number; volume: number; reps: number };
type RecordItem = { exercise: string; type: PRType; value: number };

type ViewName = 'home' | 'editor' | 'workout' | 'finish' | 'picker' | 'records';

const BLUE = ['#5AB0FF', '#1F4FFF'] as const;
const BLUE_DARK = ['#143a78', '#0a1a3d'] as const;

const REST_MIN = 15;
const REST_MAX = 600;
const REST_STEP = 15;
const REST_DEFAULT = 120;

const MAX_PHOTOS = 3;
const MAX_VIDEOS = 1;
const MAX_VIDEO_SECONDS = 60;

const uid = () => Math.random().toString(36).slice(2, 10);
const emptySet = (): SetT => ({ reps: '', weight: '', seconds: '', done: false, type: 'N' });

// Qué campos tiene cada tipo de ejercicio
const FIELDS: Record<Kind, { key: FieldKey; label: string }[]> = {
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

const SET_TYPES: { type: SetType; label: string; color: string }[] = [
  { type: 'N', label: 'Serie normal', color: '#ffffff' },
  { type: 'W', label: 'Serie de calentamiento', color: '#FBBF24' },
  { type: 'F', label: 'Serie al fallo', color: '#F87171' },
  { type: 'D', label: 'Dropset', color: '#A78BFA' },
];
const typeColor = (t: SetType) => SET_TYPES.find((x) => x.type === t)?.color ?? '#fff';

const PR_LABEL: Record<PRType, string> = {
  weight: 'Mayor peso',
  volume: 'Mayor volumen en una serie',
  reps: 'Más repeticiones',
};

// Nombre con agarre: "Press de banca con barra agarre abierto" (el agarre "Normal" no se añade)
const gripName = (base: string, grip?: string) =>
  grip && grip !== 'Normal' ? `${base} agarre ${grip.toLowerCase()}` : base;

type PickItem = { c: CatalogExercise; grip?: string; attach?: string };

const newExercise = ({ c, grip, attach }: PickItem): Exercise => ({
  id: uid(),
  name: gripName(c.name, grip),
  group: c.group,
  exId: c.grips?.find((g) => g.l === grip)?.id ?? c.id,
  grip,
  attach,
  kind: c.kind,
  sets: [emptySet()],
});

// Para datos guardados con versiones anteriores de la app
const normalizeExercise = (e: Exercise, doneDefault: boolean): Exercise => ({
  ...e,
  kind: e.kind ?? 'reps',
  sets: (e.sets ?? []).map((s) => ({
    reps: s.reps ?? '',
    weight: s.weight ?? '',
    seconds: s.seconds ?? '',
    done: s.done ?? doneDefault,
    type: s.type ?? 'N',
    prs: s.prs,
  })),
});

const pad = (n: number) => String(n).padStart(2, '0');

// 1h 05min 12s
const formatDuration = (total: number) => {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${pad(m)}min ${pad(s)}s`;
  if (m > 0) return `${m}min ${pad(s)}s`;
  return `${s}s`;
};

// 1h 05min (rueda de duración)
const formatMinutes = (min: number) =>
  min >= 60 ? `${Math.floor(min / 60)}h ${pad(min % 60)}min` : `${min}min`;

// 2:00 o 1:05:12 (relojes de descanso y cronómetro)
const formatClock = (total: number) => {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

const formatSet = (kind: Kind | undefined, s: SetT) => {
  const k = kind ?? 'reps';
  if (k === 'time') return `${s.seconds || 0}s`;
  if (k === 'timeWeight') return `${s.weight || 0}kg x ${s.seconds || 0}s`;
  return `${s.weight || 0}kg x ${s.reps || 0}`;
};

const toNum = (v: string) => {
  const n = parseFloat((v || '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
};

// En una serie al fallo cuenta una repetición menos
const effReps = (s: SetT) => {
  const r = toNum(s.reps);
  return s.type === 'F' ? Math.max(0, r - 1) : r;
};

// Volumen total (series completadas × reps × kg) y nº de series completadas
const calcStats = (exs: Exercise[]) => {
  let volume = 0;
  let series = 0;
  for (const e of exs) {
    for (const s of e.sets) {
      if (!s.done) continue;
      series += 1;
      if ((e.kind ?? 'reps') === 'reps') volume += toNum(s.weight) * effReps(s);
    }
  }
  return { volume: Math.round(volume * 10) / 10, series };
};

/* ---------- Récords personales ---------- */
const ZERO: Best = { weight: 0, volume: 0, reps: 0 };

// Mejores marcas de un ejercicio: peso máximo, volumen máximo en una serie y,
// para series sin peso (peso corporal), repeticiones máximas. Las series W no cuentan.
const bestFromSets = (sets: SetT[], skip = -1): Best => {
  const b = { ...ZERO };
  sets.forEach((s, i) => {
    if (i === skip || !s.done || s.type === 'W' || s.type === 'D') return;
    const w = toNum(s.weight);
    const r = effReps(s);
    if (w > 0) {
      b.weight = Math.max(b.weight, w);
      b.volume = Math.max(b.volume, w * r);
    } else {
      b.reps = Math.max(b.reps, r);
    }
  });
  return b;
};

// Solo hay récord si ya existía una marca anterior que superar
const detectPRs = (s: SetT, best: Best): PRType[] => {
  const w = toNum(s.weight);
  const r = effReps(s);
  const out: PRType[] = [];
  if (w > 0) {
    if (best.weight > 0 && w > best.weight) out.push('weight');
    if (best.volume > 0 && w * r > best.volume) out.push('volume');
  } else if (r > 0 && best.reps > 0 && r > best.reps) {
    out.push('reps');
  }
  return out;
};

// De todos los récords de un ejercicio en un entreno, se queda solo con el mejor de cada tipo
const collectRecords = (exs: Exercise[]): RecordItem[] => {
  const out: RecordItem[] = [];
  for (const e of exs) {
    const bestBy: Partial<Record<PRType, number>> = {};
    for (const s of e.sets) {
      if (!s.done || !s.prs) continue;
      for (const t of s.prs) {
        const v =
          t === 'weight' ? toNum(s.weight) : t === 'volume' ? toNum(s.weight) * effReps(s) : effReps(s);
        if (v > (bestBy[t] ?? -1)) bestBy[t] = v;
      }
    }
    (['weight', 'volume', 'reps'] as PRType[]).forEach((t) => {
      const v = bestBy[t];
      if (v !== undefined) out.push({ exercise: e.name, type: t, value: Math.round(v * 10) / 10 });
    });
  }
  return out;
};

const formatRecordValue = (r: RecordItem) =>
  r.type === 'reps' ? `${r.value} reps` : `${r.value} kg`;

const normalizeText = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Copia el archivo a una carpeta permanente de la app (el de la cámara/galería puede borrarse)
const persistMedia = async (uri: string): Promise<string> => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FS = require('expo-file-system/legacy');
    const dir = `${FS.documentDirectory}media/`;
    try {
      await FS.makeDirectoryAsync(dir, { intermediates: true });
    } catch {}
    const ext = (uri.split('?')[0].match(/\.[a-zA-Z0-9]+$/) ?? ['.jpg'])[0];
    const dest = `${dir}${uid()}${ext}`;
    await FS.copyAsync({ from: uri, to: dest });
    return dest;
  } catch {
    return uri;
  }
};

/* ---------- Componentes pequeños ---------- */
function GradientButton({
  label,
  onPress,
  style,
  small,
}: {
  label: string;
  onPress: () => void;
  style?: object;
  small?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [style, pressed && { opacity: 0.8 }]}>
      <LinearGradient
        colors={BLUE}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradBtn, small && styles.gradBtnSmall]}
      >
        <Text style={styles.gradBtnText}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

// Cronómetro propio: solo se redibuja él cada segundo, no toda la pantalla.
function ElapsedTimer({ start, style }: { start: number; style?: object }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <Text style={style}>{formatDuration(Math.max(0, Math.floor((now - start) / 1000)))}</Text>;
}

// Cuenta atrás del descanso (calculada con la hora real, así sigue bien en segundo plano)
function RestClock({
  rest,
  style,
  onDone,
}: {
  rest: NonNullable<Rest>;
  style?: object;
  onDone?: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const elapsed = Math.max(0, (now - rest.startAt) / 1000);
  const remaining = rest.loop
    ? rest.duration - (elapsed % rest.duration)
    : Math.max(0, rest.duration - elapsed);
  const done = !rest.loop && elapsed >= rest.duration;
  useEffect(() => {
    if (done) onDone?.();
  }, [done]);
  return <Text style={style}>{formatClock(Math.ceil(remaining))}</Text>;
}

// Línea azul del descanso: empieza llena y se va vaciando de derecha a izquierda
function RestLine({ rest }: { rest: Rest }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!rest) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [rest]);
  let pct = 0;
  if (rest) {
    const elapsed = Math.max(0, (now - rest.startAt) / 1000);
    const remaining = rest.loop
      ? rest.duration - (elapsed % rest.duration)
      : Math.max(0, rest.duration - elapsed);
    pct = Math.min(1, remaining / rest.duration);
  }
  return (
    <View style={styles.restTrack}>
      {pct > 0 && (
        <LinearGradient
          colors={BLUE}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ height: 3, width: `${pct * 100}%` }}
        />
      )}
    </View>
  );
}

function StopwatchClock({ sw, style }: { sw: Stopwatch; style?: object }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (sw.startedAt === null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [sw.startedAt]);
  const ms = sw.acc + (sw.startedAt !== null ? Math.max(0, now - sw.startedAt) : 0);
  return <Text style={style}>{formatClock(Math.floor(ms / 1000))}</Text>;
}

const CONFETTI_COLORS = ['#5AB0FF', '#FACC15', '#22C55E', '#F87171', '#A78BFA', '#ffffff'];

function Confetti() {
  const t = useRef(new Animated.Value(0)).current;
  const pieces = useRef(
    Array.from({ length: 30 }, () => ({
      dx: (Math.random() - 0.5) * 300,
      up: 40 + Math.random() * 90,
      fall: 50 + Math.random() * 110,
      rot: (Math.random() - 0.5) * 900,
      size: 6 + Math.random() * 6,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    }))
  ).current;

  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 1500, useNativeDriver: true }).start();
  }, []);

  return (
    <View pointerEvents="none" style={styles.confettiOrigin}>
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            width: p.size,
            height: p.size * 0.6,
            backgroundColor: p.color,
            borderRadius: 1,
            opacity: t.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
              {
                translateY: t.interpolate({
                  inputRange: [0, 0.35, 1],
                  outputRange: [0, -p.up, p.fall],
                }),
              },
              { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.rot}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

// Panel 0/X: se rellena de azul según las series completadas; con todas hechas, confeti
function ProgressPanel({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(1, done / total) : 0;
  const wasComplete = useRef(false);
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    const complete = total > 0 && done === total;
    if (complete && !wasComplete.current) setBurst((b) => b + 1);
    wasComplete.current = complete;
  }, [done, total]);

  return (
    <View style={styles.panelWrap}>
      <View style={styles.panel}>
        {pct > 0 && (
          <LinearGradient
            colors={BLUE}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct * 100}%` }}
          />
        )}
        <Text style={styles.panelText}>
          {done}/{total}
        </Text>
      </View>
      {burst > 0 && <Confetti key={burst} />}
    </View>
  );
}

function Sheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>{children}</View>
      </View>
    </Modal>
  );
}

function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.dialogRoot}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>{title}</Text>
          <Text style={styles.dialogMsg}>{message}</Text>
          <View style={styles.dialogBtns}>
            <Pressable style={styles.dialogBtn} onPress={onCancel}>
              <Text style={styles.dialogCancel}>Cancelar</Text>
            </Pressable>
            <Pressable style={styles.dialogBtn} onPress={onConfirm}>
              <Text style={styles.dialogDanger}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// − 15s  [ 2:00 ]  + 15s   (entre 0:15 y 10:00)
function DurationStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={styles.stepper}>
      <Pressable
        style={styles.stepBtn}
        onPress={() => onChange(Math.max(REST_MIN, value - REST_STEP))}
      >
        <Text style={styles.stepBtnText}>−15s</Text>
      </Pressable>
      <Text style={styles.stepValue}>{formatClock(value)}</Text>
      <Pressable
        style={styles.stepBtn}
        onPress={() => onChange(Math.min(REST_MAX, value + REST_STEP))}
      >
        <Text style={styles.stepBtnText}>+15s</Text>
      </Pressable>
    </View>
  );
}

// Rueda deslizable de minutos (de 1 min a 5 h)
const WHEEL_ITEM = 48;
function DurationWheel({
  selected,
  onChange,
}: {
  selected: number;
  onChange: (min: number) => void;
}) {
  const minutes = useMemo(() => Array.from({ length: 300 }, (_, i) => i + 1), []);
  const onEnd = (y: number) => {
    const i = Math.max(0, Math.min(299, Math.round(y / WHEEL_ITEM)));
    onChange(i + 1);
  };
  return (
    <View style={{ height: WHEEL_ITEM * 5 }}>
      <View pointerEvents="none" style={styles.wheelBand} />
      <FlatList
        data={minutes}
        extraData={selected}
        keyExtractor={(m) => String(m)}
        getItemLayout={(_, i) => ({ length: WHEEL_ITEM, offset: WHEEL_ITEM * i, index: i })}
        initialScrollIndex={selected - 1}
        snapToInterval={WHEEL_ITEM}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: WHEEL_ITEM * 2 }}
        onMomentumScrollEnd={(e) => onEnd(e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(e) => onEnd(e.nativeEvent.contentOffset.y)}
        renderItem={({ item }) => (
          <View style={{ height: WHEEL_ITEM, alignItems: 'center', justifyContent: 'center' }}>
            <Text
              style={{
                color: item === selected ? '#fff' : '#666',
                fontSize: item === selected ? 22 : 18,
                fontWeight: item === selected ? '800' : '500',
              }}
            >
              {formatMinutes(item)}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

// Rueda deslizable de opciones de texto (agarres)
function OptionWheel({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: number;
  onChange: (index: number) => void;
}) {
  const onEnd = (y: number) =>
    onChange(Math.max(0, Math.min(options.length - 1, Math.round(y / WHEEL_ITEM))));
  return (
    <View style={{ height: WHEEL_ITEM * 5 }}>
      <View pointerEvents="none" style={styles.wheelBand} />
      <FlatList
        data={options}
        extraData={selected}
        keyExtractor={(o) => o}
        getItemLayout={(_, i) => ({ length: WHEEL_ITEM, offset: WHEEL_ITEM * i, index: i })}
        initialScrollIndex={selected}
        snapToInterval={WHEEL_ITEM}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: WHEEL_ITEM * 2 }}
        onMomentumScrollEnd={(e) => onEnd(e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(e) => onEnd(e.nativeEvent.contentOffset.y)}
        renderItem={({ item, index }) => (
          <View style={{ height: WHEEL_ITEM, alignItems: 'center', justifyContent: 'center' }}>
            <Text
              style={{
                color: index === selected ? '#fff' : '#666',
                fontSize: index === selected ? 22 : 18,
                fontWeight: index === selected ? '800' : '500',
              }}
            >
              {item}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

function Header({
  left,
  title,
  right,
}: {
  left?: { label: string; onPress: () => void; disabled?: boolean };
  title: string;
  right?: { label: string; onPress: () => void; disabled?: boolean };
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerSide}>
        {left && (
          <Pressable onPress={left.onPress} disabled={left.disabled}>
            <Text style={[styles.headerLink, left.disabled && styles.headerLinkOff]}>
              {left.label}
            </Text>
          </Pressable>
        )}
      </View>
      <View style={styles.headerCenter}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>
        {right && (
          <Pressable onPress={right.onPress} disabled={right.disabled}>
            <Text
              style={[styles.headerLink, right.disabled && styles.headerLinkOff]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {right.label}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function StatsRow({
  start,
  stats,
}: {
  start: number;
  stats: { volume: number; series: number };
}) {
  return (
    <View style={styles.statsRow}>
      <View style={styles.statBox}>
        <Text style={styles.statLabel}>Duración</Text>
        <ElapsedTimer start={start} style={[styles.statValue, { color: '#5AB0FF' }]} />
      </View>
      <View style={styles.statBox}>
        <Text style={styles.statLabel}>Volumen</Text>
        <Text style={styles.statValue}>{stats.volume} kg</Text>
      </View>
      <View style={styles.statBox}>
        <Text style={styles.statLabel}>Series</Text>
        <Text style={styles.statValue}>{stats.series}</Text>
      </View>
    </View>
  );
}

function MediaStrip({
  items,
  onRemove,
}: {
  items: MediaItem[];
  onRemove?: (index: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    <View style={styles.mediaRow}>
      {items.map((m, i) => (
        <View key={m.uri + i} style={styles.mediaThumb}>
          {m.type === 'image' ? (
            <Image source={{ uri: m.uri }} style={styles.mediaImg} />
          ) : (
            <View style={[styles.mediaImg, styles.mediaVideo]}>
              <Ionicons name="videocam" size={26} color="#9cc9ff" />
              <Text style={styles.mediaVideoText}>Vídeo</Text>
            </View>
          )}
          {onRemove && (
            <Pressable style={styles.mediaRemove} hitSlop={8} onPress={() => onRemove(i)}>
              <Ionicons name="close" size={14} color="#fff" />
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

/* Lista de ejercicios.
   mode 'editor'  -> al crear rutina: solo se ven las series (sin reps/peso)
   mode 'workout' -> entrenando: anterior, kg, reps y tick de serie completada */
function ExerciseList({
  exercises,
  mode,
  getPrevious,
  getBest,
  onChange,
  onSetCompleted,
}: {
  exercises: Exercise[];
  mode: 'editor' | 'workout';
  getPrevious?: (name: string) => Exercise | undefined;
  getBest?: (name: string) => Best;
  onChange: (next: Exercise[]) => void;
  onSetCompleted?: (ex: Exercise, brokeRecord: boolean) => void;
}) {
  const editable = mode === 'workout';
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [restFor, setRestFor] = useState<{ id: string; value: number } | null>(null);
  const [typeFor, setTypeFor] = useState<{ id: string; i: number } | null>(null);
  const [noteOpen, setNoteOpen] = useState<Record<string, boolean>>({});
  const [gripFor, setGripFor] = useState<{ id: string; index: number } | null>(null);
  const [attachFor, setAttachFor] = useState<{ id: string; index: number } | null>(null);

  const updateExercise = (id: string, fn: (e: Exercise) => Exercise) =>
    onChange(exercises.map((e) => (e.id === id ? fn(e) : e)));

  const setField = (id: string, i: number, key: FieldKey, value: string) =>
    updateExercise(id, (e) => ({
      ...e,
      sets: e.sets.map((x, j) => (j === i ? { ...x, [key]: value } : x)),
    }));

  // Récords que bate la serie i comparada con el historial y con el resto del entreno
  const prsFor = (ex: Exercise, sets: SetT[], i: number): PRType[] => {
    const s = sets[i];
    if (s.type === 'W' || s.type === 'D' || (ex.kind ?? 'reps') !== 'reps') return [];
    const hist = getBest?.(ex.name) ?? ZERO;
    const sess = bestFromSets(sets, i);
    return detectPRs(s, {
      weight: Math.max(hist.weight, sess.weight),
      volume: Math.max(hist.volume, sess.volume),
      reps: Math.max(hist.reps, sess.reps),
    });
  };

  const toggleDone = (ex: Exercise, i: number) => {
    const completing = !ex.sets[i].done;
    let ns: SetT = { ...ex.sets[i], done: completing, prs: undefined };
    if (completing) {
      // Si dejaste kg/reps vacíos, se usan los de la vez anterior
      const prev = getPrevious?.(ex.name)?.sets[i];
      for (const f of FIELDS[ex.kind ?? 'reps']) {
        if (!ns[f.key] && prev?.[f.key]) ns = { ...ns, [f.key]: prev[f.key] };
      }
    }
    const sets = ex.sets.map((x, j) => (j === i ? ns : x));
    if (completing) {
      const prs = prsFor(ex, sets, i);
      if (prs.length) sets[i] = { ...ns, prs };
    }
    updateExercise(ex.id, (e) => ({ ...e, sets }));
    if (completing) onSetCompleted?.(ex, !!sets[i].prs?.length);
  };

  const changeType = (ex: Exercise, i: number, type: SetType) => {
    const sets = ex.sets.map((x, j) => (j === i ? { ...x, type, prs: undefined } : x));
    if (sets[i].done) {
      const prs = prsFor(ex, sets, i);
      if (prs.length) sets[i] = { ...sets[i], prs };
    }
    updateExercise(ex.id, (e) => ({ ...e, sets }));
  };

  const removeSet = (ex: Exercise, i: number) =>
    updateExercise(ex.id, (e) => ({ ...e, sets: e.sets.filter((_, j) => j !== i) }));

  const menuEx = exercises.find((e) => e.id === menuFor);
  const restEx = exercises.find((e) => e.id === restFor?.id);
  const typeEx = exercises.find((e) => e.id === typeFor?.id);
  const familyOf = (ex?: Exercise) =>
    ex ? CATALOG.find((c) => c.grips?.some((g) => g.id === ex.exId)) : undefined;
  const isCable = (ex?: Exercise) =>
    !!ex && CATALOG.find((c) => c.id === ex.exId || c.grips?.some((g) => g.id === ex.exId))?.equipment === 'polea';
  const openAttach = (ex: Exercise) => {
    const list = attachmentsFor(ex.group);
    setAttachFor({ id: ex.id, index: Math.max(0, list.findIndex((a) => a.id === ex.attach)) });
  };
  const attachEx = exercises.find((e) => e.id === attachFor?.id);
  const menuFamily = familyOf(menuEx);
  const gripEx = exercises.find((e) => e.id === gripFor?.id);
  const gripFamily = familyOf(gripEx);

  return (
    <>
      {exercises.map((ex) => {
        const fields = FIELDS[ex.kind ?? 'reps'];
        const prevEx = editable ? getPrevious?.(ex.name) : undefined;
        let counter = 0; // numeración: solo las series normales llevan número
        return (
          <View key={ex.id} style={styles.exBlock}>
            <View style={styles.exTop}>
              <Text style={styles.exTitle}>{ex.name}</Text>
              {!!ex.attach && (
                <Pressable hitSlop={8} onPress={() => openAttach(ex)} style={{ marginRight: 12 }}>
                  <AttachBadge id={ex.attach} />
                </Pressable>
              )}
              <Pressable hitSlop={12} onPress={() => setMenuFor(ex.id)}>
                <Ionicons name="ellipsis-vertical" size={20} color="#9aa4b5" />
              </Pressable>
            </View>

            <View style={styles.chipsRow}>
              <Pressable
                style={styles.miniChip}
                onPress={() => setRestFor({ id: ex.id, value: ex.rest ?? REST_DEFAULT })}
              >
                <Ionicons name="timer-outline" size={16} color="#cfd8e6" />
                <Text style={styles.miniChipText}>
                  Descanso: {ex.rest ? formatClock(ex.rest) : '--'}
                </Text>
              </Pressable>
              <Pressable
                style={styles.miniChip}
                onPress={() => setNoteOpen((p) => ({ ...p, [ex.id]: true }))}
              >
                <Ionicons name="document-text-outline" size={16} color="#cfd8e6" />
                <Text style={styles.miniChipText}>Nota</Text>
              </Pressable>
            </View>

            {(noteOpen[ex.id] || !!ex.note) && (
              <TextInput
                style={styles.noteInput}
                multiline
                placeholder="Añade una nota…"
                placeholderTextColor="#555"
                value={ex.note ?? ''}
                onChangeText={(t) => updateExercise(ex.id, (e) => ({ ...e, note: t }))}
              />
            )}

            <View style={styles.setHeader}>
              <Text style={[styles.setHeadText, { width: 44 }]}>SERIE</Text>
              {editable && <Text style={[styles.setHeadText, { flex: 1.3 }]}>ANTERIOR</Text>}
              {fields.map((f) => (
                <Text key={f.key} style={[styles.setHeadText, { flex: 1 }]}>
                  {f.label}
                </Text>
              ))}
              {editable && (
                <View style={{ width: 40, alignItems: 'center' }}>
                  <Ionicons name="checkmark" size={16} color="#666" />
                </View>
              )}
            </View>

            {ex.sets.map((s, i) => {
              const prev = prevEx?.sets[i];
              const isPR = s.done && !!s.prs?.length;
              const label = s.type === 'N' ? String(++counter) : s.type;
              const isDrop = s.type === 'D';
              return (
                <View
                  key={i}
                  style={[
                    styles.setRow,
                    s.done && !isPR && styles.setRowDone,
                    isDrop && styles.dropRow,
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

                  {/* Número / tipo de serie (o medalla si batió récord) */}
                  <Pressable
                    disabled={!editable}
                    onPress={() => setTypeFor({ id: ex.id, i })}
                    style={styles.setNumBox}
                  >
                    {isPR ? (
                      <LinearGradient
                        colors={['#FDE047', '#F59E0B']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.setNumFill}
                      >
                        <Ionicons name="medal" size={22} color="#6b4500" />
                      </LinearGradient>
                    ) : (
                      <View style={[styles.setNumFill, { backgroundColor: '#161616' }]}>
                        {isDrop ? (
                          <Ionicons name="return-down-forward" size={20} color={typeColor('D')} />
                        ) : (
                          <Text style={[styles.setNum, { color: typeColor(s.type) }]}>{label}</Text>
                        )}
                      </View>
                    )}
                  </Pressable>

                  {editable && (
                    <Text style={styles.prevText} numberOfLines={1}>
                      {prev ? formatSet(ex.kind, prev) : '—'}
                    </Text>
                  )}

                  {fields.map((f) =>
                    editable ? (
                      <TextInput
                        key={f.key}
                        style={[styles.setInput, s.done && styles.setInputDone]}
                        keyboardType={f.key === 'weight' ? 'decimal-pad' : 'numeric'}
                        placeholder={prev?.[f.key] || '0'}
                        placeholderTextColor="#555"
                        value={s[f.key]}
                        onChangeText={(t) => setField(ex.id, i, f.key, t)}
                      />
                    ) : (
                      <Text key={f.key} style={styles.setPlaceholder}>
                        —
                      </Text>
                    )
                  )}

                  {editable && (
                    <Pressable
                      style={[styles.tick, s.done && styles.tickOn]}
                      onPress={() => toggleDone(ex, i)}
                    >
                      <Ionicons name="checkmark" size={20} color={s.done ? '#fff' : '#666'} />
                    </Pressable>
                  )}
                </View>
              );
            })}

            <Pressable
              style={styles.addSetBtn}
              onPress={() => updateExercise(ex.id, (e) => ({ ...e, sets: [...e.sets, emptySet()] }))}
            >
              <Text style={styles.addSetText}>+ Agregar serie</Text>
            </Pressable>
          </View>
        );
      })}

      {/* Menú ⋮ del ejercicio */}
      <Sheet visible={!!menuEx} onClose={() => setMenuFor(null)}>
        <Text style={styles.sheetTitle}>{menuEx?.name}</Text>
        {isCable(menuEx) && (
          <Pressable
            style={styles.sheetRow}
            onPress={() => {
              if (menuEx) openAttach(menuEx);
              setMenuFor(null);
            }}
          >
            <Text style={styles.sheetRowText}>Cambiar agarre</Text>
          </Pressable>
        )}
        {!!menuFamily && (
          <Pressable
            style={styles.sheetRow}
            onPress={() => {
              if (menuEx && menuFamily) {
                const idx = Math.max(0, menuFamily.grips!.findIndex((g) => g.l === menuEx.grip));
                setGripFor({ id: menuEx.id, index: idx });
              }
              setMenuFor(null);
            }}
          >
            <Text style={styles.sheetRowText}>Cambiar agarre</Text>
          </Pressable>
        )}
        <Pressable
          style={styles.sheetRow}
          onPress={() => {
            if (menuEx) {
              updateExercise(menuEx.id, (e) => ({
                ...e,
                sets: e.sets.length > 1 ? e.sets.slice(0, -1) : e.sets,
              }));
            }
            setMenuFor(null);
          }}
        >
          <Text style={styles.sheetRowText}>Quitar última serie</Text>
        </Pressable>
        <Pressable
          style={styles.sheetRow}
          onPress={() => {
            if (menuEx) onChange(exercises.filter((e) => e.id !== menuEx.id));
            setMenuFor(null);
          }}
        >
          <Text style={[styles.sheetRowText, { color: '#ff5b4d' }]}>Eliminar ejercicio</Text>
        </Pressable>
      </Sheet>

      {/* Elegir enganche de polea */}
      <Sheet visible={!!attachFor && !!attachEx} onClose={() => setAttachFor(null)}>
        <Text style={styles.sheetTitle}>Elige el agarre</Text>
        {attachFor && attachEx && (
          <AttachmentPicker
            options={attachmentsFor(attachEx.group)}
            index={attachFor.index}
            onChange={(i) => setAttachFor({ ...attachFor, index: i })}
          />
        )}
        <GradientButton
          label="Guardar"
          style={{ marginTop: 18 }}
          onPress={() => {
            if (attachFor && attachEx) {
              const a = attachmentsFor(attachEx.group)[attachFor.index];
              updateExercise(attachFor.id, (e) => ({ ...e, attach: a.id }));
            }
            setAttachFor(null);
          }}
        />
      </Sheet>

      {/* Cambiar agarre */}
      <Sheet visible={!!gripFor && !!gripFamily} onClose={() => setGripFor(null)}>
        <Text style={styles.sheetTitle}>Agarre · {gripFamily?.name}</Text>
        {gripFor && gripFamily && (
          <OptionWheel
            options={gripFamily.grips!.map((g) => g.l)}
            selected={gripFor.index}
            onChange={(i) => setGripFor({ ...gripFor, index: i })}
          />
        )}
        <GradientButton
          label="Guardar"
          style={{ marginTop: 16 }}
          onPress={() => {
            if (gripFor && gripFamily) {
              const g = gripFamily.grips![gripFor.index];
              updateExercise(gripFor.id, (e) => ({
                ...e,
                name: gripName(gripFamily.name, g.l),
                exId: g.id,
                grip: g.l,
              }));
            }
            setGripFor(null);
          }}
        />
      </Sheet>

      {/* Tipo de serie */}
      <Sheet visible={!!typeEx && !!typeFor} onClose={() => setTypeFor(null)}>
        <Text style={styles.sheetTitle}>Tipo de serie</Text>
        {SET_TYPES.map((t) => (
          <Pressable
            key={t.type}
            style={[styles.sheetRow, styles.typeRow]}
            onPress={() => {
              if (typeEx && typeFor) changeType(typeEx, typeFor.i, t.type);
              setTypeFor(null);
            }}
          >
            <View style={styles.typeBadge}>
              <Text style={[styles.typeBadgeText, { color: t.color }]}>
                {t.type === 'N' ? '1' : t.type}
              </Text>
            </View>
            <Text style={styles.sheetRowText}>{t.label}</Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.sheetRow, styles.typeRow]}
          onPress={() => {
            if (typeEx && typeFor) removeSet(typeEx, typeFor.i);
            setTypeFor(null);
          }}
        >
          <View style={styles.typeBadge}>
            <Ionicons name="close" size={20} color="#ff5b4d" />
          </View>
          <Text style={[styles.sheetRowText, { color: '#ff5b4d' }]}>Eliminar serie</Text>
        </Pressable>
      </Sheet>

      {/* Descanso propio del ejercicio */}
      <Sheet visible={!!restFor} onClose={() => setRestFor(null)}>
        <Text style={styles.sheetTitle}>Descanso · {restEx?.name}</Text>
        <Text style={[styles.muted, { textAlign: 'center', marginBottom: 16 }]}>
          Empieza solo cuando marques una serie como completada.
        </Text>
        {restFor && (
          <DurationStepper
            value={restFor.value}
            onChange={(v) => setRestFor({ ...restFor, value: v })}
          />
        )}
        <GradientButton
          label="Guardar"
          style={{ marginTop: 20 }}
          onPress={() => {
            if (restFor) updateExercise(restFor.id, (e) => ({ ...e, rest: restFor.value }));
            setRestFor(null);
          }}
        />
        {!!restEx?.rest && (
          <Pressable
            style={[styles.sheetRow, { marginTop: 6 }]}
            onPress={() => {
              if (restFor) updateExercise(restFor.id, (e) => ({ ...e, rest: undefined }));
              setRestFor(null);
            }}
          >
            <Text style={[styles.sheetRowText, { color: '#ff5b4d', textAlign: 'center' }]}>
              Quitar descanso
            </Text>
          </Pressable>
        )}
      </Sheet>
    </>
  );
}

/* Selector de ejercicios: buscador (ES/EN) + grupo muscular + equipamiento + selección múltiple.
   Al filtrar por un grupo salen primero los que lo trabajan como principal y, al final,
   los que lo trabajan como secundario. Si el ejercicio tiene variantes de agarre, se elige en una rueda. */
function ExercisePickerScreen({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (items: PickItem[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<Group | 'Todos'>('Todos');
  const [equip, setEquip] = useState<Equipment | 'Todo'>('Todo');
  const [selected, setSelected] = useState<PickItem[]>([]);
  const [gripPick, setGripPick] = useState<{ c: CatalogExercise; index: number } | null>(null);
  const [attachPick, setAttachPick] = useState<{ c: CatalogExercise; index: number } | null>(null);

  type Row = { kind: 'ex'; c: CatalogExercise } | { kind: 'head'; text: string };
  const rows = useMemo<Row[]>(() => {
    const q = normalizeText(query);
    const ok = (c: CatalogExercise) =>
      (equip === 'Todo' || c.equipment === equip) &&
      (!q || normalizeText(c.name).includes(q) || normalizeText(c.en).includes(q));
    if (group === 'Todos') return CATALOG.filter(ok).map((c) => ({ kind: 'ex', c }));
    const prim = CATALOG.filter((c) => c.groups.includes(group) && ok(c));
    const sec = CATALOG.filter((c) => !c.groups.includes(group) && c.secondary.includes(group) && ok(c));
    const out: Row[] = prim.map((c) => ({ kind: 'ex', c }));
    if (sec.length) {
      out.push({ kind: 'head', text: `También trabajan ${group.toLowerCase()} (secundario)` });
      sec.forEach((c) => out.push({ kind: 'ex', c }));
    }
    return out;
  }, [query, group, equip]);

  const isSel = (c: CatalogExercise) => selected.some((x) => x.c.id === c.id);
  const onRow = (c: CatalogExercise) => {
    if (isSel(c)) setSelected((p) => p.filter((x) => x.c.id !== c.id));
    else if (c.equipment === 'polea') setAttachPick({ c, index: 0 });
    else if (c.grips?.length) setGripPick({ c, index: 0 });
    else setSelected((p) => [...p, { c }]);
  };

  const chipList = <T extends string>(
    all: T[],
    current: T,
    set: (v: T) => void,
    label: (v: T) => string
  ) => (
    <View style={styles.chipBar}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        keyboardShouldPersistTaps="handled"
      >
        {all.map((g) => (
          <Pressable
            key={g}
            onPress={() => set(g)}
            style={[styles.filterChip, current === g && styles.filterChipActive]}
          >
            <Text numberOfLines={1} style={[styles.filterChipText, current === g && { color: '#000' }]}>
              {label(g)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <>
      <Header
        left={{ label: 'Cancelar', onPress: onClose }}
        title="Añadir ejercicio"
        right={{
          label: selected.length ? `Añadir (${selected.length})` : 'Añadir',
          onPress: () => onAdd(selected),
          disabled: selected.length === 0,
        }}
      />

      <View style={styles.pickerTop}>
        <TextInput
          style={styles.input}
          placeholder="Buscar ejercicio (español o inglés)"
          placeholderTextColor="#666"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
        />
      </View>

      {chipList<Group | 'Todos'>(['Todos', ...GROUPS], group, setGroup, (g) => g)}
      {chipList<Equipment | 'Todo'>(['Todo', ...EQUIPMENT], equip, setEquip, (e) =>
        e === 'Todo' ? 'Todo el material' : EQUIPMENT_LABEL[e]
      )}

      <FlatList
        data={rows}
        keyExtractor={(r, i) => (r.kind === 'ex' ? r.c.id : 'h' + i)}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={20}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 60 }}
        ListEmptyComponent={
          <Text style={[styles.muted, { textAlign: 'center', marginTop: 30 }]}>
            No hay ejercicios con ese filtro.
          </Text>
        }
        renderItem={({ item }) => {
          if (item.kind === 'head') {
            return <Text style={styles.pickSection}>{item.text}</Text>;
          }
          const c = item.c;
          const sel = selected.find((x) => x.c.id === c.id);
          return (
            <Pressable style={styles.pickRow} onPress={() => onRow(c)}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.pickName}>{c.name}</Text>
                <Text style={styles.pickMeta}>
                  {c.group} · {EQUIPMENT_LABEL[c.equipment]}
                  {c.kind === 'time' ? ' · Tiempo' : c.kind === 'timeWeight' ? ' · Peso y tiempo' : ''}
                  {c.grips?.length ? ` · ${c.grips.length} agarres` : ''}
                  {sel?.grip ? ` · ${sel.grip}` : ''}
                  {sel?.attach ? ` · ${ATTACH_BY_ID[sel.attach]?.name}` : ''}
                </Text>
              </View>
              <View style={[styles.check, !!sel && styles.checkOn]}>
                {!!sel && <Text style={styles.checkMark}>✓</Text>}
              </View>
            </Pressable>
          );
        }}
      />

      {/* Enganche de polea */}
      <Sheet visible={!!attachPick} onClose={() => setAttachPick(null)}>
        <Text style={styles.sheetTitle}>Elige el agarre</Text>
        {attachPick && (
          <AttachmentPicker
            options={attachmentsFor(attachPick.c.group)}
            index={attachPick.index}
            onChange={(i) => setAttachPick({ ...attachPick, index: i })}
          />
        )}
        <GradientButton
          label="Elegir"
          style={{ marginTop: 18 }}
          onPress={() => {
            if (attachPick) {
              const a = attachmentsFor(attachPick.c.group)[attachPick.index];
              setSelected((p) => [...p, { c: attachPick.c, attach: a.id }]);
            }
            setAttachPick(null);
          }}
        />
      </Sheet>

      {/* Rueda de agarre */}
      <Sheet visible={!!gripPick} onClose={() => setGripPick(null)}>
        <Text style={styles.sheetTitle}>Agarre · {gripPick?.c.name}</Text>
        {gripPick && (
          <OptionWheel
            options={gripPick.c.grips!.map((g) => g.l)}
            selected={gripPick.index}
            onChange={(i) => setGripPick({ ...gripPick, index: i })}
          />
        )}
        <GradientButton
          label="Elegir"
          style={{ marginTop: 16 }}
          onPress={() => {
            if (gripPick) {
              const grip = gripPick.c.grips![gripPick.index].l;
              setSelected((p) => [...p, { c: gripPick.c, grip }]);
            }
            setGripPick(null);
          }}
        />
      </Sheet>
    </>
  );
}

/* Pantalla final: ¡Batiste algún récord! */
function RecordsScreen({ items, onDone }: { items: RecordItem[]; onDone: () => void }) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  return (
    <View style={styles.recordsRoot}>
      <Text style={styles.recordsTitle}>¡Batiste algún récord!</Text>
      <Text style={styles.recordsSub}>Sigue así.</Text>

      <View style={{ height: 190, marginTop: 28 }}>
        <FlatList
          data={items}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(r) => r.exercise + r.type}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => (
            <View style={{ width, paddingHorizontal: 18 }}>
              <LinearGradient
                colors={['#2b1f00', '#7a5a00', '#FACC15']}
                locations={[0, 0.55, 1]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.recordCard}
              >
                <Ionicons name="medal" size={84} color="#FACC15" />
                <View style={{ flex: 1, marginLeft: 18 }}>
                  <Text style={styles.recordValue}>{formatRecordValue(item)}</Text>
                  <Text style={styles.recordName} numberOfLines={2}>
                    {item.exercise}
                  </Text>
                  <Text style={styles.recordType}>{PR_LABEL[item.type]}</Text>
                </View>
              </LinearGradient>
            </View>
          )}
        />
      </View>

      {items.length > 1 && (
        <View style={styles.dots}>
          {items.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotOn]} />
          ))}
        </View>
      )}

      <View style={{ paddingHorizontal: 18, marginTop: 28 }}>
        <GradientButton label="Perfecto." onPress={onDone} />
      </View>
    </View>
  );
}

/* ---------- Pantalla principal ---------- */
export type GymHandle = {
  openWorkout: () => void;
  discardWorkout: () => void;
  addRoutine: (r: { name: string; exercises: any[] }) => void;
};

const GymScreen = forwardRef<
  GymHandle,
  {
    onViewChange?: (view: string) => void;
    onWorkoutSaved?: (w: Workout) => void;
    onActiveChange?: (info: { name: string; start: number; exercise: string | null } | null) => void;
    onLiveChange?: (live: { name: string; start: number; exercises: Exercise[] } | null) => void;
    onRoutinesChange?: (routines: Routine[]) => void;
  }
>(function GymScreen(
  { onViewChange, onWorkoutSaved, onActiveChange, onLiveChange, onRoutinesChange },
  ref
) {

  const [view, setView] = useState<ViewName>('home');
  const [pickerTarget, setPickerTarget] = useState<'editor' | 'workout'>('editor');

  const [routines, setRoutines] = useState<Routine[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderEdit, setFolderEdit] = useState<{ id?: string; name: string } | null>(null);
  const [folderMenu, setFolderMenu] = useState<string | null>(null);
  const [moveFor, setMoveFor] = useState<string | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [draftRoutine, setDraftRoutine] = useState<Routine | null>(null);
  const [activeWorkout, setActiveWorkout] = useState<Routine | null>(null);
  const [workoutStart, setWorkoutStart] = useState<number>(Date.now());
  const [workoutName, setWorkoutName] = useState('');
  const [workoutDesc, setWorkoutDesc] = useState('');
  const [lastDoneExId, setLastDoneExId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Resumen final
  const [durationOverride, setDurationOverride] = useState<number | null>(null);
  const [durationSheet, setDurationSheet] = useState(false);
  const [wheelMinutes, setWheelMinutes] = useState(60);
  const [editingName, setEditingName] = useState(false);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [mediaSheet, setMediaSheet] = useState(false);
  const [records, setRecords] = useState<RecordItem[]>([]);

  // Descanso (solo puede haber uno activo a la vez) y cronómetro
  const [rest, setRest] = useState<Rest>(null);
  const restIds = useRef<string[]>([]);
  const restToken = useRef(0);
  const [restDraft, setRestDraft] = useState(REST_DEFAULT);
  const [restLoop, setRestLoop] = useState(false);
  const [sw, setSw] = useState<Stopwatch>({ acc: 0, startedAt: null });
  const [timerSheet, setTimerSheet] = useState(false);
  const [timerTab, setTimerTab] = useState<'rest' | 'sw'>('rest');

  useEffect(() => {
    onViewChange?.(view);
  }, [view]);

  // Avisa a la pantalla principal del entreno en curso (para la barra de abajo)
  const lastReport = useRef('');
  useEffect(() => {
    const cur = currentExercise();
    const info = activeWorkout
      ? { name: activeWorkout.name, start: workoutStart, exercise: cur?.name ?? null }
      : null;
    const key = JSON.stringify(info);
    if (key !== lastReport.current) {
      lastReport.current = key;
      onActiveChange?.(info);
    }
  }, [activeWorkout, lastDoneExId, workoutStart]);

  // Cosas que la pantalla principal puede pedirle al entreno
  // Entreno en directo: lo que llevas hecho, para que otros lo vean en tu perfil
  useEffect(() => {
    onLiveChange?.(
      activeWorkout
        ? {
            name: activeWorkout.name,
            start: workoutStart,
            exercises: activeWorkout.exercises.map((e) => ({ ...e, note: undefined })),
          }
        : null
    );
  }, [activeWorkout, workoutStart]);

  // Rutinas guardadas, para mostrarlas en tu perfil (solo cuando ya se han cargado del móvil)
  useEffect(() => {
    if (loaded) onRoutinesChange?.(routines);
  }, [routines, loaded]);

  useImperativeHandle(ref, () => ({
    addRoutine: (r) =>
      setRoutines((prev) => [
        ...prev,
        {
          id: uid(),
          name: r.name,
          exercises: (r.exercises ?? []).map((e: Exercise) => ({
            ...normalizeExercise(e, false),
            id: uid(),
            sets: (e.sets ?? []).map((st) => ({ ...emptySet(), type: st.type ?? 'N' })),
          })),
        },
      ]),
    openWorkout: () => setView('workout'),
    discardWorkout: () => {
      endWorkoutCleanup();
      setView('home');
    },
  }));

  /* Cargar / guardar en el móvil */
  useEffect(() => {
    (async () => {
      try {
        const r = await AsyncStorage.getItem('routines');
        const w = await AsyncStorage.getItem('workouts');
        const fo = await AsyncStorage.getItem('folders');
        if (fo) setFolders(JSON.parse(fo));
        if (r) {
          const parsed: Routine[] = JSON.parse(r);
          setRoutines(
            parsed.map((x) => ({ ...x, exercises: x.exercises.map((e) => normalizeExercise(e, false)) }))
          );
        }
        if (w) {
          const parsed: Workout[] = JSON.parse(w);
          setWorkouts(
            parsed.map((x) => ({ ...x, exercises: x.exercises.map((e) => normalizeExercise(e, true)) }))
          );
        }
      } catch {}
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem('routines', JSON.stringify(routines)).catch(() => {});
  }, [routines, loaded]);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem('folders', JSON.stringify(folders)).catch(() => {});
  }, [folders, loaded]);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem('workouts', JSON.stringify(workouts)).catch(() => {});
  }, [workouts, loaded]);

  /* ---------- Descanso y cronómetro ---------- */
  const clearRest = async () => {
    restToken.current += 1;
    const ids = restIds.current;
    restIds.current = [];
    setRest(null);
    await cancelRestNotifications(ids);
  };

  // Empezar un descanso cancela el que hubiera (no se solapan)
  const startRest = async (duration: number, loop = false) => {
    const token = ++restToken.current;
    const old = restIds.current;
    restIds.current = [];
    setRest({ startAt: Date.now(), duration, loop });
    cancelRestNotifications(old);
    try {
      const ids = await scheduleRestEnd(duration, loop);
      if (token !== restToken.current) {
        cancelRestNotifications(ids);
      } else {
        restIds.current = ids;
      }
    } catch {}
  };

  const swToggle = () =>
    setSw((s) =>
      s.startedAt === null
        ? { ...s, startedAt: Date.now() }
        : { acc: s.acc + (Date.now() - s.startedAt), startedAt: null }
    );
  const swReset = () => setSw({ acc: 0, startedAt: null });

  /* ---------- Rutinas ---------- */
  const startNewRoutine = () => {
    setDraftRoutine({ id: uid(), name: '', exercises: [] });
    setView('editor');
  };

  const editRoutine = (r: Routine) => {
    setDraftRoutine(JSON.parse(JSON.stringify(r)));
    setView('editor');
  };

  const saveRoutine = () => {
    if (!draftRoutine) return;
    const routine = { ...draftRoutine, name: draftRoutine.name.trim() || 'Rutina sin nombre' };
    setRoutines((prev) =>
      prev.some((r) => r.id === routine.id)
        ? prev.map((r) => (r.id === routine.id ? routine : r))
        : [...prev, routine]
    );
    setDraftRoutine(null);
    setView('home');
  };

  const saveFolder = () => {
    if (!folderEdit) return;
    const name = folderEdit.name.trim() || 'Carpeta';
    if (folderEdit.id) {
      setFolders((p) => p.map((f) => (f.id === folderEdit.id ? { ...f, name } : f)));
    } else {
      setFolders((p) => [...p, { id: uid(), name, open: true }]);
    }
    setFolderEdit(null);
  };
  const deleteFolder = (id: string) => {
    setRoutines((p) => p.map((r) => (r.folderId === id ? { ...r, folderId: undefined } : r)));
    setFolders((p) => p.filter((f) => f.id !== id));
  };
  const moveRoutine = (routineId: string, folderId?: string) =>
    setRoutines((p) => p.map((r) => (r.id === routineId ? { ...r, folderId } : r)));

  const deleteRoutine = (id: string) => setRoutines((prev) => prev.filter((r) => r.id !== id));

  const renderRoutine = (r: Routine) => (
    <View key={r.id} style={[styles.card, { marginTop: 14 }]}>
      <Text style={styles.cardTitle}>{r.name}</Text>
      {r.exercises.length === 0 ? (
        <Text style={styles.muted}>Sin ejercicios</Text>
      ) : (
        r.exercises.slice(0, 2).map((e) => (
          <Text key={e.id} style={styles.muted} numberOfLines={1}>
            {e.name}
          </Text>
        ))
      )}
      <View style={styles.routineActions}>
        <GradientButton label="Empezar rutina" onPress={() => startWorkout(r)} style={{ flex: 1 }} />
        <Pressable style={styles.ghostBtn} onPress={() => editRoutine(r)}>
          <Text style={styles.ghostBtnText}>Editar</Text>
        </Pressable>
        <Pressable style={styles.ghostBtn} onPress={() => setMoveFor(r.id)}>
          <Ionicons name="folder-outline" size={18} color="#cfd8e6" />
        </Pressable>
        <Pressable style={styles.ghostBtn} onPress={() => deleteRoutine(r.id)}>
          <Text style={styles.ghostBtnText}>Borrar</Text>
        </Pressable>
      </View>
    </View>
  );

  /* ---------- Entreno ---------- */
  // Si ya hay un entreno en curso no se puede empezar otro
  const blockedByActive = (): boolean => {
    if (!activeWorkout) return false;
    Alert.alert('Ya tienes un entreno en curso', 'Termínalo o bórralo antes de empezar otro.', [
      { text: 'Volver al entreno', onPress: () => setView('workout') },
      { text: 'Cancelar', style: 'cancel' },
    ]);
    return true;
  };

  const beginWorkout = (name: string, exercises: Exercise[]) => {
    setActiveWorkout({ id: uid(), name, exercises });
    setWorkoutName(name);
    setWorkoutDesc('');
    setWorkoutStart(Date.now());
    setLastDoneExId(null);
    setDurationOverride(null);
    setEditingName(false);
    setMedia([]);
    clearRest();
    swReset();
    setTimerSheet(false);
    setupNotifications(); // pide permiso de notificaciones la primera vez
    setView('workout');
  };

  const startWorkout = (r: Routine) => {
    if (blockedByActive()) return;
    beginWorkout(
      r.name,
      r.exercises.map((e) => ({ ...e, sets: e.sets.map(() => emptySet()) }))
    );
  };

  const startEmptyWorkout = () => {
    if (blockedByActive()) return;
    beginWorkout('', []);
  };

  const endWorkoutCleanup = () => {
    clearRest();
    swReset();
    setTimerSheet(false);
    setActiveWorkout(null);
    setLastDoneExId(null);
    setDurationOverride(null);
    setMedia([]);
    setEditingName(false);
  };

  const saveWorkout = () => {
    if (!activeWorkout) return;
    // En el historial solo se guardan las series completadas
    const exercises = activeWorkout.exercises
      .map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) }))
      .filter((e) => e.sets.length > 0);
    const st = calcStats(exercises);
    const workout: Workout = {
      id: uid(),
      name: workoutName.trim() || 'Entrenamiento',
      description: workoutDesc.trim(),
      date: new Date().toISOString(),
      durationSec: durationOverride ?? Math.round((Date.now() - workoutStart) / 1000),
      volume: st.volume,
      series: st.series,
      media,
      exercises,
    };
    const recs = collectRecords(exercises);
    setWorkouts((prev) => [workout, ...prev]);
    onWorkoutSaved?.(workout);
    endWorkoutCleanup();
    if (recs.length > 0) {
      setRecords(recs);
      setView('records');
    } else {
      setView('home');
    }
  };

  const openPicker = (target: 'editor' | 'workout') => {
    setPickerTarget(target);
    setView('picker');
  };

  const addExercises = (items: PickItem[]) => {
    const exs = items.map(newExercise);
    if (pickerTarget === 'editor' && draftRoutine) {
      setDraftRoutine({ ...draftRoutine, exercises: [...draftRoutine.exercises, ...exs] });
      setView('editor');
    } else if (pickerTarget === 'workout' && activeWorkout) {
      setActiveWorkout({ ...activeWorkout, exercises: [...activeWorkout.exercises, ...exs] });
      setView('workout');
    }
  };

  const closePicker = () => setView(pickerTarget);

  // Última vez que hiciste ese ejercicio (para la columna ANTERIOR)
  const getPrevious = (name: string) => {
    for (const w of workouts) {
      const e = w.exercises.find((x) => x.name === name);
      if (e) return e;
    }
    return undefined;
  };

  // Récords históricos de un ejercicio
  const getBest = (name: string): Best => {
    const b = { ...ZERO };
    for (const w of workouts) {
      for (const e of w.exercises) {
        if (e.name !== name) continue;
        const x = bestFromSets(e.sets);
        b.weight = Math.max(b.weight, x.weight);
        b.volume = Math.max(b.volume, x.volume);
        b.reps = Math.max(b.reps, x.reps);
      }
    }
    return b;
  };

  // Ejercicio "en curso": el último donde completaste una serie (o el siguiente si ya no quedan series)
  const currentExercise = (): Exercise | null => {
    const exs = activeWorkout?.exercises ?? [];
    if (exs.length === 0) return null;
    const idx = exs.findIndex((e) => e.id === lastDoneExId);
    if (idx < 0) return exs[0];
    const e = exs[idx];
    if (e.sets.some((s) => !s.done)) return e;
    return exs[idx + 1] ?? e;
  };

  /* ---------- Resumen: duración, fotos y vídeo ---------- */
  const openDurationSheet = () => {
    const sec = durationOverride ?? Math.floor((Date.now() - workoutStart) / 1000);
    setWheelMinutes(Math.min(300, Math.max(1, Math.round(sec / 60))));
    setDurationSheet(true);
  };

  const photoCount = media.filter((m) => m.type === 'image').length;
  const videoCount = media.filter((m) => m.type === 'video').length;

  const addAssets = async (assets: ImagePicker.ImagePickerAsset[]) => {
    let photos = photoCount;
    let videos = videoCount;
    const added: MediaItem[] = [];
    let skipped = false;
    for (const a of assets) {
      if (a.type === 'video') {
        if (videos >= MAX_VIDEOS || (a.duration ?? 0) > MAX_VIDEO_SECONDS * 1000) {
          skipped = true;
          continue;
        }
        videos += 1;
        added.push({ uri: await persistMedia(a.uri), type: 'video' });
      } else {
        if (photos >= MAX_PHOTOS) {
          skipped = true;
          continue;
        }
        photos += 1;
        added.push({ uri: await persistMedia(a.uri), type: 'image' });
      }
    }
    if (added.length) setMedia((prev) => [...prev, ...added]);
    if (skipped) {
      Alert.alert(
        'Algunos archivos no se añadieron',
        `Máximo ${MAX_PHOTOS} fotos y ${MAX_VIDEOS} vídeo por entreno, y el vídeo no puede durar más de ${MAX_VIDEO_SECONDS} segundos.`
      );
    }
  };

  const takeCapture = async (kind: 'photo' | 'video') => {
    setMediaSheet(false);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Sin permiso', 'Necesito permiso de cámara para hacer fotos o vídeos.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: kind === 'photo' ? ['images'] : ['videos'],
      quality: 0.7,
      videoMaxDuration: MAX_VIDEO_SECONDS,
    });
    if (!res.canceled) await addAssets(res.assets);
  };

  const pickFromGallery = async () => {
    setMediaSheet(false);
    const remaining = MAX_PHOTOS - photoCount + (MAX_VIDEOS - videoCount);
    if (remaining <= 0) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.7,
      videoMaxDuration: MAX_VIDEO_SECONDS,
    });
    if (!res.canceled) await addAssets(res.assets);
  };

  const mediaFull = photoCount >= MAX_PHOTOS && videoCount >= MAX_VIDEOS;

  /* ---------- Vistas ---------- */
  let content: React.ReactNode;

  if (view === 'records') {
    content = (
      <RecordsScreen
        items={records}
        onDone={() => {
          setView('home');
        }}
      />
    );
  } else if (view === 'picker') {
    content = <ExercisePickerScreen onClose={closePicker} onAdd={addExercises} />;
  } else if (view === 'editor' && draftRoutine) {
    const isEdit = routines.some((r) => r.id === draftRoutine.id);
    content = (
      <>
        <Header
          left={{
            label: 'Cancelar',
            onPress: () => {
              setDraftRoutine(null);
              setView('home');
            },
          }}
          title={isEdit ? 'Editar rutina' : 'Nueva rutina'}
          right={{ label: 'Guardar', onPress: saveRoutine }}
        />
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <TextInput
            style={styles.input}
            placeholder="Nombre de la rutina"
            placeholderTextColor="#666"
            value={draftRoutine.name}
            onChangeText={(t) => setDraftRoutine({ ...draftRoutine, name: t })}
          />

          <ExerciseList
            exercises={draftRoutine.exercises}
            mode="editor"
            onChange={(exercises) => setDraftRoutine({ ...draftRoutine, exercises })}
          />

          <GradientButton label="+ Agregar ejercicio" onPress={() => openPicker('editor')} />
        </ScrollView>
      </>
    );
  } else if (view === 'workout' && activeWorkout) {
    const stats = calcStats(activeWorkout.exercises);
    const totalSets = activeWorkout.exercises.reduce((n, e) => n + e.sets.length, 0);
    const swActive = sw.startedAt !== null || sw.acc > 0;
    content = (
      <>
        {/* Barra superior */}
        <View style={styles.topBar}>
          <Pressable style={styles.topLeft} hitSlop={10} onPress={() => setView('home')}>
            <Ionicons name="chevron-down" size={28} color="#fff" />
            <Text style={styles.topTitle} numberOfLines={1}>
              Entreno
            </Text>
          </Pressable>
          <View style={styles.topRight}>
            <Pressable hitSlop={10} onPress={() => setTimerSheet(true)}>
              <Ionicons name="timer-outline" size={30} color="#fff" />
            </Pressable>
            <GradientButton label="Terminar" small onPress={() => setView('finish')} />
          </View>
        </View>

        {/* Series completadas 0/X */}
        <ProgressPanel done={stats.series} total={totalSets} />

        {/* Línea del descanso */}
        <RestLine rest={rest} />

        {/* Duración · Volumen · Series */}
        <StatsRow start={workoutStart} stats={stats} />

        {/* Descanso / cronómetro activos */}
        {(rest || swActive) && (
          <Pressable onPress={() => setTimerSheet(true)}>
            <LinearGradient
              colors={BLUE_DARK}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.banner}
            >
              {rest && (
                <View style={styles.bannerItem}>
                  <Ionicons name={rest.loop ? 'repeat' : 'timer-outline'} size={18} color="#9cc9ff" />
                  <Text style={styles.bannerText}>Descanso</Text>
                  <RestClock rest={rest} style={styles.bannerClock} onDone={clearRest} />
                </View>
              )}
              {swActive && (
                <View style={styles.bannerItem}>
                  <Ionicons name="stopwatch-outline" size={18} color="#9cc9ff" />
                  <StopwatchClock sw={sw} style={styles.bannerClock} />
                </View>
              )}
            </LinearGradient>
          </Pressable>
        )}

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <ExerciseList
            exercises={activeWorkout.exercises}
            mode="workout"
            getPrevious={getPrevious}
            getBest={getBest}
            onChange={(exercises) => setActiveWorkout({ ...activeWorkout, exercises })}
            onSetCompleted={(ex, brokeRecord) => {
              setLastDoneExId(ex.id);
              if (brokeRecord) Vibration.vibrate([0, 150, 80, 150]);
              if (ex.rest) startRest(ex.rest, false);
            }}
          />

          <GradientButton label="+ Agregar ejercicio" onPress={() => openPicker('workout')} />

          <Pressable onPress={() => setConfirmDelete(true)} style={styles.discardBtn}>
            <Text style={styles.discardText}>Descartar entreno</Text>
          </Pressable>
        </ScrollView>

        {/* Hoja del reloj: descanso y cronómetro */}
        <Sheet visible={timerSheet} onClose={() => setTimerSheet(false)}>
          <View style={styles.segment}>
            {(['rest', 'sw'] as const).map((t) => (
              <Pressable
                key={t}
                style={[styles.segmentItem, timerTab === t && styles.segmentActive]}
                onPress={() => setTimerTab(t)}
              >
                <Text style={[styles.segmentText, timerTab === t && { color: '#000' }]}>
                  {t === 'rest' ? 'Descanso' : 'Cronómetro'}
                </Text>
              </Pressable>
            ))}
          </View>

          {timerTab === 'rest' ? (
            rest ? (
              <View style={styles.sheetBody}>
                <RestClock rest={rest} style={styles.bigClock} />
                <Text style={[styles.muted, { textAlign: 'center', marginBottom: 18 }]}>
                  {rest.loop ? 'En bucle · ' : ''}descanso de {formatClock(rest.duration)}
                </Text>
                <GradientButton label="Parar descanso" onPress={clearRest} />
              </View>
            ) : (
              <View style={styles.sheetBody}>
                <DurationStepper value={restDraft} onChange={setRestDraft} />
                <View style={styles.loopRow}>
                  <Text style={styles.loopLabel}>Repetir en bucle</Text>
                  <Switch
                    value={restLoop}
                    onValueChange={setRestLoop}
                    trackColor={{ false: '#333', true: '#2F6BFF' }}
                    thumbColor="#fff"
                  />
                </View>
                <GradientButton
                  label="Iniciar descanso"
                  onPress={() => {
                    startRest(restDraft, restLoop);
                    setTimerSheet(false);
                  }}
                />
              </View>
            )
          ) : (
            <View style={styles.sheetBody}>
              <StopwatchClock sw={sw} style={styles.bigClock} />
              <View style={styles.swButtons}>
                <GradientButton
                  label={sw.startedAt === null ? (sw.acc > 0 ? 'Reanudar' : 'Iniciar') : 'Pausar'}
                  onPress={swToggle}
                  style={{ flex: 1 }}
                />
                <Pressable style={styles.ghostBtn} onPress={swReset}>
                  <Text style={styles.ghostBtnText}>Reiniciar</Text>
                </Pressable>
              </View>
            </View>
          )}
        </Sheet>
      </>
    );
  } else if (view === 'finish' && activeWorkout) {
    const stats = calcStats(activeWorkout.exercises);
    content = (
      <>
        <Header
          left={{
            label: 'Cancelar',
            onPress: () => {
              setDurationOverride(null);
              setView('workout');
            },
          }}
          title="Terminar entreno"
          right={{ label: 'Guardar', onPress: saveWorkout }}
        />
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {/* Nombre: texto plano, se puede cambiar al pulsarlo */}
          {editingName ? (
            <TextInput
              autoFocus
              style={styles.nameEdit}
              value={workoutName}
              onChangeText={setWorkoutName}
              placeholder="Entrenamiento"
              placeholderTextColor="#555"
              onBlur={() => setEditingName(false)}
              onSubmitEditing={() => setEditingName(false)}
              maxLength={40}
            />
          ) : (
            <Pressable onPress={() => setEditingName(true)}>
              <Text style={styles.nameText}>{workoutName.trim() || 'Entrenamiento'}</Text>
            </Pressable>
          )}

          {/* Duración (se puede cambiar) · Volumen · Series */}
          <View style={styles.summaryStats}>
            <Pressable style={styles.statBox} onPress={openDurationSheet}>
              <Text style={styles.statLabel}>Duración ✎</Text>
              {durationOverride !== null ? (
                <Text style={[styles.statValue, { color: '#5AB0FF' }]}>
                  {formatDuration(durationOverride)}
                </Text>
              ) : (
                <ElapsedTimer start={workoutStart} style={[styles.statValue, { color: '#5AB0FF' }]} />
              )}
            </Pressable>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Volumen</Text>
              <Text style={styles.statValue}>{stats.volume} kg</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Series</Text>
              <Text style={styles.statValue}>{stats.series}</Text>
            </View>
          </View>

          {/* Fotos y vídeo */}
          <Pressable
            style={[styles.mediaBtn, mediaFull && { opacity: 0.4 }]}
            disabled={mediaFull}
            onPress={() => setMediaSheet(true)}
          >
            <Ionicons name="camera-outline" size={24} color="#cfd8e6" />
            <Text style={styles.mediaBtnText}>Añadir foto / video</Text>
          </Pressable>
          <MediaStrip items={media} onRemove={(i) => setMedia((p) => p.filter((_, j) => j !== i))} />

          {/* Descripción */}
          <Text style={[styles.label, { marginTop: 12 }]}>DESCRIPCIÓN</Text>
          <TextInput
            style={[styles.input, { height: 110, textAlignVertical: 'top' }]}
            placeholder="¿Qué tal ha ido?"
            placeholderTextColor="#666"
            multiline
            value={workoutDesc}
            onChangeText={setWorkoutDesc}
          />
          <Text style={[styles.muted, { marginTop: 4 }]}>
            Solo se guardarán las series marcadas como completadas.
          </Text>
        </ScrollView>

        {/* Rueda de duración */}
        <Sheet visible={durationSheet} onClose={() => setDurationSheet(false)}>
          <Text style={styles.sheetTitle}>Duración del entreno</Text>
          <DurationWheel selected={wheelMinutes} onChange={setWheelMinutes} />
          <GradientButton
            label="Listo"
            style={{ marginTop: 16 }}
            onPress={() => {
              setDurationOverride(wheelMinutes * 60);
              setDurationSheet(false);
            }}
          />
        </Sheet>

        {/* Foto / vídeo */}
        <Sheet visible={mediaSheet} onClose={() => setMediaSheet(false)}>
          <Text style={styles.sheetTitle}>Añadir foto / video</Text>
          <Text style={[styles.muted, { textAlign: 'center', marginBottom: 8 }]}>
            Máximo {MAX_PHOTOS} fotos y {MAX_VIDEOS} vídeo (hasta {MAX_VIDEO_SECONDS} s).
          </Text>
          {photoCount < MAX_PHOTOS && (
            <Pressable style={styles.sheetRow} onPress={() => takeCapture('photo')}>
              <Text style={styles.sheetRowText}>Hacer foto</Text>
            </Pressable>
          )}
          {videoCount < MAX_VIDEOS && (
            <Pressable style={styles.sheetRow} onPress={() => takeCapture('video')}>
              <Text style={styles.sheetRowText}>Grabar vídeo</Text>
            </Pressable>
          )}
          <Pressable style={styles.sheetRow} onPress={pickFromGallery}>
            <Text style={styles.sheetRowText}>Elegir de la galería</Text>
          </Pressable>
        </Sheet>
      </>
    );
  } else {
    content = (
      <>
        <View style={styles.homeTop}>
          <Text style={styles.screenTitle}>Mis rutinas</Text>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <Pressable style={styles.greyBtn} onPress={startEmptyWorkout}>
            <Text style={styles.greyBtnText}>Empezar entrenamiento vacío</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <GradientButton label="+ Nueva rutina" onPress={startNewRoutine} style={{ flex: 1 }} />
            <Pressable style={styles.folderBtn} onPress={() => setFolderEdit({ name: '' })}>
              <Ionicons name="folder-open-outline" size={20} color="#fff" />
              <Text style={styles.folderBtnText}>Carpeta</Text>
            </Pressable>
          </View>

          {routines.length === 0 && folders.length === 0 && (
            <Text style={[styles.muted, { marginTop: 28, textAlign: 'center' }]}>
              Aún no tienes rutinas. Crea la primera.
            </Text>
          )}

          {folders.map((f) => {
            const inside = routines.filter((r) => r.folderId === f.id);
            return (
              <View key={f.id} style={{ marginTop: 14 }}>
                <Pressable
                  style={styles.folderHead}
                  onPress={() =>
                    setFolders((p) => p.map((x) => (x.id === f.id ? { ...x, open: !x.open } : x)))
                  }
                >
                  <Ionicons name={f.open ? 'folder-open' : 'folder'} size={24} color="#5AB0FF" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.folderName} numberOfLines={1}>
                      {f.name}
                    </Text>
                    <Text style={styles.muted}>
                      {inside.length} {inside.length === 1 ? 'rutina' : 'rutinas'}
                    </Text>
                  </View>
                  <Pressable hitSlop={10} onPress={() => setFolderMenu(f.id)}>
                    <Ionicons name="ellipsis-vertical" size={20} color="#9aa4b5" />
                  </Pressable>
                  <Ionicons name={f.open ? 'chevron-up' : 'chevron-down'} size={20} color="#9aa4b5" />
                </Pressable>
                {f.open && (
                  <View style={styles.folderBody}>
                    {inside.length === 0 && (
                      <Text style={[styles.muted, { padding: 6 }]}>
                        Vacía. Usa "Mover" en una rutina para meterla aquí.
                      </Text>
                    )}
                    {inside.map(renderRoutine)}
                  </View>
                )}
              </View>
            );
          })}

          {routines.filter((r) => !r.folderId || !folders.some((f) => f.id === r.folderId)).map(renderRoutine)}
        </ScrollView>
      </>
    );
  }

  const folderMenuObj = folders.find((f) => f.id === folderMenu);
  return (
    <View style={styles.container}>
      {content}

      {/* Nueva carpeta / renombrar */}
      <Sheet visible={!!folderEdit} onClose={() => setFolderEdit(null)}>
        <Text style={styles.sheetTitle}>{folderEdit?.id ? 'Renombrar carpeta' : 'Nueva carpeta'}</Text>
        <TextInput
          style={styles.input}
          placeholder="Nombre de la carpeta"
          placeholderTextColor="#666"
          value={folderEdit?.name ?? ''}
          onChangeText={(t) => setFolderEdit((p) => (p ? { ...p, name: t } : p))}
          autoFocus
          maxLength={30}
        />
        <GradientButton label="Guardar" style={{ marginTop: 16 }} onPress={saveFolder} />
      </Sheet>

      {/* Menú de carpeta */}
      <Sheet visible={!!folderMenuObj} onClose={() => setFolderMenu(null)}>
        <Text style={styles.sheetTitle}>{folderMenuObj?.name}</Text>
        <Pressable
          style={styles.sheetRow}
          onPress={() => {
            if (folderMenuObj) setFolderEdit({ id: folderMenuObj.id, name: folderMenuObj.name });
            setFolderMenu(null);
          }}
        >
          <Text style={styles.sheetRowText}>Renombrar</Text>
        </Pressable>
        <Pressable
          style={styles.sheetRow}
          onPress={() => {
            if (folderMenuObj) deleteFolder(folderMenuObj.id);
            setFolderMenu(null);
          }}
        >
          <Text style={[styles.sheetRowText, { color: '#ff5b4d' }]}>
            Eliminar carpeta (las rutinas se conservan)
          </Text>
        </Pressable>
      </Sheet>

      {/* Mover rutina a una carpeta */}
      <Sheet visible={!!moveFor} onClose={() => setMoveFor(null)}>
        <Text style={styles.sheetTitle}>Mover a…</Text>
        <Pressable
          style={styles.sheetRow}
          onPress={() => {
            if (moveFor) moveRoutine(moveFor, undefined);
            setMoveFor(null);
          }}
        >
          <Text style={styles.sheetRowText}>Sin carpeta</Text>
        </Pressable>
        {folders.map((f) => (
          <Pressable
            key={f.id}
            style={styles.sheetRow}
            onPress={() => {
              if (moveFor) moveRoutine(moveFor, f.id);
              setMoveFor(null);
            }}
          >
            <Text style={styles.sheetRowText}>📁 {f.name}</Text>
          </Pressable>
        ))}
        {folders.length === 0 && (
          <Text style={[styles.muted, { textAlign: 'center', marginTop: 8 }]}>
            Primero crea una carpeta con el botón "Carpeta".
          </Text>
        )}
      </Sheet>

      <ConfirmDialog
        visible={confirmDelete}
        title="BORRAR ENTRENO EN CURSO"
        message="¿Seguro que quieres borrar el entreno en curso?"
        confirmLabel="Borrar entreno"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          endWorkoutCleanup();
          setView('home');
        }}
      />
    </View>
  );
});

export default GymScreen;

/* ---------- Estilos ---------- */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  body: { padding: 18, paddingBottom: 60, gap: 12 },

  homeTop: { paddingHorizontal: 18, paddingTop: 14 },
  screenTitle: { color: '#fff', fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },

  segment: {
    flexDirection: 'row',
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 4,
  },
  segmentItem: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 9 },
  segmentActive: { backgroundColor: '#EAF2FF' },
  segmentText: { color: '#aaa', fontWeight: '700', fontSize: 14 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  headerSide: { width: 120 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  headerLink: { color: '#5AB0FF', fontSize: 15, fontWeight: '600' },
  headerLinkOff: { color: '#3a4a5e' },

  /* Entreno en curso */
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  topTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },

  panelWrap: { marginHorizontal: 18, marginBottom: 12, zIndex: 10 },
  panel: {
    height: 46,
    borderRadius: 14,
    backgroundColor: '#161616',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  confettiOrigin: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 },

  restTrack: { height: 3, backgroundColor: '#1c1c1c' },

  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomColor: '#1c1c1c',
    borderBottomWidth: 1,
  },
  statBox: { flex: 1 },
  statLabel: { color: '#777', fontSize: 13 },
  statValue: { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: 2 },

  banner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 18,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderColor: '#1F4FFF',
    borderWidth: 1,
  },
  bannerItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bannerText: { color: '#cfe3ff', fontSize: 14, fontWeight: '600' },
  bannerClock: { color: '#fff', fontSize: 18, fontWeight: '800' },

  exBlock: { marginBottom: 18 },
  exTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  exTitle: { flex: 1, color: '#5AB0FF', fontSize: 20, fontWeight: '700', paddingRight: 12 },
  chipsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  miniChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#161616',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  miniChipText: { color: '#e6ecf5', fontSize: 14, fontWeight: '500' },
  noteInput: {
    backgroundColor: '#111',
    borderColor: '#222',
    borderWidth: 1,
    borderRadius: 12,
    color: '#fff',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
  },

  card: {
    backgroundColor: '#111',
    borderColor: '#222',
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
  },
  cardTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 4 },
  label: { color: '#5AB0FF', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  muted: { color: '#888', fontSize: 13 },
  duration: { color: '#5AB0FF', fontSize: 13, fontWeight: '600', marginBottom: 2 },

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

  gradBtn: { paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  gradBtnSmall: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 12 },
  gradBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  greyBtn: {
    backgroundColor: '#1b1b1b',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  greyBtnText: { color: '#e6ecf5', fontSize: 15, fontWeight: '700' },

  folderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#1b1b1b',
    borderColor: '#2a2a2a',
    borderWidth: 1,
  },
  folderBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  folderHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#111',
    borderColor: '#222',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  folderName: { color: '#fff', fontSize: 17, fontWeight: '800' },
  folderBody: { marginLeft: 14, paddingLeft: 12, borderLeftColor: '#1f3a66', borderLeftWidth: 2 },
  ghostBtn: {
    borderColor: '#2a2a2a',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  ghostBtnText: { color: '#EAF2FF', fontWeight: '600', fontSize: 13 },

  routineActions: { flexDirection: 'row', gap: 8, marginTop: 16, alignItems: 'center' },

  /* Tabla de series */
  setHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 14, marginBottom: 6, gap: 8 },
  setHeadText: {
    color: '#666',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textAlign: 'center',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    borderRadius: 12,
  },
  setRowDone: { backgroundColor: 'rgba(34,197,94,0.14)' },
  setNumBox: { width: 44, height: 38 },
  setNumFill: {
    flex: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setNum: { fontSize: 16, fontWeight: '800' },
  prevText: { flex: 1.3, color: '#6c7686', fontSize: 14, textAlign: 'center' },
  setPlaceholder: { flex: 1, color: '#555', fontSize: 15, textAlign: 'center' },
  setInput: {
    flex: 1,
    height: 38,
    backgroundColor: '#0f0f0f',
    borderColor: '#2a2a2a',
    borderWidth: 1,
    borderRadius: 10,
    color: '#fff',
    fontSize: 16,
    paddingHorizontal: 8,
    paddingVertical: 0,
    textAlign: 'center',
  },
  setInputDone: { borderColor: 'rgba(34,197,94,0.5)' },
  tick: {
    width: 40,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#161616',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickOn: { backgroundColor: '#22C55E' },
  addSetBtn: {
    backgroundColor: '#161616',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  addSetText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  discardBtn: {
    backgroundColor: '#161616',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  discardText: { color: '#ff5b4d', fontSize: 15, fontWeight: '600' },

  /* Entreno minimizado */
  miniBar: {
    backgroundColor: '#111',
    borderTopColor: '#222',
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  miniRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  miniMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  miniName: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '700' },
  miniTime: { color: '#5AB0FF', fontSize: 15, fontWeight: '700' },
  miniExercise: { color: '#9aa4b5', fontSize: 14, marginTop: 8, marginLeft: 2 },

  /* Hojas inferiores y diálogos */
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: '#0d0d0d',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderColor: '#222',
    borderWidth: 1,
    padding: 20,
    paddingBottom: 36,
  },
  sheetTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 14,
  },
  sheetBody: { marginTop: 22 },
  sheetRow: { paddingVertical: 16, borderTopColor: '#1c1c1c', borderTopWidth: 1 },
  sheetRowText: { color: '#fff', fontSize: 16, fontWeight: '500' },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  typeBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#161616',
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeBadgeText: { fontSize: 16, fontWeight: '800' },

  dialogRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  dialog: {
    width: '100%',
    backgroundColor: '#121212',
    borderColor: '#262626',
    borderWidth: 1,
    borderRadius: 20,
    padding: 22,
  },
  dialogTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  dialogMsg: { color: '#aab3c2', fontSize: 15, textAlign: 'center', marginTop: 12, lineHeight: 21 },
  dialogBtns: { flexDirection: 'row', marginTop: 22, gap: 10 },
  dialogBtn: {
    flex: 1,
    backgroundColor: '#1b1b1b',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  dialogCancel: { color: '#fff', fontSize: 15, fontWeight: '600' },
  dialogDanger: { color: '#ff5b4d', fontSize: 15, fontWeight: '700' },

  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepBtn: {
    backgroundColor: '#161616',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    minWidth: 78,
    alignItems: 'center',
  },
  stepBtnText: { color: '#EAF2FF', fontSize: 16, fontWeight: '700' },
  stepValue: { color: '#fff', fontSize: 42, fontWeight: '800' },

  bigClock: { color: '#fff', fontSize: 56, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  loopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 20,
  },
  loopLabel: { color: '#fff', fontSize: 16, fontWeight: '500' },
  swButtons: { flexDirection: 'row', gap: 10, marginTop: 16, alignItems: 'center' },

  dropRow: { marginLeft: 22, borderLeftWidth: 2, borderLeftColor: 'rgba(167,139,250,0.55)' },
  pickSection: { color: '#9aa4b5', fontSize: 13, fontWeight: '700', marginTop: 18, marginBottom: 4 },
  wheelBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: WHEEL_ITEM * 2,
    height: WHEEL_ITEM,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  /* Resumen del entreno */
  nameText: { color: '#fff', fontSize: 26, fontWeight: '800' },
  nameEdit: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
    paddingVertical: 0,
    borderBottomColor: '#2F6BFF',
    borderBottomWidth: 1,
  },
  summaryStats: { flexDirection: 'row', paddingVertical: 6 },
  mediaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#161616',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  mediaBtnText: { color: '#e6ecf5', fontSize: 15, fontWeight: '600' },
  mediaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  mediaThumb: { width: 82, height: 82 },
  mediaImg: { width: 82, height: 82, borderRadius: 12, backgroundColor: '#161616' },
  mediaVideo: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  mediaVideoText: { color: '#9cc9ff', fontSize: 11, fontWeight: '600' },
  mediaRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Récords */
  recordsRoot: { flex: 1, justifyContent: 'center' },
  recordsTitle: { color: '#fff', fontSize: 30, fontWeight: '800', textAlign: 'center' },
  recordsSub: { color: '#9aa4b5', fontSize: 14, textAlign: 'center', marginTop: 6 },
  recordCard: {
    flex: 1,
    borderRadius: 22,
    padding: 22,
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordValue: { color: '#fff', fontSize: 32, fontWeight: '800' },
  recordName: { color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 4 },
  recordType: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 4 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 14 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#333' },
  dotOn: { backgroundColor: '#FACC15' },

  /* Selector de ejercicios */
  pickerTop: { paddingHorizontal: 18 },
  chipBar: { height: 66, marginTop: 6 },
  chipRow: { paddingHorizontal: 18, gap: 10, alignItems: 'center', height: 66 },
  filterChip: {
    backgroundColor: '#141414',
    borderColor: '#262626',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 22,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: { backgroundColor: '#EAF2FF', borderColor: '#EAF2FF' },
  filterChipText: { color: '#cfd8e6', fontWeight: '600', fontSize: 15 },

  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomColor: '#1a1a1a',
    borderBottomWidth: 1,
  },
  pickName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  pickMeta: { color: '#777', fontSize: 12, marginTop: 3 },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderColor: '#333',
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: '#2F6BFF', borderColor: '#2F6BFF' },
  checkMark: { color: '#fff', fontSize: 14, fontWeight: '800' },

  historyLine: { color: '#cfd8e6', fontSize: 13, marginTop: 4 },
  historyNote: { color: '#777', fontSize: 12, fontStyle: 'italic', marginTop: 2 },
});
