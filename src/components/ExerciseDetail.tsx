import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import ProgressChart from '@/components/ProgressChart';
import type { Pt } from '@/components/ProgressChart';
import { Avatar } from '@/components/SocialParts';
import { WorkoutDetailModal } from '@/components/WorkoutView';
import type { CatalogExercise } from '@/data/exercises';
import { errText, fetchExerciseLeaderboard } from '@/lib/social';
import type { LeaderRow, SocialWorkout } from '@/lib/social';
import { exerciseAliases, setEffReps, setNum } from '@/lib/stats';
import type { Session } from '@/lib/stats';

type Tab = 'resumen' | 'historial' | 'indicaciones' | 'clasificacion';
const TABS: { key: Tab; label: string }[] = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'historial', label: 'Historial' },
  { key: 'indicaciones', label: 'Indicaciones' },
  { key: 'clasificacion', label: 'Clasificación' },
];

type Period = '3m' | '6m' | '1y' | 'all';
const PERIODS: { key: Period; label: string; days: number }[] = [
  { key: '3m', label: 'Últimos 3 meses', days: 91 },
  { key: '6m', label: 'Últimos 6 meses', days: 182 },
  { key: '1y', label: 'Último año', days: 365 },
  { key: 'all', label: 'Desde siempre', days: 0 },
];

const p2 = (n: number) => String(n).padStart(2, '0');
const fmtDate = (d: Date) => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
const fmtTime = (d: Date) => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
const r1 = (n: number) => String(Math.round(n * 10) / 10);

export default function ExerciseDetail({
  me,
  exKey,
  name,
  cat,
  kind,
  group,
  sessions,
  onExit,
}: {
  me: string;
  exKey: string;
  name: string;
  cat?: CatalogExercise;
  kind: string;
  group?: string;
  sessions: Session[]; // de antiguo a reciente
  onExit: () => void;
}) {
  const [tab, setTab] = useState<Tab>('resumen');
  const isTime = kind === 'time';
  const unit = isTime ? 's' : 'kg';

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <Pressable onPress={onExit} hitSlop={12} style={{ width: 40 }}>
          <Ionicons name="arrow-back" size={26} color="#fff" />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {name}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.key} style={[styles.tab, tab === t.key && styles.tabOn]} onPress={() => setTab(t.key)}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]} numberOfLines={1}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'resumen' && (
        <Summary name={name} cat={cat} group={group} sessions={sessions} isTime={isTime} unit={unit} />
      )}
      {tab === 'historial' && <History sessions={sessions} isTime={isTime} unit={unit} />}
      {tab === 'indicaciones' && (
        <View style={styles.center}>
          <Ionicons name="information-circle-outline" size={40} color="#444" />
          <Text style={styles.muted}>Las indicaciones llegarán próximamente.</Text>
        </View>
      )}
      {tab === 'clasificacion' && <Ranking me={me} exKey={exKey} name={name} cat={cat} isTime={isTime} />}
    </View>
  );
}

