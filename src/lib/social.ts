import type { Workout } from '@/screens/GymScreen';
import { supabase } from './supabase';

/* ---------- Tipos ---------- */
export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
};

export type PostMedia = { uri: string; type: 'image' | 'video' };

type Author = { username: string; display_name: string | null; avatar_url: string | null };

export type SocialWorkout = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  duration_sec: number | null;
  volume: number | null;
  series: number | null;
  exercises: any[];
  media: PostMedia[];
  created_at: string;
  profiles: Author | null;
  likes: { user_id: string }[];
  comments: { count: number }[];
};

export type CommentRow = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  profiles: Author | null;
};

// "profiles!user_id" indica que el autor es el de la columna user_id (si no, la base de datos
// no sabe elegir entre ese enlace y los que pasan por likes y comentarios)
const WORKOUT_SELECT =
  '*, profiles!user_id(username, display_name, avatar_url), likes(user_id), comments(count)';

export const errText = (e: any): string => e?.message ?? String(e);

/* ---------- Perfiles ---------- */
export async function getProfile(id: string): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Profile;
}

export async function getProfileByUsername(username: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username.toLowerCase())
    .single();
  if (error) throw error;
  return data as Profile;
}

// Si por algún motivo tu perfil no existe, lo vuelve a crear con los datos de tu cuenta
export async function ensureOwnProfile(): Promise<void> {
  const { data } = await supabase.auth.getUser();
  const u = data.user;
  if (!u) return;
  const meta: any = u.user_metadata ?? {};
  let username = String(meta.username ?? '').toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(username)) username = 'user_' + u.id.replace(/-/g, '').slice(0, 10);
  await supabase.from('profiles').insert({
    id: u.id,
    username,
    display_name: meta.display_name || null,
  });
}

export async function updateProfile(
  id: string,
  patch: { display_name?: string; bio?: string; avatar_url?: string | null }
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Profile;
}

export async function searchProfiles(q: string): Promise<Profile[]> {
  const clean = q.replace(/[%,()]/g, '').trim();
  if (!clean) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .or(`username.ilike.%${clean}%,display_name.ilike.%${clean}%`)
    .limit(20);
  if (error) throw error;
  return (data ?? []) as Profile[];
}

/* ---------- Seguidores ---------- */
export async function getFollowingIds(me: string): Promise<string[]> {
  const { data, error } = await supabase.from('follows').select('following_id').eq('follower_id', me);
  if (error) throw error;
  return (data ?? []).map((r: any) => r.following_id as string);
}

export async function isFollowing(me: string, other: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', me)
    .eq('following_id', other)
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

export async function follow(me: string, other: string) {
  const { error } = await supabase.from('follows').insert({ follower_id: me, following_id: other });
  if (error && error.code !== '23505') throw error; // 23505 = ya lo seguías
}

export async function unfollow(me: string, other: string) {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', me)
    .eq('following_id', other);
  if (error) throw error;
}

export async function getCounts(userId: string) {
  const head = { count: 'exact' as const, head: true };
  const [w, f1, f2] = await Promise.all([
    supabase.from('workouts').select('id', head).eq('user_id', userId),
    supabase.from('follows').select('follower_id', head).eq('following_id', userId),
    supabase.from('follows').select('following_id', head).eq('follower_id', userId),
  ]);
  return { workouts: w.count ?? 0, followers: f1.count ?? 0, following: f2.count ?? 0 };
}

// Seguidores (quién me sigue) o seguidos (a quién sigo) de un usuario
export async function listPeople(userId: string, kind: 'followers' | 'following'): Promise<Profile[]> {
  const mine = kind === 'followers' ? 'following_id' : 'follower_id';
  const other = kind === 'followers' ? 'follower_id' : 'following_id';
  const { data, error } = await supabase.from('follows').select(other).eq(mine, userId);
  if (error) throw error;
  const ids = (data ?? []).map((r: any) => r[other] as string);
  if (ids.length === 0) return [];
  const { data: profs, error: e2 } = await supabase.from('profiles').select('*').in('id', ids);
  if (e2) throw e2;
  return (profs ?? []) as Profile[];
}

/* ---------- Entrenos ---------- */
export async function fetchFeed(me: string): Promise<SocialWorkout[]> {
  const following = await getFollowingIds(me);
  const { data, error } = await supabase
    .from('workouts')
    .select(WORKOUT_SELECT)
    .in('user_id', [me, ...following])
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) throw error;
  return (data ?? []) as unknown as SocialWorkout[];
}

