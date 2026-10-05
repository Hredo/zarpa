import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { journal, openDatabases } from '@/db';

import { nearbyRarities, RARITY_DAYS, RARITY_RADIUS_KM } from './rarities';
import { displayName } from './speciesName';

/*
 * Avisos de rarezas cerca (opcional, apagado por defecto).
 *
 * El sistema despierta la app de vez en cuando (como mucho cada 12 h; en iOS
 * cuando le conviene) y se miran las rarezas confirmadas cerca del último
 * sitio donde se usó Zarpa. Si hay una que no tienes y de la que aún no se
 * avisó, llega una notificación local. No hay servidor de por medio: la
 * ubicación (redondeada a ~1 km) se queda en el móvil.
 */

export const RARITY_TASK = 'zarpa-rarezas';
const AREA_KEY = 'zarpa-rarezas-zona';
const NOTIFIED_KEY = 'zarpa-rarezas-avisadas';
const CHANNEL = 'rarezas';

/** Última zona conocida, redondeada a dos decimales (~1 km). */
export async function rememberArea(lat: number, lng: number): Promise<void> {
  const area = { lat: Number(lat.toFixed(2)), lng: Number(lng.toFixed(2)) };
  await AsyncStorage.setItem(AREA_KEY, JSON.stringify(area)).catch(() => {});
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Mira las rarezas y avisa de la mejor nueva. Devuelve cuántas nuevas había. */
export async function runRarityCheck(): Promise<number> {
  const area = await readJson<{ lat: number; lng: number }>(AREA_KEY);
  if (!area) return 0;
  await openDatabases();
  const caughtRows = await journal().getAllAsync<{ species_id: number }>('SELECT DISTINCT species_id FROM sighting WHERE species_id IS NOT NULL');
  const caught = new Set(caughtRows.map((r) => r.species_id));
  const res = await nearbyRarities(area.lat, area.lng, caught);
  if (!res) return 0;
  const notified = new Set(await readJson<number[]>(NOTIFIED_KEY));
  const fresh = res.data.filter((r) => !notified.has(r.id));
  if (fresh.length === 0) return 0;
  const top = fresh[0];
  const name = displayName(top).name;
  const more = fresh.length - 1;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: top.rarity >= 5 ? 'Una especie legendaria cerca' : 'Una rareza cerca de ti',
      body: `Se ha visto ${name} a menos de ${RARITY_RADIUS_KM} km en los últimos ${RARITY_DAYS} días.${more > 0 ? ` Y ${more} ${more === 1 ? 'rareza más' : 'rarezas más'}.` : ''}`,
      data: { speciesId: top.id },
    },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null,
  });
  // Se recuerdan todas para no repetir; se guardan las 500 últimas.
  const all = [...notified, ...fresh.map((r) => r.id)].slice(-500);
  await AsyncStorage.setItem(NOTIFIED_KEY, JSON.stringify(all)).catch(() => {});
  return fresh.length;
}

// La tarea se define al cargar el módulo: tiene que existir también cuando el
// sistema arranca la app en segundo plano solo para ejecutarla.
if (Platform.OS !== 'web') {
  TaskManager.defineTask(RARITY_TASK, async () => {
    try {
      await runRarityCheck();
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

/** Activa los avisos: pide permiso de notificaciones y registra la tarea. */
export async function enableRarityAlerts(): Promise<'ok' | 'denied' | 'unavailable'> {
  const status = await BackgroundTask.getStatusAsync().catch(() => BackgroundTask.BackgroundTaskStatus.Restricted);
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) return 'unavailable';
  const perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return 'denied';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Rarezas cerca',
      description: 'Especies raras vistas cerca de ti',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#FF7A1A',
    });
  }
  await BackgroundTask.registerTaskAsync(RARITY_TASK, { minimumInterval: 12 * 60 });
  return 'ok';
}

export async function disableRarityAlerts(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(RARITY_TASK).catch(() => false)) {
    await BackgroundTask.unregisterTaskAsync(RARITY_TASK).catch(() => {});
  }
}

let routed = false;

/**
 * Notificaciones en primer plano y al tocarlas: abre la ficha de la especie.
 * `open` lo pasa el layout raíz (navegación de expo-router).
 */
export function routeRarityNotifications(open: (speciesId: number) => void): () => void {
  if (routed) return () => {};
  routed = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
  const go = (data: unknown) => {
    const id = typeof data === 'object' && data && 'speciesId' in data ? Number((data as { speciesId: unknown }).speciesId) : NaN;
    if (Number.isFinite(id)) open(id);
  };
  const last = Notifications.getLastNotificationResponse();
  if (last) go(last.notification.request.content.data);
  const sub = Notifications.addNotificationResponseReceivedListener((r) => go(r.notification.request.content.data));
  return () => {
    sub.remove();
    routed = false;
  };
}
