"""
Etapa 3 · Cruce con Wikidata por el identificador de iNaturalist (P3151).

Wikidata es el nudo que une las demás fuentes: da el identificador del taxón en
GBIF (P846), WoRMS (P850), ITIS (P815) y la UICN (P627), la categoría de la Lista
Roja (P141), la imagen representativa elegida por la comunidad en Commons (P18),
la categoría de Commons (P373), los nombres comunes (P1843) y los artículos de
Wikipedia en español e inglés. Todo es CC0.

Por qué varias consultas pequeñas y no una: con todas las propiedades en una
sola consulta, una especie con 20 nombres comunes y 4 fotos multiplica las
filas intermedias (20 × 4 × …) y el servidor corta a los 60 s con un 500. Cada
consulta de aquí pide una sola propiedad con varios valores, agrupada en el
servidor; el producto cartesiano desaparece. Si aun así un lote falla, se parte
por la mitad hasta que pase.

Salida: `out/wikidata.jsonl`.
"""

from __future__ import annotations

import json

from .. import config
from ..http import FetchError, fetch_json

ENDPOINT = "https://query.wikidata.org/sparql"
BATCH = 250

Q_CORE = """
SELECT ?inat ?item
  (SAMPLE(?taxonName) AS ?taxonName) (SAMPLE(?gbif) AS ?gbif) (SAMPLE(?worms) AS ?worms)
  (SAMPLE(?itis) AS ?itis) (SAMPLE(?iucnId) AS ?iucnId) (SAMPLE(?commonsCat) AS ?commonsCat)
  (SAMPLE(?esLabel) AS ?esLabel) (SAMPLE(?enLabel) AS ?enLabel)
  (SAMPLE(?eswiki) AS ?eswiki) (SAMPLE(?enwiki) AS ?enwiki)
WHERE {
  VALUES ?inat { %s }
  ?item wdt:P3151 ?inat .
  OPTIONAL { ?item wdt:P225 ?taxonName }
  OPTIONAL { ?item wdt:P846 ?gbif }
  OPTIONAL { ?item wdt:P850 ?worms }
  OPTIONAL { ?item wdt:P815 ?itis }
  OPTIONAL { ?item wdt:P627 ?iucnId }
  OPTIONAL { ?item wdt:P373 ?commonsCat }
  OPTIONAL { ?item rdfs:label ?esLabel FILTER(LANG(?esLabel) = "es") }
  OPTIONAL { ?item rdfs:label ?enLabel FILTER(LANG(?enLabel) = "en") }
  OPTIONAL { ?eswiki schema:about ?item ; schema:isPartOf <https://es.wikipedia.org/> }
  OPTIONAL { ?enwiki schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
}
GROUP BY ?inat ?item
"""

# Una propiedad multivaluada por consulta.
Q_MULTI = {
    "images": """
SELECT ?inat (GROUP_CONCAT(DISTINCT ?v; separator="|") AS ?vals) WHERE {
  VALUES ?inat { %s }
  ?item wdt:P3151 ?inat ; wdt:P18 ?v .
} GROUP BY ?inat""",
    "iucn_status": """
SELECT ?inat (GROUP_CONCAT(DISTINCT STRAFTER(STR(?v), "entity/"); separator="|") AS ?vals) WHERE {
  VALUES ?inat { %s }
  ?item wdt:P3151 ?inat ; wdt:P141 ?v .
} GROUP BY ?inat""",
    "common_es": """
SELECT ?inat (GROUP_CONCAT(DISTINCT ?v; separator="|") AS ?vals) WHERE {
  VALUES ?inat { %s }
  ?item wdt:P3151 ?inat ; wdt:P1843 ?v .
  FILTER(LANG(?v) = "es")
} GROUP BY ?inat""",
}

# Categoría de la Lista Roja de la UICN según su elemento en Wikidata.
IUCN_QID = {
    "Q211005": "LC",
    "Q719675": "NT",
    "Q278113": "VU",
    "Q11394": "EN",
    "Q219127": "CR",
    "Q239509": "EW",
    "Q237350": "EX",
    "Q3245245": "DD",
}


def _sparql(template: str, ids: list[str]) -> list[dict]:
    """Ejecuta la consulta; si el servidor la rechaza, la parte en dos."""
    values = " ".join(f'"{x}"' for x in ids)
    try:
        rec = fetch_json(
            ENDPOINT,
            method="POST",
            data={"query": template % values, "format": "json"},
            headers={"Accept": "application/sparql-results+json"},
            max_retries=3,
        )
        return rec["data"]["results"]["bindings"]
    except FetchError:
        if len(ids) == 1:
            print(f"[wikidata] consulta imposible para iNat {ids[0]}; se omite", flush=True)
            return []
        mid = len(ids) // 2
        return _sparql(template, ids[:mid]) + _sparql(template, ids[mid:])


def _val(binding: dict, key: str) -> str | None:
    v = binding.get(key, {}).get("value")
    return v if v else None


def run() -> None:
    universe = [json.loads(line) for line in open(config.OUT / "universe.jsonl", encoding="utf-8")]
    ids = [str(s["inat_id"]) for s in universe]
    out_path = config.OUT / "wikidata.jsonl"
    found = 0
    with open(out_path, "w", encoding="utf-8") as fh:
        for i in range(0, len(ids), BATCH):
            chunk = ids[i : i + BATCH]
            core = {_val(b, "inat"): b for b in _sparql(Q_CORE, chunk)}
            multi: dict[str, dict[str, list[str]]] = {k: {} for k in Q_MULTI}
            for key, template in Q_MULTI.items():
                for b in _sparql(template, chunk):
                    vals = _val(b, "vals")
                    multi[key][_val(b, "inat")] = [v for v in vals.split("|") if v] if vals else []
            for inat, b in core.items():
                entry = {
                    "inat_id": int(inat),
                    "qid": _val(b, "item").rsplit("/", 1)[-1],
                    "taxon_name": _val(b, "taxonName"),
                    "gbif_id": _val(b, "gbif"),
                    "worms_id": _val(b, "worms"),
                    "itis_id": _val(b, "itis"),
                    "iucn_id": _val(b, "iucnId"),
                    "iucn_status": [IUCN_QID.get(q, q) for q in multi["iucn_status"].get(inat, [])],
                    "images": [u.rsplit("/", 1)[-1] for u in multi["images"].get(inat, [])],
                    "commons_category": _val(b, "commonsCat"),
                    "label_es": _val(b, "esLabel"),
                    "label_en": _val(b, "enLabel"),
                    "common_es": multi["common_es"].get(inat, []),
                    "eswiki": _val(b, "eswiki"),
                    "enwiki": _val(b, "enwiki"),
                }
                fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
                found += 1
            if (i // BATCH) % 20 == 0:
                print(f"[wikidata] {i + len(chunk)}/{len(ids)} consultadas, {found} con elemento", flush=True)
    print(f"[wikidata] {found} especies enlazadas: {out_path}")
