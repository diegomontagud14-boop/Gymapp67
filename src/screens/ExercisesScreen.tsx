import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import ExerciseDetail from '@/components/ExerciseDetail';
import FilterChips from '@/components/FilterChips';
import { EQUIPMENT, EQUIPMENT_LABEL, GROUPS } from '@/data/exercises';
import type { CatalogExercise, Equipment, Group } from '@/data/exercises';
import { errText, fetchAllWorkouts } from '@/lib/social';
import { exerciseKey, sessionsOf } from '@/lib/stats';
import type { W } from '@/lib/stats';

type Agg = {
  key: string;
  name: string;
  en?: string;
  cat?: CatalogExercise;
  custom: boolean;
  kind: string;
  group?: string;
  sessions: number;
  sets: number;
};

type Range = '1' | '3' | '6' | '12';
const RANGES: { key: Range; label: string; months: number }[] = [
  { key: '1', label: 'Último mes', months: 1 },
  { key: '3', label: 'Últimos 3 meses', months: 3 },
  { key: '6', label: 'Últimos 6 meses', months: 6 },
  { key: '12', label: 'Último año', months: 12 },
];

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export default function ExercisesScreen({ me, onExit }: { me: string; onExit: () => void }) {
  const [all, setAll] = useState<W[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [equip, setEquip] = useState<Equipment | 'Todo' | 'Personalizados'>('Todo');
  const [group, setGroup] = useState<Group | 'Todos'>('Todos');
  const [seg, setSeg] = useState<'always' | 'month'>('always');
  const [range, setRange] = useState<Range>('1');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetchAllWorkouts(me)
      .then((r) => setAll(r as unknown as W[]))
      .catch((e) => setError(errText(e)));
  }, [me]);

  const list = useMemo(() => {
    if (!all) return [];
    const cutoff =
      seg === 'month'
        ? (() => {
            const d = new Date();
            d.setMonth(d.getMonth() - RANGES.find((r) => r.key === range)!.months);
            return +d;
          })()
        : 0;
    const map = new Map<string, Agg>();
    for (const w of all) {
      if (cutoff && +new Date(w.created_at) < cutoff) continue;
      const seen = new Set<string>();
      for (const ex of Array.isArray(w.exercises) ? w.exercises : []) {
        const done = (ex.sets ?? []).filter((s: any) => s.done !== false && s.type !== 'W').length;
        if (!done) continue;
        const k = exerciseKey(ex);
        const a =
          map.get(k.key) ??
          ({
            key: k.key,
            name: k.name,
            en: k.cat?.en,
            cat: k.cat,
            custom: k.custom,
            kind: ex.kind ?? k.cat?.kind ?? 'reps',
            group: ex.group,
            sessions: 0,
            sets: 0,
          } as Agg);
        a.sets += done;
        if (!seen.has(k.key)) {
          a.sessions += 1;
          seen.add(k.key);
        }
        map.set(k.key, a);
      }
    }
    const q = norm(query);
    return [...map.values()]
      .filter((a) => {
        if (q && !norm(a.name).includes(q) && !(a.en && norm(a.en).includes(q))) return false;
        if (equip === 'Personalizados' && !a.custom) return false;
        if (equip !== 'Todo' && equip !== 'Personalizados' && a.cat?.equipment !== equip) return false;
        if (group !== 'Todos') {
          const gs = a.cat ? a.cat.groups : a.group ? [a.group] : [];
          if (!gs.includes(group)) return false;
        }
        return true;
      })
      .sort((x, y) => y.sessions - x.sessions || y.sets - x.sets || x.name.localeCompare(y.name));
  }, [all, seg, range, query, equip, group]);

  if (open && all) {
    const a = list.find((x) => x.key === open) ?? undefined;
    const sessions = sessionsOf(open, all);
    const ex = (() => {
      for (const w of all)
        for (const e of Array.isArray(w.exercises) ? w.exercises : [])
          if (exerciseKey(e).key === open) return e;
      return null;
    })();
    const k = ex ? exerciseKey(ex) : null;
    return (
      <ExerciseDetail
        me={me}
        exKey={open}
        name={k?.name ?? a?.name ?? ''}
        cat={k?.cat}
        kind={ex?.kind ?? k?.cat?.kind ?? 'reps'}
        group={ex?.group}
        sessions={sessions}
        onExit={() => setOpen(null)}
      />
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <Pressable style={styles.createBtn} onPress={() => Alert.alert('Crear ejercicio', 'Esta función llegará próximamente.')}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.createText}>Crear ejercicio</Text>
        </Pressable>
        <Text style={styles.title}>Ejercicios</Text>
        <Pressable onPress={onExit} hitSlop={12} style={{ alignItems: 'flex-end', width: 110 }}>
          <Ionicons name="arrow-forward" size={26} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={20} color="#777" />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar ejercicio"
          placeholderTextColor="#666"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
        />
        {!!query && (
          <Pressable onPress={() => setQuery('')} hitSlop={10}>
            <Ionicons name="close-circle" size={20} color="#777" />
          </Pressable>
        )}
      </View>

      <FilterChips<Equipment | 'Todo' | 'Personalizados'>
        all={['Todo', ...EQUIPMENT, 'Personalizados']}
        current={equip}
        onSelect={setEquip}
        label={(e) => (e === 'Todo' ? 'Todo el material' : e === 'Personalizados' ? 'Personalizados' : EQUIPMENT_LABEL[e])}
      />
      <FilterChips<Group | 'Todos'> all={['Todos', ...GROUPS]} current={group} onSelect={setGroup} label={(g) => g} />

      <View style={styles.seg}>
        {(
          [
            ['always', 'Desde siempre'],
            ['month', 'Último mes'],
          ] as const
        ).map(([k, l]) => (
          <Pressable key={k} style={[styles.segBtn, seg === k && styles.segOn]} onPress={() => setSeg(k)}>
            <Text style={[styles.segText, seg === k && { color: '#fff' }]}>{l}</Text>
          </Pressable>
        ))}
      </View>
      {seg === 'month' && (
        <FilterChips<Range>
          all={RANGES.map((r) => r.key)}
          current={range}
          onSelect={setRange}
          label={(k) => RANGES.find((r) => r.key === k)!.label}
        />
      )}

      {all === null ? (
        error ? (
          <Text style={styles.err}>No se pudieron cargar los entrenos: {error}</Text>
        ) : (
          <ActivityIndicator color="#5AB0FF" style={{ marginTop: 40 }} />
        )
      ) : (
        <FlatList
          data={list}
          keyExtractor={(a) => a.key}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 70, paddingTop: 6 }}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {all.length === 0
                ? 'Todavía no has completado ningún entreno.'
                : 'No hay ejercicios con ese filtro en este periodo.'}
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => setOpen(item.key)}>
              <Text style={styles.name} numberOfLines={2}>
                {item.name}
              </Text>
              <Ionicons name="chevron-forward" size={20} color="#666" />
            </Pressable>
          )}
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
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#161616',
  },
  createBtn: {
    width: 110,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  createText: { color: '#fff', fontSize: 12, fontWeight: '700', flexShrink: 1 },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#141414',
    borderColor: '#262626',
    borderWidth: 1,
    borderRadius: 14,
    marginHorizontal: 18,
    marginTop: 12,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 16, paddingVertical: 12 },
  seg: { flexDirection: 'row', gap: 10, paddingHorizontal: 18, marginVertical: 8 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12, backgroundColor: '#242424' },
  segOn: { backgroundColor: '#2F6BFF' },
  segText: { color: '#9aa4b5', fontSize: 15, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
    borderBottomColor: '#1a1a1a',
    borderBottomWidth: 1,
  },
  name: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '600' },
  empty: { color: '#888', textAlign: 'center', marginTop: 40, fontSize: 14 },
  err: { color: '#ff8a80', textAlign: 'center', marginTop: 40, paddingHorizontal: 20 },
});
