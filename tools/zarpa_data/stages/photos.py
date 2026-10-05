"""
Etapa · Fotos de iNaturalist con licencia libre para las especies sin imagen.

`taxa` guarda, para las ~175 000 especies que se descargaron con la búsqueda v1,
solo la foto por defecto del taxón, y esa suele ser «todos los derechos
reservados» o no comercial (NC): `build` las descarta (criterio del proyecto:
solo CC0, CC BY, CC BY-SA y dominio público, con autor; las NC atarían la app a un
uso no comercial). Resultado: 187 000 especies sin foto aunque iNaturalist tiene
otras fotos libres del mismo taxón.

Esta etapa pide a la API v2, de 30 en 30 (límite de la v2) y con solo el campo
`taxon_photos`, las fotos curadas de cada especie que aún no tiene imagen libre
en Commons ni en `taxa`, y guarda únicamente las de licencia libre. Primero las
más observadas, para que una descarga parcial cubra lo que más se va a ver.

Salida: `out/photos_inat.jsonl` (reanudable). Opciones: `ZARPA_PHOTOS_LIMIT=N`
para una prueba corta.
"""

from __future__ import annotations

import json
import os

from .. import config
from ..http import fetch_json

API = "https://api.inaturalist.org/v2/taxa/{ids}"
BATCH = 30
FIELDS = "(id:!t,taxon_photos:(photo:(id:!t,license_code:!t,attribution:!t,url:!t,original_dimensions:!t)))"


def _read(name: str):
    path = config.OUT / name
    for line in open(path, encoding="utf-8"):
        try:
            yield json.loads(line)
        except json.JSONDecodeError:
            continue


def missing_species() -> list[dict]:
    """Especies del catálogo sin imagen libre con lo que ya se descargó (más observadas primero)."""
    from .build import _images

    universe = {u["inat_id"]: u for u in _read("universe.jsonl")}
    wikidata = {w["inat_id"]: w for w in _read("wikidata.jsonl")}
    commons = {c["file"]: c for c in _read("commons.jsonl")}
    gbif = {g["inat_id"]: g for g in _read("gbif_taxa.jsonl")}
    out = []
    for t in _read("taxa.jsonl"):
        u = universe.get(t["inat_id"])
        g = gbif.get(t["inat_id"])
        if not u or u.get("extinct") or t.get("extinct") or t.get("is_active") is False:
            continue
        if not g or g.get("match") == "none":
            continue
        # Las fichas completas (v2) ya traen todas las fotos curadas del taxón: no hay más que pedir.
        if not t.get("lite"):
            continue
        if not _images(u, t, wikidata.get(t["inat_id"]), commons):
            out.append(u)
    out.sort(key=lambda u: -u["rg_obs"])
    return out


def run() -> None:
    todo_all = [u["inat_id"] for u in missing_species()]
    limit = int(os.environ.get("ZARPA_PHOTOS_LIMIT", "0")) or None
    if limit:
        todo_all = todo_all[:limit]
    out_path = config.OUT / "photos_inat.jsonl"
    done: set[int] = set()
    if out_path.exists():
        for rec in _read("photos_inat.jsonl"):
            done.add(rec["inat_id"])
    todo = [i for i in todo_all if i not in done]
    print(f"[photos] {len(todo_all)} especies sin foto libre; {len(done)} ya consultadas; {len(todo)} por pedir", flush=True)
    free = 0
    with open(out_path, "a", encoding="utf-8") as fh:
        for k in range(0, len(todo), BATCH):
            ids = todo[k : k + BATCH]
            rec = fetch_json(API.format(ids=",".join(map(str, ids))), {"fields": FIELDS})
            got = {t["id"]: t for t in (rec["data"] or {}).get("results", [])}
            for i in ids:
                photos = []
                seen = 0
                for tp in (got.get(i) or {}).get("taxon_photos") or []:
                    p = tp.get("photo") or {}
                    seen += 1
                    if (p.get("license_code") or "").lower() in ("cc0", "cc-by", "cc-by-sa", "pd") and p.get("url"):
                        photos.append(
                            {
                                "id": p.get("id"),
                                "license": p["license_code"].lower(),
                                "attribution": p.get("attribution"),
                                "url": p["url"],
                                "dims": p.get("original_dimensions"),
                            }
                        )
                free += bool(photos)
                fh.write(json.dumps({"inat_id": i, "seen": seen, "photos": photos[:4], "retrieved_at": rec["retrieved_at"]}, ensure_ascii=False) + "\n")
            fh.flush()
            if (k // BATCH) % 25 == 0:
                print(f"[photos] {k + len(ids)}/{len(todo)} · con foto libre en este tramo: {free}", flush=True)
    print(f"[photos] listo → {out_path}")
