"""
Etapa · Imagen principal del artículo de Wikipedia (en español y, si no, en inglés)
para las especies que siguen sin foto libre.

La imagen que los editores de Wikipedia eligen para abrir el artículo de una
especie suele estar en Commons con licencia libre, aunque el elemento de Wikidata
no tenga la propiedad P18. Se pide de 50 en 50 (`prop=pageimages`) y los
metadatos (autor, licencia) se piden a Commons con la misma función que la etapa
`commons`; solo se guarda la imagen si su licencia es libre y tiene autor.

Salida: `out/wiki_images.jsonl` con `{inat_id, lang, title, meta: {…}}`; `build`
la usa después de la imagen de Wikidata y de las fotos de iNaturalist.
"""

from __future__ import annotations

import json
from urllib.parse import unquote

from .. import config
from ..http import fetch_json
from .build import FREE_LICENSES, commons_key
from .commons import describe
from .photos import _read, missing_species

BATCH = 50


def _page_images(lang: str, titles: list[str]) -> dict[str, str]:
    """título pedido → fichero de Commons de la imagen principal."""
    rec = fetch_json(
        f"https://{lang}.wikipedia.org/w/api.php",
        {
            "action": "query",
            "prop": "pageimages",
            "piprop": "name",
            "pilimit": BATCH,
            "titles": "|".join(titles),
            "redirects": 1,
            "format": "json",
            "formatversion": 2,
            "maxlag": 5,
        },
    )
    q = rec["data"].get("query", {})
    back: dict[str, str] = {}
    for n in q.get("normalized", []):
        back[n["to"]] = n["from"]
    for r in q.get("redirects", []):
        back[r["to"]] = back.get(r["from"], r["from"])
    out = {}
    for p in q.get("pages", []):
        if p.get("pageimage"):
            out[back.get(p["title"], p["title"])] = p["pageimage"]
    return out


def run() -> None:
    from .build import _images

    universe = {u["inat_id"]: u for u in _read("universe.jsonl")}
    wikidata = {w["inat_id"]: w for w in _read("wikidata.jsonl")}
    commons = {c["file"]: c for c in _read("commons.jsonl")}
    extra = {p["inat_id"]: p["photos"] for p in _read("photos_inat.jsonl")} if (config.OUT / "photos_inat.jsonl").exists() else {}
    taxa_by = {}
    for t in _read("taxa.jsonl"):
        if t["inat_id"] in wikidata:
            taxa_by[t["inat_id"]] = t
    todo = []
    for inat_id, w in wikidata.items():
        t = taxa_by.get(inat_id)
        u = universe.get(inat_id)
        if not t or not u or t.get("extinct") or t.get("is_active") is False:
            continue
        if _images(u, t, w, commons, extra.get(inat_id)):
            continue
        todo.append((u["rg_obs"], inat_id, w))
    todo.sort(key=lambda x: -x[0])
    print(f"[wiki_images] {len(todo)} especies sin imagen libre con artículo posible", flush=True)

    out_path = config.OUT / "wiki_images.jsonl"
    done: set[int] = set()
    if out_path.exists():
        done = {r["inat_id"] for r in _read("wiki_images.jsonl")}
    found = 0
    with open(out_path, "a", encoding="utf-8") as fh:
        for lang in ("es", "en"):
            key = "eswiki" if lang == "es" else "enwiki"
            pending = [(i, unquote(w[key].rsplit("/wiki/", 1)[-1]).replace("_", " ")) for _, i, w in todo if i not in done and w.get(key)]
            print(f"[wiki_images] {lang}: {len(pending)} artículos", flush=True)
            for k in range(0, len(pending), BATCH):
                chunk = pending[k : k + BATCH]
                files = _page_images(lang, [t for _, t in chunk])
                metas = {m["file"]: m for m in describe(list(files.values()))} if files else {}
                for inat_id, title in chunk:
                    f = files.get(title)
                    m = metas.get(commons_key(f)) if f else None
                    if m and (m.get("license") or "").lower() in FREE_LICENSES and m.get("author"):
                        fh.write(json.dumps({"inat_id": inat_id, "lang": lang, "title": title, "meta": m}, ensure_ascii=False) + "\n")
                        done.add(inat_id)
                        found += 1
                fh.flush()
                if (k // BATCH) % 40 == 0:
                    print(f"[wiki_images] {lang} {k + len(chunk)}/{len(pending)} · {found} con imagen libre", flush=True)
    print(f"[wiki_images] {found} imágenes → {out_path}")
