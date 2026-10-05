"""
Etapa · Nombres vernáculos en español del volcado de la taxonomía de GBIF.

Pedirlos uno a uno a la API serían 266 000 llamadas; el volcado de la taxonomía
de referencia (`backbone.zip`, ~1 GB, 2023) trae `VernacularName.tsv` con todos
los nombres comunes y su idioma. Se lee en continuo (sin descomprimir a disco)
y se guardan solo los de idioma `es` de las especies del catálogo.

El cruce con el catálogo es por la clave de GBIF que ya fijó la etapa `gbif`;
si esa clave no tiene nombres en el volcado (los números cambian entre
revisiones), por el nombre científico aceptado. Los nombres que se repiten en
varios registros (fuentes distintas) van primero.

Salida: `out/names_gbif.jsonl` con `{inat_id, gbif_key, spa: [...]}`.
"""

from __future__ import annotations

import csv
import io
import json
import sys
import zipfile
from collections import Counter, defaultdict

from .. import config
from ..http import download_file

URL = "https://hosted-datasets.gbif.org/datasets/backbone/current/backbone.zip"


def _rows(zf: zipfile.ZipFile, member: str):
    csv.field_size_limit(sys.maxsize)
    with zf.open(member) as raw:
        text = io.TextIOWrapper(raw, encoding="utf-8", newline="", errors="replace")
        reader = csv.reader(text, delimiter="\t", quoting=csv.QUOTE_NONE)
        header = next(reader)
        index = {h: i for i, h in enumerate(header)}
        yield index
        yield from reader


def run() -> None:
    zip_path = config.EXTERNAL / "gbif" / "backbone.zip"
    download_file(URL, zip_path, min_bytes=900_000_000)
    wanted: dict[int, tuple[int, str, str | None]] = {}
    for line in open(config.OUT / "gbif_taxa.jsonl", encoding="utf-8"):
        g = json.loads(line)
        if g.get("gbif_key"):
            wanted[g["inat_id"]] = (g["gbif_key"], g.get("gbif_name") or "", None)
    universe_names = {}
    for line in open(config.OUT / "universe.jsonl", encoding="utf-8"):
        u = json.loads(line)
        universe_names[u["inat_id"]] = u["name"]

    spa: dict[str, Counter] = defaultdict(Counter)
    with zipfile.ZipFile(zip_path) as zf:
        print("[gbif_names] leyendo VernacularName.tsv", flush=True)
        rows = _rows(zf, "VernacularName.tsv")
        idx = next(rows)
        i_id, i_name, i_lang = idx["taxonID"], idx["vernacularName"], idx["language"]
        n = 0
        for r in rows:
            n += 1
            if len(r) > i_lang and r[i_lang] == "es" and r[i_name].strip():
                spa[r[i_id]][r[i_name].strip()] += 1
        print(f"[gbif_names] {n} nombres vernáculos; {len(spa)} taxones con nombre en español", flush=True)

        # Segunda pasada solo para el cruce por nombre científico de los taxones con nombre.
        by_name: dict[str, Counter] = defaultdict(Counter)
        print("[gbif_names] leyendo Taxon.tsv", flush=True)
        rows = _rows(zf, "Taxon.tsv")
        idx = next(rows)
        i_id, i_can = idx["taxonID"], idx["canonicalName"]
        for r in rows:
            c = spa.get(r[i_id])
            if c and len(r) > i_can and r[i_can]:
                by_name[r[i_can]].update(c)

    out_path = config.OUT / "names_gbif.jsonl"
    found = by_key = 0
    with open(out_path, "w", encoding="utf-8") as fh:
        for inat_id, (key, gname, _) in wanted.items():
            c = spa.get(str(key))
            if c:
                by_key += 1
            else:
                c = by_name.get(universe_names.get(inat_id, "")) or by_name.get(gname)
            if not c:
                continue
            names = [x for x, _ in c.most_common(8)]
            fh.write(json.dumps({"inat_id": inat_id, "gbif_key": key, "spa": names}, ensure_ascii=False) + "\n")
            found += 1
    print(f"[gbif_names] {found} especies con nombre en español de GBIF ({by_key} por clave) → {out_path}")
