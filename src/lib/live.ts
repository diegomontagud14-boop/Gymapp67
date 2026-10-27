import { supabase } from './supabase';

/* Entreno en directo: mientras entrenas se guarda una fila con lo que llevas hecho
   y quien visita tu perfil la ve actualizarse en tiempo real. */
export type LiveRow = {
  user_id: string;
  name: string;
  started_at: string;
  exercises: any[];
  updated_at: string;
};

// Si no se actualiza en 3 minutos se considera terminado (la app manda un latido cada minuto)
export const LIVE_STALE_MS = 3 * 60 * 1000;
export const isFresh = (r?: LiveRow | null): r is LiveRow =>
  !!r && Date.now() - new Date(r.updated_at).getTime() < LIVE_STALE_MS;

export async function pushLive(
  me: string,
  p: { name: string; start: number; exercises: any[] }
) {
  const { error } = await supabase.from('live_workouts').upsert({
    user_id: me,
    name: p.name,
    started_at: new Date(p.start).toISOString(),
    exercises: p.exercises,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function clearLive(me: string) {
  const { error } = await supabase.from('live_workouts').delete().eq('user_id', me);
  if (error) throw error;
}

export async function fetchLive(userId: string): Promise<LiveRow | null> {
  const { data, error } = await supabase
    .from('live_workouts')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as LiveRow | null) ?? null;
}

// Cambios en tiempo real (Supabase Realtime) + consulta cada 8 s por si el canal falla
export function subscribeLive(userId: string, cb: (row: LiveRow | null) => void): () => void {
  let stopped = false;
  const poll = async () => {
    try {
      const r = await fetchLive(userId);
      if (!stopped) cb(isFresh(r) ? r : null);
    } catch {}
  };
  const iv = setInterval(poll, 8000);
  let ch: any = null;
  try {
    ch = supabase
      .channel(`live-${userId}-${Math.random().toString(36).slice(2, 7)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_workouts', filter: `user_id=eq.${userId}` },
        (payload: any) => {
          if (stopped) return;
          if (payload.eventType === 'DELETE') cb(null);
          else cb(isFresh(payload.new) ? (payload.new as LiveRow) : null);
        }
      )
      .subscribe();
  } catch {}
  return () => {
    stopped = true;
    clearInterval(iv);
    try {
      if (ch) supabase.removeChannel(ch);
    } catch {}
  };
}
