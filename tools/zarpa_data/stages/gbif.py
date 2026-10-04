"""
Etapa 4 · GBIF: segunda autoridad taxonómica y presencia por país.

1. **Cruce taxonómico.** Cada especie de iNaturalist se busca, por nombre
   canónico exacto, en la taxonomía de referencia de GBIF (el «Backbone», que se
   construye sobre el Catalogue of Life y ~100 listas de expertos). Que dos
   autoridades independientes reconozcan el mismo nombre es la condición para
   que una especie entre en el catálogo con la marca de taxonomía verificada.
   El fichero (~490 MB, CC BY 4.0) se lee en local en vez de hacer 100 000
   consultas a la API.

   Si en GBIF el nombre es sinónimo de otro, se guarda la clave aceptada y el
   nombre que usa GBIF: no es un error del animal, es una diferencia de
   nomenclatura, y la ficha la enseña.

2. **Presencia por país.** Una consulta por país a la API de ocurrencias con la
   faceta `speciesKey` devuelve todas las especies de animales con
   observaciones humanas allí y cuántas (España: ~26 000 especies en una sola
   respuesta). ~250 consultas para el mundo entero.

Salidas: `out/gbif_taxa.jsonl` y `out/gbif_countries.jsonl`.
"""

from __future__ import annotations

import gzip
import json
from collections import defaultdict

from .. import config
from ..http import download_file, fetch_json

BACKBONE_URL = "https://hosted-datasets.gbif.org/datasets/backbone/current/simple.txt.gz"
BACKBONE = config.EXTERNAL / "gbif" / "backbone-simple.txt.gz"

# Columnas de `simple.txt` (sin cabecera; comprobadas sobre el fichero).
C_ID, C_PARENT, C_STATUS, C_RANK = 0, 1, 4, 5
C_KINGDOM, C_PHYLUM, C_CLASS, C_ORDER, C_FAMILY, C_GENUS, C_SPECIES = 10, 11, 12, 13, 14, 15, 16
C_SCI, C_CANON = 18, 19

OCC = "https://api.gbif.org/v1/occurrence/search"


def _num(v: str) -> int | None:
    return None if v in ("\\N", "") else int(v)


