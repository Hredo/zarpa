"""
Etapa 11 · ¿Hace falta un submarino para verla?

Regla del producto: no entran animales que solo se pueden ver con submarino (o
robot submarino). El buceo recreativo llega hasta 40 m; por debajo ya no es
«verlo sin ayuda».

GBIF tiene la profundidad de unos 60 millones de registros de animales (redes,
dragas, buceadores, ROV, colecciones). Dos consultas agrupadas por especie:

  - registros entre 0 y 40 m,
  - registros a más de 40 m.

Una especie se considera de aguas profundas si tiene al menos 20 registros por
debajo de 40 m y los de 0–40 m no llegan al 2 % (margen para profundidades mal
anotadas como 0). Las especies sin ningún registro de profundidad (casi todas
las terrestres y muchas costeras) no se tocan.

Esto solo marca; quién se queda fuera lo decide build.py con dos condiciones
más, porque el campo de profundidad de GBIF se usa mal en algunos conjuntos
(salen «profundos» un guepardo y polillas):
  - que la especie sea solo marina según WoRMS, y
  - que tenga menos de 25 avistamientos confirmados: si la gente la fotografía
    a menudo (buceando, en la lonja, desde la costa) está demostrado que se
    puede ver sin submarino, aunque los arrastres la registren sobre todo en
    profundidad (calamar Rossia pacifica, cangrejo real, esponja de nube…).

Salida: `out/depth.jsonl` (clave de GBIF → registros someros y profundos).
"""

from __future__ import annotations

import json

from .. import config
from ..http import fetch_json

LIMIT_M = 40
MIN_DEEP = 20
MAX_SHALLOW_SHARE = 0.02


def _facet(depth: str) -> dict[str, int]:
    rec = fetch_json(
        "https://api.gbif.org/v1/occurrence/search",
        {
            "kingdomKey": 1,
            "depth": depth,
            "occurrenceStatus": "PRESENT",
            "facet": "speciesKey",
            "facetMincount": 1,
            "facetLimit": 1_000_000,
            "limit": 0,
        },
    )
    facets = (rec["data"] or {}).get("facets") or []
    return {f["name"]: f["count"] for f in (facets[0]["counts"] if facets else [])}


def deep_only(shallow: int, deep: int) -> bool:
    return deep >= MIN_DEEP and shallow < MAX_SHALLOW_SHARE * (shallow + deep)


def run() -> None:
    shallow = _facet(f"0,{LIMIT_M}")
    deep = _facet(f"{LIMIT_M}.01,11000")
    keys = set(shallow) | set(deep)
    n_deep = 0
    with open(config.OUT / "depth.jsonl", "w", encoding="utf-8") as fh:
        for k in keys:
            s, d = shallow.get(k, 0), deep.get(k, 0)
            only = deep_only(s, d)
            n_deep += only
            fh.write(json.dumps({"gbif_key": k, "shallow": s, "deep": d, "deep_only": only}) + "\n")
    print(f"[profundidad] {len(keys)} especies con profundidad en GBIF; {n_deep} solo en aguas profundas (>{LIMIT_M} m)")
