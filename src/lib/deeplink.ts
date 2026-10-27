/*
 * Enlaces a perfiles: gymapp://u/nombre_de_usuario
 * +native-intent.ts guarda aquí el usuario cuando se abre un enlace, y la pantalla
 * principal lo recoge en cuanto hay sesión iniciada.
 */
let pending: string | null = null;
const listeners = new Set<() => void>();

export const setPendingProfile = (username: string) => {
  pending = username.toLowerCase();
  listeners.forEach((l) => l());
};

export const takePendingProfile = (): string | null => {
  const p = pending;
  pending = null;
  return p;
};

export const onPendingProfile = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
