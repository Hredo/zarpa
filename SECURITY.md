# Política de seguridad

**Español** · [English](#security-policy)

## Versiones con soporte

Solo la [última versión](https://github.com/Hredo/zarpa/releases) recibe arreglos de
seguridad. Si usas una anterior, actualiza primero y comprueba si el problema sigue.

## Cómo avisar de una vulnerabilidad

**No abras un issue público.** Avisa en privado a través de GitHub:

1. Entra en la pestaña [Security](https://github.com/Hredo/zarpa/security) del repositorio.
2. Pulsa **Report a vulnerability**
   ([enlace directo](https://github.com/Hredo/zarpa/security/advisories/new)).

Solo el mantenedor ve el aviso. Ayuda mucho incluir:

- la versión de la app (o el commit) y el móvil y la versión de Android o iOS;
- qué puede hacer un atacante y qué necesita tener antes;
- los pasos para reproducirlo o una prueba de concepto.

Es un proyecto que mantiene una persona: no hay un plazo fijo, pero recibirás respuesta lo
antes posible, con si se acepta, cuál será el arreglo y cuándo sale. Si quieres aparecer en
el aviso publicado, dilo.

## Qué entra

- **La app:** almacenamiento local (SQLite, almacén seguro), el inicio de sesión con Google
  y Apple, el flujo OAuth con PKCE de iNaturalist, la descarga y verificación del catálogo
  (MD5 del manifiesto) y los módulos nativos de `app/modules/`.
- **Las reglas de Firebase** (`firestore.rules`, `storage.rules`): son la única defensa de
  los datos de cada cuenta. Leer o escribir datos de otra persona, saltarse la forma
  validada de un documento o el borrado de cuenta cuentan como vulnerabilidad.
- **`tools/`**, si un dato de una fuente externa pudiera ejecutar código o colar contenido
  en el catálogo publicado.

## Qué no entra

- Fallos en servicios de terceros (Firebase, iNaturalist, GBIF, Wikimedia…): avisa a cada uno.
- La configuración web de Firebase del cliente (`EXPO_PUBLIC_FIREBASE_*`): son
  identificadores públicos por diseño; la protección está en las reglas.
- Ataques que necesitan un móvil ya comprometido (root, depuración activada por el atacante).

---

# Security policy

[Español](#política-de-seguridad) · **English**

**Supported versions:** only the [latest release](https://github.com/Hredo/zarpa/releases)
gets security fixes.

**Reporting a vulnerability:** please **do not open a public issue**. Use GitHub's private
reporting: [Security tab](https://github.com/Hredo/zarpa/security) → **Report a
vulnerability** ([direct link](https://github.com/Hredo/zarpa/security/advisories/new)).
Include the app version (or commit), the device and OS version, the impact and what an
attacker needs, and steps or a proof of concept. This is a one-person project with no fixed
deadline, but you will get an answer as soon as possible; say so if you want to be credited.

**In scope:** the app (local storage, Google/Apple sign-in, iNaturalist OAuth with PKCE,
catalogue download and verification, the native modules in `app/modules/`), the Firebase
rules (`firestore.rules`, `storage.rules`, the only protection of each account's data) and
`tools/` if external data could execute code or inject content into the published catalogue.

**Out of scope:** bugs in third-party services (report them to each provider), the
client-side Firebase web configuration (public identifiers by design; protection lives in
the rules), and attacks that require an already compromised device.
