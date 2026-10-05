import { useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fmtInt } from '@/lib/format';
import { resolveAccountSwitch, useSync, type AccountSwitchChoice } from '@/sync';
import { elevation, HIT, radius, space, usePalette } from '@/theme';

import { Icon } from './Icon';
import { Press } from './Press';
import { Txt } from './Txt';

const plural = (n: number, one: string, many: string) => `${fmtInt(n)} ${n === 1 ? one : many}`;

/**
 * Hoja que aparece cuando entra en este móvil una cuenta distinta de la dueña
 * del cuaderno. Mientras no se decide, la sincronización está en pausa: nada se
 * mezcla en silencio. Va una vez en el layout raíz.
 */
export function AccountSwitchSheet() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const conflict = useSync((s) => s.conflict);
  const [busy, setBusy] = useState<AccountSwitchChoice | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);

  if (!conflict) return null;

  const choose = async (choice: AccountSwitchChoice) => {
    if (busy) return;
    setBusy(choice);
    try {
      await resolveAccountSwitch(choice);
    } finally {
      setBusy(null);
      setConfirmReplace(false);
    }
  };

  const losing = conflict.unsynced;

  return (
    <Modal transparent animationType="fade" statusBarTranslucent onRequestClose={() => void choose('cancel')}>
      <View style={[styles.scrim, { backgroundColor: palette.scrim }]}>
        <View style={[styles.sheet, { backgroundColor: palette.surface, paddingBottom: insets.bottom + space.lg }, elevation.raised]}>
          <View style={[styles.badge, { backgroundColor: palette.brandTint }]}>
            <Icon name="cuaderno" size={28} color={palette.brandInk} />
          </View>
          <Txt variant="title" accessibilityRole="header">
            Este cuaderno es de otra cuenta
          </Txt>
          <Txt variant="body" tone="soft" style={styles.gap}>
            En este móvil hay {plural(conflict.count, 'avistamiento', 'avistamientos')} de la cuenta que se usó antes. ¿Qué hacemos con ellos?
          </Txt>

          {confirmReplace ? (
            <View style={[styles.warn, { backgroundColor: palette.redTint }]}>
              <Txt variant="bodyStrong" tone="danger">
                {losing > 0
                  ? `${plural(losing, 'avistamiento no está', 'avistamientos no están')} en la nube de la otra cuenta y se perderán.`
                  : 'Se borrarán de este móvil. Siguen a salvo en la nube de la otra cuenta.'}
              </Txt>
              <View style={styles.row}>
                <Press
                  onPress={() => setConfirmReplace(false)}
                  disabled={busy != null}
                  accessibilityRole="button"
                  style={[styles.btn, styles.half, { backgroundColor: palette.surface }]}>
                  <Txt variant="bodyStrong">Volver</Txt>
                </Press>
                <Press
                  onPress={() => void choose('replace')}
                  disabled={busy != null}
                  haptic
                  accessibilityRole="button"
                  style={[styles.btn, styles.half, { backgroundColor: palette.danger }]}>
                  <Txt variant="bodyStrong" tone="onStrong">
                    {busy === 'replace' ? 'Cambiando…' : 'Sí, cambiar'}
                  </Txt>
                </Press>
              </View>
            </View>
          ) : (
            <View style={styles.options}>
              <Option
                icon="cloud"
                title="Pasarlos a esta cuenta"
                body="Se suman a tu álbum y se guardan en tu nube."
                onPress={() => void choose('merge')}
                busy={busy === 'merge'}
                disabled={busy != null}
                primary
              />
              <Option
                icon="flip"
                title="Empezar con mi cuaderno"
                body="Se quitan de este móvil y se baja el cuaderno de esta cuenta."
                onPress={() => setConfirmReplace(true)}
                disabled={busy != null}
              />
              <Option
                icon="close"
                title="Cancelar y cerrar sesión"
                body="Todo queda como estaba."
                onPress={() => void choose('cancel')}
                busy={busy === 'cancel'}
                disabled={busy != null}
              />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Option({
  icon,
  title,
  body,
  onPress,
  busy,
  disabled,
  primary,
}: {
  icon: 'cloud' | 'flip' | 'close';
  title: string;
  body: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  primary?: boolean;
}) {
  const palette = usePalette();
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      style={[styles.option, { backgroundColor: primary ? palette.brand : palette.surfaceAlt }]}>
      <Icon name={icon} size={22} color={primary ? palette.onBrand : palette.inkSoft} />
      <View style={styles.fill}>
        <Txt variant="bodyStrong" tone={primary ? 'onBrand' : 'ink'}>
          {busy ? 'Un momento…' : title}
        </Txt>
        <Txt variant="small" tone={primary ? 'onBrand' : 'soft'}>
          {body}
        </Txt>
      </View>
    </Press>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.xl, gap: space.xs },
  badge: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: space.md },
  gap: { marginTop: space.xs },
  options: { gap: space.sm, marginTop: space.lg },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, minHeight: HIT },
  fill: { flex: 1 },
  warn: { marginTop: space.lg, padding: space.lg, borderRadius: radius.lg, gap: space.md },
  row: { flexDirection: 'row', gap: space.sm },
  btn: { minHeight: HIT, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  half: { flex: 1 },
});
