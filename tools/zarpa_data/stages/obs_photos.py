"""
Etapa · Fotos libres de observaciones de iNaturalist, en lotes, para las especies que siguen sin foto.

Complementa a `gbif_media` (una búsqueda por especie, que GBIF limita a ~10 por minuto
tras unos miles seguidas). La API v2 de iNaturalist acepta muchas especies por
petición, filtra por licencia de la foto y devuelve solo los campos pedidos, así que
cada petición resuelve decenas de especies con ~100 KB:

    /v2/observations?taxon_id=<hasta 200>&quality_grade=research
        &photo_license=cc0,cc-by,cc-by-sa&per_page=200&order_by=random&fields=…

Mismos criterios que el resto del catálogo: observaciones con grado de investigación
(identidad confirmada por la comunidad), foto CC0, CC BY o CC BY-SA con autor, nada NC.

Cómo se decide cada especie del lote:
  * aparece con una foto libre → se guarda la primera;
  * el lote trae todas las observaciones que casan (`total_results` ≤ 200) y la
    especie no sale → no tiene ninguna foto libre: se anota `null` para no repetir;
  * si el lote tenía más de 200 y la especie no salió → se vuelve a intentar en otro
    lote (orden aleatorio) hasta `MAX_ROUNDS`; después se anota `null`.

Ritmo: el de `config.MIN_INTERVAL` para api.inaturalist.org (1 petición/s) y un
tope de `DAILY_CAP` peticiones por tirada, por debajo de las 10 000 diarias que pide
iNaturalist. Reanudable: `out/obs_photos.jsonl` con `{inat_id, photo | null}`.

Entrada: las especies sin imagen de `out/catalogo.db` (lo deja `build`).
"""

from __future__ import annotations

import json
import os
import sqlite3

from .. import config
from ..http import FetchError, fetch_json

API = "https://api.inaturalist.org/v2/observations"
FREE = {"cc0", "cc-by", "cc-by-sa"}
BATCH = 200
MAX_ROUNDS = 3
DAILY_CAP = int(os.environ.get("ZARPA_OBS_CAP", "8000"))
FIELDS = "taxon.id,photos.id,photos.license_code,photos.attribution,photos.url,photos.original_dimensions"


def _read(path):
    if not path.exists():
        return
    for line in open(path, encoding="utf-8"):
        try:
            yield json.loads(line)
        except json.JSONDecodeError:
            continue


def pick_photo(obs: dict) -> dict | None:
    """Primera foto libre y con autor de una observación (formato de `build._images`)."""
    for p in obs.get("photos") or []:
        lic = (p.get("license_code") or "").lower()
        author = (p.get("attribution") or "").strip()
        if lic in FREE and p.get("url") and p.get("id") and author:
            dims = p.get("original_dimensions") or {}
            return {
                "id": p["id"],
                "license": lic,
                "attribution": author,
                "url": p["url"],
                "dims": {"width": dims.get("width"), "height": dims.get("height")} if dims.get("width") else None,
            }
    return None


def resolve_batch(batch: list[int], data: dict) -> tuple[dict[int, dict], bool]:
    """Fotos encontradas en el lote y si la respuesta trae TODO lo que casa (definitivo)."""
    found: dict[int, dict] = {}
    for obs in data.get("results") or []:
        tid = (obs.get("taxon") or {}).get("id")
        if tid in found or tid not in batch:
            continue
        photo = pick_photo(obs)
        if photo:
            found[tid] = photo
    complete = (data.get("total_results") or 0) <= len(data.get("results") or [])
    return found, complete


def _todo(done: set[int]) -> list[int]:
    db = sqlite3.connect(f"file:{config.OUT / 'catalogo.db'}?mode=ro", uri=True)
    rows = db.execute("SELECT id FROM species WHERE img IS NULL OR img = '' ORDER BY rg_obs DESC, id").fetchall()
    db.close()
    return [r[0] for r in rows if r[0] not in done]


def _fetch(batch: list[int]) -> dict | None:
    try:
        rec = fetch_json(
            API,
            {
                "taxon_id": ",".join(map(str, batch)),
                "quality_grade": "research",
                "photo_license": "cc0,cc-by,cc-by-sa",
                "per_page": 200,
                "order_by": "random",
                "fields": FIELDS,
            },
            use_cache=False,
            max_retries=4,
        )
    except FetchError as exc:
        print(f"[obs_photos] fallo en un lote, vuelve a la cola: {exc}", flush=True)
        return None
    return rec["data"] or {}


def run() -> None:
    from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait

    out_path = config.OUT / "obs_photos.jsonl"
    done = {r["inat_id"] for r in _read(out_path)}
    queue = _todo(done)
    rounds: dict[int, int] = {}
    print(f"[obs_photos] {len(queue)} especies sin foto por mirar ({len(done)} ya hechas)", flush=True)
    found_n = none_n = requests = failures = 0
    # Tres lotes en vuelo: la respuesta tarda ~3 s en el servidor, y el cerrojo por
    # host de http.py sigue sin dejar pasar más de una petición por segundo.
    with open(out_path, "a", encoding="utf-8") as fh, ThreadPoolExecutor(max_workers=3) as pool:
        futures: dict = {}

        def submit() -> None:
            nonlocal queue, requests
            if queue and requests < DAILY_CAP and failures < 20:
                batch, queue = queue[:BATCH], queue[BATCH:]
                requests += 1
                futures[pool.submit(_fetch, batch)] = batch

        for _ in range(3):
            submit()
        while futures:
            finished, _ = wait(futures, return_when=FIRST_COMPLETED)
            for f in finished:
                batch = futures.pop(f)
                data = f.result()
                if data is None:
                    failures += 1
                    queue.extend(batch)
                    submit()
                    continue
                found, complete = resolve_batch(batch, data)
                for tid in batch:
                    if tid in found:
                        fh.write(json.dumps({"inat_id": tid, "photo": found[tid]}, ensure_ascii=False) + "\n")
                        found_n += 1
                        continue
                    rounds[tid] = rounds.get(tid, 0) + 1
                    if complete or rounds[tid] >= MAX_ROUNDS:
                        fh.write(json.dumps({"inat_id": tid, "photo": None}, ensure_ascii=False) + "\n")
                        none_n += 1
                    else:
                        queue.append(tid)  # vuelve a la cola, mezclada con otras especies
                fh.flush()
                if requests % 25 == 0:
                    print(f"[obs_photos] {requests} peticiones · {found_n} con foto · {none_n} sin foto libre · quedan {len(queue)}", flush=True)
                submit()
    print(f"[obs_photos] listo: {found_n} fotos nuevas, {none_n} sin foto libre, {len(queue)} pendientes ({requests} peticiones)")
