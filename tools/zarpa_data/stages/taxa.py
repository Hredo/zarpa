"""
Etapa 2 · Ficha taxonómica de iNaturalist para cada especie del universo.

Pide a la API v2 de iNaturalist, de 30 en 30, solo los campos que se usan:
clasificación completa con nombres en español, estados de conservación de cada
autoridad, si es nativa o introducida en cada país y continente donde hay lista,
el enlace a Wikipedia y si el modelo de visión de iNaturalist la conoce.

La API v2 permite elegir campos; con la v1 cada lote de 30 pesaba ~1,5 MB por
las listas de lugares completas. Con 100 000 especies son ~3 400 peticiones:
algo menos de una hora y un tercio del cupo diario de iNaturalist.

Ampliación a todas las especies (2026-10-04): la v2 no admite más de 30
identificadores por petición y las ~200 000 especies nuevas pasarían del cupo
diario. Para ellas se usa la búsqueda v1 (`/v1/taxa?id=…`, 200 por petición):
nombre, nombre común en español, si está activa o extinguida, foto principal y
la lista de sus antepasados, cuyos nombres y rangos se piden aparte (también de
200 en 200) salvo los que ya se conocen. No traen las listas de países ni los
estados de conservación nacionales: la ficha muestra lo que hay (la categoría
global de la UICN llega por Wikidata).

Las especies que ya tenían ficha completa la conservan (`out/v1/taxa.jsonl`).

Salida: `out/taxa.jsonl`.
"""

from __future__ import annotations

import json

from .. import config
from ..http import fetch_json

API = "https://api.inaturalist.org/v2/taxa/{ids}"
BATCH = 30

FIELDS = (
    "(id:!t,name:!t,rank:!t,is_active:!t,extinct:!t,vision:!t,"
    "preferred_common_name:!t,wikipedia_url:!t,current_synonymous_taxon_ids:!t,"
    "ancestors:(id:!t,name:!t,rank:!t,preferred_common_name:!t),"
    "conservation_statuses:(authority:!t,status:!t,status_name:!t,iucn:!t,place_id:!t,url:!t,updated_at:!t),"
    "listed_taxa:(establishment_means:!t,place:(id:!t,name:!t,admin_level:!t)),"
    "taxon_photos:(photo:(id:!t,license_code:!t,attribution:!t,url:!t,original_dimensions:!t)))"
)

# Rangos que se guardan de la clasificación. Los intermedios (superfamilia,
# tribu, subclase…) no aportan al usuario y cambian a menudo de una revisión
# taxonómica a otra.
KEEP_RANKS = {"kingdom", "phylum", "subphylum", "class", "subclass", "order", "family", "genus"}


def _compact(t: dict, retrieved_at: str) -> dict:
    ancestors = [
        {"id": a["id"], "rank": a["rank"], "name": a["name"], "name_es": a.get("preferred_common_name")}
        for a in t.get("ancestors", [])
        if a.get("rank") in KEEP_RANKS
    ]
    statuses = []
    for c in t.get("conservation_statuses", []) or []:
        statuses.append(
            {
                "authority": c.get("authority"),
                "status": c.get("status"),
                "iucn": c.get("iucn"),
                "place_id": c.get("place_id"),
                "url": c.get("url"),
                "updated_at": c.get("updated_at"),
            }
        )
    listed = []
    for lt in t.get("listed_taxa", []) or []:
        place = lt.get("place") or {}
        # Solo países (0) y continentes (-10): las listas de parques o
        # municipios son incompletas y harían creer que el animal solo vive ahí.
        if place.get("admin_level") in (0, -10) and lt.get("establishment_means"):
            listed.append(
                {
                    "place_id": place.get("id"),
                    "place": place.get("name"),
                    "admin_level": place.get("admin_level"),
                    "means": lt.get("establishment_means"),
                }
            )
    photos = []
    for tp in t.get("taxon_photos", []) or []:
        p = tp.get("photo") or {}
        photos.append(
            {
                "id": p.get("id"),
                "license": p.get("license_code"),
                "attribution": p.get("attribution"),
                "url": p.get("url"),
                "dims": p.get("original_dimensions"),
            }
        )
    return {
        "inat_id": t["id"],
        "name": t["name"],
        "rank": t.get("rank"),
        "is_active": t.get("is_active"),
        "extinct": t.get("extinct"),
        "vision": t.get("vision"),
        "name_es": t.get("preferred_common_name"),
        "wikipedia_url": t.get("wikipedia_url"),
        "synonym_of": t.get("current_synonymous_taxon_ids"),
        "ancestors": ancestors,
        "statuses": statuses,
        "listed": listed,
        "photos": photos,
        "retrieved_at": retrieved_at,
    }


