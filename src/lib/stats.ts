import { CATALOG } from '@/data/exercises';
import type { CatalogExercise } from '@/data/exercises';
import { startOfWeek } from '@/lib/format';

/* Cálculos de calendario, rachas y estadísticas a partir de los entrenos guardados */
export type W = {
  id: string;
  name: string;
  created_at: string;
  duration_sec: number | null;
  volume: number | null;
  series: number | null;
  exercises: any[];
  [k: string]: any;
};

export const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
export const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const DAYS_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

const p2 = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const weekKey = (d: Date) => dayKey(startOfWeek(d));
export const mondayIndex = (d: Date) => (d.getDay() + 6) % 7;

// día -> entrenos de ese día (el primero del día va primero)
export const buildDayMap = (ws: W[]): Record<string, W[]> => {
  const map: Record<string, W[]> = {};
  const sorted = [...ws].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
  for (const w of sorted) (map[dayKey(new Date(w.created_at))] ??= []).push(w);
  return map;
};

const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const weekSetOf = (ws: W[]) => new Set(ws.map((w) => weekKey(new Date(w.created_at))));

// Semanas que forman parte de una racha de 2 o más semanas seguidas con entreno
export const fireWeeksOf = (weeks: Set<string>) => {
  const out = new Set<string>();
  weeks.forEach((k) => {
    const d = new Date(k + 'T00:00:00');
    if (weeks.has(weekKey(addDays(d, -7))) || weeks.has(weekKey(addDays(d, 7)))) out.add(k);
  });
  return out;
};

// Semanas seguidas hasta ahora (si esta semana aún no has entrenado, cuenta desde la anterior)
export const currentStreak = (weeks: Set<string>) => {
  let d = startOfWeek(new Date());
  if (!weeks.has(dayKey(d))) d = addDays(d, -7);
  let n = 0;
  while (weeks.has(dayKey(d))) {
    n++;
    d = addDays(d, -7);
  }
  return n;
};

export const longestStreak = (weeks: Set<string>) => {
  let best = 0;
  weeks.forEach((k) => {
    const d = new Date(k + 'T00:00:00');
    if (weeks.has(weekKey(addDays(d, -7)))) return; // no es el inicio de una racha
    let n = 0;
    let c = d;
    while (weeks.has(dayKey(c))) {
      n++;
      c = addDays(c, 7);
    }
    best = Math.max(best, n);
  });
  return best;
};

// Días desde el último entreno (0 = hoy)
export const restDays = (dayMap: Record<string, W[]>) => {
  const keys = Object.keys(dayMap).sort();
  if (!keys.length) return null;
  const last = new Date(keys[keys.length - 1] + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((+today - +last) / 86400000));
};

/* ---------- Grupos musculares (hexágono) ---------- */
export const AXES = ['Espalda', 'Pecho', 'Pierna', 'Brazo', 'Abdominales', 'Hombros'] as const;
export type Axis = (typeof AXES)[number];

const GROUP_AXIS: Record<string, Axis | undefined> = {
  Pecho: 'Pecho',
  Espalda: 'Espalda',
  Hombros: 'Hombros',
  'Bíceps': 'Brazo',
  'Tríceps': 'Brazo',
  'Antebrazo y agarre': 'Brazo',
  Pierna: 'Pierna',
  'Isquios y glúteos': 'Pierna',
  'Gemelos y tibial': 'Pierna',
  Core: 'Abdominales',
};

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
let byId: Map<string, CatalogExercise> | null = null;
let byName: Map<string, CatalogExercise> | null = null;
const buildMaps = () => {
  if (byId && byName) return;
  byId = new Map();
  byName = new Map();
  for (const c of CATALOG) {
    byId.set(c.id, c);
    c.grips?.forEach((g) => byId!.set(g.id, c));
    byName.set(norm(c.name), c);
  }
};

const exerciseAxes = (ex: any): { primary: Axis[]; secondary: Axis[] } => {
  buildMaps();
  let c: CatalogExercise | undefined = ex.exId ? byId!.get(ex.exId) : undefined;
  if (!c && typeof ex.name === 'string') {
    c = byName!.get(norm(ex.name.replace(/\s+agarre\s.+$/i, '')));
  }
  const uniq = (xs: (Axis | undefined)[]) => [...new Set(xs.filter((x): x is Axis => !!x))];
  if (c) {
    const primary = uniq(c.groups.map((g) => GROUP_AXIS[g]));
    const secondary = uniq(c.secondary.map((g) => GROUP_AXIS[g])).filter((a) => !primary.includes(a));
    return { primary, secondary };
  }
  return { primary: uniq([GROUP_AXIS[ex.group]]), secondary: [] };
};

