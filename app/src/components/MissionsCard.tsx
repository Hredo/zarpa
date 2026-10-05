import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useMissions } from '@/lib/useMissions';
import { space, usePalette } from '@/theme';

import { Card } from './Card';
import { Icon } from './Icon';
import { MissionRow } from './MissionRow';
import { Txt } from './Txt';

/**
 * Tarjeta de Inicio con los tres retos de la semana y su avance. Pulsarla abre
 * la pantalla de misiones (con los retos de temporada).
 *
 * API: `<MissionsCard />`. Sin props; lee el cuaderno, el catálogo y la ubicación.
 */
export function MissionsCard() {
  const palette = usePalette();
  const { weekly, completed, total, loading } = useMissions();
  const weeklyDone = weekly.filter((m) => m.progress.done).length;

  return (
    <Card accessibilityLabel={`Retos de la semana: ${weeklyDone} de ${weekly.length} cumplidos. Abrir`} onPress={() => router.push('/misiones')}>
      <View style={styles.head}>
        <Txt variant="subheading" style={styles.flex}>
          Retos de la semana
        </Txt>
        <Txt variant="label" tone="soft">
          {loading ? '' : `${completed} de ${total}`}
        </Txt>
        <Icon name="chevronRight" size={20} color={palette.inkFaint} />
      </View>
      <View style={styles.list}>
        {weekly.map((m) => (
          <MissionRow key={m.id} mission={m} compact />
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
  list: { gap: space.lg, marginTop: space.lg },
});
