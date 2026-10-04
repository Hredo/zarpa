"""
Fotos de referencia de cada raza para que la IA la reconozca.

De cada raza de perro (FCI) y gato (FIFe) enlazada a Wikidata se toma su
categoría de Wikimedia Commons (P373) y se bajan hasta 20 fotos (miniaturas de
330 px). Son las razas que más se cruzan por la calle; el ganado queda para una
segunda tanda (sus categorías de Commons mezclan más fotos de granja y paisaje). Commons solo
aloja material con licencia libre; aun así, las fotos no viajan en la app: solo
el vector medio de cada raza (`breed_index.py`).

Se descartan las ilustraciones, los dibujos y los mapas por el nombre del
fichero (svg, png con «map», «drawing», «illustration»…): el retrato medio de
una raza tiene que salir de fotos de animales.

Uso: python -m zarpa_models.breed_photos [--part 0 --parts 3]   (y luego --merge)
Con --part/--parts cada proceso baja un tercio de las razas (tres peticiones a
la vez como mucho, un ritmo educado para Wikimedia); --merge junta los trozos.
"""

from __future__ import annotations

import json
import re
import sqlite3
from urllib.parse import unquote

from zarpa_data import config
from zarpa_data.http import FetchError, download_file, fetch_json

BREEDS = config.ROOT / "cache" / "breeds"
PER_BREED = 20
SPECIES = (47144, 118552)  # perro, gato
COMMONS = "https://commons.wikimedia.org/w/api.php"
SKIP = re.compile(r"map|drawing|illustration|logo|stamp|coat of arms|skeleton|statue|painting|\.svg|\.gif|\.tif", re.I)


def _categories(qids: list[str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for i in range(0, len(qids), 300):
        values = " ".join(f"wd:{q}" for q in qids[i : i + 300])
        q = f"SELECT ?item ?cat WHERE {{ VALUES ?item {{ {values} }} ?item wdt:P373 ?cat . }}"
        rows = fetch_json("https://query.wikidata.org/sparql", None, method="POST", data={"query": q, "format": "json"})
        for b in rows["data"]["results"]["bindings"]:
            out[b["item"]["value"].rsplit("/", 1)[1]] = b["cat"]["value"]
    return out


def _files(category: str) -> list[str]:
    rec = fetch_json(
        COMMONS,
        {
            "action": "query",
            "list": "categorymembers",
            "cmtitle": f"Category:{category}",
            "cmtype": "file",
            "cmlimit": 200,
            "format": "json",
            "formatversion": 2,
        },
    )
    files = [m["title"] for m in (rec["data"] or {}).get("query", {}).get("categorymembers", [])]
    return [f for f in files if f.lower().endswith((".jpg", ".jpeg")) and not SKIP.search(f)]


def _thumbs(titles: list[str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for i in range(0, len(titles), 50):
        rec = fetch_json(
            COMMONS,
            {
                "action": "query",
                "titles": "|".join(titles[i : i + 50]),
                "prop": "imageinfo",
                "iiprop": "url|mime",
                "iiurlwidth": 330,
                "format": "json",
                "formatversion": 2,
            },
        )
        for p in (rec["data"] or {}).get("query", {}).get("pages", []):
            info = (p.get("imageinfo") or [None])[0]
            if info and (info.get("mime") or "").startswith("image/jpeg") and info.get("thumburl"):
                out[p["title"]] = info["thumburl"]
    return out


def run(part: int = 0, parts: int = 1) -> None:
    db = sqlite3.connect(config.OUT / "catalogo.db")
    rows = db.execute(
        f"SELECT id, species_id, wd FROM breed WHERE wd IS NOT NULL AND species_id IN ({','.join(map(str, SPECIES))})"
    ).fetchall()
    db.close()
    rows = [r for i, r in enumerate(rows) if i % parts == part]
    cats = _categories(sorted({wd for _, _, wd in rows}))
    print(f"[razas-ia] {len(rows)} razas con Wikidata, {len(cats)} con categoría en Commons", flush=True)
    manifest = []
    for n, (breed_id, species_id, wd) in enumerate(rows, 1):
        cat = cats.get(wd)
        if not cat:
            continue
        try:
            titles = _files(cat)[: PER_BREED * 2]
            urls = _thumbs(titles)
        except FetchError as exc:
            print(f"[razas-ia] {breed_id}: {exc}")
            continue
        got = []
        for title, url in list(urls.items())[:PER_BREED]:
            name = re.sub(r"[^A-Za-z0-9_.-]+", "_", unquote(title.split(":", 1)[1]))[:120]
            dest = BREEDS / breed_id.replace(":", "_") / name
            try:
                download_file(url, dest, min_bytes=3000)
                got.append(str(dest.relative_to(BREEDS)))
            except Exception as exc:  # una foto rota no tumba la raza
                print(f"[razas-ia] {url}: {exc}")
        if got:
            manifest.append({"breed": breed_id, "species": species_id, "wd": wd, "category": cat, "photos": got})
        if n % 50 == 0:
            print(f"[razas-ia] {n}/{len(rows)} razas · {len(manifest)} con fotos", flush=True)
    BREEDS.mkdir(parents=True, exist_ok=True)
    name = "manifest.json" if parts == 1 else f"manifest-{part}.json"
    (BREEDS / name).write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[razas-ia] {len(manifest)} razas con {sum(len(m['photos']) for m in manifest)} fotos → {BREEDS / name}")


def merge() -> None:
    manifest = []
    for f in sorted(BREEDS.glob("manifest-*.json")):
        manifest += json.loads(f.read_text(encoding="utf-8"))
    (BREEDS / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[razas-ia] {len(manifest)} razas en total → {BREEDS / 'manifest.json'}")


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--part", type=int, default=0)
    ap.add_argument("--parts", type=int, default=1)
    ap.add_argument("--merge", action="store_true")
    args = ap.parse_args()
    merge() if args.merge else run(args.part, args.parts)
