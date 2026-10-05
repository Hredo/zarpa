"""
Etapa · Nombres comunes de iNaturalist en todos los idiomas útiles.

La ficha de cada especie guarda desde `taxa` un único «nombre preferido», que
iNaturalist rellena con el nombre en español de España y, cuando no lo hay,
cae a otro idioma (de ahí los nombres en inglés colados). Esta etapa pide, de
200 en 200 (`/v1/taxa?id=…&all_names=true`), la lista completa de nombres de
cada taxón con el idioma y el léxico en que está escrito, y guarda aparte:

  * `pref`: el nombre preferido SOLO si está escrito en el léxico español (el
    de España, si hay lugar preferido).
  * `es`: todos los nombres del léxico español (variantes regionales incluidas),
    en el orden de iNaturalist.
  * `en`: los nombres del léxico inglés (solo para detectar nombres «en español»
    que en realidad son los ingleses; la app no los muestra).

También se piden los nodos taxonómicos (clases, órdenes y familias) de la tabla
`taxon`, para dar nombre español a los rangos.

Salida: `out/names_inat.jsonl` (reanudable: lo ya escrito no se vuelve a pedir,
y la caché HTTP evita repetir peticiones).
"""

from __future__ import annotations

import json

from .. import config
from ..http import fetch_json

V1_SEARCH = "https://api.inaturalist.org/v1/taxa"
BATCH = 200
RANKS = {"class", "order", "family"}


def _ids() -> tuple[list[int], dict[int, tuple[str, str]]]:
    """Especies del universo (más observadas primero) y nodos de clasificación."""
    universe = [json.loads(line) for line in open(config.OUT / "universe.jsonl", encoding="utf-8")]
    universe.sort(key=lambda u: -u["rg_obs"])
    species = [u["inat_id"] for u in universe]
    nodes: dict[int, tuple[str, str]] = {}
    for line in open(config.OUT / "taxa.jsonl", encoding="utf-8"):
        # Evita cargar la ficha entera (cientos de MB): solo hacen falta los antepasados.
        t = json.loads(line)
        for a in t.get("ancestors", []):
            if a.get("rank") in RANKS:
                nodes[a["id"]] = (a["rank"], a["name"])
    return species, nodes


def fetch_names(ids: list[int]) -> list[dict]:
    rec = fetch_json(
        V1_SEARCH,
        {
            "id": ",".join(map(str, ids)),
            "per_page": BATCH,
            "locale": "es",
            "preferred_place_id": config.INAT_PLACE_SPAIN,
            "all_names": "true",
        },
    )
    out = []
    for t in (rec["data"] or {}).get("results", []):
        es: list[str] = []
        en: list[str] = []
        for n in t.get("names") or []:
            lex = n.get("lexicon") or ""
            name = (n.get("name") or "").strip()
            if not name:
                continue
            if lex == "spanish" and name not in es:
                es.append(name)
            elif lex == "english" and name not in en:
                en.append(name)
        pref = (t.get("preferred_common_name") or "").strip()
        out.append(
            {
                "inat_id": t["id"],
                "name": t["name"],
                "rank": t.get("rank"),
                "pref": pref if pref in es else None,
                "es": es,
                "en": en[:8],
            }
        )
    return out


def run(limit: int | None = None) -> None:
    species, nodes = _ids()
    wanted = species[:limit] if limit else species
    wanted = wanted + [i for i in nodes if i not in set(species)]
    out_path = config.OUT / "names_inat.jsonl"
    done: set[int] = set()
    if out_path.exists():
        for line in open(out_path, encoding="utf-8"):
            try:
                done.add(json.loads(line)["inat_id"])
            except (json.JSONDecodeError, KeyError):
                continue
    todo = [i for i in wanted if i not in done]
    print(f"[inat_names] {len(done)} ya hechos, {len(todo)} por pedir", flush=True)
    with open(out_path, "a", encoding="utf-8") as fh:
        for k in range(0, len(todo), BATCH):
            for rec in fetch_names(todo[k : k + BATCH]):
                fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
            fh.flush()
            if (k // BATCH) % 20 == 0:
                print(f"[inat_names] {k + BATCH}/{len(todo)}", flush=True)
    print(f"[inat_names] listo → {out_path}")
