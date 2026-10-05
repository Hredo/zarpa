import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { create } from 'zustand';

import { AuthCancelled, AuthError, cleanAlias, deleteAccount, saveAlias, saveShareAlbum, signInWithApple, signInWithGoogle, signOutUser } from '@/lib/auth';
import { fb, firebaseEnabled } from '@/lib/firebase';

/*
 * Estado de la cuenta. Iniciar sesión es opcional: sin cuenta (o sin Firebase
 * configurado) la app es la misma y `status` queda en `signedOut`/`disabled`.
 *
 *   disabled   falta la configuración de Firebase: se ocultan las opciones de cuenta
 *   loading    esperando a que Firebase restaure la sesión guardada
 *   signedOut  sin cuenta
 *   signedIn   con cuenta
 */

export type AuthStatus = 'disabled' | 'loading' | 'signedOut' | 'signedIn';

export type AccountUser = {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  provider: 'google' | 'apple' | 'otro';
  /** ISO de la fecha de alta de la cuenta (metadatos de Auth). */
  createdAt: string | null;
};

export type Profile = {
  alias: string;
  photoURL: string | null;
  sightings: number;
  /** Comparte su álbum (especies y pegatinas) con sus amigos. */
  shareAlbum: boolean;
  /** Código para que otra persona le añada como amigo (lo asigna el servidor). */
  friendCode: string | null;
};

type State = {
  status: AuthStatus;
  user: AccountUser | null;
  profile: Profile | null;
  /** Operación en curso: bloquea los botones. */
  busy: boolean;
  /** Último error, ya redactado para el usuario. */
  error: string | null;
  signInGoogle: () => Promise<boolean>;
  signInApple: () => Promise<boolean>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<boolean>;
  setAlias: (alias: string) => Promise<boolean>;
  setShareAlbum: (on: boolean) => Promise<boolean>;
  clearError: () => void;
};

function toUser(u: User): AccountUser {
  const id = u.providerData[0]?.providerId;
  return {
    uid: u.uid,
    displayName: u.displayName,
    email: u.email,
    photoURL: u.photoURL,
    provider: id === 'google.com' ? 'google' : id === 'apple.com' ? 'apple' : 'otro',
    createdAt: u.metadata.creationTime ? new Date(u.metadata.creationTime).toISOString() : null,
  };
}

export const useAuth = create<State>((set, get) => {
  /** Ejecuta una operación de cuenta con `busy` y errores controlados. */
  async function run(op: () => Promise<void>): Promise<boolean> {
    if (get().busy) return false;
    set({ busy: true, error: null });
    try {
      await op();
      return true;
    } catch (e) {
      if (!(e instanceof AuthCancelled)) set({ error: e instanceof AuthError ? e.message : 'No se pudo completar la operación.' });
      return false;
    } finally {
      set({ busy: false });
    }
  }

  return {
    status: firebaseEnabled ? 'loading' : 'disabled',
    user: null,
    profile: null,
    busy: false,
    error: null,
    signInGoogle: () => run(signInWithGoogle),
    signInApple: () => run(signInWithApple),
    signOut: async () => {
      await run(signOutUser);
    },
    deleteAccount: () =>
      run(async () => {
        const uid = get().user?.uid;
        if (!uid) return;
        await deleteAccount(uid);
      }),
    setAlias: (alias) =>
      run(async () => {
        const uid = get().user?.uid;
        if (!uid) return;
        await saveAlias(uid, alias);
      }),
    setShareAlbum: (on) =>
      run(async () => {
        const uid = get().user?.uid;
        if (!uid) return;
        await saveShareAlbum(uid, on);
      }),
    clearError: () => set({ error: null }),
  };
});

let started = false;

/**
 * Arranca la escucha de la sesión (una sola vez, desde el layout raíz) y la del
 * perfil de Firestore mientras haya cuenta. Sin Firebase configurado no hace nada.
 */
export function startAuth(): void {
  if (started || !firebaseEnabled) return;
  started = true;
  let stopProfile: Unsubscribe | null = null;

  onAuthStateChanged(fb().auth, (u) => {
    stopProfile?.();
    stopProfile = null;
    if (!u) {
      useAuth.setState({ status: 'signedOut', user: null, profile: null });
      return;
    }
    const user = toUser(u);
    useAuth.setState({
      status: 'signedIn',
      user,
      // Mientras llega el perfil de la nube, lo que sabe la cuenta de Google/Apple.
      profile: { alias: cleanAlias(user.displayName ?? '') || 'Explorador', photoURL: user.photoURL, sightings: 0, shareAlbum: false, friendCode: null },
    });
    // El perfil lo crea una función al darse de alta: puede tardar un instante.
    stopProfile = onSnapshot(
      doc(fb().db, 'users', u.uid),
      (snap) => {
        const d = snap.data();
        if (!d) return;
        useAuth.setState({
          profile: {
            alias: typeof d.alias === 'string' && d.alias ? d.alias : 'Explorador',
            photoURL: typeof d.photoURL === 'string' ? d.photoURL : null,
            sightings: typeof d.counters?.sightings === 'number' ? d.counters.sightings : 0,
            shareAlbum: d.shareAlbum === true,
            friendCode: typeof d.friendCode === 'string' ? d.friendCode : null,
          },
        });
      },
      () => {
        // Sin red o sin permisos: se queda con el perfil provisional.
      },
    );
  });
}
