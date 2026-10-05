# Firebase en Zarpa

Proyecto: `zarpa-47a67` · **plan gratuito (Spark)** · Firestore en `eur3` · SDK: Firebase JS (v12).
Iniciar sesión es opcional: sin cuenta la app funciona entera (el cuaderno vive en SQLite).
La cuenta añade perfil, copia en la nube y amigos.

Zarpa no usa Cloud Functions: el perfil, lo social y el borrado de cuenta los hace la
app, y `firestore.rules` es la única defensa (cada regla tiene su prueba contra el
emulador). Cloud Storage exige el plan Blaze: sin él (`EXPO_PUBLIC_FIREBASE_STORAGE=0`)
la copia en la nube guarda los datos de cada avistamiento, y la foto, la pegatina y la
nota de voz se quedan en el móvil. Si algún día se pasa a Blaze, basta con crear el
bucket, desplegar `storage.rules` y poner la variable a `1`.

## Qué hay en el repo

| Ruta | Para qué |
|---|---|
| `firebase.json`, `.firebaserc` | Configuración de la CLI (proyecto por defecto y emuladores) |
| `firestore.rules`, `firestore.indexes.json`, `storage.rules` | Reglas estrictas: cada usuario solo lee y escribe lo suyo |
| `firebase/` | Pruebas contra los emuladores (Node 22, vitest, pnpm): `test/rules.test.ts` (reglas) y `test/flows.test.ts` (los flujos de la app: alta, amigos, borrado de cuenta) |
| `app/src/social/flows.ts` | Alta del perfil, código de amigo, solicitudes, amistades, perfil público y borrado de los datos de la cuenta (solo depende de `firebase/firestore`) |
| `app/src/lib/firebase.ts` | Único punto de `initializeApp` |
| `app/src/lib/auth.ts`, `app/src/store/auth.ts` | Google, Apple, cierre de sesión, borrado de cuenta |
| `app/src/sync/` | Sincronización del cuaderno (tablas propias `sync_item` y `sync_meta`) |
| `app/src/db/catalogUpdate.ts`, `catalogDetail.ts`, `catalogRemote.ts` | Catálogo servido desde Hosting: primera descarga del índice, actualizaciones, fichas y países bajo demanda |
| `tools/zarpa_data/stages/hosting.py` | Parte el catálogo para Hosting (`tools/out/hosting/`, que es el `public` de `firebase.json`) |

### Modelo de datos

- `users/{uid}`: alias, photoURL, createdAt, updatedAt, `counters` (avistamientos y especies), `shareAlbum` y `friendCode`. Lo crea la app la primera vez que entra la cuenta, con la forma de partida que exigen las reglas; después solo cambian alias, foto, compartir, contadores (tras cada sincronización) y, una vez, el código de amigo.
- `users/{uid}/private/settings`: ajustes privados.
- `users/{uid}/sightings/{id}`: copia de cada avistamiento (mismas columnas que la tabla local, sin rutas de ficheros; más `has_photo`, `has_sticker`, `sticker_ext`, `has_voice`, `voice_ext`, `schema`, `synced_at`). Las reglas validan también el diario (clima, momento del día, duración de la nota de voz).
- Storage (solo con plan Blaze), por avistamiento: `users/{uid}/sightings/{id}.jpg` (foto, JPEG ≤ 10 MB), `{id}.sticker.png|jpg` (pegatina ≤ 10 MB) y `{id}.voice.m4a` (nota de voz, audio ≤ 5 MB; también aac, mp4, caf, 3gp).
- Lo social (amigos por código, álbum compartido, perfiles públicos): ver `docs/social.md`.

## Lo que está hecho en la consola (5 de octubre de 2026)

- Plan **Spark** (gratuito). Sin facturación.
- **Authentication** → Google activado (nombre público «Zarpa», correo de asistencia del proyecto).
- **Firestore** en modo producción, región `eur3`.
- **App Android** `com.hrval.zarpa` con el SHA-1 del keystore de depuración (con el que se firman los APK de prueba) y **app web** (su configuración está en `app/.env`, que no se sube).

Pendiente, cuando haga falta:

