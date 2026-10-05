import { collection, doc, onSnapshot, orderBy, query, type Unsubscribe } from 'firebase/firestore';
import { create } from 'zustand';

import { fb, firebaseEnabled } from '@/lib/firebase';
import { useAuth } from '@/store/auth';
import { useSync } from '@/sync/store';

import { forgetPublishedAlbum, publishAlbum } from './album';
import { getFriendCode } from './api';

/*
 * Estado social en vivo: amigos y solicitudes (escuchas de Firestore mientras
 * haya cuenta) y publicación del álbum compartido después de cada
 * sincronización correcta, si la persona lo comparte.
 */

export type Friend = { uid: string; alias: string; photoURL: string | null; species: number | null; shareAlbum: boolean };
export type FriendRequest = { uid: string; alias: string; photoURL: string | null; at: Date | null };

type State = {
  friends: Friend[];
  requests: FriendRequest[];
  loaded: boolean;
  albumError: string | null;
};

export const useSocial = create<State>(() => ({ friends: [], requests: [], loaded: false, albumError: null }));

let started = false;

export function startSocial(): void {
  if (started || !firebaseEnabled) return;
  started = true;
  let stops: Unsubscribe[] = [];
  const profileStops = new Map<string, Unsubscribe>();
  let lastUid: string | null = null;

  const stopAll = () => {
    for (const s of stops) s();
    for (const s of profileStops.values()) s();
    stops = [];
    profileStops.clear();
  };

  useAuth.subscribe((s) => {
    const uid = s.user?.uid ?? null;
    if (uid === lastUid) return;
    lastUid = uid;
    stopAll();
    useSocial.setState({ friends: [], requests: [], loaded: false, albumError: null });
    if (!uid) return;

    const db = fb().db;
    stops.push(
      onSnapshot(
        collection(db, 'users', uid, 'friends'),
        (snap) => {
          const prev = new Map(useSocial.getState().friends.map((f) => [f.uid, f]));
          const friends = snap.docs.map((d) => {
            const v = d.data();
            const old = prev.get(d.id);
            return {
              uid: d.id,
              alias: typeof v.alias === 'string' ? v.alias : 'Explorador',
              photoURL: typeof v.photoURL === 'string' ? v.photoURL : null,
              species: old?.species ?? null,
              shareAlbum: old?.shareAlbum ?? false,
            };
          });
          friends.sort((a, b) => a.alias.localeCompare(b.alias, 'es'));
          useSocial.setState({ friends, loaded: true });
          // Recuento y «comparte» de cada amigo, desde su perfil público.
          for (const f of friends) {
            if (profileStops.has(f.uid)) continue;
            profileStops.set(
              f.uid,
              onSnapshot(
                doc(db, 'publicProfiles', f.uid),
                (p) => {
                  const v = p.data();
                  useSocial.setState((st) => ({
                    friends: st.friends.map((x) =>
                      x.uid === f.uid ? { ...x, species: typeof v?.species === 'number' ? v.species : null, shareAlbum: v?.shareAlbum === true } : x,
                    ),
                  }));
                },
                () => {},
              ),
            );
          }
          for (const [id, stop] of profileStops) {
            if (!friends.some((f) => f.uid === id)) {
              stop();
              profileStops.delete(id);
            }
          }
        },
        () => useSocial.setState({ loaded: true }),
      ),
    );
    stops.push(
      onSnapshot(
        query(collection(db, 'users', uid, 'friendRequests'), orderBy('at', 'desc')),
        (snap) =>
          useSocial.setState({
            requests: snap.docs.map((d) => {
              const v = d.data();
              return {
                uid: d.id,
                alias: typeof v.alias === 'string' ? v.alias : 'Explorador',
                photoURL: typeof v.photoURL === 'string' ? v.photoURL : null,
                at: v.at?.toDate?.() ?? null,
              };
            }),
          }),
        () => {},
      ),
    );
  });

  // Cuentas anteriores a lo social: piden su código la primera vez (una sola).
  let askedFor: string | null = null;
  useAuth.subscribe((s) => {
    if (s.status !== 'signedIn' || !s.user || !s.profile || s.profile.friendCode || askedFor === s.user.uid) return;
    askedFor = s.user.uid;
    void getFriendCode().catch(() => {
      askedFor = null;
    });
  });

  // El álbum se publica tras cada sincronización correcta (las pegatinas ya están en Storage).
  let wasSharing = false;
  const maybePublish = () => {
    const { user, profile } = useAuth.getState();
    if (!user || !profile) return;
    if (profile.shareAlbum) {
      wasSharing = true;
      void publishAlbum(user.uid)
        .then(() => useSocial.setState({ albumError: null }))
        .catch(() => useSocial.setState({ albumError: 'No se pudo actualizar tu álbum compartido. Se reintentará.' }));
    } else if (wasSharing) {
      wasSharing = false;
      void forgetPublishedAlbum(user.uid);
    }
  };
  let lastPhase = useSync.getState().phase;
  useSync.subscribe((s) => {
    if (s.phase === 'idle' && lastPhase === 'syncing') maybePublish();
    lastPhase = s.phase;
  });
  let lastShare: boolean | null = null;
  useAuth.subscribe((s) => {
    const share = s.profile?.shareAlbum ?? null;
    if (share === lastShare) return;
    const before = lastShare;
    lastShare = share;
    if (before !== null || share) maybePublish();
  });
}
