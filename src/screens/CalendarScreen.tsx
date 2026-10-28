import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import StatsView from '@/components/StatsView';
import { WorkoutDetailModal } from '@/components/WorkoutView';
import { errText, fetchAllWorkouts } from '@/lib/social';
import type { SocialWorkout } from '@/lib/social';
import {
  DAYS_SHORT,
  MONTHS,
  MONTHS_SHORT,
  buildDayMap,
  dayKey,
  fireWeeksOf,
  mondayIndex,
  weekKey,
  weekSetOf,
} from '@/lib/stats';
import type { W } from '@/lib/stats';

type Mode = 'month' | 'year' | 'all';
const MODE_LABEL: Record<Mode, string> = { month: 'Mensual', year: 'Anual', all: 'Desde siempre' };
const BLUE = '#1E90FF';
const FIRE = '#FF8A1F';

type StatsTarget = { title: string; list: W[]; weeks: number; extended: boolean };

const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const inMonth = (ws: W[], y: number, m: number) =>
  ws.filter((w) => {
    const d = new Date(w.created_at);
    return d.getFullYear() === y && d.getMonth() === m;
  });
const inYear = (ws: W[], y: number) => ws.filter((w) => new Date(w.created_at).getFullYear() === y);

/* Filas de semanas (lunes a domingo) de un mes: null = hueco */
const monthRows = (y: number, m: number): (number | null)[][] => {
  const lead = mondayIndex(new Date(y, m, 1));
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysIn(y, m) }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
};

