import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountButtons } from '@/components/AccountButtons';
import { AchievementsStrip } from '@/components/AchievementsStrip';
import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { Appear } from '@/components/motion';
import { Press } from '@/components/Press';
import { Section } from '@/components/Section';
import { StatTile } from '@/components/StatTile';
import { Txt } from '@/components/Txt';
import { Meter } from '@/components/Meter';
import { catalogInfo, journal } from '@/db';
import { fmtMegabytes } from '@/db/catalogCloud';
import { catalogUpdatesEnabled, checkCatalogUpdate, useCatalogUpdate } from '@/db/catalogUpdate';
import { getSpeciesByIds } from '@/db/catalog';
import { fmtAgo, fmtDate, fmtInt } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { useJournal } from '@/store/journal';
import { useSettings } from '@/store/settings';
import { signOutWith, syncNow, useSync, type SyncPhase } from '@/sync';
import { HIT, radius, space, usePalette } from '@/theme';

const SYNC_TEXT: Record<SyncPhase, string> = {
  off: 'Sin cuenta, sin copia en la nube',
  idle: 'Al día',
  syncing: 'Sincronizando…',
  offline: 'Sin conexión: se copiará al volver la red',
  error: 'Hubo un problema: se reintentará sola',
  blocked: 'En pausa: este móvil tiene el cuaderno de otra cuenta',
};

const CATALOG_TEXT = {
  idle: '',
  checking: 'Buscando actualizaciones…',
  uptodate: 'Tienes la versión más reciente',
  available: 'Hay una versión nueva',
  downloading: 'Descargando la versión nueva…',
  verifying: 'Comprobando la descarga…',
  ready: 'Lista: se usará la próxima vez que abras Zarpa',
  offline: 'Sin conexión: se buscará más tarde',
  error: 'No se pudo actualizar',
} as const;

function CatalogSection() {
  const palette = usePalette();
  const info = catalogInfo();
  const { phase, progress, remote, error } = useCatalogUpdate();
  const busy = phase === 'checking' || phase === 'downloading' || phase === 'verifying';
  const action = phase === 'available' && remote ? `Descargar (${fmtMegabytes(remote.files.gz.size)})` : 'Buscar actualización';
  return (
    <Section title="Catálogo de especies" icon="bestiario" accent={palette.leaf} tint={palette.leafTint}>
      <Card tone="outline">
        <Txt variant="bodyStrong">{fmtInt(info.species)} especies de todo el mundo</Txt>
        <Txt variant="small" tone="soft">
          {`Datos del ${fmtDate(info.built_at)} · ${info.source === 'nube' ? 'actualizado desde la nube' : 'incluido en la app'}`}
        </Txt>
        {catalogUpdatesEnabled ? (
          <>
            {phase !== 'idle' ? (
              <Txt variant="small" tone={phase === 'error' ? 'danger' : phase === 'ready' ? 'brand' : 'soft'} style={styles.gap} accessibilityLiveRegion="polite">
                {phase === 'error' && error ? error : CATALOG_TEXT[phase]}
              </Txt>
            ) : null}
            {phase === 'downloading' ? <Meter value={progress} color={palette.leaf} height={8} style={styles.gap} /> : null}
            {phase !== 'ready' ? (
              <Press
                disabled={busy}
                onPress={() => void checkCatalogUpdate({ force: true })}
                accessibilityRole="button"
                accessibilityLabel={action}
                style={[styles.pill, styles.gapLg, { backgroundColor: palette.strongTint }]}>
                <Txt variant="bodyStrong">{action}</Txt>
              </Press>
            ) : null}
            {phase === 'available' ? (
              <Txt variant="small" tone="faint" style={styles.gap}>
                Sin wifi no se descarga sola para no gastar tus datos.
              </Txt>
            ) : null}
          </>
        ) : null}
      </Card>
    </Section>
  );
}

