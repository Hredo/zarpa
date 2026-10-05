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
| `app/src/db/catalogUpdate.ts` | Actualización del catálogo de especies desde Storage |
| `tools/zarpa_data/stages/cloud.py` | Publica el catálogo en Storage (`catalog/`) |

### Modelo de datos

- `users/{uid}`: alias, photoURL, createdAt, updatedAt, `counters` (avistamientos y especies), `shareAlbum` y `friendCode`. Lo crea la app la primera vez que entra la cuenta, con la forma de partida que exigen las reglas; después solo cambian alias, foto, compartir, contadores (tras cada sincronización) y, una vez, el código de amigo.
- `users/{uid}/private/settings`: ajustes privados.
- `users/{uid}/sightings/{id}`: copia de cada avistamiento (mismas columnas que la tabla local, sin rutas de ficheros; más `has_photo`, `has_sticker`, `sticker_ext`, `has_voice`, `voice_ext`, `schema`, `synced_at`). Las reglas validan también el diario (clima, momento del día, duración de la nota de voz).
- Storage (solo con plan Blaze), por avistamiento: `users/{uid}/sightings/{id}.jpg` (foto, JPEG ≤ 10 MB), `{id}.sticker.png|jpg` (pegatina ≤ 10 MB) y `{id}.voice.m4a` (nota de voz, audio ≤ 5 MB; también aac, mp4, caf, 3gp).
- Storage, `catalog/`: el catálogo de especies versionado y su `manifest.json`. Lectura pública; nadie lo escribe desde la app.
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
pnpm dlx firebase-tools deploy --only firestore
```

Sube las reglas y los índices (`firestore.indexes.json`: el índice de grupo de colecciones de
`friendRequests.from`, que usa el borrado de cuenta). Nada de esto cuesta dinero en Spark.

## Publicar el catálogo en Storage

La app trae su catálogo dentro y funciona sin red. Para que reciba datos nuevos (más fotos, nombres…) sin sacar otra versión, se publica en Storage; la app mira una vez al día, con wifi, y usa el nuevo al reabrirse.

```
gcloud auth application-default login     # una vez por equipo, con tu cuenta de Google del proyecto
cd tools
uv run python -m zarpa_data build cloud   # construye y publica; ZARPA_CLOUD_DRY=1 para probar sin subir
```

Sube `catalog/v/<versión>/catalogo.db.gz` (servido con `Content-Encoding: gzip`), `catalogo.db` sin comprimir de respaldo y, al final, `catalog/manifest.json`. Conserva las 3 últimas versiones. La app solo acepta catálogos de su mismo esquema (`CATALOG_SCHEMA` en `build.py`): si cambian tablas o columnas que la app consulta, sube el número y saca versión nueva de la app.

Coste: cada actualización son ~70 MB por móvil que la baja (salida de Storage). Con muchos usuarios conviene publicar con moderación (p. ej. una vez al mes).

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
