"""
Cliente HTTP educado y con caché en disco.

Por qué existe en vez de llamar a httpx a pelo:

* **Reanudable.** Bajar el catálogo mundial son miles de peticiones repartidas en
  horas. Si algo se corta a la mitad, la siguiente ejecución lee de la caché lo
  que ya bajó y sigue donde se quedó, sin volver a gastar el cupo diario de
  iNaturalist (10 000 peticiones).
* **Ritmo por host.** Cada API tiene su límite (ver `config.MIN_INTERVAL`); se
  respeta aquí, en un único sitio, y no en cada script.
* **Reintentos con espera** ante 429 y 5xx, que en tiradas largas aparecen
  siempre alguna vez.
* **Trazabilidad.** Cada respuesta cacheada guarda su URL y la fecha en que se
  obtuvo: es lo que luego se cita como fuente en la ficha («consultado el …»).
"""

from __future__ import annotations

import gzip
import hashlib
import json
import random
import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode, urlsplit

import httpx

from . import config

_last_call: dict[str, float] = {}
_client: httpx.Client | None = None


def _get_client() -> httpx.Client:
    global _client
    if _client is None:
        _client = httpx.Client(
            headers={"User-Agent": config.USER_AGENT, "Accept": "application/json"},
            timeout=httpx.Timeout(60.0, connect=20.0),
            follow_redirects=True,
            http2=False,
        )
    return _client


def _cache_path(key: str):
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
    return config.CACHE / "http" / digest[:2] / f"{digest}.json.gz"


def _throttle(host: str) -> None:
    interval = config.MIN_INTERVAL.get(host, config.DEFAULT_INTERVAL)
    last = _last_call.get(host)
    if last is not None:
        wait = interval - (time.monotonic() - last)
        if wait > 0:
            time.sleep(wait)
    _last_call[host] = time.monotonic()


class FetchError(RuntimeError):
    pass


def fetch_json(
    url: str,
    params: dict[str, Any] | None = None,
    *,
    method: str = "GET",
    data: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    use_cache: bool = True,
    max_retries: int = 6,
    allow_404: bool = False,
) -> dict[str, Any]:
    """
    Devuelve `{"url", "retrieved_at", "status", "data"}`.

    `data` es el JSON de la respuesta (o `None` si fue 404 y se permitió).
    """
    full_url = url
    if params:
        full_url = f"{url}?{urlencode(params, doseq=True)}"
    body_key = json.dumps(data, sort_keys=True) if data else ""
    key = f"{method} {full_url} {body_key}"
    path = _cache_path(key)

    if use_cache and path.exists():
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            return json.load(fh)

    host = urlsplit(full_url).netloc
    client = _get_client()
    attempt = 0
    while True:
        _throttle(host)
        try:
            if method == "GET":
                resp = client.get(full_url, headers=headers)
            else:
                resp = client.request(method, url, params=params, data=data, headers=headers)
        except httpx.HTTPError as exc:  # red caída, timeout…
            attempt += 1
            if attempt > max_retries:
                raise FetchError(f"{full_url}: {exc}") from exc
            time.sleep(min(120, 2**attempt + random.random()))
            continue

        if resp.status_code == 404 and allow_404:
            payload = None
            break
        if resp.status_code in (429, 500, 502, 503, 504):
            attempt += 1
            if attempt > max_retries:
                raise FetchError(f"{full_url}: HTTP {resp.status_code}")
            retry_after = resp.headers.get("Retry-After")
            wait = float(retry_after) if retry_after and retry_after.isdigit() else 2**attempt
            time.sleep(min(300, wait + random.random()))
            continue
        if resp.status_code >= 400:
            raise FetchError(f"{full_url}: HTTP {resp.status_code} {resp.text[:300]}")
        # WoRMS responde 204 (sin cuerpo) cuando no encuentra el taxón.
        payload = resp.json() if resp.content else None
        break

    record = {
        "url": full_url,
        "retrieved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "status": resp.status_code,
        "data": payload,
    }
    if use_cache:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        with gzip.open(tmp, "wt", encoding="utf-8") as fh:
            json.dump(record, fh, ensure_ascii=False)
        tmp.replace(path)
    return record


def download_file(url: str, dest, *, min_bytes: int = 1) -> None:
    """Descarga un fichero grande (bases de rasgos, capas) si no está ya."""
    from pathlib import Path

    dest = Path(dest)
    if dest.exists() and dest.stat().st_size >= min_bytes:
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    host = urlsplit(url).netloc
    _throttle(host)
    tmp = dest.with_suffix(dest.suffix + ".part")
    with _get_client().stream("GET", url, headers={"Accept": "*/*"}) as resp:
        if resp.status_code >= 400:
            raise FetchError(f"{url}: HTTP {resp.status_code}")
        with open(tmp, "wb") as fh:
            for chunk in resp.iter_bytes(1 << 20):
                fh.write(chunk)
    tmp.replace(dest)
