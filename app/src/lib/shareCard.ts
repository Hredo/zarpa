import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  BlurStyle,
  ClipOp,
  FontStyle,
  ImageFormat,
  PaintStyle,
  Skia,
  type SkCanvas,
  type SkImage,
  type SkTypeface,
} from '@shopify/react-native-skia';

import { PAD_D, TOES } from '@/components/Logo';
import { fontAssets } from '@/theme/fonts';
import { groupColors, iucnColors, light, type GroupColor } from '@/theme/tokens';

import { CARD_H, CARD_IUCN_SCALE, CARD_W, coverSrc, containDst, ellipsize, fitFontSize, iucnIndex } from './cardMath';

/*
 * Cromo para compartir: 1080 × 1350 con Skia fuera de pantalla (sin montar
 * nada en la UI). Lleva la foto, el nombre, el científico, el grupo con su
 * color, la escala de la Lista Roja, la fecha si es un avistamiento, el logo
 * y —si la foto es de Commons/iNaturalist— su autor y licencia.
 */

export type CardInput = {
  id: number;
  name: string;
  isSci?: boolean;
  sci: string;
  /** Código del grupo y su nombre en singular («Ave»). */
  grp: string;
  groupLabel: string;
  iucn: string | null;
  rarityLabel: string | null;
  /** Foto: URL https o archivo local. */
  photo: string | null;
  /** `contain` para pegatinas con transparencia, `cover` para fotos. */
  fit?: 'cover' | 'contain';
  /** «Avistada el 5 de octubre de 2026» si es un avistamiento propio. */
  dateText?: string | null;
  placeText?: string | null;
  /** «Foto: Autora · CC BY 4.0»; vacío si la foto es del propio usuario. */
  credit?: string | null;
};

const fontCache = new Map<string, SkTypeface>();

async function loadTypeface(key: keyof typeof fontAssets): Promise<SkTypeface | null> {
  const hit = fontCache.get(key);
  if (hit) return hit;
  try {
    const asset = await Asset.fromModule(fontAssets[key]).downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    const data = await Skia.Data.fromURI(uri);
    const tf = Skia.Typeface.MakeFreeTypeFaceFromData(data);
    if (tf) fontCache.set(key, tf);
    return tf;
  } catch {
    return null;
  }
}

async function loadImage(uri: string | null): Promise<SkImage | null> {
  if (!uri) return null;
  try {
    const data = await Skia.Data.fromURI(uri);
    return Skia.Image.MakeImageFromEncoded(data);
  } catch {
    return null;
  }
}

function paint(color: string, style: PaintStyle = PaintStyle.Fill): ReturnType<typeof Skia.Paint> {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setStyle(style);
  p.setColor(Skia.Color(color));
  return p;
}

function rr(x: number, y: number, w: number, h: number, r: number) {
  return Skia.RRectXY(Skia.XYWHRect(x, y, w, h), r, r);
}

function drawPaw(canvas: SkCanvas, x: number, y: number, size: number, color: string) {
  canvas.save();
  canvas.translate(x, y);
  canvas.scale(size / 100, size / 100);
  // PAW_TRANSFORM = translate(0 -6) rotate(-12 50 55)
  canvas.translate(0, -6);
  canvas.rotate(-12, 50, 55);
  const fill = paint(color);
  const pad = Skia.Path.MakeFromSVGString(PAD_D);
  if (pad) canvas.drawPath(pad, fill);
  for (const [cx, cy, rx, ry, g] of TOES) {
    canvas.save();
    canvas.rotate(g, cx, cy);
    canvas.drawOval(Skia.XYWHRect(cx - rx, cy - ry, rx * 2, ry * 2), fill);
    canvas.restore();
  }
  canvas.restore();
}

