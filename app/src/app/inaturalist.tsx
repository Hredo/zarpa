import { Redirect, router } from 'expo-router';
import { useEffect } from 'react';

/*
 * Vuelta del inicio de sesión de iNaturalist (`zarpa://inaturalist?code=…`).
 * El código lo recoge `connectInat` (expo-web-browser); expo-router, además,
 * abre esta ruta con el enlace. No pinta nada: vuelve a donde estaba la
 * persona (el avistamiento o el perfil).
 */
export default function InaturalistCallback() {
  const canGoBack = router.canGoBack();
  useEffect(() => {
    if (canGoBack) router.back();
  }, [canGoBack]);
  return canGoBack ? null : <Redirect href="/" />;
}