1. **iOS**: registrar la app iOS, copiar su ID de cliente a `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` y poner su inverso en `app.json` (`iosUrlScheme`, ahora con un marcador `REEMPLAZAR-…`).
2. **Apple**: en developer.apple.com, un Service ID y una clave «Sign in with Apple» (.p8, que NO se sube al repo); en Firebase → Authentication → Apple, Service ID, Team ID, Key ID y la clave.
3. **Release firmada**: añadir el SHA-1 del keystore de publicación (`keytool -list -v -keystore <tu-keystore> -alias <alias>`) en la app Android.

## Desplegar

Desde la raíz del repo, con la CLI autorizada (`pnpm dlx firebase-tools login`, una vez por equipo):

```
pnpm dlx firebase-tools deploy --only firestore    # reglas e índices
pnpm dlx firebase-tools deploy --only hosting      # catálogo (ver abajo)
```

Sube las reglas y los índices (`firestore.indexes.json`: el índice de grupo de colecciones de
`friendRequests.from`, que usa el borrado de cuenta). Nada de esto cuesta dinero en Spark.

## El catálogo, en Firebase Hosting

La app no lleva el catálogo dentro (el APK pesaba 305 MB y, instalada, más del doble).
Vive en Firebase Hosting, que entra en el plan gratuito (10 GB guardados, 360 MB/día de descarga):

| Ruta | Qué es | Cuándo lo baja el móvil |
|---|---|---|
| `c/manifest.json` | versión vigente, tamaño y MD5 del índice (sin caché) | al arrancar por primera vez y una vez al día con wifi |
| `c/<versión>/indice.db.gz` | índice para buscar, filtrar y ordenar (~44 MB; ~19 MB comprimido, servido con `Content-Encoding: gzip`) | la primera vez, con barra de progreso; después solo si hay versión nueva |
| `c/<versión>/d/<n>.json` | fichas completas en 4096 trozos (resumen, galería con autoría, estado por regiones, países, fuentes) | al abrir una ficha; se guardan en el índice (caché de 600 trozos, sin caducidad las del cuaderno) |
| `c/<versión>/cc/<CC>.json` | especies de cada país con sus observaciones | al filtrar por país, en «qué ver aquí», misiones y candidatas de la IA |

Publicar un catálogo nuevo (desde `tools/`, y luego desde la raíz):

```
uv run python -m zarpa_data build hosting
pnpm dlx firebase-tools deploy --only hosting
```

`hosting` deja en `tools/out/hosting/` la versión nueva y la anterior (una app que aún no
se ha actualizado sigue encontrando sus fichas). El índice lleva su esquema
(`INDEX_SCHEMA` en `hosting.py` = `CATALOG_SCHEMA` en `app/src/db/catalogRemote.ts`): si
cambian tablas o columnas que la app consulta, sube los dos y saca versión nueva de la app.
Las pruebas de la app (`pnpm test`) leen `tools/out/indice.db`.

## Cambio de cuenta en el mismo móvil

El cuaderno del móvil tiene dueño (la cuenta que lo sincronizó). Si entra otra cuenta, la sincronización se pausa y la app pregunta: pasar los avistamientos a la cuenta nueva, empezar con el cuaderno de la cuenta nueva (se quitan del móvil; avisa si alguno no estaba en la nube) o cancelar y cerrar sesión. Al cerrar sesión se elige si el cuaderno se queda en el móvil o se borra (solo del móvil; si hay algo sin copiar, avisa antes).

## Probar en local

```
pnpm --dir firebase install
pnpm --dir firebase test         # reglas y flujos contra los emuladores (necesita Java)
```
Para que la app use los emuladores: `EXPO_PUBLIC_FIREBASE_EMULATORS=1` y `pnpm dlx firebase-tools emulators:start`.

## Notas

- Fotos, pegatinas y notas de voz se suben y se bajan con cada avistamiento. Si el mismo avistamiento se edita en dos móviles, gana la edición más reciente (`updated_at`).
- Borrar la cuenta (obligatorio en App Store y Google Play) lo hace la app: confirma la identidad si la sesión tiene más de unos minutos, borra de Firestore todo lo suyo y su rastro en las listas de sus amigos, sus ficheros de Storage si los hay y, al final, la cuenta de Auth. Si se corta a medias se puede repetir.
- La política de privacidad debe mencionar cuenta, fotos y ubicación almacenadas en Firebase (UE).