V1_SEARCH = "https://api.inaturalist.org/v1/taxa"
V1_BATCH = 200


def _v1(ids: list[int]) -> tuple[list[dict], str]:
    rec = fetch_json(
        V1_SEARCH,
        {
            "id": ",".join(map(str, ids)),
            "per_page": V1_BATCH,
            "locale": "es",
            "preferred_place_id": config.INAT_PLACE_SPAIN,
        },
    )
    return (rec["data"] or {}).get("results", []), rec["retrieved_at"]


def _lite(t: dict, known: dict[int, dict], retrieved_at: str) -> dict:
    """Ficha reducida con la búsqueda v1 (ver docstring)."""
    ancestors = [known[a] for a in t.get("ancestor_ids", []) if a in known and known[a]["rank"] in KEEP_RANKS]
    photo = t.get("default_photo") or {}
    cs = t.get("conservation_status") or {}
    statuses = []
    if cs:
        statuses.append(
            {
                "authority": cs.get("authority"),
                "status": cs.get("status"),
                "iucn": cs.get("iucn"),
                "place_id": (cs.get("place") or {}).get("id") if isinstance(cs.get("place"), dict) else cs.get("place_id"),
                "url": cs.get("url"),
                "updated_at": cs.get("updated_at"),
            }
        )
    return {
        "inat_id": t["id"],
        "name": t["name"],
        "rank": t.get("rank"),
        "is_active": t.get("is_active"),
        "extinct": t.get("extinct"),
        "vision": None,
        "name_es": t.get("preferred_common_name"),
        "wikipedia_url": t.get("wikipedia_url"),
        "synonym_of": t.get("current_synonymous_taxon_ids"),
        "ancestors": [{k: a[k] for k in ("id", "rank", "name", "name_es")} for a in ancestors],
        "statuses": statuses,
        "listed": [],
        "photos": [
            {
                "id": photo.get("id"),
                "license": photo.get("license_code"),
                "attribution": photo.get("attribution"),
                "url": photo.get("url"),
                "dims": photo.get("original_dimensions"),
            }
        ]
        if photo
        else [],
        "retrieved_at": retrieved_at,
        "lite": True,
    }


def run() -> None:
    universe = [json.loads(line) for line in open(config.OUT / "universe.jsonl", encoding="utf-8")]
    wanted = {s["inat_id"] for s in universe}
    out_path = config.OUT / "taxa.jsonl"

    # Fichas completas ya descargadas (v2) y antepasados que ya se conocen.
    previous: dict[int, dict] = {}
    known: dict[int, dict] = {}
    base = config.OUT / "v1" / "taxa.jsonl"
    if base.exists():
        for line in open(base, encoding="utf-8"):
            t = json.loads(line)
            if t["inat_id"] in wanted:
                previous[t["inat_id"]] = t
            for a in t["ancestors"]:
                known[a["id"]] = a
    new_ids = [s["inat_id"] for s in universe if s["inat_id"] not in previous]
    print(f"[taxa] {len(previous)} fichas completas conservadas, {len(new_ids)} especies nuevas", flush=True)

    # 1) Especies nuevas, de 200 en 200.
    fetched: list[tuple[dict, str]] = []
    for i in range(0, len(new_ids), V1_BATCH):
        results, retrieved = _v1(new_ids[i : i + V1_BATCH])
        fetched += [(t, retrieved) for t in results]
        if (i // V1_BATCH) % 50 == 0:
            print(f"[taxa] nuevas {i + V1_BATCH}/{len(new_ids)}", flush=True)

    # 2) Antepasados desconocidos (nombre y rango), también de 200 en 200.
    missing = sorted({a for t, _ in fetched for a in t.get("ancestor_ids", []) if a not in known and a != t["id"]})
    print(f"[taxa] {len(missing)} antepasados por conocer", flush=True)
    for i in range(0, len(missing), V1_BATCH):
        results, _ = _v1(missing[i : i + V1_BATCH])
        for a in results:
            known[a["id"]] = {"id": a["id"], "rank": a.get("rank"), "name": a["name"], "name_es": a.get("preferred_common_name")}
        if (i // V1_BATCH) % 50 == 0:
            print(f"[taxa] antepasados {i + V1_BATCH}/{len(missing)}", flush=True)

    done = 0
    tmp = out_path.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as fh:
        for t in previous.values():
            fh.write(json.dumps(t, ensure_ascii=False) + "\n")
            done += 1
        for t, retrieved in fetched:
            fh.write(json.dumps(_lite(t, known, retrieved), ensure_ascii=False) + "\n")
            done += 1
    tmp.replace(out_path)
    print(f"[taxa] {done} fichas → {out_path}")