/** Dibuja el cromo y devuelve la imagen. */
export async function renderCard(input: CardInput): Promise<SkImage> {
  const [display, bold, text, textBold, textItalic, photo] = await Promise.all([
    loadTypeface('BricolageGrotesque_800ExtraBold'),
    loadTypeface('BricolageGrotesque_700Bold'),
    loadTypeface('AtkinsonHyperlegibleNext_400Regular'),
    loadTypeface('AtkinsonHyperlegibleNext_700Bold'),
    loadTypeface('AtkinsonHyperlegibleNext_700Bold_Italic'),
    loadImage(input.photo),
  ]);
  const fallback = Skia.FontMgr.System().matchFamilyStyle('sans-serif', FontStyle.Normal);
  const face = (tf: SkTypeface | null) => tf ?? fallback;

  const g: GroupColor = groupColors[input.grp as keyof typeof groupColors] ?? groupColors.otro;
  const surface = Skia.Surface.MakeOffscreen(CARD_W, CARD_H);
  if (!surface) throw new Error('No se pudo crear la superficie de dibujo');
  const canvas = surface.getCanvas();

  // Fondo: blanco piedra con una franja del color del grupo arriba.
  canvas.drawRect(Skia.XYWHRect(0, 0, CARD_W, CARD_H), paint(light.bg));
  canvas.drawRect(Skia.XYWHRect(0, 0, CARD_W, 520), paint(g.tint));

  // Hoja blanca con sombra suave.
  const M = 48;
  const sheet = { x: M, y: M, w: CARD_W - M * 2, h: CARD_H - M * 2 };
  const shadow = paint('#14213D');
  shadow.setAlphaf(0.16);
  shadow.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 22, true));
  canvas.drawRRect(rr(sheet.x, sheet.y + 14, sheet.w, sheet.h, 64), shadow);
  canvas.drawRRect(rr(sheet.x, sheet.y, sheet.w, sheet.h, 64), paint(light.surface));

  // Foto troquelada.
  const P = 24;
  const ph = { x: sheet.x + P, y: sheet.y + P, w: sheet.w - P * 2, h: 780 };
  canvas.save();
  canvas.clipRRect(rr(ph.x, ph.y, ph.w, ph.h, 44), ClipOp.Intersect, true);
  canvas.drawRect(Skia.XYWHRect(ph.x, ph.y, ph.w, ph.h), paint(g.tint));
  if (photo) {
    const src = input.fit === 'contain' ? Skia.XYWHRect(0, 0, photo.width(), photo.height()) : (() => {
      const r = coverSrc(photo.width(), photo.height(), ph.w, ph.h);
      return Skia.XYWHRect(r.x, r.y, r.width, r.height);
    })();
    const dstR =
      input.fit === 'contain'
        ? containDst(photo.width(), photo.height(), { x: ph.x + 24, y: ph.y + 24, width: ph.w - 48, height: ph.h - 48 })
        : { x: ph.x, y: ph.y, width: ph.w, height: ph.h };
    canvas.drawImageRect(photo, src, Skia.XYWHRect(dstR.x, dstR.y, dstR.width, dstR.height), paint('#FFFFFF'));
  }
  canvas.restore();

  // Pastilla del grupo sobre la foto.
  const pillFont = Skia.Font(face(bold), 34);
  const pillW = pillFont.measureText(input.groupLabel).width + 64;
  canvas.drawRRect(rr(ph.x + 28, ph.y + 28, pillW, 64, 32), paint('#FFFFFF'));
  canvas.drawCircle(ph.x + 28 + 32, ph.y + 28 + 32, 11, paint(g.color));
  canvas.drawText(input.groupLabel, ph.x + 28 + 54, ph.y + 28 + 44, paint(g.ink), pillFont);

  // Nombre y científico.
  const left = ph.x + 16;
  const maxW = ph.w - 32;
  const nameFace = face(display);
  const nameSize = fitFontSize((s) => Skia.Font(nameFace, s).measureText(input.name).width, maxW, 92, 48);
  const nameFont = Skia.Font(nameFace, nameSize);
  const nameText = ellipsize(input.name, (t) => nameFont.measureText(t).width, maxW);
  const nameY = ph.y + ph.h + 36 + nameSize * 0.8;
  canvas.drawText(nameText, left, nameY, paint(light.ink), nameFont);

  const sciFont = Skia.Font(face(textItalic), 40);
  const sciText = ellipsize(input.sci, (t) => sciFont.measureText(t).width, maxW);
  const sciY = nameY + 58;
  if (!input.isSci || sciText !== nameText) canvas.drawText(sciText, left, sciY, paint(light.inkSoft), sciFont);

  // Escala de la Lista Roja.
  let y = sciY + 52;
  const idx = iucnIndex(input.iucn);
  if (idx >= 0) {
    const gap = 10;
    const cw = (maxW - gap * (CARD_IUCN_SCALE.length - 1)) / CARD_IUCN_SCALE.length;
    const codeFont = Skia.Font(face(bold), 30);
    CARD_IUCN_SCALE.forEach((code, i) => {
      const cur = i === idx;
      const c = iucnColors[code];
      const x = left + i * (cw + gap);
      const top = cur ? y - 8 : y;
      const h = cur ? 84 : 68;
      const p = paint(c.bg);
      if (!cur) p.setAlphaf(0.45);
      canvas.drawRRect(rr(x, top, cw, h, 18), p);
      if (cur) canvas.drawRRect(rr(x, top, cw, h, 18), paint(light.ink, PaintStyle.Stroke));
      const tw = codeFont.measureText(code).width;
      canvas.drawText(code, x + (cw - tw) / 2, top + h / 2 + 11, paint(cur ? c.fg : light.inkSoft), codeFont);
    });
    y += 84;
  }
  const meta = [input.rarityLabel ? `Rareza: ${input.rarityLabel}` : null, input.dateText ?? null, input.placeText ?? null]
    .filter(Boolean)
    .join('  ·  ');
  if (meta) {
    const metaFont = Skia.Font(face(textBold), 32);
    canvas.drawText(ellipsize(meta, (t) => metaFont.measureText(t).width, maxW), left, y + 52, paint(light.ink), metaFont);
  }

  // Pie: logo y crédito.
  const footY = sheet.y + sheet.h - 56;
  drawPaw(canvas, left - 6, footY - 54, 70, light.brand);
  const logoFont = Skia.Font(face(display), 46);
  canvas.drawText('Zarpa', left + 70, footY, paint(light.ink), logoFont);
  if (input.credit) {
    const credFont = Skia.Font(face(text), 24);
    const credW = maxW - 260;
    const credText = ellipsize(input.credit, (t) => credFont.measureText(t).width, credW);
    const tw = credFont.measureText(credText).width;
    canvas.drawText(credText, left + maxW - tw, footY - 2, paint(light.inkFaint), credFont);
  }

  surface.flush();
  const snap = surface.makeImageSnapshot();
  return snap.makeNonTextureImage() ?? snap;
}

/** Genera el cromo, lo guarda en caché y abre la hoja de compartir del sistema. */
export async function shareCard(input: CardInput): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  const image = await renderCard(input);
  const bytes = image.encodeToBytes(ImageFormat.PNG, 100);
  const file = new File(Paths.cache, `zarpa-cromo-${input.id}-${Date.now()}.png`);
  file.create({ overwrite: true });
  file.write(bytes);
  await Sharing.shareAsync(file.uri, {
    mimeType: 'image/png',
    UTI: 'public.png',
    dialogTitle: `${input.name} en Zarpa`,
  });
  return true;
}
