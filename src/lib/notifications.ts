import { Platform } from 'react-native';

/**
 * SONIDO DEL DESCANSO
 * -------------------
 * Cuando tengas tu archivo de sonido:
 *   1. Ponlo en  assets/sounds/descanso.wav  (puedes cambiar el nombre, aquí y en app.json)
 *   2. Cambia la línea de abajo a:  export const CUSTOM_SOUND: string | null = 'descanso.wav';
 *   3. Añade el plugin en app.json y vuelve a compilar la app.
 *
 * Mientras sea null suena el sonido por defecto del móvil.
 */
export const CUSTOM_SOUND: string | null = null;

// En Android el sonido va ligado al canal y no se puede cambiar una vez creado.
// Si cambias CUSTOM_SOUND, cambia también este id (por ejemplo a 'descanso-v2').
const CHANNEL_ID = 'descanso-v1';

/*
 * expo-notifications se carga de forma segura: en Expo Go (Android) le falta un módulo
 * nativo y daría error al importarlo. Si no está disponible, las funciones de abajo
 * simplemente no hacen nada y el resto de la app funciona igual (el reloj sigue contando,
 * pero no llegará la notificación). En una development build funciona completo.
 */
type NotificationsModule = typeof import('expo-notifications');
let Notifications: NotificationsModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Notifications = require('expo-notifications');
  // Cómo se muestra la notificación si la app está abierta
  Notifications?.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch {
  Notifications = null;
}

export const notificationsAvailable = () => Notifications !== null;

/** Crea el canal (Android) y pide permiso de notificaciones. Devuelve true si hay permiso. */
export async function setupNotifications(): Promise<boolean> {
  if (!Notifications) return false;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Descansos',
        importance: Notifications.AndroidImportance.MAX,
        sound: CUSTOM_SOUND ?? 'default',
        vibrationPattern: [0, 400, 200, 400],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const asked = await Notifications.requestPermissionsAsync();
    return asked.granted;
  } catch {
    return false;
  }
}

/**
 * Programa la notificación "¡Descanso finalizado!".
 * Si loop=true se programan varias seguidas (una por cada vuelta del bucle),
 * hasta un máximo de 60 o 2 horas, lo que ocurra antes.
 */
export async function scheduleRestEnd(seconds: number, loop: boolean): Promise<string[]> {
  if (!Notifications) return [];
  const count = loop ? Math.max(1, Math.min(60, Math.floor(7200 / seconds))) : 1;
  const ids: string[] = [];
  try {
    for (let i = 1; i <= count; i++) {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: '¡Descanso finalizado!',
          body: 'Es hora de la siguiente serie.',
          sound: CUSTOM_SOUND ?? true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: seconds * i,
          channelId: CHANNEL_ID,
        },
      });
      ids.push(id);
    }
  } catch {}
  return ids;
}

export async function cancelRestNotifications(ids: string[]): Promise<void> {
  const N = Notifications;
  if (!N) return;
  await Promise.all(ids.map((id) => N.cancelScheduledNotificationAsync(id).catch(() => {})));
}
