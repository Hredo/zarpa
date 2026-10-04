import { requireOptionalNativeModule } from 'expo';

type CutoutModule = {
  prepare(): Promise<boolean>;
  makeSticker(
    inputUri: string,
    outputPath: string,
    focusX: number,
    focusY: number,
    outline: number,
  ): Promise<{ uri: string; width: number; height: number } | null>;
};

/*
 * Puente con `modules/zarpa-cutout` (Vision en iOS, ML Kit en Android).
 * Opcional a propósito: en web, en tests o en un móvil sin el servicio de
 * recorte devuelve null y el fichaje sigue con la foto recortada.
 */
function native(): CutoutModule | null {
  try {
    return requireOptionalNativeModule<CutoutModule>('ZarpaCutout');
  } catch {
    return null;
  }
}

export async function prepareCutout(): Promise<void> {
  await native()
    ?.prepare()
    .catch(() => false);
}

/**
 * Pegatina troquelada del animal: PNG con fondo transparente y borde blanco.
 * `focus` es el punto (0–1) donde estaba la retícula dentro de `inputUri`.
 */
export async function makeSticker(
  inputUri: string,
  outputPath: string,
  focus: { x: number; y: number },
): Promise<{ uri: string; width: number; height: number } | null> {
  const mod = native();
  if (!mod) return null;
  try {
    // Borde del 3 % del lado mayor: se ve como troquel en la miniatura del
    // álbum y no se come el animal en la vista grande.
    return await mod.makeSticker(inputUri, outputPath, focus.x, focus.y, 0.03);
  } catch {
    return null;
  }
}
