"""
Etapa 2 · Ficha taxonómica de iNaturalist para cada especie del universo.

Pide a la API v2 de iNaturalist, de 30 en 30, solo los campos que se usan:
clasificación completa con nombres en español, estados de conservación de cada
autoridad, si es nativa o introducida en cada país y continente donde hay lista,
el enlace a Wikipedia y si el modelo de visión de iNaturalist la conoce.

La API v2 permite elegir campos; con la v1 cada lote de 30 pesaba ~1,5 MB por
las listas de lugares completas. Con 100 000 especies son ~3 400 peticiones:
algo menos de una hora y un tercio del cupo diario de iNaturalist.

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


def run() -> None:
    universe = [json.loads(line) for line in open(config.OUT / "universe.jsonl", encoding="utf-8")]
    ids = [s["inat_id"] for s in universe]
    out_path = config.OUT / "taxa.jsonl"
    done = 0
    with open(out_path, "w", encoding="utf-8") as fh:
        for i in range(0, len(ids), BATCH):
            chunk = ids[i : i + BATCH]
            rec = fetch_json(
                API.format(ids=",".join(map(str, chunk))),
                {"locale": "es", "preferred_place_id": config.INAT_PLACE_SPAIN, "fields": FIELDS},
            )
            for t in rec["data"].get("results", []):
                fh.write(json.dumps(_compact(t, rec["retrieved_at"]), ensure_ascii=False) + "\n")
                done += 1
            if (i // BATCH) % 50 == 0:
                print(f"[taxa] {done}/{len(ids)}", flush=True)
    print(f"[taxa] {done} fichas → {out_path}")
