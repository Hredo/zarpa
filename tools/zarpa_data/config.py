"""
Parámetros del pipeline.

Todo umbral que decide si algo entra o no en el catálogo vive aquí, con su
porqué. Cambiar uno de estos números cambia qué ve el usuario, así que no deben
estar repartidos por los scripts.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "cache"
OUT = ROOT / "out"
EXTERNAL = ROOT / "external"

# Identificación ante las API públicas. Wikimedia, GBIF e iNaturalist piden un
# User-Agent con un contacto; se usa la página pública del autor en GitHub y no
# un correo personal.
USER_AGENT = "ZarpaDataBot/0.1 (+https://github.com/Hredo; catalogo de fauna)"

# --- Qué especies entran -----------------------------------------------------

# Una especie entra si al menos una persona la ha fotografiado en libertad y la
# comunidad ha confirmado la identificación (grado «investigación» de
# iNaturalist: dos o más identificadores y al menos dos tercios de acuerdo).
#
# Es la prueba de la regla del producto «solo animales que un humano puede ver
# sin ayuda», a escala mundial: lo que solo se conoce por ejemplares de museo,
# dragas, trampas de cuevas inaccesibles o drones no tiene fotos de personas en
# libertad. El nombre además tiene que existir en la taxonomía de GBIF (etapa
# gbif) y, si es marino, no estar registrado solo en aguas profundas (etapa
# depth): verlo exigiría un submarino.
#
# Hasta el 2026-10-04 el corte era 25 observaciones (~97 000 especies). Hugo
# quiere todas las especies del mundo: con 1 son ~297 000. La rareza de cada
# especie sigue diciendo lo difícil que es verla.
MIN_RG_OBSERVATIONS = 1

# Etiqueta de la tirada del universo: los recuentos cambian cada día y una
# página vieja en caché mezclada con páginas nuevas podría saltarse especies
# en el borde entre páginas. Se cambia al rehacer el universo.
UNIVERSE_SNAPSHOT = "2026-10-04-mundo"

# Solo observaciones de animales en libertad. Sin esto, un pingüino del zoo de
# Madrid contaría como prueba de que se puede ver en España.
WILD_ONLY = True

# Lugar de iNaturalist cuyos nombres comunes en español se prefieren (España).
# El mismo animal se llama distinto en México o Argentina; el público inicial
# es de España.
INAT_PLACE_SPAIN = 6774

# --- Ritmo de las peticiones ---------------------------------------------------

# Segundos mínimos entre peticiones a cada host. iNaturalist pide no pasar de
# 60 por minuto y 10 000 al día; GBIF y Wikimedia no publican un límite duro,
# pero piden mesura y cabecera de contacto.
MIN_INTERVAL = {
    "api.inaturalist.org": 1.05,
    "api.gbif.org": 0.12,
    "query.wikidata.org": 1.0,
    "www.wikidata.org": 0.2,
    "commons.wikimedia.org": 0.2,
    "es.wikipedia.org": 0.2,
    "en.wikipedia.org": 0.2,
    "www.marinespecies.org": 0.3,
    # Fotos de iNaturalist (cubo público de AWS Open Data): ficheros estáticos.
    "inaturalist-open-data.s3.amazonaws.com": 0.1,
    # Webs institucionales sin API: una página por segundo.
    "www.fci.be": 1.0,
    "fifeweb.org": 1.0,
    "www.mapa.gob.es": 1.0,
}
DEFAULT_INTERVAL = 0.5
