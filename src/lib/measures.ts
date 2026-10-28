import { uploadPublicFile } from './social';
import type { PostMedia } from './social';
import { supabase } from './supabase';

/* ---------- Métricas ---------- */
export type MetricKey =
  | 'weight' | 'height' | 'waist' | 'bodyFat' | 'neck' | 'shoulder' | 'chest'
  | 'bicepL' | 'bicepR' | 'forearmL' | 'forearmR' | 'abdomen' | 'hip'
  | 'thighL' | 'thighR' | 'calfL' | 'calfR';

export type Metric = { key: MetricKey; label: string; unit: string; min: number; max: number };

const cm = (key: MetricKey, label: string): Metric => ({ key, label, unit: 'cm', min: 5, max: 300 });

export const METRICS: Metric[] = [
  { key: 'weight', label: 'Peso corporal', unit: 'kg', min: 20, max: 400 },
  { key: 'height', label: 'Altura', unit: 'cm', min: 50, max: 260 },
  cm('waist', 'Cintura'),
  { key: 'bodyFat', label: 'Grasa corporal', unit: '%', min: 1, max: 80 },
  cm('neck', 'Cuello'),
  cm('shoulder', 'Hombro'),
  cm('chest', 'Pecho'),
  cm('bicepL', 'Bíceps izquierdo'),
  cm('bicepR', 'Bíceps derecho'),
  cm('forearmL', 'Antebrazo izquierdo'),
  cm('forearmR', 'Antebrazo derecho'),
  cm('abdomen', 'Abdomen'),
  cm('hip', 'Cadera'),
  cm('thighL', 'Muslo izquierdo'),
  cm('thighR', 'Muslo derecho'),
  cm('calfL', 'Gemelo izquierdo'),
  cm('calfR', 'Gemelo derecho'),
];

export const METRIC_BY_KEY = Object.fromEntries(METRICS.map((m) => [m.key, m])) as Record<MetricKey, Metric>;

export type Measures = Partial<Record<MetricKey, number>>;

export type BodyRecord = {
  id: string;
  user_id: string;
  recorded_at: string; // YYYY-MM-DD
  measures: Measures;
  media: PostMedia[];
  created_at: string;
};

export type Draft = {
  id: string;
  recorded_at: string;
  measures: Measures;
  media: PostMedia[]; // las que empiezan por http ya están subidas; el resto son locales
};

/* ---------- Utilidades ---------- */
const p2 = (n: number) => String(n).padStart(2, '0');
export const dateKey = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const keyToDate = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12);
};
export const fmtDate = (k: string) => {
  const [y, m, d] = k.split('-');
  return `${d}/${m}/${y}`;
};
export const fmtDateShort = (t: number) => {
  const d = new Date(t);
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
};
export const fmtNum = (n: number, max = 2) =>
  n.toLocaleString('es-ES', { maximumFractionDigits: max });

export const newId = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });

const isRemote = (uri: string) => /^https?:\/\//i.test(uri);

const normalize = (row: any): BodyRecord => {
  const measures: Measures = {};
  for (const m of METRICS) {
    const v = Number(row?.measures?.[m.key]);
    if (row?.measures?.[m.key] != null && Number.isFinite(v)) measures[m.key] = v;
  }
  return {
    id: row.id,
    user_id: row.user_id,
    recorded_at: String(row.recorded_at).slice(0, 10),
    measures,
    media: Array.isArray(row.media) ? row.media : [],
    created_at: row.created_at,
  };
};

export const sortRecords = (rs: BodyRecord[]) =>
  [...rs].sort(
    (a, b) =>
      b.recorded_at.localeCompare(a.recorded_at) || b.created_at.localeCompare(a.created_at)
  );

/* ---------- Supabase ---------- */
export async function fetchRecords(me: string): Promise<BodyRecord[]> {
  const { data, error } = await supabase
    .from('body_records')
    .select('*')
    .eq('user_id', me)
    .order('recorded_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) throw error;
  return (data ?? []).map(normalize);
}

// Borra archivos del bucket (si no hay permiso, se ignora: el registro ya está guardado)
const removeFiles = async (uris: string[]) => {
  const paths = uris
    .map((u) => u.split('/workout-media/')[1])
    .filter(Boolean)
    .map((p) => decodeURIComponent(p.split('?')[0]));
  if (!paths.length) return;
  try {
    await supabase.storage.from('workout-media').remove(paths);
  } catch {}
};

export async function saveRecord(me: string, draft: Draft, previous?: BodyRecord): Promise<BodyRecord> {
  // 1) Subir los archivos nuevos (si alguno falla se corta y no se guarda nada a medias)
  const media: PostMedia[] = [];
  for (const m of draft.media) {
    if (isRemote(m.uri)) {
      media.push(m);
      continue;
    }
    const ext = m.type === 'video' ? 'mp4' : 'jpg';
    const path = `${me}/body/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const url = await uploadPublicFile(
      'workout-media',
      path,
      m.uri,
      m.type === 'video' ? 'video/mp4' : 'image/jpeg'
    );
    media.push({ uri: url, type: m.type });
  }

  const payload = {
    recorded_at: draft.recorded_at,
    measures: draft.measures,
    media,
    updated_at: new Date().toISOString(),
  };

  // 2) Guardar
  if (previous) {
    const { data, error } = await supabase
      .from('body_records')
      .update(payload)
      .eq('id', previous.id)
      .eq('user_id', me)
      .select('*')
      .single();
    if (error) throw error;
    const kept = new Set(media.map((m) => m.uri));
    removeFiles(previous.media.map((m) => m.uri).filter((u) => !kept.has(u)));
    return normalize(data);
  }

  const { data, error } = await supabase
    .from('body_records')
    .insert({ id: draft.id, user_id: me, ...payload })
    .select('*')
    .single();
  if (error) {
    // 23505 = ese id ya se guardó (doble pulsación o reintento): se devuelve el existente
    if (error.code === '23505') {
      const { data: ex, error: e2 } = await supabase
        .from('body_records')
        .select('*')
        .eq('id', draft.id)
        .single();
      if (e2) throw e2;
      return normalize(ex);
    }
    throw error;
  }
  return normalize(data);
}

export async function deleteRecord(me: string, rec: BodyRecord) {
  const { error } = await supabase.from('body_records').delete().eq('id', rec.id).eq('user_id', me);
  if (error) throw error;
  removeFiles(rec.media.map((m) => m.uri));
}
