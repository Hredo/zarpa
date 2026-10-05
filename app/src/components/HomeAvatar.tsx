import { router } from 'expo-router';

import { firebaseEnabled } from '@/lib/firebase';
import { useAuth } from '@/store/auth';

import { Avatar } from './Avatar';
import { Press } from './Press';

/** Acceso al perfil desde la cabecera de Inicio. */
export function HomeAvatar() {
  const profile = useAuth((s) => s.profile);
  const photo = useAuth((s) => s.user?.photoURL);
  return (
    <Press
      onPress={() => router.push('/perfil')}
      accessibilityRole="button"
      accessibilityLabel={firebaseEnabled && profile ? `Tu perfil, ${profile.alias}` : 'Tu perfil'}
      hitSlop={8}>
      <Avatar uri={profile?.photoURL ?? photo} name={profile?.alias} size={40} />
    </Press>
  );
}
