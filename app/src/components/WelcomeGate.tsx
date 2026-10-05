import { router, useRootNavigationState } from 'expo-router';
import { useEffect } from 'react';

import { markWelcomeSeen, welcomeSeen } from '@/lib/welcome';

/**
 * Ofrece la bienvenida la primera vez que se abre la app. Va dentro del layout
 * raíz; no pinta nada. La marca se guarda al abrirla, así que si se cierra la
 * app a medias no vuelve a insistir.
 */
export function WelcomeGate() {
  const ready = useRootNavigationState()?.key != null;
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    welcomeSeen().then((seen) => {
      if (cancelled || seen) return;
      void markWelcomeSeen();
      router.push('/bienvenida');
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);
  return null;
}
