"""
Etapa 6 · Introducción de Wikipedia de cada especie.

Se usa el artículo enlazado desde el propio elemento de Wikidata (no una
búsqueda por nombre, que confunde homónimos: «Pardillo» es un ave y también un
pez). Primero en español; si no hay artículo en español, en inglés, y la app lo
indica. Texto plano de la introducción, 20 artículos por petición.

Licencia CC BY-SA 4.0: la ficha cita el artículo y enlaza a él.

Salida: `out/wikipedia.jsonl`.
"""

from __future__ import annotations

import json

from .. import config
from ..http import fetch_json

BATCH = 20


def _fetch(lang: str, titles: list[str]) -> dict[str, dict]:
    rec = fetch_json(
        f"https://{lang}.wikipedia.org/w/api.php",
        {
            "action": "query",
            "prop": "extracts|info",
            "exintro": 1,
            "explaintext": 1,
            "exlimit": BATCH,
            "inprop": "url",
            "titles": "|".join(titles),
            "redirects": 1,
            "format": "json",
            "formatversion": 2,
            "maxlag": 5,
        },
    )
    q = rec["data"].get("query", {})
    # Las redirecciones y normalizaciones cambian el título: se traduce de vuelta
    # al que se pidió para poder casar cada extracto con su especie.
    back: dict[str, str] = {}
    for n in q.get("normalized", []):
        back[n["to"]] = n["from"]
    for r in q.get("redirects", []):
        back[r["to"]] = back.get(r["from"], r["from"])
    out = {}
    for p in q.get("pages", []):
        if p.get("missing") or not p.get("extract"):
            continue
        asked = back.get(p["title"], p["title"])
        out[asked] = {
            "title": p["title"],
            "extract": p["extract"].strip(),
            "revid": p.get("lastrevid"),
            "retrieved_at": rec["retrieved_at"],
        }
    return out


def run() -> None:
    from urllib.parse import unquote

    wanted: dict[str, list[tuple[int, str]]] = {"es": [], "en": []}
    for line in open(config.OUT / "wikidata.jsonl", encoding="utf-8"):
        try:
            w = json.loads(line)
        except json.JSONDecodeError:
            continue
        if w.get("eswiki"):
            wanted["es"].append((w["inat_id"], unquote(w["eswiki"].rsplit("/wiki/", 1)[-1]).replace("_", " ")))
        elif w.get("enwiki"):
            wanted["en"].append((w["inat_id"], unquote(w["enwiki"].rsplit("/wiki/", 1)[-1]).replace("_", " ")))

    out_path = config.OUT / "wikipedia.jsonl"
    n = 0
    with open(out_path, "w", encoding="utf-8") as fh:
        for lang, items in wanted.items():
            for i in range(0, len(items), BATCH):
                chunk = items[i : i + BATCH]
                got = _fetch(lang, [t for _, t in chunk])
                for inat_id, title in chunk:
                    hit = got.get(title)
                    if not hit:
                        continue
                    fh.write(json.dumps({"inat_id": inat_id, "lang": lang, **hit}, ensure_ascii=False) + "\n")
                    n += 1
                if (i // BATCH) % 100 == 0:
                    print(f"[wikipedia] {lang}: {i + len(chunk)}/{len(items)}", flush=True)
    print(f"[wikipedia] {n} resúmenes: {out_path}")
