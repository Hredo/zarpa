import { StyleSheet, View } from 'react-native';

import { fmtMegabytes } from '@/db/catalogRemote';
import { HIT, radius, space, usePalette } from '@/theme';

import { Logo } from './Logo';
import { Meter } from './Meter';
import { Press } from './Press';
import { Txt } from './Txt';

export type BootState =
  | { phase: 'opening' }
  | { phase: 'downloading' | 'verifying'; progress: number; total: number }
  | { phase: 'offline' }
  | { phase: 'error'; message: string };

/**
 * Primer arranque: el catálogo vive en el servidor y el móvil baja una vez su
 * índice (lo que hace falta para buscar y filtrar). Se enseña el progreso y,
 * sin red o si algo falla, se explica y se ofrece reintentar. El cuaderno no
 * se toca en ningún caso.
 */
export function CatalogDownload({ state, onRetry }: { state: BootState; onRetry: () => void }) {
  const palette = usePalette();
  const busy = state.phase === 'downloading' || state.phase === 'verifying' || state.phase === 'opening';
  return (
    <View style={[styles.wrap, { backgroundColor: palette.bg }]}>
      <Logo variant="mark" size={72} />
      {busy ? (
        <>
          <Txt variant="title">Preparando el catálogo</Txt>
          <Txt variant="body" tone="soft">
            Zarpa baja una sola vez el índice de las especies del mundo para buscar y filtrar sin esperas. Cada ficha completa se baja al abrirla.
          </Txt>
          {state.phase === 'downloading' || state.phase === 'verifying' ? (
            <View style={styles.meter} accessibilityLiveRegion="polite">
              <Meter value={state.progress} color={palette.leaf} height={10} />
              <Txt variant="small" tone="soft">
                {state.phase === 'verifying'
                  ? 'Comprobando la descarga…'
                  : `${Math.round(state.progress * 100)} % · ${fmtMegabytes(state.total)} en total`}
              </Txt>
            </View>
          ) : null}
        </>
      ) : (
        <>
          <Txt variant="title">{state.phase === 'offline' ? 'Hace falta conexión' : 'No se pudo preparar el catálogo'}</Txt>
          <Txt variant="body" tone="soft">
            {state.phase === 'offline'
              ? 'La primera vez, Zarpa necesita internet para bajar el catálogo de especies (unos 19 MB). Conéctate a una red y vuelve a intentarlo.'
              : 'Vuelve a intentarlo en un momento. Tus avistamientos no se han tocado: viven en una base aparte del catálogo.'}
          </Txt>
          {state.phase === 'error' ? (
            <Txt variant="data" tone="faint">
              {state.message}
            </Txt>
          ) : null}
          <Press onPress={onRetry} accessibilityRole="button" style={[styles.btn, { backgroundColor: palette.strong }]}>
            <Txt variant="bodyStrong" tone="onStrong">
              Reintentar
            </Txt>
          </Press>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: space.xl, gap: space.md },
  meter: { gap: space.sm, marginTop: space.md },
  btn: { alignSelf: 'flex-start', height: HIT, paddingHorizontal: space.xl, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: space.md },
});