/* ---------- Récords ---------- */
export type RecordType = 'weight' | 'volume' | 'reps';
export type RecordEntry = { exercise: string; type: RecordType; value: number; date: string };
export const RECORD_LABEL: Record<RecordType, string> = {
  weight: 'Mayor peso',
  volume: 'Mayor volumen en una serie',
  reps: 'Más repeticiones',
};

const num = (v: any) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const effReps = (s: any) => Math.max(0, num(s.reps) - (s.type === 'F' ? 1 : 0));

/* ---------- Estadísticas ---------- */
export type Stats = {
  count: number;
  seconds: number;
  volume: number;
  sets: number;
  records: RecordEntry[];
  routines: { name: string; count: number }[];
  radar: Record<Axis, number>;
  topExercises: { name: string; sets: number }[];
  perMonth: number[]; // 12 meses
  bestMonth: number | null;
  daysTrained: number;
  longestStreak: number;
  favDay: number | null; // 0 = lunes
  avgSeconds: number;
  avgVolume: number;
};

export const computeStats = (ws: W[]): Stats => {
  const radar = Object.fromEntries(AXES.map((a) => [a, 0])) as Record<Axis, number>;
  const routineMap = new Map<string, number>();
  const exMap = new Map<string, number>();
  const records: RecordEntry[] = [];
  const perMonth = Array(12).fill(0) as number[];
  const perDow = Array(7).fill(0) as number[];
  const days = new Set<string>();
  let seconds = 0;
  let volume = 0;
  let sets = 0;

  for (const w of ws) {
    const d = new Date(w.created_at);
    days.add(dayKey(d));
    perMonth[d.getMonth()]++;
    perDow[mondayIndex(d)]++;
    seconds += w.duration_sec ?? 0;
    volume += w.volume ?? 0;
    routineMap.set(w.name, (routineMap.get(w.name) ?? 0) + 1);

    for (const ex of Array.isArray(w.exercises) ? w.exercises : []) {
      const done = (ex.sets ?? []).filter((s: any) => s.done !== false && s.type !== 'W');
      sets += done.length;
      if (done.length) {
        exMap.set(ex.name, (exMap.get(ex.name) ?? 0) + done.length);
        const ax = exerciseAxes(ex);
        ax.primary.forEach((a) => (radar[a] += done.length));
        ax.secondary.forEach((a) => (radar[a] += done.length * 0.5));
      }
      const best: Partial<Record<RecordType, number>> = {};
      for (const s of ex.sets ?? []) {
        if (s.done === false || !s.prs) continue;
        for (const t of s.prs as RecordType[]) {
          const v = t === 'weight' ? num(s.weight) : t === 'volume' ? num(s.weight) * effReps(s) : effReps(s);
          if (v > (best[t] ?? -1)) best[t] = v;
        }
      }
      (['weight', 'volume', 'reps'] as RecordType[]).forEach((t) => {
        if (best[t] !== undefined)
          records.push({ exercise: ex.name, type: t, value: Math.round(best[t]! * 10) / 10, date: w.created_at });
      });
    }
  }

  const maxMonth = Math.max(...perMonth);
  const maxDow = Math.max(...perDow);
  return {
    count: ws.length,
    seconds,
    volume,
    sets,
    records,
    routines: [...routineMap].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    radar,
    topExercises: [...exMap].map(([name, s]) => ({ name, sets: s })).sort((a, b) => b.sets - a.sets),
    perMonth,
    bestMonth: maxMonth > 0 ? perMonth.indexOf(maxMonth) : null,
    daysTrained: days.size,
    longestStreak: longestStreak(weekSetOf(ws)),
    favDay: maxDow > 0 ? perDow.indexOf(maxDow) : null,
    avgSeconds: ws.length ? Math.round(seconds / ws.length) : 0,
    avgVolume: ws.length ? volume / ws.length : 0,
  };
};
