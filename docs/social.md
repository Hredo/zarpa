# Lo social en Zarpa

Cuatro piezas, todas opcionales y pensadas para que la usen también niños:

| Pieza | Qué hace | Dónde |
|---|---|---|
| Amigos | Se añade a alguien **solo con su código** (8 caracteres). No hay buscador de personas. | `app/src/app/amigos.tsx`, `functions/src/social.ts` |
| Álbum compartido | Si lo activas en el perfil, tus amigos ven tus especies, cuántas veces las viste, el mes y tu pegatina. **Nunca** dónde, ni la foto completa, ni las notas de voz. | `app/src/social/`, `app/src/app/amigo/[uid].tsx` |
| Rarezas cerca | Inicio enseña las especies raras confirmadas a menos de 50 km en 14 días (iNaturalist). Con el aviso activado, una notificación local en segundo plano. | `app/src/lib/rarities.ts`, `app/src/lib/rarityAlerts.ts` |
| Aportar a iNaturalist | Publica un avistamiento (foto, especie, fecha, lugar) en tu cuenta de iNaturalist. Si la comunidad lo confirma, llega a GBIF. | `app/src/lib/inat.ts`, `app/src/components/InatCard.tsx` |

## Modelo de datos (Firestore)

- `users/{uid}.friendCode` y `friendCodes/{code} → {uid}`: el código lo asigna el servidor (al darse de alta, o con `getFriendCode` en cuentas antiguas). El índice inverso no lo lee nadie desde la app.
- `users/{uid}.shareAlbum`: lo cambia el dueño desde el perfil. Al desactivarlo, `onProfileWrite` borra el álbum de la nube.
- `publicProfiles/{uid}`: alias, avatar, contadores y si comparte. Lo escribe `onProfileWrite`; lo lee quien tenga cuenta (para ver quién te pide amistad).
- `users/{uid}/friends/{fid}` y `users/{uid}/friendRequests/{fromUid}`: solo los escriben las funciones `sendFriendRequest`, `respondFriendRequest` y `removeFriend`. Cada persona lee los suyos.
- `users/{uid}/album/{speciesId}`: `{species_id, count, first, last, sticker, sticker_ext, updated_at}`. Lo escribe el dueño (si comparte); lo leen sus amigos. Las reglas rechazan cualquier otro campo (por ejemplo, coordenadas).
- Storage: los amigos de alguien que comparte pueden leer sus `…/{id}.sticker.png|jpg`, nada más. La regla consulta Firestore (`firestore.exists`/`firestore.get`): al desplegar, la CLI pide permiso para que Storage lea Firestore; acéptalo.
- Al borrar la cuenta, `cleanupSocial` retira sus amistades del otro lado, las solicitudes que envió y su código.

Límites: 200 amigos y 50 solicitudes pendientes por persona.

Pruebas: `pnpm --dir functions test` (reglas y funciones contra los emuladores).

## Rarezas

«Rara» y «legendaria» son los niveles 4 y 5 de rareza del catálogo (menos de 60 y de 25 observaciones confirmadas en el mundo). La consulta es `observations/species_counts` de iNaturalist con grado de investigación, en un radio de 50 km y 14 días, cacheada 6 horas. El aviso usa `expo-background-task` (como mucho cada 12 h; en iOS, cuando el sistema decide) y `expo-notifications` con notificaciones **locales**: no hace falta servidor ni FCM. La zona se guarda en el móvil redondeada a ~1 km.

## iNaturalist: lo que haces tú

1. Entra en https://www.inaturalist.org/oauth/applications/new con tu cuenta de iNaturalist (iNaturalist puede pedir antigüedad y actividad en la cuenta para crear aplicaciones).
2. Nombre «Zarpa», URL de redirección `zarpa://inaturalist` y **desmarca «Confidential»**: la app usa PKCE y no lleva secreto.
3. Copia el **Application ID** (público) a `app/.env` como `EXPO_PUBLIC_INAT_CLIENT_ID`. El «Secret» no se usa: no lo pongas en ningún sitio.
4. Build nueva de la app (hay módulos nativos nuevos: almacén seguro, notificaciones y tareas en segundo plano).

El token de acceso de cada persona se guarda en el almacén seguro del sistema (Keychain/Keystore) y solo se envía a iNaturalist. Las observaciones se publican con las licencias que la persona tenga en su cuenta de iNaturalist y, si lo elige, con la ubicación oculta (`geoprivacy: obscured`, recomendado por defecto para especies amenazadas o raras).
