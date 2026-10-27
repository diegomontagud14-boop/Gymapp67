import { setPendingProfile } from '../lib/deeplink';

// Se ejecuta cada vez que Android abre la app con un enlace.
// gymapp://u/juan_fit  ->  se guarda "juan_fit" y se deja la app en la pantalla principal.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    const m = path.match(/(?:^|\/)u\/([A-Za-z0-9_]{3,20})(?:[/?#]|$)/);
    if (m) {
      setPendingProfile(m[1]);
      return '/';
    }
  } catch {}
  return path;
}
