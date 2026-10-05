import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BootError } from '@/components/BootError';
import { openDatabases } from '@/db';
import { useJournal } from '@/store/journal';
import { usePalette } from '@/theme';
import { fontAssets } from '@/theme/fonts';

SplashScreen.preventAutoHideAsync().catch(() => {
  // En web y en algunos arranques en caliente la splash ya no existe.
});

export default function RootLayout() {
  const palette = usePalette();
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<Error | null>(null);

  useEffect(() => {
    openDatabases()
      .then(() => useJournal.getState().load())
      .then(() => setDbReady(true))
      .catch((e: unknown) => setDbError(e instanceof Error ? e : new Error(String(e))));
  }, []);

  const ready = (fontsLoaded || fontError) && dbReady;

  useEffect(() => {
    if (ready || dbError) SplashScreen.hideAsync().catch(() => {});
  }, [ready, dbError]);

  if (dbError) return <BootError error={dbError} />;
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
          <Stack.Screen name="avistamiento/[id]" />
          <Stack.Screen name="razas/[id]" />
          <Stack.Screen name="raza/[id]" />
          {/* El visor ocupa toda la pantalla y se cierra hacia abajo, como una
              cámara del sistema: no compite con la navegación de pestañas. */}
          <Stack.Screen name="avistar" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
          {/* Filtros a pantalla completa con cabecera y pie fijos: una hoja con
              detents se comía el scroll al llegar al final de la lista. */}
          <Stack.Screen name="filtros" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', gestureEnabled: false }} />
          <Stack.Screen name="fuentes" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
