import { StyleSheet, View } from 'react-native';

import { space, usePalette } from '@/theme';

import { Txt } from './Txt';

/**
 * Si el catálogo o el cuaderno no se pueden abrir, la app no puede funcionar:
 * se dice claramente en vez de dejar una pantalla vacía.
 */
export function BootError({ error }: { error: Error }) {
  const palette = usePalette();
  return (
    <View style={[styles.wrap, { backgroundColor: palette.bg }]}>
      <Txt variant="title">No se pudo abrir el catálogo</Txt>
      <Txt variant="body" tone="soft">
        Cierra la app y vuelve a abrirla. Tus avistamientos no se han tocado: viven en una base aparte del
        catálogo.
      </Txt>
      <Txt variant="data" tone="faint">
        {error.message}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: space.xl, gap: space.md },
});
