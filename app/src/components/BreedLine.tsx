import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import type { BreedRow } from '@/db/catalog';
import { COUNTRY_NAME } from '@/lib/countries';
import { AUTHORITY_LABEL } from '@/lib/groups';
import { expandUrl } from '@/lib/urls';
import { radius, space, usePalette } from '@/theme';

import { Icon } from './Icon';
import { Press } from './Press';
import { Txt } from './Txt';

/** Países de una lista ISO separada por comas, con nombre en español. */
export function countryNames(list: string | null, max = 3): string | null {
  const ccs = (list ?? '').split(',').filter(Boolean);
  if (!ccs.length) return null;
  const names = ccs.slice(0, max).map((cc) => COUNTRY_NAME[cc] ?? cc);
  return ccs.length > max ? `${names.join(', ')} y ${ccs.length - max} más` : names.join(', ');
}

/** Lo esencial de una raza en una línea, según lo que publica su autoridad. */
export function breedSubline(b: BreedRow): string {
  const origin = countryNames(b.origin_cc) ?? b.origin_text;
  switch (b.authority) {
    case 'fci':
      return [b.grp?.split(' · ')[0], origin].filter(Boolean).join(' · ');
    case 'fife':
      return [b.code ? `EMS ${b.code}` : null, b.status].filter(Boolean).join(' · ');
    case 'mapa':
      return [origin, b.status].filter(Boolean).join(' · ');
    default:
      return [countryNames(b.countries), b.adapt, b.risk].filter(Boolean).join(' · ');
  }
}

export function BreedLine({ breed, onPress, showAuthority }: { breed: BreedRow; onPress: (id: string) => void; showAuthority?: boolean }) {
  const palette = usePalette();
  return (
    <Press
      onPress={() => onPress(breed.id)}
      accessibilityRole="button"
      style={[styles.row, { borderBottomColor: palette.line }]}>
      <View style={[styles.thumb, { backgroundColor: palette.surfaceAlt }]}>
        {breed.img ? (
          <Image source={expandUrl(breed.img)?.replace('/960px-', '/330px-')} style={styles.thumbImg} contentFit="cover" transition={150} />
        ) : (
          <Txt variant="data" tone="faint">
            {AUTHORITY_LABEL[breed.authority].split(' ')[0]}
          </Txt>
        )}
      </View>
      <View style={styles.text}>
        <Txt variant="subheading" upper numberOfLines={2}>
          {breed.name}
        </Txt>
        <Txt variant="small" tone="soft" numberOfLines={2}>
          {breedSubline(breed)}
        </Txt>
        {showAuthority ? (
          <Txt variant="data" tone="faint">
            {AUTHORITY_LABEL[breed.authority]}
          </Txt>
        ) : null}
      </View>
      <Icon name="chevronRight" size={18} color={palette.inkFaint} />
    </Press>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  thumb: { width: 56, height: 56, borderRadius: radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  thumbImg: { width: 56, height: 56 },
  text: { flex: 1, gap: 2 },
});
