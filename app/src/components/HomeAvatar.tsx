import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { firebaseEnabled } from '@/lib/firebase';
import { useSocial } from '@/social';
import { useAuth } from '@/store/auth';
import { usePalette } from '@/theme';

import { Avatar } from './Avatar';
import { Press } from './Press';

/** Acceso al perfil desde la cabecera de Inicio. Un punto avisa de solicitudes de amistad. */
export function HomeAvatar() {
  const palette = usePalette();
  const profile = useAuth((s) => s.profile);
  const photo = useAuth((s) => s.user?.photoURL);
  const requests = useSocial((s) => s.requests.length);
  const label = firebaseEnabled && profile ? `Tu perfil, ${profile.alias}` : 'Tu perfil';
  return (
    <Press
      onPress={() => router.push('/perfil')}
      accessibilityRole="button"
      accessibilityLabel={requests > 0 ? `${label}. ${requests} ${requests === 1 ? 'solicitud de amistad' : 'solicitudes de amistad'}` : label}
      hitSlop={8}>
      <Avatar uri={profile?.photoURL ?? photo} name={profile?.alias} size={40} />
      {requests > 0 ? <View style={[styles.dot, { backgroundColor: palette.brand, borderColor: palette.bg }]} /> : null}
    </Press>
  );
}

const styles = StyleSheet.create({
  dot: { position: 'absolute', top: -2, right: -2, width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
});
