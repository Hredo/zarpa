import * as AppleAuthentication from 'expo-apple-authentication';
import { StyleSheet, View } from 'react-native';

import { appleSupported, googleAvailable } from '@/lib/auth';
import { firebaseEnabled } from '@/lib/firebase';
import { useAuth } from '@/store/auth';
import { HIT, radius, space, usePalette } from '@/theme';

import { Press } from './Press';
import { Txt } from './Txt';

type Props = {
  /** Se llama tras un inicio de sesión correcto. */
  onSignedIn?: () => void;
};

/**
 * «Continuar con Google / Apple». Android solo Google; iOS los dos. Si Firebase
 * no está configurado muestra un aviso amable en lugar de los botones.
 */
export function AccountButtons({ onSignedIn }: Props) {
  const palette = usePalette();
  const busy = useAuth((s) => s.busy);
  const error = useAuth((s) => s.error);
  const signInGoogle = useAuth((s) => s.signInGoogle);
  const signInApple = useAuth((s) => s.signInApple);

  if (!firebaseEnabled || !(googleAvailable || appleSupported)) {
    return (
      <View style={[styles.notice, { backgroundColor: palette.skyTint }]}>
        <Txt variant="small">Las cuentas aún no están activadas en esta versión. Zarpa funciona igual sin ellas: tu cuaderno se guarda en el móvil.</Txt>
      </View>
    );
  }

  return (
    <View style={styles.col}>
      {appleSupported ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={radius.pill}
          style={[styles.apple, busy && { opacity: 0.45 }]}
          onPress={async () => {
            if (busy) return;
            if (await signInApple()) onSignedIn?.();
          }}
        />
      ) : null}
      {googleAvailable ? (
        <Press
          disabled={busy}
          haptic
          onPress={async () => {
            if (await signInGoogle()) onSignedIn?.();
          }}
          accessibilityRole="button"
          accessibilityLabel="Continuar con Google"
          style={[styles.google, { backgroundColor: palette.surface, borderColor: palette.lineStrong }]}>
          <Txt variant="bodyStrong">Continuar con Google</Txt>
        </Press>
      ) : null}
      {error ? (
        <Txt variant="small" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  col: { gap: space.md },
  apple: { height: HIT + 4, width: '100%' },
  google: { height: HIT + 4, borderRadius: radius.pill, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  notice: { borderRadius: radius.md, padding: space.md },
});
