# Firebase en Zarpa

Proyecto: `zarpa-47a67` · Funciones en `europe-west1` · SDK: Firebase JS (v12).
Iniciar sesión es opcional: sin cuenta la app funciona entera (el cuaderno vive en SQLite).
La cuenta añade perfil, copia en la nube y, más adelante, lo social.

## Qué hay en el repo

| Ruta | Para qué |
|---|---|
| `firebase.json`, `.firebaserc` | Configuración de la CLI (proyecto por defecto y emuladores) |
| `firestore.rules`, `firestore.indexes.json`, `storage.rules` | Reglas estrictas: cada usuario solo lee y escribe lo suyo |
| `functions/` | `onUserCreate`, `onSightingWrite`, `deleteAccount` (Node 22, TypeScript, pnpm) |
| `functions/test/rules.test.ts` | 21 pruebas de las reglas contra los emuladores |
| `app/src/lib/firebase.ts` | Único punto de `initializeApp` |
| `app/src/lib/auth.ts`, `app/src/store/auth.ts` | Google, Apple, cierre de sesión, borrado de cuenta |
| `app/src/sync/` | Sincronización del cuaderno (tablas propias `sync_item` y `sync_meta`) |
| `app/src/db/catalogUpdate.ts` | Actualización del catálogo de especies desde Storage |
| `tools/zarpa_data/stages/cloud.py` | Publica el catálogo en Storage (`catalog/`) |

### Modelo de datos

- `users/{uid}`: alias, photoURL, createdAt, updatedAt, `counters.sightings`. Lo crea la función; el cliente solo cambia alias y foto.
- `users/{uid}/private/settings`: ajustes privados.
- `users/{uid}/sightings/{id}`: copia de cada avistamiento (mismas columnas que la tabla local, sin rutas de ficheros; más `has_photo`, `has_sticker`, `sticker_ext`, `has_voice`, `voice_ext`, `schema`, `synced_at`). Las reglas validan también el diario (clima, momento del día, duración de la nota de voz).
- Storage, por avistamiento: `users/{uid}/sightings/{id}.jpg` (foto, JPEG ≤ 10 MB), `{id}.sticker.png|jpg` (pegatina ≤ 10 MB) y `{id}.voice.m4a` (nota de voz, audio ≤ 5 MB; también aac, mp4, caf, 3gp).
- Storage, `catalog/`: el catálogo de especies versionado y su `manifest.json`. Lectura pública; nadie lo escribe desde la app.
- Lo social (`publicProfiles`, `follows`) está preparado pero cerrado con `if false`.

## Pasos que haces tú en la consola

1. **Plan Blaze** (Consola de Firebase → Uso y facturación). Las funciones lo exigen. Crea una **alerta de presupuesto** (p. ej. 5 €) en Google Cloud → Facturación → Presupuestos y alertas.
2. **Authentication** → Sign-in method: activa **Google** y **Apple**. Al activar Google, Firebase crea el cliente OAuth «web»: su ID es el `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
3. **Firestore Database** → Crear base de datos en modo producción, región **eur3** (o europe-west1).
4. **Storage** → Comenzar, misma región.
5. **App web**: Configuración del proyecto → Tus apps → añadir app web. Copia la configuración del SDK a `app/.env` (parte de `app/.env.example`): `API_KEY`, `MESSAGING_SENDER_ID`, `APP_ID`. Son identificadores públicos, no secretos.
6. **App Android** `com.hrval.zarpa` con su SHA-1 (Google lo exige para el inicio de sesión).
   - Debug (keystore de `~/.android/debug.keystore`):
     `keytool -list -v -keystore %USERPROFILE%\.android\debug.keystore -alias androiddebugkey -storepass android -keypass android`
   - Release: `keytool -list -v -keystore <tu-keystore> -alias <alias>`. Si firmas con EAS: `pnpm dlx eas-cli@latest credentials` y copia el SHA-1 del keystore de Android.
   - Pega cada SHA-1 en Configuración del proyecto → app Android → Huellas digitales. No hace falta descargar `google-services.json`.
7. **App iOS** `com.hrval.zarpa`: copia su ID de cliente OAuth a `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` y pon su inverso (`com.googleusercontent.apps.XXXX`) en `app.json`, en el plugin `@react-native-google-signin/google-signin` → `iosUrlScheme` (ahora lleva un marcador `REEMPLAZAR-…`).
8. **Apple**: en developer.apple.com crea un **Service ID** y una **clave «Sign in with Apple»** (.p8, que NO se sube al repo). En Firebase → Authentication → Apple, introduce Service ID, Team ID, Key ID y el contenido de la clave. Activa la capacidad «Sign in with Apple» en el App ID.
9. **Desplegar** (desde la raíz del repo):
   ```
   pnpm dlx firebase-tools login
   pnpm --dir functions install
   pnpm dlx firebase-tools deploy --only firestore,storage,functions
   ```
   Los cambios nativos (plugins, entitlements) requieren un nuevo build de desarrollo: `pnpm exec expo run:android|ios`.

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
pnpm --dir functions test        # reglas contra los emuladores (necesita Java)
pnpm --dir functions build       # compila las funciones
```
Para que la app use los emuladores: `EXPO_PUBLIC_FIREBASE_EMULATORS=1` y `pnpm dlx firebase-tools emulators:start`.

## Notas

- Fotos, pegatinas y notas de voz se suben y se bajan con cada avistamiento. Si el mismo avistamiento se edita en dos móviles, gana la edición más reciente (`updated_at`).
- Borrar la cuenta llama a `deleteAccount`, que elimina Firestore, Storage y Auth. Es obligatorio en App Store y Google Play.
- La política de privacidad debe mencionar cuenta, fotos y ubicación almacenadas en Firebase (UE).
