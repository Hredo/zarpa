import { Directory, Paths } from 'expo-file-system';

import { journal } from '@/db';
import { useJournal } from '@/store/journal';

import { clearAccountState, setNotebookOwner } from './db';

/**
 * Vacía el cuaderno de ESTE móvil: avistamientos, fotos, pegatinas y notas de
 * voz. Lo que ya está en la nube de su cuenta no se toca.
 *
 * `ownerUid` es la cuenta a la que pertenecía el cuaderno: se olvida su estado
 * de sincronización. Es imprescindible: si quedara «sincronizado» un
 * avistamiento que ya no existe aquí, la siguiente pasada lo borraría de la nube.
 */
export async function wipeLocalNotebook(ownerUid: string | null): Promise<void> {
  // Primero se olvida el estado de la cuenta: si una pasada de sincronización
  // se colara entre medias, no vería avistamientos «subidos y borrados aquí»
  // que retirar de la nube.
  if (ownerUid) await clearAccountState(ownerUid);
  await setNotebookOwner(null);
  await journal().runAsync('UPDATE excursion_target SET sighting_id = NULL WHERE sighting_id IS NOT NULL').catch(() => {});
  await journal().runAsync('DELETE FROM sighting');
  for (const name of ['avistamientos', 'notas-voz']) {
    try {
      const dir = new Directory(Paths.document, name);
      if (dir.exists) dir.delete();
    } catch {
      // Un fichero que no se deja borrar no debe dejar el cuaderno a medias.
    }
  }
  await useJournal.getState().load();
}
