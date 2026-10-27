import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import Radar from '@/components/Radar';
import { ModalShell } from '@/components/WorkoutView';
import { formatDuration } from '@/lib/format';
import { AXES, DAYS_LONG, MONTHS, RECORD_LABEL, computeStats } from '@/lib/stats';
import type { W } from '@/lib/stats';

const kg = (n: number) => `${Math.round(n).toLocaleString('es-ES')} kg`;

function Tile({ icon, label, value, onPress }: { icon: any; label: string; value: string; onPress?: () => void }) {
  return (
    <Pressable style={styles.tile} onPress={onPress} disabled={!onPress}>
      <Ionicons name={icon} size={20} color="#5AB0FF" />
      <Text style={styles.tileValue} numberOfLines={2}>
        {value}
      </Text>
      <Text style={styles.tileLabel}>
        {label}
        {onPress ? '  ›' : ''}
      </Text>
    </Pressable>
  );
}

/* Estadísticas de un conjunto de entrenos (mes, año o todo).
   extended = más info (años). compact = versión corta para la vista rápida. */
export default function StatsView({
  workouts,
  periodWeeks,
  extended = false,
  compact = false,
}: {
  workouts: W[];
  periodWeeks: number;
  extended?: boolean;
  compact?: boolean;
}) {
  const st = useMemo(() => computeStats(workouts), [workouts]);
  const [recordsOpen, setRecordsOpen] = useState(false);

  if (st.count === 0) {
    return <Text style={styles.empty}>No hay entrenos en este periodo.</Text>;
  }

  const top = st.routines[0];
  const maxRoutine = top?.count ?? 1;
  const radarValues = AXES.map((a) => st.radar[a]);
  const maxMonth = Math.max(1, ...st.perMonth);

  // Récords agrupados por ejercicio
  const byEx = new Map<string, typeof st.records>();
  st.records.forEach((r) => byEx.set(r.exercise, [...(byEx.get(r.exercise) ?? []), r]));

  return (
    <View>
      <View style={styles.grid}>
        <Tile icon="barbell-outline" label="Entrenos" value={String(st.count)} />
        <Tile icon="layers-outline" label="Series completadas" value={String(st.sets)} />
        <Tile
          icon="medal-outline"
          label="Récords batidos"
          value={String(st.records.length)}
          onPress={st.records.length && !compact ? () => setRecordsOpen(true) : undefined}
        />
        <Tile icon="trophy-outline" label="Rutina más hecha" value={top ? `${top.name} ×${top.count}` : '—'} />
        <Tile icon="time-outline" label="Tiempo total" value={formatDuration(st.seconds)} />
        <Tile icon="speedometer-outline" label="Volumen total" value={kg(st.volume)} />
        <Tile icon="calendar-outline" label="Días entrenados" value={String(st.daysTrained)} />
        <Tile icon="repeat-outline" label="Entrenos por semana" value={(st.count / Math.max(1, periodWeeks)).toFixed(1)} />
        <Tile icon="hourglass-outline" label="Duración media" value={formatDuration(st.avgSeconds)} />
        <Tile icon="flame-outline" label="Mejor racha (semanas)" value={String(st.longestStreak)} />
      </View>

      <Text style={styles.h}>Grupos musculares</Text>
      <Text style={styles.sub}>Series por grupo (los músculos secundarios cuentan 0,5)</Text>
      <Radar labels={[...AXES]} values={radarValues} />

      {!compact && (
        <>
          <Text style={styles.h}>Veces que has hecho cada rutina</Text>
          {st.routines.map((r) => (
            <View key={r.name} style={styles.barRow}>
              <Text style={styles.barName} numberOfLines={1}>
                {r.name}
              </Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${(r.count / maxRoutine) * 100}%` }]} />
              </View>
              <Text style={styles.barNum}>{r.count}</Text>
            </View>
          ))}

          <Text style={styles.h}>Ejercicios con más series</Text>
          {st.topExercises.slice(0, extended ? 10 : 5).map((e, i) => (
            <View key={e.name} style={styles.listRow}>
              <Text style={styles.rank}>{i + 1}</Text>
              <Text style={styles.listName} numberOfLines={1}>
                {e.name}
              </Text>
              <Text style={styles.listVal}>{e.sets} series</Text>
            </View>
          ))}

          {extended && (
            <>
              <Text style={styles.h}>Entrenos por mes</Text>
              <View style={styles.monthChart}>
                {st.perMonth.map((n, i) => (
                  <View key={i} style={styles.monthCol}>
                    {n > 0 && <Text style={styles.monthNum}>{n}</Text>}
                    <View style={[styles.monthBar, { height: Math.max(3, (n / maxMonth) * 90), opacity: n ? 1 : 0.25 }]} />
                    <Text style={styles.monthLbl}>{MONTHS[i].slice(0, 1)}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.grid}>
                <Tile icon="ribbon-outline" label="Mejor mes" value={st.bestMonth !== null ? MONTHS[st.bestMonth] : '—'} />
                <Tile icon="sunny-outline" label="Día favorito" value={st.favDay !== null ? DAYS_LONG[st.favDay] : '—'} />
                <Tile icon="fitness-outline" label="Volumen medio por entreno" value={kg(st.avgVolume)} />
                <Tile
                  icon="analytics-outline"
                  label="Series por entreno"
                  value={(st.sets / Math.max(1, st.count)).toFixed(1)}
                />
              </View>
              <Text style={styles.h}>Series por grupo muscular</Text>
              {AXES.map((a) => (
                <View key={a} style={styles.listRow}>
                  <Text style={styles.listName}>{a}</Text>
                  <Text style={styles.listVal}>{Math.round(st.radar[a] * 10) / 10}</Text>
                </View>
              ))}
            </>
          )}
        </>
      )}

      <ModalShell visible={recordsOpen} onClose={() => setRecordsOpen(false)} title="Récords batidos">
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 60 }}>
          {[...byEx].map(([name, rs]) => (
            <View key={name} style={styles.recBlock}>
              <Text style={styles.recName}>{name}</Text>
              {rs.map((r, i) => (
                <View key={i} style={styles.recRow}>
                  <Ionicons name="medal" size={16} color="#FACC15" />
                  <Text style={styles.recType}>{RECORD_LABEL[r.type]}</Text>
                  <Text style={styles.recVal}>
                    {r.value} {r.type === 'reps' ? 'reps' : 'kg'}
                  </Text>
                  <Text style={styles.recDate}>
                    {new Date(r.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      </ModalShell>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { color: '#888', textAlign: 'center', marginTop: 40, fontSize: 15 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: '#111',
    borderColor: '#222',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  tileValue: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 4 },
  tileLabel: { color: '#8a94a6', fontSize: 12 },
  h: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 26, marginBottom: 6 },
  sub: { color: '#888', fontSize: 12, marginBottom: 8 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  barName: { width: 110, color: '#cfd8e6', fontSize: 13 },
  barTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: '#1b1b1b' },
  barFill: { height: 10, borderRadius: 5, backgroundColor: '#3B82F6' },
  barNum: { width: 26, textAlign: 'right', color: '#fff', fontWeight: '700' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomColor: '#161616', borderBottomWidth: 1 },
  rank: { width: 20, color: '#5AB0FF', fontWeight: '800' },
  listName: { flex: 1, color: '#fff', fontSize: 14 },
  listVal: { color: '#9cc9ff', fontSize: 14, fontWeight: '700' },
  monthChart: { flexDirection: 'row', alignItems: 'flex-end', height: 130, gap: 5, marginBottom: 16 },
  monthCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 3 },
  monthBar: { width: '100%', borderRadius: 5, backgroundColor: '#3B82F6' },
  monthNum: { color: '#9cc9ff', fontSize: 10, fontWeight: '700' },
  monthLbl: { color: '#777', fontSize: 11 },
  recBlock: { marginBottom: 18 },
  recName: { color: '#5AB0FF', fontSize: 16, fontWeight: '700', marginBottom: 6 },
  recRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  recType: { flex: 1, color: '#cfd8e6', fontSize: 13 },
  recVal: { color: '#fff', fontWeight: '700', fontSize: 14 },
  recDate: { color: '#777', fontSize: 12, width: 52, textAlign: 'right' },
});
