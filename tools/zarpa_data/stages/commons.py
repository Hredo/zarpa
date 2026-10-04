"""
Etapa 5 · Metadatos de las imágenes de Wikimedia Commons.

Para cada imagen representativa de Wikidata (P18) se pide a Commons, de 50 en
50: URL de la miniatura, tamaño, autor, licencia y página de la imagen. Sin
autor y licencia libre conocidos, la imagen no se usa: mostrar una foto sin
poder atribuirla incumple su licencia.

Las miniaturas se piden a 960 px, uno de los anchos estándar de Wikimedia (los
anchos arbitrarios se limitan desde 2025); la app usa 330 px en listas.

Salida: `out/commons.jsonl`.
"""

from __future__ import annotations

import html
import json
import re

from .. import config
from ..http import fetch_json

API = "https://commons.wikimedia.org/w/api.php"
BATCH = 50
THUMB = 960

_TAG = re.compile(r"<[^>]+>")


def _plain(value: str | None) -> str | None:
    if not value:
        return None
    text = html.unescape(_TAG.sub("", value)).strip()
    return " ".join(text.split()) or None


def _license_code(short: str | None, code: str | None) -> str | None:
    s = (short or code or "").lower()
    if not s:
        return None
    if "cc0" in s or "cc-zero" in s:
        return "cc0"
    if "public domain" in s or s.startswith("pd") or s == "pdm":
        return "pd"
    if "by-sa" in s or "by sa" in s:
        return "cc-by-sa"
    if "by-nc" in s or "by nc" in s:
        return "cc-by-nc"
    if "by-nd" in s or "by nd" in s:
        return "cc-by-nd"
    if "cc by" in s or "cc-by" in s:
        return "cc-by"
    return s


def run() -> None:
    files: list[str] = []
    seen: set[str] = set()
    for line in open(config.OUT / "wikidata.jsonl", encoding="utf-8"):
        try:
            w = json.loads(line)
        except json.JSONDecodeError:
            continue
        for f in w.get("images", [])[:3]:
            if f not in seen:
                seen.add(f)
                files.append(f)

    out_path = config.OUT / "commons.jsonl"
    ok = 0
    with open(out_path, "w", encoding="utf-8") as fh:
        for i in range(0, len(files), BATCH):
            chunk = files[i : i + BATCH]
            for entry in describe(chunk):
                fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
                ok += 1
            if (i // BATCH) % 40 == 0:
                print(f"[commons] {i + len(chunk)}/{len(files)}", flush=True)
    print(f"[commons] {ok} imágenes con metadatos: {out_path}")


def describe(files: list[str]) -> list[dict]:
    """Metadatos (miniatura, autor, licencia) de hasta 50 ficheros de Commons."""
    out = []
    for i in range(0, len(files), BATCH):
        chunk = files[i : i + BATCH]
        titles = "|".join("File:" + _unquote(f) for f in chunk)
        rec = fetch_json(
            API,
            {
                "action": "query",
                "titles": titles,
                "prop": "imageinfo",
                "iiprop": "url|size|mime|extmetadata",
                "iiurlwidth": THUMB,
                "iiextmetadatafilter": "Artist|LicenseShortName|License|LicenseUrl|AttributionRequired|Credit",
                "format": "json",
                "formatversion": 2,
                "maxlag": 5,
            },
        )
        pages = rec["data"].get("query", {}).get("pages", [])
        for p in pages:
            info = (p.get("imageinfo") or [None])[0]
            if not info:
                continue
            meta = info.get("extmetadata") or {}
            mime = info.get("mime") or ""
            if not (mime.startswith("image/jpeg") or mime.startswith("image/png") or mime.startswith("image/webp") or mime.startswith("image/tiff")):
                continue
            short = (meta.get("LicenseShortName") or {}).get("value")
            code = (meta.get("License") or {}).get("value")
            width, height = info.get("width"), info.get("height")
            out.append(
                {
                    "file": p["title"].split(":", 1)[1].replace(" ", "_"),
                    "thumb": info.get("thumburl") or info.get("url"),
                    "ratio": (width / height) if width and height else None,
                    "author": _plain((meta.get("Artist") or {}).get("value")),
                    "license": _license_code(short, code),
                    "license_label": short,
                    "license_url": (meta.get("LicenseUrl") or {}).get("value"),
                    "page": info.get("descriptionurl"),
                    "retrieved_at": rec["retrieved_at"],
                }
            )
    return out


def _unquote(name: str) -> str:
    from urllib.parse import unquote

    return unquote(name).replace("_", " ")
