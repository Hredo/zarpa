"""
Etapa · Nombres en español de clases, órdenes y familias (tabla `taxon`).

Fuentes verificables, en este orden: iNaturalist (léxico español, etapa
`inat_names`) y Wikidata (P1843 con idioma es; si no, la etiqueta en español
cuando no es el propio nombre científico). Los elementos de Wikidata se
buscan por el identificador de iNaturalist (P3151), que también llevan los
taxones superiores. Sin traducción automática: un nodo sin nombre queda sin él y
la app enseña su nombre científico.

Salida: `out/names_ranks.jsonl` con `{inat_id, label_es, common_es: [...]}`.
"""

from __future__ import annotations

import json

import httpx

from .. import config
from .wikidata import PREFIXES, QLEVER, _tsv_value


def _query(pattern: str, ids: list[str]) -> list[tuple[str, str]]:
    import time

    values = " ".join(f'"{i}"' for i in ids)
    q = f"{PREFIXES}SELECT ?inat ?v WHERE {{ VALUES ?inat {{ {values} }} ?item wdt:P3151 ?inat . {pattern} }}"
    for attempt in range(8):
        r = httpx.post(
            QLEVER,
            data={"query": q},
            headers={"Accept": "text/tab-separated-values", "User-Agent": config.USER_AGENT},
            timeout=600,
        )
        if r.status_code == 429:
            time.sleep(15 * (attempt + 1))
            continue
        r.raise_for_status()
        break
    else:
        raise RuntimeError("QLever sigue devolviendo 429")
    out = []
    for line in r.text.splitlines()[1:]:
        if line:
            a, _, b = line.partition("	")
            out.append((_tsv_value(a), _tsv_value(b)))
    return out


def run() -> None:
    nodes: set[str] = set()
    path = config.OUT / "names_inat.jsonl"
    for line in open(path, encoding="utf-8"):
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        if rec.get("rank") in ("class", "order", "family"):
            nodes.add(str(rec["inat_id"]))
    label: dict[str, str] = {}
    common: dict[str, list[str]] = {}
    ordered = sorted(nodes, key=int)
    for i in range(0, len(ordered), 1000):
        chunk = ordered[i : i + 1000]
        for k, v in _query('?item rdfs:label ?v . FILTER(LANG(?v) = "es")', chunk):
            label.setdefault(k, v)
        for k, v in _query('?item wdt:P1843 ?v . FILTER(LANG(?v) = "es")', chunk):
            if v not in common.setdefault(k, []):
                common[k].append(v)
    out_path = config.OUT / "names_ranks.jsonl"
    with open(out_path, "w", encoding="utf-8") as fh:
        for k in sorted(nodes, key=int):
            fh.write(json.dumps({"inat_id": int(k), "label_es": label.get(k), "common_es": common.get(k, [])}, ensure_ascii=False) + "\n")
    print(f"[rank_names] {len(nodes)} nodos; {len(label)} con etiqueta es, {len(common)} con nombre común → {out_path}")