/* ---------- Resumen ---------- */
function Summary({
  name,
  cat,
  group,
  sessions,
  isTime,
  unit,
}: {
  name: string;
  cat?: CatalogExercise;
  group?: string;
  sessions: Session[];
  isTime: boolean;
  unit: string;
}) {
  const [period, setPeriod] = useState<Period>('3m');
  const [pickOpen, setPickOpen] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [mw, setMw] = useState(0);

  const val = (s: any) => (isTime ? setNum(s.seconds) : setNum(s.weight));
  const perSession = useMemo(
    () =>
      sessions.map((se) => {
        const maxV = Math.max(0, ...se.sets.map(val));
        const setVols = se.sets.map((s) => (isTime ? 0 : setNum(s.weight) * setEffReps(s)));
        return {
          date: se.date,
          max: maxV,
          bestSet: Math.max(0, ...setVols),
          volume: setVols.reduce((a, b) => a + b, 0),
          reps: se.sets.reduce((a, s) => a + setNum(s.reps), 0),
        };
      }),
    [sessions, isTime]
  );

  const now = Date.now();
  const days = PERIODS.find((p) => p.key === period)!.days;
  const inRange = perSession.filter((p) => p.max > 0 && (days === 0 || +p.date >= now - days * 86400000));
  const pts: Pt[] = inRange.map((p) => ({ t: +p.date, v: p.max }));
  const from = days === 0 ? (pts[0]?.t ?? now) : now - days * 86400000;
  const to = now;

  useEffect(() => setSel(null), [period]);

  const maxIn = inRange.reduce((b, p) => (p.max > (b?.max ?? 0) ? p : b), undefined as (typeof inRange)[number] | undefined);
  const head = sel !== null && inRange[sel] ? inRange[sel] : maxIn;

  // Récords y métricas (de siempre)
  const bestOf = (f: (p: (typeof perSession)[number]) => number) =>
    perSession.reduce((b, p) => (f(p) > (b ? f(b) : 0) ? p : b), undefined as (typeof perSession)[number] | undefined);
  const bMax = bestOf((p) => p.max);
  const bSet = bestOf((p) => p.bestSet);
  const bSes = bestOf((p) => p.volume);
  const totalReps = perSession.reduce((a, p) => a + p.reps, 0);
  const dd = (p?: { date: Date }) => (p ? fmtDate(p.date) : '');

  const metrics = [
    { label: isTime ? 'Mayor tiempo' : 'Mayor peso', value: bMax ? `${r1(bMax.max)} ${unit}` : '—', sub: dd(bMax) },
    { label: '1RM', value: '—', sub: 'Próximamente' },
    { label: 'Mejor volumen (serie)', value: bSet && bSet.bestSet ? `${r1(bSet.bestSet)} kg` : '—', sub: dd(bSet?.bestSet ? bSet : undefined) },
    { label: 'Mejor volumen (sesión)', value: bSes && bSes.volume ? `${r1(bSes.volume)} kg` : '—', sub: dd(bSes?.volume ? bSes : undefined) },
    { label: 'Total repeticiones', value: isTime ? '—' : String(totalReps), sub: '' },
  ];
  const cardW = mw > 0 ? (mw - 10) / 2 : 0;

  // repeticiones -> mejor peso
  const repsMap = new Map<number, number>();
  if (!isTime) {
    sessions.forEach((se) =>
      se.sets.forEach((s) => {
        const r = Math.round(setNum(s.reps));
        const w = setNum(s.weight);
        if (r > 0 && w > 0) repsMap.set(r, Math.max(repsMap.get(r) ?? 0, w));
      })
    );
  }
  const repsRows = [...repsMap].sort((a, b) => a[0] - b[0]);

  const secondary = cat?.secondary ?? [];

  return (
    <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 70 }}>
      {/* Espacio reservado para imagen / vídeo */}
      <View style={styles.media}>
        <Ionicons name="image-outline" size={34} color="#3a3f48" />
        <Text style={styles.mediaText}>Imagen o vídeo demostrativo (próximamente)</Text>
      </View>

      <Text style={styles.exName}>{name}</Text>
      <Text style={styles.info}>
        <Text style={styles.infoKey}>Primario: </Text>
        {cat ? cat.groups.join(', ') : group || '—'}
      </Text>
      <Text style={styles.info}>
        <Text style={styles.infoKey}>Secundario: </Text>
        {secondary.length ? secondary.join(', ') : '—'}
      </Text>

      {/* Gráfico */}
      <View style={styles.chartHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.chartBig}>
            {head ? `${r1(head.max)} ${unit}` : '—'}
          </Text>
          <Text style={styles.muted}>
            {head ? `${sel !== null ? '' : (isTime ? 'Mayor tiempo · ' : 'Mayor peso · ')}${fmtDate(head.date)}` : 'Sin datos'}
          </Text>
        </View>
        <Pressable style={styles.periodBtn} onPress={() => setPickOpen(true)}>
          <Text style={styles.periodText}>{PERIODS.find((p) => p.key === period)!.label}</Text>
          <Ionicons name="chevron-down" size={16} color="#fff" />
        </Pressable>
      </View>
      {pts.length ? (
        <ProgressChart points={pts} from={from} to={to} selected={sel} onSelect={setSel} />
      ) : (
        <Text style={[styles.muted, { textAlign: 'center', marginVertical: 40 }]}>
          No hay datos en este periodo.
        </Text>
      )}

      {/* Métricas: se deslizan de dos en dos */}
      <View style={{ marginTop: 22 }} onLayout={(e) => setMw(e.nativeEvent.layout.width)}>
        {cardW > 0 && (
          <FlatList
            data={metrics}
            horizontal
            keyExtractor={(m) => m.label}
            showsHorizontalScrollIndicator={false}
            snapToInterval={cardW + 10}
            decelerationRate="fast"
            ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
            renderItem={({ item }) => (
              <View style={[styles.metric, { width: cardW }]}>
                <Text style={styles.metricLabel} numberOfLines={1}>
                  {item.label}
                </Text>
                <Text style={styles.metricValue} numberOfLines={1}>
                  {item.value}
                </Text>
                <Text style={styles.metricSub}>{item.sub || ' '}</Text>
              </View>
            )}
          />
        )}
      </View>

      {/* Récords personales */}
      <View style={styles.recTitleRow}>
        <Ionicons name="medal" size={20} color="#FACC15" />
        <Text style={styles.h}>Récords personales</Text>
      </View>
      {[
        { l: isTime ? 'Mayor tiempo' : 'Mayor peso', v: bMax ? `${r1(bMax.max)} ${unit}` : '—', d: dd(bMax) },
        { l: '1RM', v: '—', d: 'Próximamente' },
        { l: 'Mejor volumen (serie)', v: bSet?.bestSet ? `${r1(bSet.bestSet)} kg` : '—', d: dd(bSet?.bestSet ? bSet : undefined) },
        { l: 'Mejor volumen (sesión)', v: bSes?.volume ? `${r1(bSes.volume)} kg` : '—', d: dd(bSes?.volume ? bSes : undefined) },
      ].map((r) => (
        <View key={r.l} style={styles.row}>
          <Text style={styles.rowL}>{r.l}</Text>
          <Text style={styles.rowD}>{r.d}</Text>
          <Text style={styles.rowV}>{r.v}</Text>
        </View>
      ))}

      {/* Repeticiones / mejor peso */}
      {!isTime && (
        <>
          <Text style={[styles.h, { marginTop: 26 }]}>Repeticiones y mejor peso</Text>
          {repsRows.length === 0 && <Text style={styles.muted}>Aún no hay series con peso registradas.</Text>}
          {repsRows.map(([r, w]) => (
            <View key={r} style={styles.row}>
              <Text style={styles.rowL}>
                {r} {r === 1 ? 'repetición' : 'repeticiones'}
              </Text>
              <Text style={styles.rowV}>{r1(w)} kg</Text>
            </View>
          ))}
        </>
      )}

      <Modal visible={pickOpen} transparent animationType="fade" onRequestClose={() => setPickOpen(false)}>
        <View style={styles.pickRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPickOpen(false)} />
          <View style={styles.pickBox}>
            {PERIODS.map((p) => (
              <Pressable
                key={p.key}
                style={styles.pickRow}
                onPress={() => {
                  setPeriod(p.key);
                  setPickOpen(false);
                }}
              >
                <Text style={[styles.pickText, period === p.key && { color: '#5AB0FF' }]}>{p.label}</Text>
                {period === p.key && <Ionicons name="checkmark" size={18} color="#5AB0FF" />}
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

/* ---------- Historial ---------- */
function History({ sessions, isTime, unit }: { sessions: Session[]; isTime: boolean; unit: string }) {
  const [open, setOpen] = useState<SocialWorkout | null>(null);
  const list = useMemo(() => [...sessions].reverse(), [sessions]);
  return (
    <>
      <FlatList
        data={list}
        keyExtractor={(s) => s.workout.id}
        contentContainerStyle={{ padding: 18, paddingBottom: 70 }}
        ListEmptyComponent={<Text style={[styles.muted, { textAlign: 'center', marginTop: 40 }]}>Aún no has hecho este ejercicio.</Text>}
        renderItem={({ item }) => (
          <View style={styles.histCard}>
            <Text style={styles.histDate}>
              {fmtDate(item.date)} · {fmtTime(item.date)}
            </Text>
            <Pressable onPress={() => setOpen(item.workout as unknown as SocialWorkout)}>
              <Text style={styles.histName}>{item.workout.name}  ›</Text>
            </Pressable>
            {item.sets.map((s, i) => (
              <View key={i} style={styles.histSet}>
                <Text style={styles.histSetN}>{s.type && s.type !== 'N' ? s.type : i + 1}</Text>
                <Text style={styles.histSetV}>
                  {isTime
                    ? `${setNum(s.seconds)} s`
                    : `${s.weight ? r1(setNum(s.weight)) : '—'} ${unit} × ${s.reps || '—'}`}
                </Text>
              </View>
            ))}
          </View>
        )}
      />
      <WorkoutDetailModal workout={open} onClose={() => setOpen(null)} />
    </>
  );
}

/* ---------- Clasificación ---------- */
const MEDAL = ['#FACC15', '#CBD5E1', '#D97706'];

function Ranking({
  me,
  exKey,
  name,
  cat,
  isTime,
}: {
  me: string;
  exKey: string;
  name: string;
  cat?: CatalogExercise;
  isTime: boolean;
}) {
  const [scope, setScope] = useState<'global' | 'friends'>('global');
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isTime) return;
    let live = true;
    setRows(null);
    setError('');
    const al = exerciseAliases(exKey, name, cat);
    fetchExerciseLeaderboard(al.ids, al.names, scope === 'friends')
      .then((r) => live && setRows(r))
      .catch((e) => live && setError(errText(e)));
    return () => {
      live = false;
    };
  }, [scope, exKey, isTime]);

  // Mismo peso = misma posición; la siguiente se salta (1º, 1º, 3º)
  const ranked = useMemo(
    () => (rows ?? []).map((r) => ({ ...r, rank: 1 + (rows ?? []).filter((o) => o.max_weight > r.max_weight).length })),
    [rows]
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.seg}>
        {(['global', 'friends'] as const).map((k) => (
          <Pressable key={k} style={[styles.segBtn, scope === k && styles.segOn]} onPress={() => setScope(k)}>
            <Text style={[styles.segText, scope === k && { color: '#fff' }]}>{k === 'global' ? 'Global' : 'Amigos'}</Text>
          </Pressable>
        ))}
      </View>

      {isTime ? (
        <Text style={[styles.muted, styles.centerText]}>La clasificación solo está disponible para ejercicios con peso.</Text>
      ) : error ? (
        <Text style={[styles.err, styles.centerText]}>
          No se pudo cargar la clasificación: {error}
          {'\n'}(¿Has ejecutado supabase_v3.sql en Supabase?)
        </Text>
      ) : rows === null ? (
        <ActivityIndicator color="#5AB0FF" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={ranked}
          keyExtractor={(r) => r.user_id}
          contentContainerStyle={{ padding: 18, paddingBottom: 70 }}
          ListEmptyComponent={<Text style={[styles.muted, styles.centerText]}>Nadie ha registrado peso en este ejercicio todavía.</Text>}
          renderItem={({ item }) => {
            const medal = item.rank <= 3 ? MEDAL[item.rank - 1] : null;
            return (
              <View style={[styles.rankRow, item.user_id === me && styles.rankMe]}>
                <View style={[styles.rankBadge, medal ? { backgroundColor: medal } : null]}>
                  <Text style={[styles.rankNum, medal ? { color: '#1a1200' } : null]}>{item.rank}</Text>
                </View>
                <Avatar url={item.avatar_url} name={item.username} size={38} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rankName} numberOfLines={1}>
                    {item.display_name || item.username}
                  </Text>
                  <Text style={styles.muted}>@{item.username}</Text>
                </View>
                <Text style={[styles.rankW, medal ? { color: medal } : null]}>{r1(item.max_weight)} kg</Text>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: '#161616',
  },
  title: { flex: 1, color: '#fff', fontSize: 19, fontWeight: '700', textAlign: 'center' },
  tabs: { flexDirection: 'row', backgroundColor: '#161616', borderBottomColor: '#222', borderBottomWidth: 1 },
  tab: { flex: 1, paddingVertical: 13, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: '#3B82F6' },
  tabText: { color: '#9aa4b5', fontSize: 13, fontWeight: '600' },
  tabTextOn: { color: '#3B82F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  centerText: { textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
  muted: { color: '#888', fontSize: 13 },
  err: { color: '#ff8a80', fontSize: 13 },

  media: {
    height: 180,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#262626',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  mediaText: { color: '#555', fontSize: 12 },
  exName: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 6 },
  info: { color: '#cfd8e6', fontSize: 14, marginTop: 2 },
  infoKey: { color: '#8a94a6', fontWeight: '700' },

  chartHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 24, marginBottom: 10 },
  chartBig: { color: '#fff', fontSize: 24, fontWeight: '800' },
  periodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1b1b1b',
    borderColor: '#2a2a2a',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  periodText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  metric: { backgroundColor: '#111', borderColor: '#222', borderWidth: 1, borderRadius: 16, padding: 14, gap: 4 },
  metricLabel: { color: '#8a94a6', fontSize: 12 },
  metricValue: { color: '#fff', fontSize: 22, fontWeight: '800' },
  metricSub: { color: '#5AB0FF', fontSize: 12 },

  recTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 26, marginBottom: 6 },
  h: { color: '#fff', fontSize: 18, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomColor: '#161616', borderBottomWidth: 1 },
  rowL: { flex: 1, color: '#fff', fontSize: 15 },
  rowD: { color: '#777', fontSize: 12 },
  rowV: { color: '#9cc9ff', fontSize: 15, fontWeight: '700', minWidth: 70, textAlign: 'right' },

  pickRoot: { flex: 1, justifyContent: 'center', padding: 40, backgroundColor: 'rgba(0,0,0,0.65)' },
  pickBox: { backgroundColor: '#161616', borderRadius: 18, borderColor: '#2a2a2a', borderWidth: 1, paddingVertical: 6 },
  pickRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14 },
  pickText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  histCard: { backgroundColor: '#111', borderColor: '#222', borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12 },
  histDate: { color: '#8a94a6', fontSize: 13 },
  histName: { color: '#5AB0FF', fontSize: 17, fontWeight: '700', marginTop: 4, marginBottom: 8 },
  histSet: { flexDirection: 'row', gap: 14, paddingVertical: 4 },
  histSetN: { width: 22, color: '#8a94a6', fontWeight: '700', textAlign: 'center' },
  histSetV: { color: '#fff', fontSize: 15 },

  seg: { flexDirection: 'row', margin: 18, backgroundColor: '#141414', borderRadius: 12, padding: 3 },
  segBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  segOn: { backgroundColor: '#2F6BFF' },
  segText: { color: '#9aa4b5', fontWeight: '700', fontSize: 14 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 14 },
  rankMe: { backgroundColor: 'rgba(47,107,255,0.14)' },
  rankBadge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  rankNum: { color: '#cfd8e6', fontSize: 16, fontWeight: '800' },
  rankName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  rankW: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
