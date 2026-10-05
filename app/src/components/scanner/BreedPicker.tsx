import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import type { BreedGuess } from '@/ai/engine';
import { breedTotals, countBreeds, getBreedsByRids, listBreeds, type BreedRow } from '@/db/catalog';
import { fmt1 } from '@/lib/format';
import { radius, space, type, usePalette } from '@/theme';

import { breedSubline } from '../BreedLine';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { Txt } from '../Txt';

type Props = {
  speciesId: number;
  /** País del avistamiento: sus razas salen primero. */
  cc: string | null;
  value: BreedRow | null;
  onChange: (b: BreedRow | null) => void;
  /** Sugerencias de la IA para esta especie (vacío si no reconoce razas). */
  guesses: BreedGuess[];
  /** La sugerencia que supera el umbral calibrado (acierta ≥95 %), si alguna. */
  sureRid: number | null;
};

/**
 * Raza del animal avistado, si la especie tiene razas reconocidas. Es lo que
 * dice el usuario, no la IA: se guarda tal cual y la ficha lo indica.
 */
export function BreedPicker({ speciesId, cc, value, onChange, guesses, sureRid }: Props) {
  const palette = usePalette();
  const [total, setTotal] = useState<{ id: number; n: number }>({ id: 0, n: 0 });
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<{ key: string; list: BreedRow[] }>({ key: '', list: [] });
  const [suggested, setSuggested] = useState<{ key: string; list: (BreedRow & { rid: number; p: number })[] }>({
    key: '',
    list: [],
  });
  const guessKey = guesses.map((g) => g.rid).join(',');

  useEffect(() => {
    let alive = true;
    getBreedsByRids(guesses.map((g) => g.rid)).then((list) => {
      if (!alive) return;
      const p = new Map(guesses.map((g) => [g.rid, g.p]));
      setSuggested({ key: guessKey, list: list.map((b) => ({ ...b, p: p.get(b.rid) ?? 0 })) });
    });
    return () => {
      alive = false;
    };
    // `guesses` entra a través de `guessKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guessKey]);
  // Solo se enseña la raza que la IA afirma con la seguridad calibrada (acierta
  // ≥95 %). Con BioCLIP eso pasa en pocas fotos (acierta la raza a la primera
  // un 31 % de las veces): sugerir por debajo metería errores en el cuaderno.
  const suggestions = suggested.key === guessKey ? suggested.list.filter((b) => b.rid === sureRid) : [];

  useEffect(() => {
    breedTotals(speciesId).then((t) => setTotal({ id: speciesId, n: Object.values(t).reduce((a, b) => a + (b ?? 0), 0) }));
  }, [speciesId]);

  const key = `${speciesId}|${q}|${cc ?? ''}`;
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const t = setTimeout(async () => {
      // Con el buscador vacío, primero las razas del país donde estás.
      const local = !q.trim() && cc && (await countBreeds(speciesId, { cc })) > 0;
      const list = await listBreeds(speciesId, { q, cc: local ? cc : null }, 8, 0);
      if (alive) setRows({ key, list });
    }, 160);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [open, key, q, cc, speciesId]);

  if (total.id !== speciesId || total.n === 0) return null;

  if (value && !open) {
    return (
      <View style={[styles.box, { borderColor: 'rgba(255,255,255,0.16)' }]}>
        <View style={styles.fill}>
          <Txt variant="label" tone="onStrongSoft">
            Raza
          </Txt>
          <Txt variant="subheading" tone="onStrong" upper>
            {value.name}
          </Txt>
        </View>
        <Press onPress={() => onChange(null)} accessibilityLabel="Quitar la raza" style={styles.iconBtn}>
          <Icon name="close" size={18} color={palette.onStrong} />
        </Press>
      </View>
    );
  }

  if (!open && suggestions.length > 0) {
    return (
      <View style={styles.picker}>
        <Txt variant="label" tone="onStrongSoft">
          La IA reconoce la raza: con esta seguridad acertó al menos 19 de cada 20 veces en las pruebas. Confírmala tú.
        </Txt>
        {suggestions.map((b) => (
          <Press
            key={b.id}
            onPress={() => onChange(b)}
            style={[
              styles.option,
              styles.suggestion,
              { borderColor: b.rid === sureRid ? palette.brand : 'rgba(255,255,255,0.16)' },
            ]}>
            <View style={styles.fill}>
              <Txt variant="subheading" tone="onStrong" upper numberOfLines={1}>
                {b.name}
              </Txt>
              <Txt variant="small" tone="onStrongSoft" numberOfLines={1}>
                {breedSubline(b)}
              </Txt>
            </View>
            <Txt variant="data" tone="onStrongSoft">
              {fmt1(b.p * 100)} %
            </Txt>
          </Press>
        ))}
        <Press onPress={() => setOpen(true)} style={styles.link}>
          <Icon name="search" size={18} color={palette.onStrong} />
          <Txt variant="bodyStrong" tone="onStrong">
            Es otra raza
          </Txt>
        </Press>
      </View>
    );
  }

  if (!open) {
    return (
      <Press onPress={() => setOpen(true)} style={styles.link}>
        <Icon name="plus" size={18} color={palette.onStrong} />
        <Txt variant="bodyStrong" tone="onStrong">
          Añadir la raza (opcional)
        </Txt>
      </Press>
    );
  }

  return (
    <View style={styles.picker}>
      <View style={[styles.search, { backgroundColor: palette.surface }]}>
        <Icon name="search" size={20} color={palette.inkFaint} />
        <TextInput
          autoFocus
          value={q}
          onChangeText={setQ}
          placeholder="Busca la raza"
          placeholderTextColor={palette.inkFaint}
          style={[type.body, styles.input, { color: palette.ink }]}
          autoCorrect={false}
        />
        <Press onPress={() => setOpen(false)} accessibilityLabel="Cerrar" hitSlop={10}>
          <Icon name="close" size={18} color={palette.inkSoft} />
        </Press>
      </View>
      {(rows.key === key ? rows.list : []).map((b) => (
        <Press
          key={b.id}
          onPress={() => {
            onChange(b);
            setOpen(false);
          }}
          style={[styles.option, { borderColor: 'rgba(255,255,255,0.16)' }]}>
          <Txt variant="subheading" tone="onStrong" upper numberOfLines={1}>
            {b.name}
          </Txt>
          <Txt variant="small" tone="onStrongSoft" numberOfLines={1}>
            {breedSubline(b)}
          </Txt>
        </Press>
      ))}
      <Txt variant="small" tone="onStrongSoft">
        Solo razas reconocidas oficialmente. Si no la sabes, déjalo vacío.
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  box: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1.5 },
  iconBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  link: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md },
  picker: { marginTop: space.md, gap: space.sm },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 48, paddingHorizontal: space.md, borderRadius: radius.md },
  input: { flex: 1, paddingVertical: 0 },
  option: { borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, gap: 2 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
