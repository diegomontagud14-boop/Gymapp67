const pad = (n: number) => String(n).padStart(2, '0');

// 1h 05min 12s
export const formatDuration = (total: number) => {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${pad(m)}min ${pad(s)}s`;
  if (m > 0) return `${m}min ${pad(s)}s`;
  return `${s}s`;
};

// hace 5 min · hace 2 h · hace 3 días ...
export const timeAgo = (iso: string) => {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'hace un momento';
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
  if (d < 30) {
    const w = Math.floor(d / 7);
    return `hace ${w} ${w === 1 ? 'semana' : 'semanas'}`;
  }
  if (d < 365) {
    const mo = Math.floor(d / 30);
    return `hace ${mo} ${mo === 1 ? 'mes' : 'meses'}`;
  }
  const y = Math.floor(d / 365);
  return `hace ${y} ${y === 1 ? 'año' : 'años'}`;
};

// Lunes de la semana de una fecha
export const startOfWeek = (d: Date) => {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // lunes = 0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
};

// Nº de récords de un entreno: un récord por ejercicio y tipo (peso, volumen o repeticiones),
// aunque se haya batido varias veces en el mismo entreno.
export const countRecords = (exercises: any[]): number => {
  let n = 0;
  for (const e of exercises ?? []) {
    const types = new Set<string>();
    for (const s of e?.sets ?? []) {
      if (s?.done === false) continue;
      for (const t of s?.prs ?? []) types.add(String(t));
    }
    n += types.size;
  }
  return n;
};