export default function CalendarScreen({ me, onExit }: { me: string; onExit: () => void }) {
  const [mode, setMode] = useState<Mode>('month');
  const [menu, setMenu] = useState(false);
  const [all, setAll] = useState<W[] | null>(null);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<StatsTarget | null>(null);
  const [detail, setDetail] = useState<SocialWorkout | null>(null);
  const [dayPick, setDayPick] = useState<W[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView | null>(null);
  const scrolled = useRef(false);
  useEffect(() => {
    scrolled.current = false;
  }, [mode, all, stats]);

  useEffect(() => {
    fetchAllWorkouts(me)
      .then((r) => setAll(r as unknown as W[]))
      .catch((e) => setError(errText(e)));
  }, [me]);

  const dayMap = useMemo(() => buildDayMap(all ?? []), [all]);
  const weeks = useMemo(() => weekSetOf(all ?? []), [all]);
  const fire = useMemo(() => fireWeeksOf(weeks), [weeks]);

  const now = new Date();
  const firstDate = useMemo(() => {
    const ds = (all ?? []).map((w) => +new Date(w.created_at));
    return ds.length ? new Date(Math.min(...ds)) : now;
  }, [all]);
  const firstYear = firstDate.getFullYear();

  /* ---------- Pantalla de estadísticas ---------- */
  if (stats) {
    return (
      <View style={styles.root}>
        <View style={styles.top}>
          <Pressable onPress={() => setStats(null)} hitSlop={12}>
            <Ionicons name="arrow-back" size={26} color="#fff" />
          </Pressable>
          <Text style={styles.topTitle}>{stats.title}</Text>
          <View style={{ width: 26 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 60 }}>
          <StatsView workouts={stats.list} periodWeeks={stats.weeks} extended={stats.extended} />
        </ScrollView>
      </View>
    );
  }

  const openDay = (list: W[]) => {
    if (list.length === 1) setDetail(list[0] as unknown as SocialWorkout);
    else setDayPick(list);
  };

  /* ---------- Vista mensual ---------- */
  const monthList: { y: number; m: number }[] = [];
  {
    let y = firstDate.getFullYear();
    let m = firstDate.getMonth();
    // al menos 3 meses hacia atrás
    const min = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    if (new Date(y, m, 1) > min) {
      y = min.getFullYear();
      m = min.getMonth();
    }
    while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth())) {
      monthList.push({ y, m });
      m++;
      if (m > 11) {
        m = 0;
        y++;
      }
    }
  }
  const todayKey = dayKey(now);

  const monthView = (
    <>
      <View style={styles.dow}>
        {DAYS_SHORT.map((d) => (
          <Text key={d} style={styles.dowText}>
            {d}
          </Text>
        ))}
      </View>
      <ScrollView
        ref={(r) => {
          scrollRef.current = r;
        }}
        onContentSizeChange={() => {
          if (!scrolled.current) {
            scrollRef.current?.scrollToEnd({ animated: false });
            scrolled.current = true;
          }
        }}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {monthList.map(({ y, m }) => {
          const key = `${y}-${m}`;
          const open = expanded === key;
          return (
            <View key={key} style={{ marginTop: 18 }}>
              <View style={styles.monthHead}>
                <Text style={styles.monthTitle}>
                  {MONTHS[m]} de {y}
                </Text>
                <Pressable hitSlop={10} onPress={() => setExpanded(open ? null : key)}>
                  <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={22} color="#fff" />
                </Pressable>
              </View>
              {open && (
                <Pressable
                  style={styles.statsBtn}
                  onPress={() =>
                    setStats({
                      title: `${MONTHS[m]} de ${y}`,
                      list: inMonth(all ?? [], y, m),
                      weeks: daysIn(y, m) / 7,
                      extended: false,
                    })
                  }
                >
                  <Ionicons name="stats-chart" size={16} color="#fff" />
                  <Text style={styles.statsBtnText}>Ver estadísticas</Text>
                </Pressable>
              )}
              {monthRows(y, m).map((row, ri) => (
                <View key={ri} style={styles.weekRow}>
                  {row.map((d, ci) => {
                    if (d === null) return <View key={ci} style={styles.cell} />;
                    const date = new Date(y, m, d);
                    const k = dayKey(date);
                    const list = dayMap[k];
                    const trained = !!list;
                    const isFire = trained && fire.has(weekKey(date));
                    const isToday = k === todayKey;
                    return (
                      <Pressable
                        key={ci}
                        style={styles.cell}
                        disabled={!trained}
                        onPress={() => list && openDay(list)}
                      >
                        {trained ? (
                          isFire ? (
                            <View style={styles.badge}>
                              <Ionicons name="flame" size={46} color={FIRE} />
                              <Text style={styles.fireNum}>{d}</Text>
                            </View>
                          ) : (
                            <View style={[styles.badge, styles.circle]}>
                              <Text style={styles.circleNum}>{d}</Text>
                            </View>
                          )
                        ) : (
                          <View style={styles.badge}>
                            <Text style={[styles.dayNum, isToday && { color: BLUE, fontWeight: '800' }]}>{d}</Text>
                          </View>
                        )}
                        {trained && (
                          <Text style={styles.dayLabel} numberOfLines={1}>
                            {list[0].name}
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          );
        })}
      </ScrollView>
    </>
  );

  /* ---------- Vista anual ---------- */
  const years: number[] = [];
  for (let y = firstYear; y <= now.getFullYear(); y++) years.push(y);

  const yearView = (
    <ScrollView
      ref={(r) => {
        scrollRef.current = r;
      }}
      onContentSizeChange={() => {
        if (!scrolled.current) {
          scrollRef.current?.scrollToEnd({ animated: false });
          scrolled.current = true;
        }
      }}
      contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 40 }}
    >
      <Text style={styles.hint}>Toca un mes para ver sus estadísticas</Text>
      {years.map((y) => (
        <View key={y}>
          <Text style={styles.yearTitle}>{y}</Text>
          <View style={styles.yearGrid}>
            {Array.from({ length: 12 }, (_, m) => (
              <Pressable
                key={m}
                style={styles.miniMonth}
                onPress={() =>
                  setStats({
                    title: `${MONTHS[m]} de ${y}`,
                    list: inMonth(all ?? [], y, m),
                    weeks: daysIn(y, m) / 7,
                    extended: false,
                  })
                }
              >
                <Text style={styles.miniTitle}>{MONTHS_SHORT[m]}</Text>
                <View>
                  {monthRows(y, m).map((row, ri) => (
                    <View key={ri} style={styles.miniRow}>
                      {row.map((d, ci) => (
                        <View
                          key={ci}
                          style={[
                            styles.miniCell,
                            d === null && { backgroundColor: 'transparent' },
                            d !== null && dayMap[dayKey(new Date(y, m, d))] && { backgroundColor: BLUE },
                          ]}
                        />
                      ))}
                    </View>
                  ))}
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );

  /* ---------- Desde siempre ---------- */
  const allView = (
    <ScrollView
      ref={(r) => {
        scrollRef.current = r;
      }}
      onContentSizeChange={() => {
        if (!scrolled.current) {
          scrollRef.current?.scrollToEnd({ animated: false });
          scrolled.current = true;
        }
      }}
      contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 40 }}
    >
      <Text style={styles.hint}>Toca un año para ver sus estadísticas</Text>
      {years.map((y) => (
        <YearStrip
          key={y}
          year={y}
          dayMap={dayMap}
          onPress={() =>
            setStats({
              title: String(y),
              list: inYear(all ?? [], y),
              weeks: y === now.getFullYear() ? Math.max(1, (+now - +new Date(y, 0, 1)) / (7 * 86400000)) : 52,
              extended: true,
            })
          }
        />
      ))}
    </ScrollView>
  );

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <Pressable onPress={onExit} hitSlop={12}>
          <Ionicons name="arrow-back" size={26} color="#fff" />
        </Pressable>
        <Pressable style={styles.modeBtn} onPress={() => setMenu((v) => !v)}>
          <Text style={styles.topTitle}>{MODE_LABEL[mode]}</Text>
          <Ionicons name={menu ? 'chevron-up' : 'chevron-down'} size={20} color="#fff" />
        </Pressable>
        <View style={{ width: 26 }} />
      </View>

      {menu && (
        <View style={styles.menu}>
          {(['month', 'year', 'all'] as Mode[]).map((k) => (
            <Pressable
              key={k}
              style={styles.menuRow}
              onPress={() => {
                setMode(k);
                setMenu(false);
              }}
            >
              <Text style={[styles.menuText, mode === k && { color: '#5AB0FF' }]}>{MODE_LABEL[k]}</Text>
              {mode === k && <Ionicons name="checkmark" size={18} color="#5AB0FF" />}
            </Pressable>
          ))}
        </View>
      )}

      {all === null ? (
        error ? (
          <Text style={[styles.hint, { color: '#ff8a80', marginTop: 40, paddingHorizontal: 20 }]}>
            No se pudieron cargar los entrenos: {error}
          </Text>
        ) : (
          <ActivityIndicator color="#5AB0FF" style={{ marginTop: 40 }} />
        )
      ) : mode === 'month' ? (
        monthView
      ) : mode === 'year' ? (
        yearView
      ) : (
        allView
      )}

      <WorkoutDetailModal workout={detail} onClose={() => setDetail(null)} exit="right" />

      <Modal visible={!!dayPick} transparent animationType="fade" onRequestClose={() => setDayPick(null)}>
        <View style={styles.pickRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setDayPick(null)} />
          <View style={styles.pickBox}>
            <Text style={styles.pickTitle}>Elige un entreno</Text>
            {(dayPick ?? []).map((w) => (
              <Pressable
                key={w.id}
                style={styles.pickRow}
                onPress={() => {
                  setDayPick(null);
                  setDetail(w as unknown as SocialWorkout);
                }}
              >
                <Text style={styles.pickName}>{w.name}</Text>
                <Ionicons name="chevron-forward" size={18} color="#777" />
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* Un año entero en una tira (columnas = semanas, filas = días) */
function YearStrip({
  year,
  dayMap,
  onPress,
}: {
  year: number;
  dayMap: Record<string, W[]>;
  onPress: () => void;
}) {
  const { width } = useWindowDimensions();
  const cols = 54;
  const avail = width - 36;
  const stride = avail / cols;
  const size = Math.max(3, stride - 1.5);
  const jan1 = mondayIndex(new Date(year, 0, 1));
  const total = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;

  const columns: (string | null)[][] = Array.from({ length: cols }, () => Array(7).fill(null));
  for (let i = 0; i < total; i++) {
    const col = Math.floor((i + jan1) / 7);
    const row = (i + jan1) % 7;
    columns[col][row] = dayKey(new Date(year, 0, 1 + i));
  }
  const monthCol = (m: number) => {
    const doy = Math.round((+new Date(year, m, 1) - +new Date(year, 0, 1)) / 86400000);
    return Math.floor((doy + jan1) / 7);
  };

  return (
    <Pressable onPress={onPress} style={{ marginTop: 26 }}>
      <Text style={styles.yearTitle}>{year}</Text>
      <View style={{ height: 16 }}>
        {MONTHS_SHORT.map((l, m) => (
          <Text key={l} style={[styles.stripLabel, { left: monthCol(m) * stride }]}>
            {l}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: stride - size }}>
        {columns.map((col, ci) => (
          <View key={ci} style={{ gap: stride - size }}>
            {col.map((k, ri) => (
              <View
                key={ri}
                style={{
                  width: size,
                  height: size,
                  borderRadius: 1.5,
                  backgroundColor: k === null ? 'transparent' : dayMap[k] ? BLUE : '#262626',
                }}
              />
            ))}
          </View>
        ))}
      </View>
    </Pressable>
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
  modeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  topTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  menu: {
    position: 'absolute',
    top: 58,
    alignSelf: 'center',
    zIndex: 10,
    width: 220,
    backgroundColor: '#1b1b1b',
    borderColor: '#2a2a2a',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 6,
  },
  menuRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 },
  menuText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  streakBar: { flexDirection: 'row', backgroundColor: '#141414', borderBottomColor: '#222', borderBottomWidth: 1 },
  streakCell: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 6 },
  streakText: { color: '#fff', fontSize: 15, fontWeight: '600', flexShrink: 1 },
  dow: { flexDirection: 'row', backgroundColor: '#141414', paddingVertical: 10 },
  dowText: { flex: 1, textAlign: 'center', color: '#8a94a6', fontSize: 15 },

  monthHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, marginBottom: 6 },
  monthTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  statsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    marginLeft: 18,
    marginBottom: 8,
    backgroundColor: '#1F4FFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  statsBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  weekRow: { flexDirection: 'row', borderTopColor: '#1d1d1d', borderTopWidth: 1, paddingVertical: 4 },
  cell: { flex: 1, minHeight: 66, alignItems: 'center', paddingHorizontal: 1 },
  badge: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  circle: { borderRadius: 23, backgroundColor: BLUE },
  circleNum: { color: '#fff', fontSize: 20, fontWeight: '700' },
  fireNum: { position: 'absolute', top: 18, color: '#fff', fontSize: 15, fontWeight: '800' },
  dayNum: { color: '#fff', fontSize: 20 },
  dayLabel: { color: '#aab3c2', fontSize: 11, marginTop: 1, maxWidth: '100%' },

  hint: { color: '#8a94a6', fontSize: 13, textAlign: 'center', marginTop: 14 },
  yearTitle: { color: '#fff', fontSize: 30, fontWeight: '800', marginTop: 20 },
  yearGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  miniMonth: { width: '33.33%', paddingVertical: 10, paddingRight: 10 },
  miniTitle: { color: '#fff', fontSize: 19, marginBottom: 8 },
  miniRow: { flexDirection: 'row', gap: 3, marginBottom: 3 },
  miniCell: { flex: 1, aspectRatio: 1, borderRadius: 3, backgroundColor: '#262626', maxWidth: 24 },
  stripLabel: { position: 'absolute', color: '#fff', fontSize: 11 },

  overlay: {
    position: 'absolute',
    top: 58,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.97)',
    zIndex: 20,
  },
  overlayTitle: { color: '#fff', fontSize: 24, fontWeight: '800', paddingHorizontal: 18, paddingTop: 16 },

  pickRoot: { flex: 1, justifyContent: 'center', padding: 30, backgroundColor: 'rgba(0,0,0,0.7)' },
  pickBox: { backgroundColor: '#161616', borderRadius: 20, padding: 18, borderColor: '#2a2a2a', borderWidth: 1 },
  pickTitle: { color: '#fff', fontSize: 17, fontWeight: '800', marginBottom: 8 },
  pickRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderTopColor: '#252525', borderTopWidth: 1 },
  pickName: { color: '#fff', fontSize: 16 },
});