function useNotebookStats() {
  const caught = useJournal((s) => s.caught);
  const [stats, setStats] = useState({ species: 0, sightings: 0, groups: 0 });
  useEffect(() => {
    let live = true;
    (async () => {
      const ids = [...caught.keys()];
      const row = await journal().getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM sighting');
      const rows = ids.length ? await getSpeciesByIds(ids) : [];
      if (live) setStats({ species: ids.length, sightings: row?.n ?? 0, groups: new Set(rows.map((r) => r.grp)).size });
    })().catch(() => {});
    return () => {
      live = false;
    };
  }, [caught]);
  return stats;
}

/**
 * Perfil: cuenta (opcional), estadísticas del cuaderno, sincronización,
 * ajustes y borrado de cuenta. Sin cuenta es una pantalla de estadísticas con
 * la invitación a crear una; sin Firebase configurado oculta lo de la cuenta.
 */
export default function Perfil() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);
  const profile = useAuth((s) => s.profile);
  const busy = useAuth((s) => s.busy);
  const error = useAuth((s) => s.error);
  const setAlias = useAuth((s) => s.setAlias);
  const deleteAccount = useAuth((s) => s.deleteAccount);
  const clearError = useAuth((s) => s.clearError);
  const sync = useSync();
  const stats = useNotebookStats();
  const kidsMode = useSettings((s) => s.kidsMode);
  const setKidsMode = useSettings((s) => s.setKidsMode);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => clearError, [clearError]);

  const alias = profile?.alias ?? 'Explorador';
  const signedIn = status === 'signedIn' && user != null;

  const saveAlias = async () => {
    if (await setAlias(draft)) setEditing(false);
  };

  const wipeAndSignOut = async (force = false) => {
    const res = await signOutWith('wipe', { force });
    if (res.ok) return;
    Alert.alert(
      'Hay avistamientos sin copia',
      `${fmtInt(res.unsynced)} ${res.unsynced === 1 ? 'avistamiento no está' : 'avistamientos no están'} en la nube todavía (falta red o hubo un error). Si borras el móvil ahora, se perderán.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Borrar igualmente', style: 'destructive', onPress: () => void wipeAndSignOut(true) },
      ],
    );
  };

  const confirmSignOut = () =>
    Alert.alert('Cerrar sesión', '¿Qué hacemos con el cuaderno de este móvil? Lo que ya está en la nube no se toca.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrarlo del móvil', style: 'destructive', onPress: () => void wipeAndSignOut() },
      { text: 'Dejarlo aquí', onPress: () => void signOutWith('keep') },
    ]);

  const confirmDelete = () =>
    Alert.alert(
      'Borrar la cuenta',
      'Se borrarán para siempre tu perfil, tus avistamientos y tus fotos de la nube, y se cerrará tu cuenta. Esta acción no se puede deshacer.\n\nTu cuaderno seguirá en este móvil.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar cuenta',
          style: 'destructive',
          onPress: () => {
            void deleteAccount().then((ok) => {
              if (ok) Alert.alert('Cuenta borrada', 'Hemos eliminado tu cuenta y sus datos de la nube.');
            });
          },
        },
      ],
    );

  return (
    <View style={[styles.fill, { backgroundColor: palette.bg }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xxxl, paddingHorizontal: space.lg }}>
        <Press onPress={() => router.back()} accessibilityLabel="Volver" style={[styles.round, { backgroundColor: palette.surface }]}>
          <Icon name="back" />
        </Press>

        <Appear>
          <View style={styles.identity}>
            <Avatar uri={profile?.photoURL ?? user?.photoURL} name={signedIn ? alias : null} size={96} />
            {editing ? (
              <View style={styles.editRow}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  autoFocus
                  maxLength={40}
                  placeholder="Tu nombre"
                  placeholderTextColor={palette.inkFaint}
                  accessibilityLabel="Nombre en tu perfil"
                  returnKeyType="done"
                  onSubmitEditing={saveAlias}
                  style={[styles.input, { color: palette.ink, backgroundColor: palette.surface, borderColor: palette.lineStrong }]}
                />
                <Press
                  disabled={busy || !draft.trim()}
                  onPress={saveAlias}
                  accessibilityRole="button"
                  accessibilityLabel="Guardar nombre"
                  style={[styles.save, { backgroundColor: palette.strong }]}>
                  <Txt variant="bodyStrong" tone="onStrong">
                    Guardar
                  </Txt>
                </Press>
              </View>
            ) : (
              <View style={styles.nameRow}>
                <Txt variant="title" style={styles.name} numberOfLines={1}>
                  {signedIn ? alias : 'Tu perfil'}
                </Txt>
                {signedIn ? (
                  <Press
                    onPress={() => {
                      setDraft(alias);
                      setEditing(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Cambiar nombre"
                    style={[styles.pill, { backgroundColor: palette.strongTint }]}>
                    <Txt variant="bodyStrong">Editar</Txt>
                  </Press>
                ) : null}
              </View>
            )}
            {signedIn && user.createdAt ? (
              <Txt variant="small" tone="soft">
                Exploradora o explorador desde el {fmtDate(user.createdAt)}
              </Txt>
            ) : null}
            {error ? (
              <Txt variant="small" tone="danger" accessibilityLiveRegion="polite">
                {error}
              </Txt>
            ) : null}
          </View>
        </Appear>

        {!signedIn ? (
          <Appear index={1} style={styles.block}>
            <Card>
              <Txt variant="subheading">Guarda tu álbum en la nube</Txt>
              <Txt variant="body" tone="soft" style={styles.gap}>
                Con una cuenta tendrás perfil y copia de seguridad de tus avistamientos y fotos. Es opcional: sin ella Zarpa funciona igual.
              </Txt>
              <View style={styles.gapLg}>{status === 'loading' ? <Txt variant="small" tone="faint">Comprobando tu sesión…</Txt> : <AccountButtons />}</View>
            </Card>
          </Appear>
        ) : null}

        <Section title="Tu cuaderno" icon="cuaderno" accent={palette.brandInk} tint={palette.brandTint}>
          <View style={styles.stats}>
            <StatTile icon="mamifero" value={stats.species} label="Especies" color={palette.brandInk} tint={palette.brandTint} style={styles.stat} />
            <StatTile icon="eye" value={stats.sightings} label="Avistamientos" color={palette.leaf} tint={palette.leafTint} delay={45} style={styles.stat} />
            <StatTile icon="layers" value={stats.groups} label="Grupos" color={palette.sky} tint={palette.skyTint} delay={90} style={styles.stat} />
          </View>
        </Section>

        <Appear index={2} style={styles.block}>
          <AchievementsStrip />
        </Appear>

        {signedIn ? (
          <Section title="Copia en la nube" icon="globe" accent={palette.sky} tint={palette.skyTint}>
            <Card tone="outline">
              <View style={styles.syncRow}>
                <View style={styles.fill}>
                  <Txt variant="bodyStrong" accessibilityLiveRegion="polite">
                    {SYNC_TEXT[sync.phase]}
                  </Txt>
                  <Txt variant="small" tone="soft">
                    {sync.pending > 0
                      ? `${fmtInt(sync.pending)} ${sync.pending === 1 ? 'avistamiento pendiente' : 'avistamientos pendientes'}`
                      : sync.lastSyncAt
                        ? `Última copia: ${fmtAgo(sync.lastSyncAt)}`
                        : 'Aún no se ha hecho ninguna copia'}
                  </Txt>
                  {sync.error ? (
                    <Txt variant="small" tone="danger">
                      {sync.error}
                    </Txt>
                  ) : null}
                </View>
                <Press
                  disabled={sync.phase === 'syncing'}
                  onPress={() => void syncNow({ retryExhausted: true })}
                  accessibilityRole="button"
                  accessibilityLabel="Sincronizar ahora"
                  style={[styles.pill, { backgroundColor: palette.strongTint }]}>
                  <Txt variant="bodyStrong">Sincronizar</Txt>
                </Press>
              </View>
            </Card>
          </Section>
        ) : null}

        <CatalogSection />

        <Section title="Ajustes" icon="info" accent={palette.inkSoft} tint={palette.surfaceAlt}>
          <Card tone="outline" padding={0}>
            <Press onPress={() => router.push('/fuentes')} accessibilityRole="link" accessibilityLabel="Fuentes y reglas de los datos" style={styles.row}>
              <Icon name="info" size={20} color={palette.inkSoft} />
              <View style={styles.fill}>
                <Txt variant="bodyStrong">Fuentes y reglas</Txt>
                <Txt variant="small" tone="soft">
                  De dónde sale cada dato de Zarpa
                </Txt>
              </View>
              <Icon name="chevronRight" size={20} color={palette.inkFaint} />
            </Press>
          </Card>
          <Card tone="outline" padding={0} style={styles.gap}>
            <View style={styles.row}>
              <Icon name="sparkle" size={20} color={palette.inkSoft} />
              <View style={styles.fill}>
                <Txt variant="bodyStrong" nativeID="kids-label">
                  Modo peques
                </Txt>
                <Txt variant="small" tone="soft">
                  Fichas con frases cortas, letra grande y sin datos técnicos
                </Txt>
              </View>
              <Switch
                value={kidsMode}
                onValueChange={setKidsMode}
                accessibilityLabelledBy="kids-label"
                accessibilityLabel="Modo peques"
                trackColor={{ false: palette.lineStrong, true: palette.brand }}
                thumbColor={palette.surface}
                ios_backgroundColor={palette.lineStrong}
              />
            </View>
          </Card>
        </Section>

        {signedIn ? (
          <Section title="Cuenta" icon="heart" accent={palette.danger} tint={palette.redTint}>
            <Txt variant="small" tone="soft" style={styles.gap}>
              {user.email ? `Sesión iniciada como ${user.email}` : 'Sesión iniciada'}
            </Txt>
            <Press
              disabled={busy}
              onPress={confirmSignOut}
              accessibilityRole="button"
              accessibilityLabel="Cerrar sesión"
              style={[styles.wide, { backgroundColor: palette.strong }]}>
              <Txt variant="subheading" tone="onStrong">
                Cerrar sesión
              </Txt>
            </Press>
            <Press
              disabled={busy}
              onPress={confirmDelete}
              accessibilityRole="button"
              accessibilityLabel="Borrar mi cuenta"
              style={[styles.wide, styles.danger, { borderColor: palette.danger }]}>
              <Txt variant="subheading" tone="danger">
                Borrar mi cuenta
              </Txt>
            </Press>
            <Txt variant="small" tone="faint" style={styles.gap}>
              Borrar la cuenta elimina de la nube tu perfil, tus avistamientos y tus fotos. Lo guardado en este móvil no se toca.
            </Txt>
          </Section>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  round: { width: HIT, height: HIT, borderRadius: HIT / 2, alignItems: 'center', justifyContent: 'center' },
  identity: { alignItems: 'center', gap: space.sm, marginTop: space.md },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm, maxWidth: '100%' },
  name: { flexShrink: 1 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm, width: '100%' },
  input: { flex: 1, height: HIT, borderRadius: radius.md, borderWidth: 1.5, paddingHorizontal: space.md, fontSize: 16 },
  save: { height: HIT, borderRadius: radius.pill, paddingHorizontal: space.lg, alignItems: 'center', justifyContent: 'center' },
  block: { marginTop: space.xl },
  gap: { marginTop: space.sm },
  gapLg: { marginTop: space.lg },
  stats: { flexDirection: 'row', gap: space.sm },
  stat: { flex: 1 },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  pill: { minHeight: HIT, borderRadius: radius.pill, paddingHorizontal: space.lg, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, minHeight: HIT },
  wide: { height: HIT + 4, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: space.md },
  danger: { borderWidth: 1.5 },
});
