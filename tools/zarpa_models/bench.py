"""
Banco de pruebas del reconocimiento: fotos verificadas que el modelo no vio.

Para un conjunto de especies que se pueden ver en España, baja de iNaturalist
observaciones de grado investigación (identificación confirmada por la
comunidad) con foto, de ejemplares en libertad. Cada especie aporta:

  - `proto`: hasta 8 fotos con licencia libre (CC0, CC BY, CC BY-SA) que podrán
    usarse como referencias de imagen del índice que viaja en la app;
  - `test`: hasta 4 fotos de observaciones distintas para medir.

Las fotos de prueba no se usan nunca como referencia (se comprueba por id de
observación), para que la medida no se infle. Es la lección del TFG: una primera
medición «bonita» resultó inflada por consultas parecidas a las referencias.

Uso: python -m zarpa_models.bench --species 400
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

from zarpa_data import config
from zarpa_data.http import download_file, fetch_json

BENCH = config.ROOT / "cache" / "bench"
FREE = {"cc0", "cc-by", "cc-by-sa"}


def pick_species(n: int, seed: int = 7) -> list[dict]:
    """Especies con presencia en España, repartidas entre grupos y rarezas."""
    universe = {json.loads(l)["inat_id"]: json.loads(l) for l in open(config.OUT / "universe.jsonl", encoding="utf-8")}
    gbif = {}
    for line in open(config.OUT / "gbif_taxa.jsonl", encoding="utf-8"):
        g = json.loads(line)
        if g.get("gbif_key"):
            gbif[str(g["gbif_key"])] = g["inat_id"]
    es = next(json.loads(l) for l in open(config.OUT / "gbif_countries.jsonl", encoding="utf-8") if '"cc": "ES"' in l)
    present = [gbif[k] for k, cnt in es["species"].items() if k in gbif and cnt >= 3]
    rng = random.Random(seed)
    by_iconic: dict[str, list[int]] = {}
    for sid in present:
        by_iconic.setdefault(universe[sid].get("iconic") or "Animalia", []).append(sid)
    # Reparto proporcional pero con mínimo por grupo: un banco con 80 % de
    # insectos diría poco de cómo va con aves o mamíferos.
    chosen: list[int] = []
    groups = sorted(by_iconic)
    per = max(10, n // len(groups))
    for g in groups:
        ids = by_iconic[g]
        rng.shuffle(ids)
        chosen += ids[:per]
    rng.shuffle(chosen)
    return [universe[s] for s in chosen[:n]]


def observations(taxon_id: int, per_page: int = 30) -> list[dict]:
    rec = fetch_json(
        "https://api.inaturalist.org/v1/observations",
        {
            "taxon_id": taxon_id,
            "quality_grade": "research",
            "captive": "false",
            "photos": "true",
            "per_page": per_page,
            "order_by": "votes",
            "locale": "es",
        },
    )
    out = []
    for o in rec["data"].get("results", []):
        if not o.get("photos") or (o.get("taxon") or {}).get("id") != taxon_id:
            continue
        p = o["photos"][0]
        out.append(
            {
                "obs": o["id"],
                "photo": p["id"],
                "license": (p.get("license_code") or "").lower() or None,
                "url": p["url"].replace("/square.", "/medium."),
            }
        )
    return out


def build(n: int) -> Path:
    BENCH.mkdir(parents=True, exist_ok=True)
    species = pick_species(n)
    manifest = []
    for i, s in enumerate(species, 1):
        obs = observations(s["inat_id"])
        free = [o for o in obs if o["license"] in FREE]
        proto = free[:8]
        proto_ids = {o["obs"] for o in proto}
        test = [o for o in obs if o["obs"] not in proto_ids][:4]
        for o in proto + test:
            dest = BENCH / str(s["inat_id"]) / f"{o['photo']}.jpg"
            try:
                download_file(o["url"], dest, min_bytes=2000)
                o["file"] = str(dest.relative_to(BENCH))
            except Exception as exc:  # una foto rota no tumba el banco
                print(f"[bench] {o['url']}: {exc}")
        manifest.append(
            {
                "inat_id": s["inat_id"],
                "name": s["name"],
                "iconic": s.get("iconic"),
                "proto": [o for o in proto if o.get("file")],
                "test": [o for o in test if o.get("file")],
            }
        )
        if i % 25 == 0:
            print(f"[bench] {i}/{len(species)} especies", flush=True)
    path = BENCH / "manifest.json"
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[bench] {len(manifest)} especies, {sum(len(m['test']) for m in manifest)} fotos de prueba → {path}")
    return path


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--species", type=int, default=400)
    args = ap.parse_args()
    build(args.species)
