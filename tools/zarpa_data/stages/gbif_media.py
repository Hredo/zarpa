"""
Etapa · Fotos de iNaturalist con licencia libre vía GBIF, para las especies que siguen sin foto.

iNaturalist solo cura ~10 fotos por taxón y, en muchas especies, ninguna es libre. Pero
GBIF publica todas las observaciones de calidad «investigación» de iNaturalist con la
licencia de cada foto. Para cada especie sin imagen se piden a GBIF las primeras 6
observaciones con foto cuya observación sea CC0 o CC BY, y se toma la primera foto
cuya PROPIA licencia (puede ser distinta de la de la observación) sea CC0, CC BY o
CC BY-SA, con autor conocido y alojada en iNaturalist (la ficha cita «iNaturalist» como
fuente). Mismos criterios de licencia que el resto del catálogo: nada NC.

Salida: `out/gbif_media.jsonl` con `{inat_id, photo: {...} | null}` (reanudable; también
se guardan los intentos sin resultado para no repetirlos).
"""

from __future__ import annotations

import json
import re
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait

from .. import config
from ..http import FetchError, fetch_json
from .photos import _read, missing_species

API = "https://api.gbif.org/v1/occurrence/search"
LICENSES = {
    "http://creativecommons.org/publicdomain/zero/1.0/": "cc0",
    "http://creativecommons.org/licenses/by/4.0/": "cc-by",
    "http://creativecommons.org/licenses/by/3.0/": "cc-by",
    "http://creativecommons.org/licenses/by-sa/4.0/": "cc-by-sa",
    "http://creativecommons.org/licenses/by-sa/3.0/": "cc-by-sa",
}
INAT_PHOTO = re.compile(r"https://inaturalist-open-data\.s3\.amazonaws\.com/photos/(\d+)/")


def _lic(url: str | None) -> str | None:
    if not url:
        return None
    u = url.strip().replace("https://", "http://").rstrip("/") + "/"
    return LICENSES.get(u)


def find_photo(gbif_key: int) -> dict | None | str:
    """Foto libre, `None` si no hay, o "retry" si GBIF no respondió (no se anota: se reintenta otro día)."""
    try:
        return _find_photo(gbif_key)
    except FetchError:
        return "retry"


def _find_photo(gbif_key: int) -> dict | None:
    rec = fetch_json(
        API,
        {
            "taxonKey": gbif_key,
            "mediaType": "StillImage",
            "license": ["CC0_1_0", "CC_BY_4_0"],
            "datasetKey": "50c9509d-22c7-4a22-a47d-8c48425ef4a7",  # iNaturalist Research-grade Observations
            # Seis bastan casi siempre (la búsqueda ya filtra por licencia) y pesan
            # una quinta parte que treinta: menos carga para GBIF y para la red.
            "limit": 6,
        },
        # GBIF responde 429 (Retry-After: 3 s) con más de ~3 peticiones a la vez:
        # se respeta y, si sigue sin servir esa especie, se deja para otra tirada.
        max_retries=4,
    )
    for occ in (rec["data"] or {}).get("results", []):
        for m in occ.get("media") or []:
            lic = _lic(m.get("license"))
            m_id = INAT_PHOTO.match(m.get("identifier") or "")
            author = (m.get("creator") or m.get("rightsHolder") or occ.get("recordedBy") or "").strip()
            if lic and m_id and author:
                pid = m_id.group(1)
                return {
                    "id": int(pid),
                    "license": lic,
                    "attribution": author,
                    "url": f"https://inaturalist-open-data.s3.amazonaws.com/photos/{pid}/medium.jpg",
                }
    return None


def run() -> None:
    # Ritmo propio de esta etapa: miles de búsquedas de ocurrencias seguidas. GBIF
    # responde 429 si se le aprieta; a dos por segundo como mucho no se queja.
    config.MIN_INTERVAL["api.gbif.org"] = 0.5
    universe_keys = {}
    for g in _read("gbif_taxa.jsonl"):
        if g.get("gbif_key"):
            universe_keys[g["inat_id"]] = g["gbif_key"]
    out_path = config.OUT / "gbif_media.jsonl"
    done = {r["inat_id"] for r in _read("gbif_media.jsonl")} if out_path.exists() else set()
    # Las que ya resolvió la etapa photos o wiki_images no se piden.
    from .build import _images

    universe = {u["inat_id"]: u for u in _read("universe.jsonl")}
    wikidata = {w["inat_id"]: w for w in _read("wikidata.jsonl")}
    commons = {c["file"]: c for c in _read("commons.jsonl")}
    extra = {p["inat_id"]: p["photos"] for p in _read("photos_inat.jsonl")}
    wiki = {p["inat_id"]: p for p in _read("wiki_images.jsonl")} if (config.OUT / "wiki_images.jsonl").exists() else {}
    todo = []
    for t in _read("taxa.jsonl"):
        i = t["inat_id"]
        u = universe.get(i)
        if not u or i in done or i not in universe_keys or t.get("extinct") or t.get("is_active") is False:
            continue
        if not _images(u, t, wikidata.get(i), commons, extra.get(i), wiki.get(i)):
            todo.append((u["rg_obs"], i))
    todo.sort(reverse=True)
    print(f"[gbif_media] {len(todo)} especies por consultar ({len(done)} ya hechas)", flush=True)
    found = 0
    done_n = 0
    pending = iter(todo)
    # Cada resultado se escribe en cuanto llega: antes se esperaba a tandas de
    # 120 y una sola petición lenta (60 s × reintentos) paraba la tanda entera.
    with open(out_path, "a", encoding="utf-8") as fh, ThreadPoolExecutor(max_workers=2) as pool:
        futures: dict = {}

        def submit() -> None:
            nxt = next(pending, None)
            if nxt is not None:
                i = nxt[1]
                futures[pool.submit(find_photo, universe_keys[i])] = i

        for _ in range(6):
            submit()
        while futures:
            finished, _ = wait(futures, return_when=FIRST_COMPLETED)
            for f in finished:
                i = futures.pop(f)
                photo = f.result()
                done_n += 1
                if photo != "retry":
                    fh.write(json.dumps({"inat_id": i, "photo": photo}, ensure_ascii=False) + "\n")
                    found += photo is not None
                submit()
                if done_n % 100 == 0:
                    fh.flush()
                if done_n % 1000 == 0:
                    print(f"[gbif_media] {done_n}/{len(todo)} · {found} con foto libre", flush=True)
    print(f"[gbif_media] listo: {found} fotos → {out_path}")
