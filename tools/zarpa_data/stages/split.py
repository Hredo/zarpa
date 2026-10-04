"""
Etapa · Presencia por país de las especies que GBIF agrupa bajo una clave.

GBIF tiene a veces bajo una sola clave lo que iNaturalist separa en varias
especies (2 264 claves y 4 850 especies el 2026-10-04): *Charaxes jasius* del
Mediterráneo, *C. epijasius* del oeste de África y *C. saturnus* del sur son
una sola especie en el Backbone de GBIF. El recuento por país de esa clave no
se puede atribuir a ninguna de ellas.

Para cada una de esas especies se cuenta por país con el nombre con que se
registró la observación (`verbatimScientificName`): las observaciones de
iNaturalist llevan el nombre de iNaturalist. Mismos filtros que la etapa
countries (observación humana, presencia, animales). Una consulta por especie.

Salida: `out/gbif_split.jsonl`.
"""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor

from .. import config
from ..http import fetch_json
from ..presence import species_by_gbif_key

OCC = "https://api.gbif.org/v1/occurrence/search"
# GBIF no publica cupo; el ritmo lo marca `config.MIN_INTERVAL` (un cerrojo por
# host en `http.py`). Los hilos solo solapan la espera de cada respuesta.
WORKERS = 4


def _countries(name: str) -> dict:
    rec = fetch_json(
        OCC,
        {
            "verbatimScientificName": name,
            "taxonKey": 1,
            "basisOfRecord": "HUMAN_OBSERVATION",
            "occurrenceStatus": "PRESENT",
            "limit": 0,
            "facet": "country",
            "facetLimit": 300,
            "facetMincount": 1,
        },
    )
    facets = (rec["data"] or {}).get("facets") or []
    counts = facets[0]["counts"] if facets else []
    return {"retrieved_at": rec["retrieved_at"], "countries": {c["name"]: c["count"] for c in counts}}


def run() -> None:
    names = {}
    for line in open(config.OUT / "universe.jsonl", encoding="utf-8"):
        u = json.loads(line)
        names[u["inat_id"]] = u["name"]
    shared = {k: v for k, v in species_by_gbif_key().items() if len(v) > 1}
    todo = [(key, inat_id) for key, ids in shared.items() for inat_id in ids if inat_id in names]
    print(f"[split] {len(shared)} claves de GBIF compartidas por {len(todo)} especies", flush=True)

    out = config.OUT / "gbif_split.jsonl"
    tmp = out.with_suffix(".tmp")
    with ThreadPoolExecutor(max_workers=WORKERS) as pool, open(tmp, "w", encoding="utf-8") as fh:
        results = pool.map(lambda item: _countries(names[item[1]]), todo)
        for n, ((key, inat_id), res) in enumerate(zip(todo, results), 1):
            fh.write(json.dumps({"inat_id": inat_id, "gbif_key": key, **res}) + "\n")
            if n % 500 == 0:
                print(f"[split] {n}/{len(todo)}", flush=True)
    tmp.replace(out)
    print(f"[split] {len(todo)} especies con presencia propia por país → {out}")
