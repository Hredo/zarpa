import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { CommonsMedia, Plates } from '@/lib/commons';
import { speciesPlates } from '@/lib/commonsRemote';
import { radius, space, usePalette, type GroupColor } from '@/theme';

import { Icon } from '../Icon';
import { FadeImage } from '../motion/FadeImage';
import { Press } from '../Press';
import { Txt } from '../Txt';
import { PlateViewer } from './PlateViewer';

/**
 * Huellas y láminas de una especie desde Wikimedia Commons (ver lib/commons.ts).
 * `undefined` mientras carga, `null` sin red ni copia guardada.
 */
export function usePlates(sci: string | null | undefined, qid: string | null | undefined): Plates | null | undefined {
  const [state, setState] = useState<{ key: string; plates: Plates | null } | undefined>(undefined);
  const key = `${sci ?? ''}|${qid ?? ''}`;
  useEffect(() => {
    if (!sci) return;
    let alive = true;
    speciesPlates(sci, qid ?? null).then((p) => {
      if (alive) setState({ key, plates: p });
    });
    return () => {
      alive = false;
    };
  }, [sci, qid, key]);
  return state?.key === key ? state.plates : undefined;
}

type Open = { list: 'tracks' | 'drawings'; i: number } | null;

/**
 * «Huellas y láminas» de la ficha: una fila de huellas y otra de dibujos
 * anatómicos y láminas, que se abren a pantalla completa con zoom.
 *
 * API: `<PlatesSection plates={plates} group={g} />` (no pinta nada si no hay ninguna).
 */
export function PlatesSection({ plates, group }: { plates: Plates; group: GroupColor }) {
  const [open, setOpen] = useState<Open>(null);
  const list = open ? plates[open.list] : [];
  return (
    <View style={styles.gap}>
      {plates.tracks.length > 0 ? (
        <Strip title="Huellas" icon="rastro" items={plates.tracks} group={group} onOpen={(i) => setOpen({ list: 'tracks', i })} />
      ) : null}
      {plates.drawings.length > 0 ? (
        <Strip title="Láminas y anatomía" icon="image" items={plates.drawings} group={group} onOpen={(i) => setOpen({ list: 'drawings', i })} />
      ) : null}
      <CommonsNote />
      <PlateViewer
        items={list}
        index={open?.i ?? null}
        onIndex={(i) => setOpen((o) => (o ? { ...o, i } : o))}
        onClose={() => setOpen(null)}
        title={open?.list === 'tracks' ? 'Huellas' : 'Láminas'}
      />
    </View>
  );
}

function Strip({
  title,
  icon,
  items,
  group,
  onOpen,
}: {
  title: string;
  icon: 'rastro' | 'image';
  items: readonly CommonsMedia[];
  group: GroupColor;
  onOpen: (i: number) => void;
}) {
  return (
    <View style={styles.gapSm}>
      <View style={styles.stripHead}>
        <Icon name={icon} size={18} color={group.ink} />
        <Txt variant="subheading" color={group.ink}>
          {title}
        </Txt>
        <Txt variant="data" tone="faint">
          {items.length}
        </Txt>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {items.map((m, i) => (
          <Thumb key={m.title} item={m} size={132} tint={group.tint} onPress={() => onOpen(i)} />
        ))}
      </ScrollView>
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
      accessibilityLabel={`Ver en grande: ${item.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '')}`}
      style={[styles.thumb, { width: size, height: size, borderColor: palette.line, backgroundColor: '#FFFFFF' }]}>
      <FadeImage source={item.thumb} style={styles.fillImg} contentFit={item.drawing ? 'contain' : 'cover'} placeholderColor={tint} />
    </Press>
  );
}

function CommonsNote() {
  return (
    <Txt variant="small" tone="faint">
      De Wikimedia Commons, clasificadas por su comunidad. Toca una para ver autor, licencia y detalles.
    </Txt>
  );
}

/**
 * Columna compacta para «Comparar»: la primera imagen grande y el resto en
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
  stripHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  row: { gap: space.sm, paddingRight: space.lg },
  thumb: { borderRadius: radius.md, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  fillImg: { width: '100%', height: '100%' },
  wrap: { flexDirection: 'row', gap: space.xs },
  more: { minHeight: 40, justifyContent: 'center' },
  empty: { minHeight: 96, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', padding: space.sm },
});
