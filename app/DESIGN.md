# Zarpa · sistema de diseño

Contrato para quien toque pantallas. La fuente de verdad del código es
`src/theme/tokens.ts`; esto explica cómo usarla.

## Dirección: «Martín pescador»

Un álbum de pegatinas de animales a pleno sol. Fondo claro y luminoso, tinta
azul noche (no negro) y color repartido con oficio: mandarina para la marca y
la acción, azul noche para la selección y **un color por grupo animal** que da
orientación y vida a todo el álbum. La paleta sale de un animal real: el martín
pescador (espalda azul, pecho mandarina). Las fotos troqueladas con borde
blanco y radios generosos son la textura del mundo: pegatinas, no paneles.

Persona y escena: cualquier amante de los animales, fuera, de día, con el móvil
en una mano mientras mira al animal; y en casa repasando su álbum. Por eso:
legible al sol, táctil (48 pt), sin ruido.

## Reglas

1. **Solo modo claro.** `usePalette()` devuelve siempre la clara; `app.json`
   fuerza `light`; StatusBar `dark` (salvo el visor de cámara, `light`).
2. **Todo en español.** Nunca mostrar nombres en inglés (`name_en` no se pinta:
   si no hay nombre común en español se muestra el científico, en cursiva).
3. **Nada de rebotes.** `withTiming` + curvas `ease.*`, o `withSpring` con
   `SPRING_NO_BOUNCE` (`dampingRatio: 1`). Nunca `ease-in` en UI.
4. Respeta «reducir movimiento»: todas las primitivas ya lo hacen.
5. Sin hex sueltos en pantallas: `palette.*`, `groupColor(code)`, `iucnColors`.
6. Contraste AA comprobado en `tests/contrast.test.ts`: si añades un color o una
   pareja de texto/fondo, añádela al test.
7. Iconos solo de `<Icon>` (SVG propio, trazo 1,9). Nada de emojis como icono.
8. Una tarjeta nunca dentro de otra. Nada de rótulos-ceja encima de los títulos.

## Paleta (roles)

| Token | Hex | Trabajo |
|---|---|---|
| `bg` | `#F7F6F2` | Fondo de pantalla, blanco piedra |
| `surface` | `#FFFFFF` | Tarjetas, barras, hojas |
| `surfaceAlt` | `#EEECE6` | Huecos, pistas de medidores |
| `ink` / `inkSoft` / `inkFaint` | `#14213D` / `#46506A` / `#5C6680` | Texto (todas AA sobre los tres fondos) |
| `line` / `lineStrong` | `#E3E1DA` / `#C5C2B8` | Filetes y bordes |
| `brand` + `onBrand` | `#FF7A1A` + `#14213D` | Marca y acción principal (Avistar, CTA). **Texto encima siempre azul noche**, nunca blanco |
| `brandInk` / `brandTint` | `#B4470A` / `#FFEBDB` | Texto de marca sobre claro / fondo de «nuevo» |
| `strong` + `onStrong` / `onStrongSoft` | `#14213D` + `#FFFFFF` / `#C9D3EA` | Selección (chips activos), botón secundario fuerte |
| `strongDeep` | `#0C1529` | Superficies inmersivas (revisión de captura sobre cámara) |
| `strongTint` | `#E6EAF3` | Selección suave (pestaña activa) |
| `sun` / `sunTint` | `#FFC53D` / `#FFF4D6` | Rareza alta, logros (texto encima `onSun`) |
| `leaf` / `leafTint` | `#2F9E55` / `#E1F3E7` | Éxito, avistada, naturaleza |
| `sky` / `skyTint` | `#1F6FD1` / `#E2EDFB` | Agua, mapas, enlaces |
| `red` / `redTint` | `#C41E3A` / `#FCE4E7` | Lo raro, introducida, alertas no destructivas |
| `danger` | `#C62828` | Errores y acciones destructivas |

**Grupos** (`groupColor(code)` → `{ color, tint, ink }`): `color` para iconos,
puntos y barras; `tint` para fondos de chip/cabecera; `ink` para texto sobre
`tint` o blanco.

| Grupo | color | tint | ink |
|---|---|---|---|
| mamífero | `#B45A2A` | `#F5E8E1` | `#A1532C` |
| ave | `#2F6FE4` | `#E2EBFB` | `#2B63C9` |
| reptil | `#5E8F1A` | `#E8EFDF` | `#4C7522` |
| anfibio | `#11916F` | `#DEF0EB` | `#127663` |
| pez | `#0B8AA6` | `#DDEFF3` | `#0D718D` |
| insecto | `#B2820C` | `#FAF1DB` | `#86671A` |
| arácnido | `#7B4BB7` | `#EDE6F5` | `#7B4BB7` |
| crustáceo | `#E0533A` | `#FBE7E3` | `#AF473B` |
| miriápodo | `#9A6B2F` | `#F1EAE2` | `#876131` |
| molusco | `#D14C8C` | `#F9E6EF` | `#A7437B` |
| cnidario | `#5B5FD6` | `#E8E9F9` | `#575BCD` |
| equinodermo | `#C7365F` | `#F7E3E9` | `#B9345C` |
| anélido | `#B5687A` | `#F5EAEC` | `#92586D` |
| esponja | `#9C8605` | `#F3EFDB` | `#766A15` |
| otro | `#64708A` | `#E9EBEF` | `#5C6882` |

