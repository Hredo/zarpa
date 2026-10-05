"""
Genera los iconos de Zarpa (assets/images/*.png) a partir del mismo dibujo que
src/components/Logo.tsx: la huella (almohadilla + cuatro dedos) en una
rejilla de 100 x 100, girada -12° como si caminara.

    cd app && uv run --with pillow python scripts/make_icons.py

Se rasteriza a 4x con Pillow y se reduce con Lanczos (bordes limpios sin
depender de cairo ni de DLL externas). Si cambias la geometría aquí, cámbiala
también en Logo.tsx (PAD_D, TOES, TILT): son la misma fuente.
"""
import math
import os

from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'assets', 'images')

# --- Geometría (idéntica a Logo.tsx) ---------------------------------------
PAD_START = (50, 53)
PAD_CURVES = [  # cúbicas: (c1, c2, fin)
    ((58.5, 53), (63.5, 58), (67.5, 63.5)),
    ((71.5, 69), (78, 71.5), (78, 78.5)),
    ((78, 84.5), (73, 88), (67, 87.5)),
    ((62, 87), (57, 84.5), (50, 84.5)),
    ((43, 84.5), (38, 87), (33, 87.5)),
    ((27, 88), (22, 84.5), (22, 78.5)),
    ((22, 71.5), (28.5, 69), (32.5, 63.5)),
    ((36.5, 58), (41.5, 53), (50, 53)),
]
TOES = [  # cx, cy, rx, ry, giro (grados)
    (38.5, 34, 8.2, 10.8, -12),
    (61.5, 34, 8.2, 10.8, 12),
    (20.5, 49, 7.2, 9.4, -36),
    (79.5, 49, 7.2, 9.4, 36),
]
TILT = -12  # giro de toda la huella alrededor de (50, 55)
CENTER = (50, 56)  # centro óptico de la huella (se lleva a 50, 50)

# --- Paleta -----------------------------------------------------------------
BRAND = (0xFF, 0x7A, 0x1A, 255)
INK = (0x14, 0x21, 0x3D, 255)
WHITE = (255, 255, 255, 255)
BG = (0xF7, 0xF6, 0xF2, 255)


def cubic(p0, p1, p2, p3, n=24):
    pts = []
    for i in range(1, n + 1):
        t = i / n
        a = (1 - t) ** 3
        b = 3 * (1 - t) ** 2 * t
        c = 3 * (1 - t) * t ** 2
        d = t ** 3
        pts.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return pts


def rot(p, deg, o):
    r = math.radians(deg)
    x, y = p[0] - o[0], p[1] - o[1]
    return (o[0] + x * math.cos(r) - y * math.sin(r), o[1] + x * math.sin(r) + y * math.cos(r))


def shapes():
    """Polígonos de la huella en unidades de 0..100, ya girada y centrada."""
    pad = [PAD_START]
    cur = PAD_START
    for c1, c2, end in PAD_CURVES:
        pad += cubic(cur, c1, c2, end)
        cur = end
    toes = []
    for cx, cy, rx, ry, g in TOES:
        poly = []
        for i in range(96):
            a = 2 * math.pi * i / 96
            poly.append(rot((cx + rx * math.cos(a), cy + ry * math.sin(a)), g, (cx, cy)))
        toes.append(poly)
    dx, dy = 50 - CENTER[0], 50 - CENTER[1]
    out = []
    for poly in [pad] + toes:
        out.append([(x + dx, y + dy) for x, y in (rot(p, TILT, (50, 55)) for p in poly)])
    return out


def paw_mask(size, scale, offset=(0, 0), ss=4):
    """Máscara L (0..255) de la huella; `scale` = fracción del lienzo que ocupa la rejilla de 100."""
    S = size * ss
    m = Image.new('L', (S, S), 0)
    d = ImageDraw.Draw(m)
    unit = S * scale / 100
    ox = (S - 100 * unit) / 2 + offset[0] * S
    oy = (S - 100 * unit) / 2 + offset[1] * S
    for poly in shapes():
        d.polygon([(ox + x * unit, oy + y * unit) for x, y in poly], fill=255)
    return m, ss


def dilate(mask, px):
    """Dilatación redonda y barata: difumina y umbraliza bajo."""
    return mask.filter(ImageFilter.GaussianBlur(px / 2)).point(lambda v: 255 if v > 14 else 0)


def erode(mask, px):
    return mask.filter(ImageFilter.GaussianBlur(px / 2)).point(lambda v: 255 if v > 241 else 0)


def die_cut(mask, px):
    """Contorno de pegatina: cierre morfológico (dilata de más y erosiona) para
    que el borde blanco abrace la huella entera, sin huecos entre los dedos."""
    return erode(dilate(mask, px * 1.5), px * 0.5).filter(ImageFilter.GaussianBlur(1))


def compose(size, bg, layers, ss=4):
    S = size * ss
    im = Image.new('RGBA', (S, S), bg)
    for color, mask in layers:
        solid = Image.new('RGBA', (S, S), color)
        im.paste(solid, (0, 0), mask)
    return im.resize((size, size), Image.LANCZOS)


def rounded(size, radius, color, ss=4):
    S = size * ss
    m = Image.new('L', (S, S), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, S - 1, S - 1), radius=radius * ss, fill=255)
    return m


def sticker(size, scale, paw=INK, outline=WHITE, border=0.05):
    m, ss = paw_mask(size, scale)
    ring = die_cut(m, size * ss * border)
    return [(outline, ring), (paw, m)]


def save(im, name):
    path = os.path.join(OUT, name)
    im.save(path, optimize=True)
    print('ok', name, im.size)


def main():
    # iOS / general: mandarina a sangre, huella azul noche con borde de pegatina.
    save(compose(1024, BRAND, sticker(1024, 0.62)), 'icon.png')
    # Android adaptativo: fondo plano + primer plano dentro de la zona segura (66 %).
    save(compose(1024, (0, 0, 0, 0), sticker(1024, 0.44)), 'android-icon-foreground.png')
    save(Image.new('RGBA', (1024, 1024), BRAND), 'android-icon-background.png')
    m, _ = paw_mask(1024, 0.44)
    save(compose(1024, (0, 0, 0, 0), [(WHITE, m)]), 'android-icon-monochrome.png')
    # Splash: huella mandarina sobre el fondo claro (lo pinta expo-splash-screen).
    m, _ = paw_mask(512, 0.9)
    save(compose(512, (0, 0, 0, 0), [(BRAND, m)]), 'splash-icon.png')
    # Favicon: pastilla mandarina redondeada con la huella.
    S = 96
    layers = [(BRAND, rounded(S, 22, BRAND))] + sticker(S, 0.66, border=0.045)
    fav = compose(S, (0, 0, 0, 0), layers).resize((48, 48), Image.LANCZOS)
    save(fav, 'favicon.png')


if __name__ == '__main__':
    main()