def _scan_backbone(wanted: set[str]):
    """Filas de especie en Animalia cuyo nombre canónico está en `wanted`."""
    rows: dict[str, list[dict]] = defaultdict(list)
    higher: dict[int, str] = {}
    with gzip.open(BACKBONE, "rt", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            f = line.rstrip("\n").split("\t")
            if len(f) < 20 or f[C_KINGDOM] != "1":
                continue
            rank = f[C_RANK]
            if rank in ("CLASS", "ORDER", "FAMILY", "GENUS", "PHYLUM") and f[C_STATUS] == "ACCEPTED":
                higher[int(f[C_ID])] = f[C_CANON]
                continue
            if rank != "SPECIES" or f[C_CANON] not in wanted:
                continue
            rows[f[C_CANON]].append(
                {
                    "key": int(f[C_ID]),
                    "status": f[C_STATUS],
                    "accepted_key": _num(f[C_SPECIES]),
                    "sci": f[C_SCI],
                    "class_key": _num(f[C_CLASS]),
                    "order_key": _num(f[C_ORDER]),
                    "family_key": _num(f[C_FAMILY]),
                }
            )
    return rows, higher


def _accepted_names(keys: set[int]) -> dict[int, str]:
    """Nombre canónico de las claves aceptadas a las que apuntan los sinónimos."""
    names: dict[int, str] = {}
    with gzip.open(BACKBONE, "rt", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            f = line.split("\t", 20)
            if f[C_KINGDOM] == "1" and int(f[C_ID]) in keys:
                names[int(f[C_ID])] = f[C_CANON]
    return names


def _choose(candidates: list[dict], inat_family: str | None, inat_order: str | None, higher: dict[int, str]):
    """
    Elige la fila de GBIF que corresponde a la especie de iNaturalist.

    Preferencia: aceptada > dudosa > sinónimo. Si hay homónimos (el mismo
    nombre en grupos distintos), decide la familia o el orden de iNaturalist;
    sin esa coincidencia no se elige ninguno: mejor sin cruce que con el animal
    equivocado.
    """
    def family_ok(c):
        fam = higher.get(c["family_key"] or -1)
        order = higher.get(c["order_key"] or -1)
        return (inat_family and fam == inat_family) or (inat_order and order == inat_order)

    for status in ("ACCEPTED", "DOUBTFUL", "SYNONYM", "HETEROTYPIC_SYNONYM", "HOMOTYPIC_SYNONYM", "PROPARTE_SYNONYM"):
        group = [c for c in candidates if c["status"] == status]
        if not group:
            continue
        if len(group) == 1:
            return group[0]
        matching = [c for c in group if family_ok(c)]
        if len(matching) == 1:
            return matching[0]
        return None
    return None


def _taxa() -> dict[int, int]:
    """Cruce taxonómico. Devuelve inat_id → clave de especie aceptada en GBIF."""
    download_file(BACKBONE_URL, BACKBONE, min_bytes=400_000_000)
    universe = [json.loads(line) for line in open(config.OUT / "universe.jsonl", encoding="utf-8")]
    taxa_path = config.OUT / "taxa.jsonl"
    ancestors: dict[int, dict[str, str]] = {}
    if taxa_path.exists():
        for line in open(taxa_path, encoding="utf-8"):
            t = json.loads(line)
            ancestors[t["inat_id"]] = {a["rank"]: a["name"] for a in t["ancestors"]}

    wanted = {s["name"] for s in universe}
    rows, higher = _scan_backbone(wanted)
    print(f"[gbif] backbone: {sum(len(v) for v in rows.values())} filas para {len(rows)} nombres", flush=True)

    chosen: dict[int, dict] = {}
    syn_targets: set[int] = set()
    for s in universe:
        anc = ancestors.get(s["inat_id"], {})
        pick = _choose(rows.get(s["name"], []), anc.get("family"), anc.get("order"), higher)
        if pick is None:
            continue
        chosen[s["inat_id"]] = pick
        if pick["status"] not in ("ACCEPTED", "DOUBTFUL") and pick["accepted_key"]:
            syn_targets.add(pick["accepted_key"])

    accepted_names = _accepted_names(syn_targets) if syn_targets else {}

    mapping: dict[int, int] = {}
    with open(config.OUT / "gbif_taxa.jsonl", "w", encoding="utf-8") as fh:
        for s in universe:
            pick = chosen.get(s["inat_id"])
            anc = ancestors.get(s["inat_id"], {})
            if pick is None:
                fh.write(json.dumps({"inat_id": s["inat_id"], "match": "none"}) + "\n")
                continue
            is_syn = pick["status"] not in ("ACCEPTED", "DOUBTFUL")
            accepted_key = pick["accepted_key"] if is_syn else pick["key"]
            gbif_family = higher.get(pick["family_key"] or -1)
            entry = {
                "inat_id": s["inat_id"],
                "match": "synonym" if is_syn else pick["status"].lower(),
                "gbif_key": accepted_key,
                "gbif_name": accepted_names.get(accepted_key) if is_syn else s["name"],
                "gbif_sci": pick["sci"],
                "gbif_class": higher.get(pick["class_key"] or -1),
                "gbif_order": higher.get(pick["order_key"] or -1),
                "gbif_family": gbif_family,
                "family_agrees": bool(gbif_family and gbif_family == anc.get("family")),
            }
            mapping[s["inat_id"]] = accepted_key
            fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
    print(f"[gbif] cruzadas {len(mapping)}/{len(universe)} especies", flush=True)
    return mapping


def _countries() -> None:
    rec = fetch_json("https://api.gbif.org/v1/enumeration/country")
    codes = [c["iso2"] for c in rec["data"] if c.get("iso2")]
    out = config.OUT / "gbif_countries.jsonl"
    with open(out, "w", encoding="utf-8") as fh:
        for i, cc in enumerate(codes, 1):
            r = fetch_json(
                OCC,
                {
                    "country": cc,
                    "taxonKey": 1,
                    "basisOfRecord": "HUMAN_OBSERVATION",
                    "occurrenceStatus": "PRESENT",
                    "limit": 0,
                    "facet": "speciesKey",
                    "facetLimit": 300000,
                    "facetMincount": 1,
                },
            )
            facets = r["data"].get("facets") or []
            counts = facets[0]["counts"] if facets else []
            fh.write(
                json.dumps(
                    {
                        "cc": cc,
                        "retrieved_at": r["retrieved_at"],
                        "species": {c["name"]: c["count"] for c in counts},
                    }
                )
                + "\n"
            )
            if i % 25 == 0:
                print(f"[gbif] países {i}/{len(codes)}", flush=True)
    print(f"[gbif] presencia por país → {out}")


def run() -> None:
    # La presencia por país es su propia etapa (`countries`): no espera a nada.
    _taxa()
