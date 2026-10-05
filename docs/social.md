# Lo social en Zarpa

Cuatro piezas, todas opcionales y pensadas para que la usen también niños:

| Pieza | Qué hace | Dónde |
|---|---|---|
| Amigos | Se añade a alguien **solo con su código** (8 caracteres). No hay buscador de personas. | `app/src/app/amigos.tsx`, `app/src/social/flows.ts` |
| Álbum compartido | Si lo activas en el perfil, tus amigos ven tus especies, cuántas veces las viste y el mes (y tu pegatina, si hay Cloud Storage). **Nunca** dónde, ni la foto completa, ni las notas de voz. | `app/src/social/`, `app/src/app/amigo/[uid].tsx` |
| Rarezas cerca | Inicio enseña las especies raras confirmadas a menos de 50 km en 14 días (iNaturalist). Con el aviso activado, una notificación local en segundo plano. | `app/src/lib/rarities.ts`, `app/src/lib/rarityAlerts.ts` |
| Aportar a iNaturalist | Publica un avistamiento (foto, especie, fecha, lugar) en tu cuenta de iNaturalist. Si la comunidad lo confirma, llega a GBIF. | `app/src/lib/inat.ts`, `app/src/components/InatCard.tsx` |

## Modelo de datos (Firestore)

Sin Cloud Functions (plan gratuito): cada escritura que toca a dos personas la hace el
móvil de una de ellas, y `firestore.rules` comprueba que la otra dio su consentimiento.

- `users/{uid}.friendCode` y `friendCodes/{code} → {uid}`: la app pide un código la primera vez y escribe los dos en el mismo lote; las reglas solo dejan ponerlo una vez y solo si el índice apunta a esa cuenta. El índice se lee de uno en uno (quien tiene el código), nunca se lista.
- `users/{uid}/friendRequests/{fromUid}`: la escribe quien pide (a su nombre, con su alias y foto, a una cuenta que existe); la lee y la borra quien la recibe; quien la envió puede retirarla.
- `users/{uid}/friends/{fid}`: una ficha en cada sentido. Al aceptar, quien recibe la solicitud escribe las dos; la del otro solo se admite porque hay una solicitud suya. Cada uno refresca su alias en la lista del otro; cualquiera de los dos rompe la amistad.
- `users/{uid}.shareAlbum`: lo cambia el dueño desde el perfil. Al desactivarlo, la app borra el álbum de la nube.
- `publicProfiles/{uid}`: alias, avatar, contadores y si comparte. Lo escribe su dueño cuando cambia su perfil; lo lee quien tenga cuenta y sepa el uid (para ver quién te pide amistad). No se lista.
- `users/{uid}/album/{speciesId}`: `{species_id, count, first, last, sticker, sticker_ext, updated_at}`. Lo escribe el dueño (si comparte); lo leen sus amigos. Las reglas rechazan cualquier otro campo (por ejemplo, coordenadas).
- Storage (solo con plan Blaze): los amigos de alguien que comparte pueden leer sus `…/{id}.sticker.png|jpg`, nada más. Sin Storage, el álbum enseña la foto del catálogo.
- Al borrar la cuenta, la app retira sus amistades del otro lado, las solicitudes que envió (consulta de grupo de colecciones sobre `friendRequests.from`), su código y su perfil público.

Límites (los comprueba la app): 200 amigos por persona.

Pruebas: `pnpm --dir firebase test` (reglas y flujos de la app contra los emuladores).

## Rarezas

«Rara» y «legendaria» son los niveles 4 y 5 de rareza del catálogo (menos de 60 y de 25 observaciones confirmadas en el mundo). La consulta es `observations/species_counts` de iNaturalist con grado de investigación, en un radio de 50 km y 14 días, cacheada 6 horas. El aviso usa `expo-background-task` (como mucho cada 12 h; en iOS, cuando el sistema decide) y `expo-notifications` con notificaciones **locales**: no hace falta servidor ni FCM. La zona se guarda en el móvil redondeada a ~1 km.

## iNaturalist: lo que haces tú

1. Entra en https://www.inaturalist.org/oauth/applications/new con tu cuenta de iNaturalist (iNaturalist puede pedir antigüedad y actividad en la cuenta para crear aplicaciones).
2. Nombre «Zarpa», URL de redirección `zarpa://inaturalist` y **desmarca «Confidential»**: la app usa PKCE y no lleva secreto.
3. Copia el **Application ID** (público) a `app/.env` como `EXPO_PUBLIC_INAT_CLIENT_ID`. El «Secret» no se usa: no lo pongas en ningún sitio.
4. Build nueva de la app (hay módulos nativos nuevos: almacén seguro, notificaciones y tareas en segundo plano).

El token de acceso de cada persona se guarda en el almacén seguro del sistema (Keychain/Keystore) y solo se envía a iNaturalist. Las observaciones se publican con las licencias que la persona tenga en su cuenta de iNaturalist y, si lo elige, con la ubicación oculta (`geoprivacy: obscured`, recomendado por defecto para especies amenazadas o raras).
