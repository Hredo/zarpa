"""
Ampliar el universo sin repetir lo ya descargado.

Las etapas piden por lotes (250 especies a Wikidata, 50 a WoRMS…) y la caché
HTTP guarda cada lote por su URL. Si al ampliar el universo cambiara el orden
de las especies, cambiarían los lotes y habría que pedirlo todo otra vez. Con
este orden —primero todas las de la tirada anterior, en su orden de entonces y
aunque alguna ya no esté; después las nuevas— los lotes antiguos son idénticos
y salen de la caché. Consultar una especie que ya no está no hace daño: el
catálogo final solo usa las del universo vigente.
"""

from __future__ import annotations

import json

from . import config


def stable_rows(universe: list[dict]) -> list[dict]:
    rows: list[dict] = []
    seen: set[int] = set()
    base = config.OUT / "v1" / "universe.jsonl"
    if base.exists():
        for line in open(base, encoding="utf-8"):
            u = json.loads(line)
            if u["inat_id"] not in seen:
                rows.append(u)
                seen.add(u["inat_id"])
    for u in universe:
        if u["inat_id"] not in seen:
            rows.append(u)
            seen.add(u["inat_id"])
    return rows


def stable_order(universe: list[dict]) -> list[int]:
    return [u["inat_id"] for u in stable_rows(universe)]
