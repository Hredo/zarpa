import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { closestToNext } from '@/lib/achievements';
import { useAchievements } from '@/lib/useAchievements';
import { space, usePalette } from '@/theme';

import { Card } from './Card';
import { Icon } from './Icon';
import { Medal } from './Medal';
import { Txt } from './Txt';

/**
 * Tira compacta de medallas para el perfil: las mejores ganadas (o, si aún hay
 * pocas, las que están más cerca de caer) y el recuento. Pulsarla abre la
 * pantalla de logros.
 *
 * API: `<AchievementsStrip />`. Sin props; lee el cuaderno y el catálogo.
 */
export function AchievementsStrip() {
  const palette = usePalette();
  const { ranked, states, unlocked, total, loading } = useAchievements();
  const won = ranked.filter((s) => s.tier > 0).slice(0, 8);
  const shown = won.length >= 4 ? won : [...won, ...closestToNext(states.filter((s) => s.tier === 0), 4 - won.length)];

  return (
    <Card accessibilityLabel={`Logros: ${unlocked} de ${total} medallas. Abrir`} onPress={() => router.push('/logros')}>
      <View style={styles.head}>
        <Txt variant="subheading" style={styles.flex}>
          Logros
        </Txt>
        <Txt variant="label" tone="soft">
          {loading ? '' : `${unlocked} de ${total}`}
        </Txt>
        <Icon name="chevronRight" size={20} color={palette.inkFaint} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroll}>
        {shown.map((s) => (
          <View key={s.def.id} style={styles.item} accessible accessibilityLabel={`${s.def.title}${s.tier ? '' : ', bloqueada'}`}>
            <Medal def={s.def} tier={s.tier} size={60} />
            <Txt variant="small" tone={s.tier ? 'ink' : 'faint'} align="center" numberOfLines={1}>
              {s.def.title}
            </Txt>
          </View>
        ))}
      </ScrollView>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
  scroll: { marginHorizontal: -space.xs, marginTop: space.md },
  row: { gap: space.md, paddingHorizontal: space.xs },
  item: { width: 76, alignItems: 'center', gap: space.xs },
});
