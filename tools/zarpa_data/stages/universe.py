"""
Etapa 1 · Universo de especies observables.

Pregunta a iNaturalist qué especies de animales (taxón 1, Animalia) tienen
observaciones de grado investigación de ejemplares en libertad, ordenadas de más
a menos observadas, y se detiene al bajar de `MIN_RG_OBSERVATIONS` (con 1,
hasta la última especie: ~600 páginas por idioma).

Se hace dos veces, en español (con los nombres de España) y en inglés, porque
`species_counts` solo devuelve el nombre común del idioma pedido. Son ~600
páginas por idioma: unos 20 minutos en total al ritmo que pide iNaturalist.

Salida: `out/universe.jsonl`, una especie por línea.
"""

from __future__ import annotations

import json

from .. import config
from ..http import fetch_json

API = "https://api.inaturalist.org/v1/observations/species_counts"


def _pages(locale: str):
    page = 1
    while True:
        params = {
            "taxon_id": 1,
            "quality_grade": "research",
            "per_page": 500,
            "page": page,
            "locale": locale,
        }
        if config.WILD_ONLY:
            params["captive"] = "false"
        if locale == "es":
            params["preferred_place_id"] = config.INAT_PLACE_SPAIN
        rec = fetch_json(API, params, cache_tag=config.UNIVERSE_SNAPSHOT)
        results = rec["data"]["results"]
        if not results:
            return
        yield rec, results
        if results[-1]["count"] < config.MIN_RG_OBSERVATIONS:
            return
        page += 1


def _photo(taxon: dict) -> dict | None:
    photo = taxon.get("default_photo")
    if not photo:
        return None
    return {
        "id": photo.get("id"),
        "license": photo.get("license_code"),
        "attribution": photo.get("attribution"),
        "url": photo.get("medium_url") or photo.get("url"),
    }


def run() -> None:
    config.OUT.mkdir(parents=True, exist_ok=True)
    species: dict[int, dict] = {}
    retrieved: dict[str, str] = {}

    for locale in ("es", "en"):
        n_pages = 0
        for rec, results in _pages(locale):
            n_pages += 1
            retrieved.setdefault(locale, rec["retrieved_at"])
            for r in results:
                if r["count"] < config.MIN_RG_OBSERVATIONS:
                    continue
                t = r["taxon"]
                # Solo especies: `species_counts` devuelve taxones hoja y a veces
                # mezcla subespecies o híbridos. Los híbridos (×) no son especies.
                if t.get("rank") != "species" or "×" in t["name"]:
                    continue
                entry = species.setdefault(
                    t["id"],
                    {
                        "inat_id": t["id"],
                        "name": t["name"],
                        "rank": t["rank"],
                        "iconic": t.get("iconic_taxon_name"),
                        "ancestor_ids": t.get("ancestor_ids", []),
                        "rg_obs": r["count"],
                        "observations_count": t.get("observations_count"),
                        "extinct": t.get("extinct"),
                        "inat_photo": _photo(t),
                    },
                )
                name = t.get("preferred_common_name")
                if name:
                    entry[f"name_{locale}"] = name
            print(f"[universe] {locale}: página {n_pages}, especies acumuladas {len(species)}", flush=True)

    out = config.OUT / "universe.jsonl"
    # Se escribe en un temporal y se renombra: las etapas siguientes esperan a
    # que exista el fichero y no deben leer uno a medio escribir.
    tmp = out.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as fh:
        for s in sorted(species.values(), key=lambda s: -s["rg_obs"]):
            s["retrieved_at"] = retrieved
            fh.write(json.dumps(s, ensure_ascii=False) + "\n")
    tmp.replace(out)
    print(f"[universe] {len(species)} especies → {out}")
