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

Modo masivo (por defecto desde la ampliación a ~300 000 especies): QLever, el
motor SPARQL de la Universidad de Friburgo sobre el volcado de Wikidata,
responde en segundos consultas de todo el conjunto. Una consulta por propiedad
para los ~865 000 elementos con P3151 y el cruce se hace aquí. Con el servicio
oficial (WDQS) serían ~1 200 lotes y horas. Si QLever falla, se usa WDQS.

Salida: `out/wikidata.jsonl`.
"""

from __future__ import annotations

import json

from .. import config
from ..http import FetchError, fetch_json
from ..incremental import stable_order

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


WORKERS = 3  # consultas a la vez: el servicio admite pocas por IP; tres es prudente


def _batch(chunk: list[str], old: bool) -> list[dict]:
    """Un lote: núcleo y, para quien tiene elemento, imágenes, UICN y nombres."""
    core = {_val(b, "inat"): b for b in _sparql(Q_CORE, chunk)}
    # Los lotes de la tirada anterior se piden igual que entonces (salen de la
    # caché); en los nuevos, las consultas de varios valores solo para las
    # especies que tienen elemento: casi la mitad de las raras no lo tienen.
    targets = chunk if old else [i for i in chunk if i in core]
    multi: dict[str, dict[str, list[str]]] = {k: {} for k in Q_MULTI}
    if targets:
        for key, template in Q_MULTI.items():
            for b in _sparql(template, targets):
                vals = _val(b, "vals")
                multi[key][_val(b, "inat")] = [v for v in vals.split("|") if v] if vals else []
    out = []
    for inat, b in core.items():
        out.append(
            {
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
        )
    return out


QLEVER = "https://qlever.dev/api/wikidata"
PREFIXES = """PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema: <http://schema.org/>
"""
# (clave, patrón): cada consulta da pares (iNat, valor).
BULK = {
    "taxon_name": "?item wdt:P225 ?v .",
    "gbif_id": "?item wdt:P846 ?v .",
    "worms_id": "?item wdt:P850 ?v .",
    "itis_id": "?item wdt:P815 ?v .",
    "iucn_id": "?item wdt:P627 ?v .",
    "commons_category": "?item wdt:P373 ?v .",
    "label_es": '?item rdfs:label ?v . FILTER(LANG(?v) = "es")',
    "label_en": '?item rdfs:label ?v . FILTER(LANG(?v) = "en")',
    "eswiki": "?v schema:about ?item ; schema:isPartOf <https://es.wikipedia.org/> .",
    "enwiki": "?v schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> .",
    "images": "?item wdt:P18 ?v .",
    "iucn_status": "?item wdt:P141 ?v .",
    "common_es": '?item wdt:P1843 ?v . FILTER(LANG(?v) = "es")',
}
MULTI = {"images", "iucn_status", "common_es"}


def _tsv_value(cell: str) -> str:
    """Celda TSV de SPARQL (sintaxis Turtle) → texto: IRI o literal sin comillas."""
    cell = cell.strip()
    if cell.startswith("<") and cell.endswith(">"):
        return cell[1:-1]
    if cell.startswith('"'):
        out, i = [], 1
        while i < len(cell):
            ch = cell[i]
            if ch == "\\" and i + 1 < len(cell):
                nxt = cell[i + 1]
                out.append({"t": "\t", "n": "\n", "r": "\r", '"': '"', "\\": "\\"}.get(nxt, nxt))
                i += 2
                continue
            if ch == '"':
                break
            out.append(ch)
            i += 1
        return "".join(out)
    return cell


def _qlever(pattern: str) -> list[tuple[str, str]]:
    import httpx

    q = f"{PREFIXES}SELECT ?inat ?v WHERE {{ ?item wdt:P3151 ?inat . {pattern} }}"
    r = httpx.post(
        QLEVER,
        data={"query": q},
        headers={"Accept": "text/tab-separated-values", "User-Agent": config.USER_AGENT},
        timeout=600,
    )
    r.raise_for_status()
    lines = r.text.split("\n")
    out = []
    for line in lines[1:]:
        if not line:
            continue
        a, _, b = line.partition("\t")
        out.append((_tsv_value(a), _tsv_value(b)))
    return out


def run_bulk(universe: list[dict]) -> int:
    wanted = {str(u["inat_id"]) for u in universe}
    items: dict[str, dict] = {}
    qids = _qlever_items()
    for inat, qid in qids:
        if inat in wanted and inat not in items:
            items[inat] = {"inat_id": int(inat), "qid": qid}
    for key, pattern in BULK.items():
        pairs = _qlever(pattern)
        for inat, v in pairs:
            it = items.get(inat)
            if it is None:
                continue
            if key in MULTI:
                if key == "images":
                    v = v.rsplit("/", 1)[-1]
                elif key == "iucn_status":
                    v = IUCN_QID.get(v.rsplit("/", 1)[-1], v.rsplit("/", 1)[-1])
                lst = it.setdefault(key, [])
                if v not in lst:
                    lst.append(v)
            elif key not in it:
                it[key] = v
        print(f"[wikidata] {key}: {len(pairs)} valores", flush=True)
    order = stable_order(universe)
    out_path = config.OUT / "wikidata.jsonl"
    tmp = out_path.with_suffix(".tmp")
    n = 0
    with open(tmp, "w", encoding="utf-8") as fh:
        for i in order:
            it = items.get(str(i))
            if not it:
                continue
            entry = {
                "inat_id": it["inat_id"],
                "qid": it["qid"],
                "taxon_name": it.get("taxon_name"),
                "gbif_id": it.get("gbif_id"),
                "worms_id": it.get("worms_id"),
                "itis_id": it.get("itis_id"),
                "iucn_id": it.get("iucn_id"),
                "iucn_status": it.get("iucn_status", []),
                "images": it.get("images", [])[:5],
                "commons_category": it.get("commons_category"),
                "label_es": it.get("label_es"),
                "label_en": it.get("label_en"),
                "common_es": it.get("common_es", []),
                "eswiki": it.get("eswiki"),
                "enwiki": it.get("enwiki"),
            }
            fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
            n += 1
    tmp.replace(out_path)
    return n


def _qlever_items() -> list[tuple[str, str]]:
    pairs = _qlever("BIND(?item AS ?v)")
    return [(inat, v.rsplit("/", 1)[-1]) for inat, v in pairs]


def run() -> None:
    universe = [json.loads(line) for line in open(config.OUT / "universe.jsonl", encoding="utf-8")]
    try:
        n = run_bulk(universe)
        print(f"[wikidata] {n} especies enlazadas (QLever): {config.OUT / 'wikidata.jsonl'}")
        return
    except Exception as exc:  # QLever caído o cambiado: el método lento de siempre
        print(f"[wikidata] QLever no disponible ({exc}); se consulta WDQS por lotes", flush=True)
    run_wdqs()


def run_wdqs() -> None:
    from concurrent.futures import ThreadPoolExecutor

    universe = [json.loads(line) for line in open(config.OUT / "universe.jsonl", encoding="utf-8")]
    ids = [str(i) for i in stable_order(universe)]
    n_old = 0
    base = config.OUT / "v1" / "universe.jsonl"
    if base.exists():
        n_old = sum(1 for _ in open(base, encoding="utf-8"))
    chunks = [(ids[i : i + BATCH], i + BATCH <= n_old) for i in range(0, len(ids), BATCH)]
    out_path = config.OUT / "wikidata.jsonl"
    found = 0
    with open(out_path, "w", encoding="utf-8") as fh, ThreadPoolExecutor(max_workers=WORKERS) as pool:
        # `map` devuelve los lotes en orden: el fichero sale igual que en serie.
        for n, entries in enumerate(pool.map(lambda c: _batch(*c), chunks)):
            for entry in entries:
                fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
                found += 1
            if n % 20 == 0:
                print(f"[wikidata] {min(len(ids), (n + 1) * BATCH)}/{len(ids)} consultadas, {found} con elemento", flush=True)
    print(f"[wikidata] {found} especies enlazadas: {out_path}")
