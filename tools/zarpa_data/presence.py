"""
Presencia por país de cada especie: `{inat_id: {país: observaciones}}`.

La usan el catálogo (`stages/build.py`, tabla `country`) y la evaluación de la
IA (`zarpa_models/evaluate.py`, candidatos por país), para que la IA se mida
con los mismos candidatos que tendrá en el móvil.

Fuentes:
  * `gbif_countries.jsonl` (etapa countries): recuentos por país de cada clave
    de especie de GBIF. Valen tal cual cuando la clave corresponde a una sola
    especie de iNaturalist.
  * `gbif_split.jsonl` (etapa split): cuando GBIF agrupa bajo una clave varias
    especies que iNaturalist separa, el recuento de la clave mezcla
    poblaciones (a *Charaxes epijasius*, africana, le salía España, que es de
    *C. jasius*). Para esas especies se usa el recuento por el nombre con que se
    registró cada observación. Sin esa etapa, esas especies no tienen países:
    mejor sin dato que con el de otra especie.
"""

from __future__ import annotations

import json
from collections import defaultdict

from . import config


def _read(name: str):
    path = config.OUT / name
    if not path.exists():
        return
    for line in open(path, encoding="utf-8"):
        try:
            yield json.loads(line)
        except json.JSONDecodeError:
            continue


def species_by_gbif_key() -> dict[str, list[int]]:
    """Clave de especie aceptada en GBIF → especies de iNaturalist que caen en ella."""
    by_key: dict[str, list[int]] = defaultdict(list)
    for g in _read("gbif_taxa.jsonl"):
        if g.get("gbif_key"):
            by_key[str(g["gbif_key"])].append(g["inat_id"])
    return dict(by_key)


def species_countries(by_key: dict[str, list[int]] | None = None) -> dict[int, dict[str, int]]:
    by_key = by_key if by_key is not None else species_by_gbif_key()
    out: dict[int, dict[str, int]] = defaultdict(dict)
    for c in _read("gbif_countries.jsonl"):
        for key, n in c["species"].items():
            ids = by_key.get(key)
            if ids and len(ids) == 1:
                out[ids[0]][c["cc"]] = n
    for s in _read("gbif_split.jsonl"):
        out[s["inat_id"]].update(s["countries"])
    return dict(out)
