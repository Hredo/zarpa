# Cómo contribuir a Zarpa

**Español** · [English](#contributing-to-zarpa)

Gracias por querer mejorar Zarpa. Toda ayuda cuenta: avisar de un fallo, corregir un dato,
mejorar un texto, proponer una idea o enviar código.

## Antes de empezar

- Lee el [código de conducta](CODE_OF_CONDUCT.md). Se aplica en issues, PR y revisiones.
- Busca en los [issues](https://github.com/Hredo/zarpa/issues) por si ya está abierto.
- Para cambios grandes (una pantalla nueva, otra fuente de datos, cambiar la IA), abre
  antes un issue y hablémoslo: ahorra trabajo a todos.
- Las vulnerabilidades **no** van a un issue público: ver [SECURITY.md](SECURITY.md).

## Avisar de un fallo

Usa la plantilla [Informar de un fallo](https://github.com/Hredo/zarpa/issues/new?template=fallo.yml).
Si la app se cerró, al volver a abrirla te ofrece **Compartir el error**: pega ese texto en
el informe, es lo que más ayuda. Di también el modelo de móvil y la versión de Android.

## Un dato está mal

Zarpa solo muestra datos verificados (de la autoridad de ese dato o de dos fuentes que
coinciden). Si ves uno mal, usa la plantilla [Dato incorrecto](https://github.com/Hredo/zarpa/issues/new?template=dato.yml)
con la especie, el dato y la fuente que lo contradice. Casi siempre el arreglo está en la
fuente original (iNaturalist, Wikidata, GBIF…) o en una regla de `tools/`, no en la app.

## Preparar el entorno

Sigue [Desarrollo en el README](README.md#desarrollo). En resumen:

```bash
cd app
pnpm install
pnpm android
```

**Solo pnpm.** No uses npm, npx ni yarn: el proyecto depende de la configuración de
`pnpm-workspace.yaml` (árbol plano para Metro y Gradle, scripts de instalación permitidos)
y otro gestor rompe el `pnpm-lock.yaml`. Para añadir una dependencia de Expo:
`pnpm exec expo install <paquete>`.

## Flujo de trabajo

1. Haz un *fork* y crea una rama desde `develop`: `fix/visor-zoom`, `feat/filtro-color`…
2. Haz tus cambios con commits pequeños y con sentido.
3. Antes de abrir la PR, en `app/`:
   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test
   ```
   Si tocas `firestore.rules`, `storage.rules` o `app/src/social/`, también
   `cd firebase && pnpm test`.
4. Abre la PR **contra `develop`** y rellena la plantilla. La CI tiene que estar en verde.
5. El mantenedor revisa y fusiona. `main` solo recibe lo que ya se ha probado en `develop`.

### Mensajes de commit

[Conventional Commits](https://www.conventionalcommits.org/) en inglés:

```
fix(viewfinder): keep the zoom label off the UI thread
feat(atlas): show protected areas near the user
docs: explain how to download the models
```

Tipos habituales: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `chore`, `ci`.

## Normas del código

- **TypeScript estricto**, sin `any` salvo que no quede otra (y explicado).
- **Comentarios en español**, explicando el *porqué*, no el *qué*. El código dice el qué.
- **Expo Router:** cada fichero de `app/src/app/` es una pantalla; lo demás va fuera.
- **No edites `android/` ni `ios/`:** se generan con `expo prebuild`. Lo nativo se configura
  en `app.json`, en *config plugins* o en un módulo de `app/modules/`.
- **Worklets:** una función que se llama desde un worklet (animaciones, gestos, visor)
  tiene que ser también un worklet (`'worklet'`). Si no, la app se cierra en producción.
  `tests/worklets.test.ts` lo comprueba en toda la app.
- **Animaciones** con `withTiming` y curva de salida, sin rebotes. Nada de emojis como
  iconos: hay un juego de iconos propio en `src/components/Icon.tsx`.
- **Contraste** correcto en modo claro (`tests/contrast.test.ts`).
- **Datos:** nunca se rellena un hueco con una suposición. Si una fuente no basta, el dato
  no se muestra.
- **Secretos:** nunca en el repositorio. La configuración va en `app/.env` (ver
  `.env.example`), que no se sube.
- **Pruebas:** todo arreglo de un fallo lleva una prueba que habría fallado antes.

## Licencia de las contribuciones

Al enviar una contribución aceptas que se publique bajo la [licencia MIT](LICENSE) del
proyecto. Si aportas datos o imágenes, tienen que tener una licencia libre compatible
(CC0, CC BY o CC BY-SA) y su autoría.

---

# Contributing to Zarpa

[Español](#cómo-contribuir-a-zarpa) · **English**

Thanks for wanting to make Zarpa better. Bug reports, data fixes, wording, ideas and code
are all welcome. The app's interface and code comments are in Spanish, but issues and PRs
in English are fine.

- Follow the [code of conduct](CODE_OF_CONDUCT.md). Report vulnerabilities privately
  ([SECURITY.md](SECURITY.md)), never in a public issue.
- For big changes, open an issue first so we can agree on the approach.
- Set up the project as described in [Development](README.en.md#development).
  **Use pnpm only** (no npm, npx or yarn); add Expo packages with `pnpm exec expo install`.
- Branch off `develop`, open the PR **against `develop`**, and make sure
  `pnpm typecheck`, `pnpm lint` and `pnpm test` pass in `app/` (plus `pnpm test` in
  `firebase/` if you touch the rules or `app/src/social/`).
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/) in English.
- Never edit `android/` or `ios/` (generated by `expo prebuild`); configure native code in
  `app.json`, config plugins or a module in `app/modules/`.
- Any function called from a worklet must be a worklet itself, or the release build
  crashes; `tests/worklets.test.ts` checks the whole app.
- Never commit secrets. Every bug fix comes with a test that would have failed before.
- By contributing you agree that your work is published under the project's
  [MIT licence](LICENSE). Data and images must carry a compatible free licence
  (CC0, CC BY or CC BY-SA) and their attribution.
