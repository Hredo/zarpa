import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { speciesAnatomy } from '@/lib/anatomyRemote';
import type { CommonsMedia } from '@/lib/commons';
import { radius, space, usePalette, type GroupColor } from '@/theme';

import { FadeImage } from '../motion/FadeImage';
import { Press } from '../Press';
import { Txt } from '../Txt';
import { PlateViewer } from './PlateViewer';

/**
 * Láminas anatómicas de una especie, de libros y artículos (ver lib/anatomy.ts).
 * `undefined` mientras carga, `null` si no se pudo consultar.
 */
export function usePlates(sci: string | null | undefined, qid: string | null | undefined): CommonsMedia[] | null | undefined {
  const [state, setState] = useState<{ key: string; plates: CommonsMedia[] | null } | undefined>(undefined);
  const key = `${sci ?? ''}|${qid ?? ''}`;
  useEffect(() => {
    if (!sci) return;
    let alive = true;
    speciesAnatomy(sci, qid ?? null).then((p) => {
      if (alive) setState({ key, plates: p });
    });
    return () => {
      alive = false;
    };
  }, [sci, qid, key]);
  return state?.key === key ? state.plates : undefined;
}

/** «Libro · 1890» / «Artículo · 2012». */
export function plateLabel(m: CommonsMedia): string {
  const kind = m.kind === 'articulo' ? 'Artículo' : 'Libro';
  return m.year ? `${kind} · ${m.year}` : kind;
}

/**
 * «Láminas anatómicas» de la ficha: una fila de láminas grandes, cada una con
 * su origen (libro o artículo, año y obra). Se abren a pantalla completa con
 * zoom, el pie de figura y la licencia.
 *
 * API: `<PlatesSection plates={lista} group={g} />`.
 */
export function PlatesSection({ plates, group }: { plates: readonly CommonsMedia[]; group: GroupColor }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <View style={styles.gap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {plates.map((m, i) => (
          <View key={m.title} style={styles.card}>
            <Thumb item={m} size={176} tint={group.tint} onPress={() => setOpen(i)} />
            <Txt variant="label" color={group.ink}>
              {plateLabel(m)}
            </Txt>
            {m.source ? (
              <Txt variant="small" tone="soft" numberOfLines={2}>
                {m.source}
              </Txt>
            ) : null}
          </View>
        ))}
      </ScrollView>
      <Txt variant="small" tone="faint">
        Láminas de libros escaneados (Biodiversity Heritage Library y otras bibliotecas, vía Wikimedia Commons) y figuras de artículos científicos
        (Biodiversity Literature Repository). Toca una para ver el pie, la obra y la licencia.
      </Txt>
      <PlateViewer items={plates} index={open} onIndex={setOpen} onClose={() => setOpen(null)} title="Láminas" />
    </View>
  );
}

/** Miniatura sobre fondo blanco (las láminas antiguas tienen fondo de papel). */
export function Thumb({ item, size, tint, onPress }: { item: CommonsMedia; size: number; tint: string; onPress: () => void }) {
  const palette = usePalette();
  return (
    <Press
      onPress={onPress}
      accessibilityRole="imagebutton"
      accessibilityLabel={`Ver en grande: ${item.caption ?? item.source ?? item.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '')}`}
      style={[styles.thumb, { width: size, height: size, borderColor: palette.line, backgroundColor: '#FFFFFF' }]}>
      <FadeImage source={item.thumb} style={styles.fillImg} contentFit="contain" placeholderColor={tint} />
    </Press>
  );
}

/**
 * Columna compacta para «Comparar»: la primera lámina grande y el resto en
 * miniaturas; todas se abren a pantalla completa.
 */
export function PlateColumn({ items, width, tint, title, empty }: { items: readonly CommonsMedia[]; width: number; tint: string; title: string; empty: string }) {
  const palette = usePalette();
  const [i, setI] = useState<number | null>(null);
  if (items.length === 0) {
    return (
      <View style={[styles.empty, { width, borderColor: palette.lineStrong }]}>
        <Txt variant="small" tone="faint" align="center">
          {empty}
        </Txt>
      </View>
    );
  }
  const small = Math.floor((width - space.xs * 2) / 3);
  return (
    <View style={styles.gapSm}>
      <Thumb item={items[0]} size={width} tint={tint} onPress={() => setI(0)} />
      <Txt variant="small" tone="soft" numberOfLines={1}>
        {plateLabel(items[0])}
      </Txt>
      {items.length > 1 ? (
        <View style={styles.wrap}>
          {items.slice(1, 4).map((m, k) => (
            <Thumb key={m.title} item={m} size={small} tint={tint} onPress={() => setI(k + 1)} />
          ))}
        </View>
      ) : null}
      {items.length > 4 ? (
        <Press onPress={() => setI(4)} accessibilityRole="button" style={styles.more}>
          <Txt variant="label" tone="soft">
            Ver las {items.length}
          </Txt>
        </Press>
      ) : null}
      <PlateViewer items={items} index={i} onIndex={setI} onClose={() => setI(null)} title={title} />
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.lg },
  gapSm: { gap: space.sm },
  row: { gap: space.md, paddingRight: space.lg },
  card: { width: 176, gap: space.xs },
  thumb: { borderRadius: radius.md, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  fillImg: { width: '100%', height: '100%' },
  wrap: { flexDirection: 'row', gap: space.xs },
  more: { minHeight: 40, justifyContent: 'center' },
  empty: { minHeight: 96, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', padding: space.sm },
});
