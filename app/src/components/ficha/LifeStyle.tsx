import { StyleSheet, View } from 'react-native';

import { DIETS, DOMESTIC_LABEL, ENVS, MEDIUM } from '@/lib/groups';
import { radius, space, usePalette, type GroupColor } from '@/theme';

import { Appear } from '../motion/Appear';
import { Icon, type IconName } from '../Icon';
import { Txt } from '../Txt';
import { Tag } from './Tag';

type Props = {
  medium: number;
  envs: number;
  diet: string | null;
  dietDetail: string | null;
  repro: string | null;
  activity: string | null;
  migration: string | null;
  domestic: number;
  group: GroupColor;
};

const ENV_ICON: Record<string, IconName> = {
  Ciudad: 'pin',
  Granja: 'leaf',
  'Selva tropical': 'tree',
  Bosque: 'tree',
  Matorral: 'leaf',
  'Praderas y sabanas': 'leaf',
  Humedales: 'drop',
  Ríos: 'drop',
  Costa: 'wave',
  Mar: 'wave',
  'Roquedos y cantiles': 'mountain',
  Desierto: 'sun',
  'Zonas humanizadas': 'pin',
};

/** Qué come, representado por lo que come (planta, insecto, pez…). */
function dietIcon(diet: string): IconName {
  switch (diet) {
    case 'Herbívoro':
    case 'Frugívoro':
    case 'Granívoro':
    case 'Nectarívoro':
      return 'leaf';
    case 'Invertívoro':
      return 'insecto';
    case 'Piscívoro':
    case 'Depredador acuático':
      return 'pez';
    case 'Carnívoro':
      return 'mamifero';
    case 'Carroñero':
      return 'eye';
    default:
      return 'sparkle';
  }
}

function reproIcon(repro: string): IconName {
  return repro.startsWith('Viv') ? 'heart' : 'egg';
}

function activityIcon(activity: string): IconName {
  return activity.startsWith('Nocturno') ? 'moon' : 'sun';
}

/** Medio en el que vive: una baldosa por medio, con su color. */
function MediumTile({ label, bit, index }: { label: string; bit: number; index: number }) {
  const palette = usePalette();
  const look =
    bit === 1
      ? { icon: 'mountain' as IconName, color: palette.leaf, tint: palette.leafTint }
      : bit === 2
        ? { icon: 'drop' as IconName, color: palette.sky, tint: palette.skyTint }
        : bit === 4
          ? { icon: 'wave' as IconName, color: palette.sky, tint: palette.skyTint }
          : { icon: 'drop' as IconName, color: palette.brandInk, tint: palette.brandTint };
  return (
    <Appear index={index} from="scale" style={styles.mediumWrap}>
      <View style={[styles.medium, { backgroundColor: look.tint }]} accessible accessibilityLabel={label}>
        <Icon name={look.icon} size={28} color={look.color} />
        <Txt variant="label" color={palette.ink} align="center">
          {label}
        </Txt>
      </View>
    </Appear>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Txt variant="small" tone="soft">
        {label}
      </Txt>
      <View style={styles.tags}>{children}</View>
    </View>
  );
}

/**
 * «Cómo vive» en imágenes: medio (tierra, agua, mar), ambientes, dieta,
 * reproducción, actividad y migración como etiquetas con icono. Lo que no
 * está en el catálogo no se pinta.
 */
export function LifeStyle({ medium, envs, diet, dietDetail, repro, activity, migration, domestic, group }: Props) {
  const palette = usePalette();
  const media = MEDIUM.filter((m) => (medium & m.bit) !== 0);
  const envList = ENVS.filter((e) => (envs & e.bit) !== 0);
  const dietHint = DIETS.find((d) => d.label === diet)?.hint;
  const detail = [dietHint, dietDetail ? `Según EltonTraits: ${dietDetail}.` : null].filter(Boolean).join('. ');

  return (
    <View style={styles.wrap}>
      {media.length > 0 && (
        <View style={styles.mediumRow}>
          {media.map((m, i) => (
            <MediumTile key={m.bit} label={m.label} bit={m.bit} index={i} />
          ))}
        </View>
      )}
      {domestic > 0 && (
        <Row label="Tipo">
          <Tag label={DOMESTIC_LABEL[domestic]} icon="heart" color={group.color} tint={group.tint} ink={group.ink} />
        </Row>
      )}
      {envList.length > 0 && (
        <Row label="Ambientes">
          {envList.map((e) => (
            <Tag key={e.bit} label={e.label} icon={ENV_ICON[e.label] ?? 'leaf'} color={group.color} tint={group.tint} ink={group.ink} />
          ))}
        </Row>
      )}
      {diet ? (
        <Row label="Alimentación">
          <Tag label={diet} icon={dietIcon(diet)} color={group.color} tint={group.tint} ink={group.ink} />
        </Row>
      ) : null}
      {detail ? (
        <Txt variant="small" tone="soft">
          {detail}
        </Txt>
      ) : null}
      {repro ? (
        <Row label="Reproducción">
          <Tag label={repro} icon={reproIcon(repro)} color={group.color} tint={group.tint} ink={group.ink} />
        </Row>
      ) : null}
      {activity ? (
        <Row label="Actividad">
          <Tag label={activity} icon={activityIcon(activity)} color={palette.brandInk} tint={palette.brandTint} />
        </Row>
      ) : null}
      {migration ? (
        <Row label="Migración">
          <Tag label={migration} icon={migration === 'Sedentaria' ? 'pin' : 'locate'} color={palette.sky} tint={palette.skyTint} />
        </Row>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  mediumRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  mediumWrap: { flexGrow: 1, flexBasis: 96, maxWidth: 160 },
  medium: { alignItems: 'center', gap: space.xs + 2, paddingVertical: space.md, paddingHorizontal: space.sm, borderRadius: radius.lg },
  row: { gap: space.xs + 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
