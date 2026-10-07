# Cambios

Todos los cambios importantes de Zarpa. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y las versiones,
[SemVer](https://semver.org/lang/es/).

## [0.1.1] — 2026-10-07

### Arreglado

- La IA de especies fallaba en cada foto («execute: Method 'forward' failed»,
  `Error::Internal`): el modelo exportado llevaba la normalización de CLIP como una
  resta y una división delante de la convolución cuantizada, y XNNPACK no podía
  propagar las formas. La normalización va ahora plegada en esa convolución (la misma
  función) y el exportador ejecuta el `.pte` con ExecuTorch y lo compara con el modelo
  original antes de darlo por bueno (coseno medio 0,998 sobre fotos reales).
- El disparo ya no hace sonido de obturador (salvo donde la ley lo exige).

## [0.1.0] — 2026-10-07

Primera versión pública (beta, Android).

### Añadido

- Visor con reconocimiento de especies en el móvil (RF-DETR Nano + BioCLIP sobre
  ExecuTorch) con umbrales calibrados al 95 % y fichaje con la foto en alta resolución.
- Todos los objetivos y todo el zoom de la cámara (ultra gran angular, tele y el máximo
  digital), con atajos y rueda de zoom.
- Cuaderno de cromos con pegatinas recortadas del fondo, diario, notas de voz, clima y
  momento del día.
- Bestiario de 266 365 especies y 8 417 razas oficiales, con buscador, filtros y fichas
  con fotos libres, sonidos, huellas y láminas de Wikimedia Commons.
- Atlas con observaciones de GBIF, municipios, bosques, parques y espacios protegidos.
- Excursiones, calendario, retos semanales, logros, quiz diario y avisos de rarezas cerca.
- Cuentas de Google, amigos por código, álbum compartido y copia en la nube (plan
  gratuito de Firebase), e iNaturalist con OAuth y PKCE.
- Catálogo servido desde Firebase Hosting (ya no va dentro del APK).
- Registro de cierres: si la app se cierra por un error, al volver a abrirla dice cuál y
  deja compartirlo, sin necesidad de conectar el móvil a un ordenador.

### Arreglado

- La app se cerraba al abrir el visor: el indicador del zoom llamaba a una función normal
  desde el hilo de la interfaz, un error fatal en la versión de producción. Una prueba
  revisa ahora todos los worklets de la app.
- La IA de especies no cargaba nunca («AccessFailed»): ExecuTorch recibía la ruta del
  modelo como URI `file://`.
- El visor se llenaba con una traza de Java cuando CameraX cancelaba un zoom (no es un
  fallo). Los errores reales salen en una línea y el detalle se comparte tocando el aviso.
- El disparador no hacía nada: la cámara se apagaba a mitad de la foto.
- El recorte del animal podía salirse un píxel de la foto y el fichaje fallaba.
- La pegatina se dibujaba en el hilo principal y congelaba la pantalla un momento.
- Faltaban las fotos y sonidos de Wikimedia Commons en Android (respuesta 403 sin
  User-Agent propio).
- Sonidos de otro animal en algunas fichas: ahora solo grabaciones identificadas por el sonido.

[0.1.1]: https://github.com/Hredo/zarpa/releases/tag/v0.1.1
[0.1.0]: https://github.com/Hredo/zarpa/releases/tag/v0.1.0
