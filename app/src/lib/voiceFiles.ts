import { Directory, File, Paths } from 'expo-file-system';

/*
 * Notas de voz del diario. En la base se guarda la ruta RELATIVA al directorio
 * de documentos (`notas-voz/<id>-<ms>.m4a`) porque en iOS la ruta absoluta del
 * contenedor cambia al actualizar la app; aquí se resuelve a un `file://`.
 */
const DIR = 'notas-voz';

export function voiceUri(rel: string): string {
  return new File(Paths.document, rel).uri;
}

export function voiceExists(rel: string): boolean {
  try {
    return new File(Paths.document, rel).exists;
  } catch {
    return false;
  }
}

/** Mueve la grabación temporal al directorio de documentos y devuelve su ruta relativa. */
export async function adoptRecording(tempUri: string, sightingId: string): Promise<string> {
  const dir = new Directory(Paths.document, DIR);
  dir.create({ idempotent: true, intermediates: true });
  const ext = /\.([a-z0-9]{2,4})$/i.exec(tempUri)?.[1]?.toLowerCase() ?? 'm4a';
  const name = `${sightingId}-${Date.now()}.${ext}`;
  await new File(tempUri).move(new File(dir, name));
  return `${DIR}/${name}`;
}

export function removeVoiceFile(rel: string | null | undefined): void {
  if (!rel) return;
  try {
    const f = new File(Paths.document, rel);
    if (f.exists) f.delete();
  } catch {
    // Un fichero que ya no está no debe impedir borrar el avistamiento.
  }
}