export async function fetchUserWorkouts(userId: string): Promise<SocialWorkout[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select(WORKOUT_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as unknown as SocialWorkout[];
}

export async function fetchWorkoutDates(userId: string, sinceISO: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select('created_at')
    .eq('user_id', userId)
    .gte('created_at', sinceISO);
  if (error) throw error;
  return (data ?? []).map((r: any) => r.created_at as string);
}

/* ---------- Likes y comentarios ---------- */
export async function toggleLike(workoutId: string, me: string, currentlyLiked: boolean) {
  if (currentlyLiked) {
    const { error } = await supabase
      .from('likes')
      .delete()
      .eq('workout_id', workoutId)
      .eq('user_id', me);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('likes').insert({ workout_id: workoutId, user_id: me });
    if (error && error.code !== '23505') throw error;
  }
}

export async function fetchComments(workoutId: string): Promise<CommentRow[]> {
  const { data, error } = await supabase
    .from('comments')
    .select('id, user_id, body, created_at, profiles!user_id(username, display_name, avatar_url)')
    .eq('workout_id', workoutId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as CommentRow[];
}

export async function addComment(workoutId: string, me: string, body: string) {
  const { error } = await supabase
    .from('comments')
    .insert({ workout_id: workoutId, user_id: me, body });
  if (error) throw error;
}

export async function deleteComment(id: string) {
  const { error } = await supabase.from('comments').delete().eq('id', id);
  if (error) throw error;
}

/* ---------- Subir archivos y publicar entrenos ---------- */
// Lee un archivo del móvil y lo convierte en bytes (así la subida funciona bien en Android)
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const base64ToBytes = (b64: string): Uint8Array => {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i]);
    const b = B64.indexOf(clean[i + 1]);
    const c = i + 2 < clean.length ? B64.indexOf(clean[i + 2]) : -1;
    const d = i + 3 < clean.length ? B64.indexOf(clean[i + 3]) : -1;
    out[o++] = (a << 2) | (b >> 4);
    if (c >= 0) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
};

const readFileBytes = async (uri: string): Promise<Uint8Array> => {
  let FS: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    FS = require('expo-file-system/legacy');
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    FS = require('expo-file-system');
  }
  const b64: string = await FS.readAsStringAsync(uri, { encoding: 'base64' });
  return base64ToBytes(b64);
};

export async function uploadPublicFile(
  bucket: 'avatars' | 'workout-media',
  path: string,
  uri: string,
  contentType: string
): Promise<string> {
  const bytes = await readFileBytes(uri);
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, bytes, { contentType, upsert: true });
  if (error) throw error;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

// Sube las fotos/vídeo y publica el entreno
export async function uploadWorkout(me: string, w: Workout) {
  const media: PostMedia[] = [];
  for (const m of w.media ?? []) {
    try {
      const ext = m.type === 'video' ? 'mp4' : 'jpg';
      const path = `${me}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const url = await uploadPublicFile(
        'workout-media',
        path,
        m.uri,
        m.type === 'video' ? 'video/mp4' : 'image/jpeg'
      );
      media.push({ uri: url, type: m.type });
    } catch {
      // si un archivo falla, el entreno se publica igualmente
    }
  }
  const { error } = await supabase.from('workouts').insert({
    user_id: me,
    name: w.name,
    description: w.description,
    duration_sec: w.durationSec ?? null,
    volume: w.volume ?? 0,
    series: w.series ?? 0,
    exercises: w.exercises,
    media,
    created_at: w.date,
  });
  if (error) throw error;
}

/* ---------- Rutinas en la nube (para que otros puedan verlas y copiarlas) ---------- */
export type RoutineRow = {
  id: string;
  user_id: string;
  local_id: string;
  name: string;
  exercises: any[];
  updated_at: string;
};

export async function syncRoutines(
  me: string,
  routines: { id: string; name: string; exercises: any[] }[]
) {
  const now = new Date().toISOString();
  if (routines.length) {
    const rows = routines.map((r) => ({
      user_id: me,
      local_id: r.id,
      name: r.name,
      exercises: r.exercises,
      updated_at: now,
    }));
    const { error } = await supabase.from('routines').upsert(rows, { onConflict: 'user_id,local_id' });
    if (error) throw error;
  }
  const { data, error: e2 } = await supabase.from('routines').select('local_id').eq('user_id', me);
  if (e2) throw e2;
  const keep = new Set(routines.map((r) => r.id));
  const gone = (data ?? []).map((r: any) => r.local_id as string).filter((id) => !keep.has(id));
  if (gone.length) {
    const { error: e3 } = await supabase.from('routines').delete().eq('user_id', me).in('local_id', gone);
    if (e3) throw e3;
  }
}

export async function fetchUserRoutines(userId: string): Promise<RoutineRow[]> {
  const { data, error } = await supabase
    .from('routines')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as RoutineRow[];
}

// Todos los entrenos de una persona (para el calendario y las estadísticas)
export async function fetchAllWorkouts(userId: string): Promise<SocialWorkout[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select(
      'id, user_id, name, description, duration_sec, volume, series, exercises, created_at, profiles!user_id(username, display_name, avatar_url)'
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5000);
  if (error) throw error;
  return (data ?? []) as unknown as SocialWorkout[];
}

/* ---------- Clasificación por ejercicio (necesita supabase_v3.sql) ---------- */
export type LeaderRow = {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  max_weight: number;
};

export async function fetchExerciseLeaderboard(
  ids: string[],
  names: string[],
  onlyFriends: boolean
): Promise<LeaderRow[]> {
  const { data, error } = await supabase.rpc('exercise_leaderboard', {
    p_ids: ids,
    p_names: names,
    p_friends: onlyFriends,
  });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({ ...r, max_weight: Number(r.max_weight) })) as LeaderRow[];
}
