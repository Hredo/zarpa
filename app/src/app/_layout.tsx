import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AccountSwitchSheet } from '@/components/AccountSwitchSheet';
import { CatalogDownload, type BootState } from '@/components/CatalogDownload';
import { WelcomeGate } from '@/components/WelcomeGate';
import { CatalogOffline, openDatabases } from '@/db';
import { keepJournalSpecies } from '@/db/catalogDetail';
// Define la tarea de rarezas al cargar: el sistema puede arrancar la app solo para ella.
import { routeRarityNotifications } from '@/lib/rarityAlerts';
import { checkCatalogUpdate } from '@/db/catalogUpdate';
import { startAuth } from '@/store/auth';
import { useJournal } from '@/store/journal';
import { startSocial } from '@/social';
import { startSync } from '@/sync';
import { usePalette } from '@/theme';
import { fontAssets } from '@/theme/fonts';

SplashScreen.preventAutoHideAsync().catch(() => {
  // En web y en algunos arranques en caliente la splash ya no existe.
});

export default function RootLayout() {
  const palette = usePalette();
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const [dbReady, setDbReady] = useState(false);
  const [boot, setBoot] = useState<BootState>({ phase: 'opening' });

  // La primera vez se baja el índice del catálogo (con progreso); sin red se
  // explica y se puede reintentar sin cerrar la app.
  const start = useCallback(() => {
    openDatabases((p) => setBoot({ phase: p.phase, progress: p.progress, total: p.total }))
      .then(() => useJournal.getState().load())
      .then(() => {
        // La cuenta y la copia en la nube son opcionales: arrancan sin bloquear la app.
        startAuth();
        startSync();
        startSocial();
        // El catálogo nuevo (si lo hay) se busca con la app ya en marcha, sin competir con el arranque;
        // y las fichas del cuaderno se guardan para verlas sin red.
        setTimeout(() => void checkCatalogUpdate(), 8000);
        setTimeout(() => void keepJournalSpecies().catch(() => {}), 12000);
      })
      .then(() => setDbReady(true))
      .catch((e: unknown) =>
        setBoot(e instanceof CatalogOffline ? { phase: 'offline' } : { phase: 'error', message: e instanceof Error ? e.message : String(e) }),
      );
  }, []);

  useEffect(() => {
    start();
  }, [start]);
  const retry = () => {
    setBoot({ phase: 'opening' });
    start();
  };

  const ready = (fontsLoaded || fontError) && dbReady;

  // Tocar un aviso de rareza abre la ficha de la especie.
  useEffect(() => {
    if (!ready) return;
    return routeRarityNotifications((id) => router.push({ pathname: '/especie/[id]', params: { id: String(id) } }));
  }, [ready]);

  const showBoot = !dbReady && boot.phase !== 'opening';
  useEffect(() => {
    if (ready || showBoot) SplashScreen.hideAsync().catch(() => {});
  }, [ready, showBoot]);

  if (showBoot) return <CatalogDownload state={boot} onRetry={retry} />;
  if (!ready) return <View style={[styles.fill, { backgroundColor: palette.bg }]} />;

  return (
    <GestureHandlerRootView style={styles.fill}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: palette.bg },
          }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="especie/[id]" />
          <Stack.Screen name="comparar" />
          <Stack.Screen name="avistamiento/[id]" />
          <Stack.Screen name="excursion" />
          <Stack.Screen name="calendario" />
          <Stack.Screen name="razas/[id]" />
          <Stack.Screen name="raza/[id]" />
          {/* El visor ocupa toda la pantalla y se cierra hacia abajo, como una
              cámara del sistema: no compite con la navegación de pestañas. */}
          <Stack.Screen name="avistar" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
          {/* Filtros a pantalla completa con cabecera y pie fijos: una hoja con
              detents se comía el scroll al llegar al final de la lista. */}
          <Stack.Screen name="filtros" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', gestureEnabled: false }} />
          <Stack.Screen name="fuentes" />
          <Stack.Screen name="logros" />
          <Stack.Screen name="misiones" />
          <Stack.Screen name="quiz" />
          <Stack.Screen name="perfil" />
          <Stack.Screen name="amigos" />
          <Stack.Screen name="amigo/[uid]" />
          <Stack.Screen name="inaturalist" options={{ presentation: 'transparentModal', animation: 'none' }} />
          <Stack.Screen name="bienvenida" options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }} />
        </Stack>
        <WelcomeGate />
        <AccountSwitchSheet />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
