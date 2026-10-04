"""
Banco de pruebas del reconocimiento: fotos verificadas que el modelo no vio.

Especies de todo el mundo, repartidas por rareza (lo común se fotografía más,
pero el umbral también tiene que aguantar con lo raro). De cada especie se bajan
de iNaturalist hasta 3 observaciones:

  - de grado investigación (identificación confirmada por la comunidad),
  - de ejemplares en libertad,
  - subidas a partir del 2025-06-01: BioCLIP 2 se entrenó con TreeOfLife-200M,
    publicado en mayo de 2025, así que estas fotos no pueden estar en su
    entrenamiento y la medida no se infla. Es la lección del TFG: una primera
    medición «bonita» resultó inflada por consultas parecidas a las referencias.
  - de observadores distintos cuando se puede (un mismo fotógrafo repite
    encuadre, cámara y lugar).

Cada foto lleva el país donde se hizo (geocodificación inversa de GBIF sobre
las coordenadas de la observación): en el móvil los candidatos son las especies
del país del usuario, y así se mide aquí.

Uso: python -m zarpa_models.bench --species 1200
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

from zarpa_data import config
from zarpa_data.http import download_file, fetch_json
from zarpa_data.taxonomy import rarity_of

BENCH = config.ROOT / "cache" / "bench"
SINCE = "2025-06-01"
PER_SPECIES = 3
# Reparto por rareza (1 común … 5 legendaria).
QUOTA = {1: 0.35, 2: 0.25, 3: 0.20, 4: 0.12, 5: 0.08}


def catalog_species() -> list[dict]:
    """Especies que entrarán en el catálogo: con cruce en GBIF y no extinguidas."""
    gbif_ok = set()
    for line in open(config.OUT / "gbif_taxa.jsonl", encoding="utf-8"):
        g = json.loads(line)
        if g.get("match") and g["match"] != "none":
            gbif_ok.add(g["inat_id"])
    out = []
    for line in open(config.OUT / "universe.jsonl", encoding="utf-8"):
        u = json.loads(line)
        if u["inat_id"] in gbif_ok and not u.get("extinct"):
            out.append(u)
    return out


def pick_species(n: int, seed: int = 7) -> list[dict]:
    rng = random.Random(seed)
    by_tier: dict[int, list[dict]] = {}
    for u in catalog_species():
        by_tier.setdefault(rarity_of(u["rg_obs"]), []).append(u)
    chosen: list[dict] = []
    for tier, share in QUOTA.items():
        pool = by_tier.get(tier, [])
        rng.shuffle(pool)
        chosen += pool[: round(n * share)]
    rng.shuffle(chosen)
    return chosen


# Solo los campos que se usan: la observación completa de la v1 pesa ~70 KB y
# 30 por especie saturaban la conexión (2 MB por especie; con estos, ~20 KB).
OBS_FIELDS = (
    "(id:!t,created_at:!t,geojson:!t,user:(id:!t),taxon:(id:!t,ancestor_ids:!t),"
    "photos:(id:!t,url:!t,license_code:!t))"
)


def observations(taxon_id: int) -> list[dict]:
    rec = fetch_json(
        "https://api.inaturalist.org/v2/observations",
        {
            "taxon_id": taxon_id,
            "quality_grade": "research",
            "captive": "false",
            "photos": "true",
            "created_d1": SINCE,
            "per_page": 30,
            "fields": OBS_FIELDS,
        },
    )
    out, users = [], set()
    for o in rec["data"].get("results", []):
        t = o.get("taxon") or {}
        if not o.get("photos") or not o.get("geojson"):
            continue
        # La especie o una de sus subespecies.
        if t.get("id") != taxon_id and taxon_id not in (t.get("ancestor_ids") or []):
            continue
        uid = (o.get("user") or {}).get("id")
        if uid in users:
            continue
        users.add(uid)
        p = o["photos"][0]
        lng, lat = o["geojson"]["coordinates"]
        out.append(
            {
                "obs": o["id"],
                "photo": p["id"],
                "license": (p.get("license_code") or "").lower() or None,
                "url": p["url"].replace("/square.", "/medium."),
                "lat": lat,
                "lng": lng,
                "created": o.get("created_at"),
            }
        )
        if len(out) == PER_SPECIES:
            break
    return out


def country_of(lat: float, lng: float) -> str | None:
    rec = fetch_json("https://api.gbif.org/v1/geocode/reverse", {"lat": round(lat, 4), "lng": round(lng, 4)})
    for area in rec["data"] or []:
        if area.get("type") == "GADM0" and area.get("isoCountryCode2Digit"):
            return area["isoCountryCode2Digit"]
    return None


def _species_entry(s: dict) -> dict:
    test = observations(s["inat_id"])
    for o in test:
        dest = BENCH / str(s["inat_id"]) / f"{o['photo']}.jpg"
        try:
            download_file(o["url"], dest, min_bytes=2000)
            o["file"] = str(dest.relative_to(BENCH))
        except Exception as exc:  # una foto rota no tumba el banco
            print(f"[bench] {o['url']}: {exc}", flush=True)
        o["cc"] = country_of(o["lat"], o["lng"])
    return {
        "inat_id": s["inat_id"],
        "name": s["name"],
        "iconic": s.get("iconic"),
        "rarity": rarity_of(s["rg_obs"]),
        "test": [o for o in test if o.get("file")],
    }


# Cada foto tarda 4-5 s en llegar del cubo de iNaturalist en EE. UU.: de una en
# una, 1 200 especies eran ~10 h. Con varias especies a la vez el límite lo pone
# el ritmo de la API de iNaturalist (una petición por segundo, `http._throttle`).
# Más hilos saturan la conexión y frenan las demás etapas que bajan a la vez.
WORKERS = 10


def build(n: int) -> Path:
    from concurrent.futures import ThreadPoolExecutor

    BENCH.mkdir(parents=True, exist_ok=True)
    species = pick_species(n)
    manifest = []
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        # `map` devuelve en el orden de entrada: el manifiesto no depende de qué hilo acabe antes.
        for i, entry in enumerate(pool.map(_species_entry, species), 1):
            manifest.append(entry)
            if i % 50 == 0:
                print(f"[bench] {i}/{len(species)} especies", flush=True)
    path = BENCH / "manifest.json"
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    photos = sum(len(m["test"]) for m in manifest)
    countries = len({o.get("cc") for m in manifest for o in m["test"]})
    print(f"[bench] {len(manifest)} especies, {photos} fotos de {countries} países → {path}")
    return path


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--species", type=int, default=1200)
    args = ap.parse_args()
    build(args.species)