**UICN**: colores oficiales de la Lista Roja (`iucnColors`), sin recolorear.

## Tipografía

- **Bricolage Grotesque** 600/700/800 — rótulos: nombres de especie, títulos,
  cifras. Ancha, redonda, con carácter; amable sin ser infantil.
- **Atkinson Hyperlegible Next** — todo el texto corrido y etiquetas (diseñada
  para baja visión: se lee al sol). Cursiva para nombres científicos (`sci`).
- **Atkinson Hyperlegible Mono** — solo medidas reales (coordenadas, recuentos,
  números de cromo).

| Variante | Fuente | Tamaño/interlínea |
|---|---|---|
| `hero` | Bricolage 800 | 40/44 |
| `title` | Bricolage 800 | 30/34 |
| `heading` | Bricolage 700 | 22/28 |
| `subheading` | Bricolage 700 | 17/22 |
| `stat` | Bricolage 800, cifras tabulares | 24/28 |
| `body` / `bodyStrong` | Atkinson 400/700 | 16/24 |
| `sci` | Atkinson cursiva | 15/20 |
| `label` | Atkinson 700 | 13/16 |
| `small` | Atkinson 400 | 13/18 |
| `data` / `dataLarge` | Atkinson Mono | 13/16 · 18/22 |

## Escala

- Espacio (`space`): 2 · 4 · 8 · 12 · 16 · 24 · 32 · 48. Margen de pantalla 16
  (20 en pantallas de lectura). Más aire encima de un título que debajo.
- Radios (`radius`): 8 · 12 · 18 · 26 · pill. Tarjeta 18; foto dentro con
  inserto de 6 → radio 12 (concéntricos).
- Elevación (`elevation.card` / `.raised`): sombra azul noche suave con
  desplazamiento; nada de sombras duras ni halos.
- Iconos (`iconSize`): 16 · 20 · 24 · 32. Área táctil mínima `HIT` = 48.

## Movimiento

Tokens: `ease.out` (entradas, pulsación), `ease.inOut` (cambios en pantalla),
`ease.sheet`; `duration.press` 120 · `small` 180 · `enter` 260 · `emphasis`
420 · `fill` 700; `stagger.step` 45 ms, máximo 8 elementos.

Primitivas (`src/components/motion`):

- `<Appear index delay from="below|scale|none">` — entrada escalonada al montar
  (fundido + 12 px). Para fichas y resúmenes, no para filas de listas recicladas.
- `<AnimatedNumber value decimals prefix suffix variant delay>` — cuenta hasta
  el valor en el hilo de UI.
- `<FadeImage … placeholderColor>` — expo-image con fundido al cargar.
- `useFill(value, delay)` — progreso 0–1 animado (base de `Meter`).
- `<Press>` — escala 0,97 al apoyar el dedo, 120 ms.

Qué no anima: cambiar de pestaña, seleccionar chips, filtros (se hacen decenas
de veces por sesión). El momento con más movimiento es la ficha al abrirse y la
captura de un avistamiento: ahí se gasta el presupuesto.

## Componentes

| Componente | API |
|---|---|
| `Txt` | `variant`, `tone` (ink·soft·faint·brand·onBrand·onStrong·onStrongSoft·onSun·danger·red·sky), `color`, `align`, `upper` |
| `Press` | Pressable + `haptic`, `scaleTo`; `disabled` baja a 0,45 |
| `Section` | `title`, `icon?`, `accent?`, `tint?`, `aside?` |
| `Card` | `tone` plain·tint·outline, `tint?`, `onPress?`, `padding?` |
| `Chip` | `label`, `selected`, `onPress`, `icon?`, `count?`, `color?` (GroupColor) |
| `StatTile` | `icon`, `value` (número cuenta / texto), `label`, `unit?`, `decimals?`, `color?`, `tint?`, `delay?` |
| `Meter` | `value` 0–1, `color?`, `trackColor?`, `height?`, `label?`, `valueLabel?`, `delay?` |
| `GroupPill` | `code`, `size` sm·md, `form` singular·plural, `iconOnly?` |
| `IucnBadge` | `code`, `compact?` |
| `Cromo` | `species`, `caught`, `width`, `onPress` (alto = ancho / `CROMO_RATIO`) |
| `Icon` | `name` (incluye los 15 grupos y ruler, weight, hourglass, leaf, sun, moon, drop, wave, tree, mountain, egg, heart, star, sparkle, eye, calendar…), `size`, `color`, `strokeWidth` |
| `Logo` | `variant` mark·full, `size`, `tone` brand·ink·white, `sticker?` |
| `TabBar` | barra propia: 4 pestañas con icono+nombre y Avistar central |

## Logo e iconos

La huella (almohadilla trilobulada + cuatro dedos) girada -12°, con borde
troquelado de pegatina en el icono. Geometría única en `Logo.tsx`
(`PAD_D`, `TOES`, `PAW_TRANSFORM`) y en `scripts/make_icons.py`, que regenera
`assets/images/*.png`:

```
cd app && uv run --with pillow python scripts/make_icons.py
```
