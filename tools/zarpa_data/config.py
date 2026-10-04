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

# Una especie entra si personas la han fotografiado en libertad y la comunidad
# ha confirmado la identificación (grado «investigación» de iNaturalist) al
# menos este número de veces.
#
# Es la prueba de la regla del producto «solo animales que un humano puede ver
# sin ayuda»: lo que solo se conoce por ROV, dragas de profundidad, trampas de
# cuevas inaccesibles o drones no acumula fotos de personas. 25 deja fuera el
# ruido (especies con dos o tres fotos, a menudo mal asignadas) y conserva
# ~100 000 especies en todo el mundo (medido el 2026-10-04: el puesto 100 000
# tiene 23 observaciones de grado investigación).
MIN_RG_OBSERVATIONS = 25

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
}
DEFAULT_INTERVAL = 0.5
