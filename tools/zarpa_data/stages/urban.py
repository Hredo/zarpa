"""
Etapa 10 · Animales de ciudad, en todo el mundo.

Pregunta que responde: ¿se deja ver esta especie en el centro de una gran
ciudad? No hay una base de datos mundial de «fauna urbana» para todos los
grupos, así que se mide con datos abiertos y se guarda la prueba:

  1. Ciudades de al menos 1 000 000 de habitantes según GeoNames
     (cities15000, CC BY 4.0): ~560 en todo el mundo.
  2. Para cada una, un cuadrado de 8 × 8 km alrededor de su centro: casco
     urbano, calles, parques y riberas, no las afueras.
  3. GBIF: observaciones humanas de animales dentro del cuadrado desde el año
     2000, sin problemas de georreferencia, agrupadas por especie. Las
     observaciones de animales en cautividad de iNaturalist no llegan a GBIF
     (no tienen grado de investigación).
  4. Una ciudad cuenta para una especie si tiene al menos 10 observaciones allí.

La app marca «Ciudad» si la especie cuenta en alguna ciudad y enseña en cuáles.
Las especies solo marinas no se marcan aunque se vean desde el paseo marítimo:
eso no las hace animales de ciudad (build.py aplica la regla).

Salidas: `out/urban.jsonl` (clave de GBIF → ciudades y observaciones) y
`out/cities.json` (ciudades con su nombre en español de Wikidata).
"""

from __future__ import annotations

import json
import math
import zipfile

from .. import config
from ..http import fetch_json

CITIES_MIN_POP = 1_000_000
HALF_SIDE_KM = 4.0
MIN_RECORDS = 10
SINCE = 2000
GEONAMES = config.EXTERNAL / "geonames" / "cities15000.zip"


def _cities() -> list[dict]:
    rows = [l.split("\t") for l in zipfile.ZipFile(GEONAMES).read("cities15000.txt").decode("utf-8").splitlines()]
    big = []
    for r in rows:
        pop = int(r[14] or 0)
        # PPLX es un barrio o distrito de otra ciudad, no una ciudad.
        if pop >= CITIES_MIN_POP and r[6] == "P" and r[7] != "PPLX":
            big.append({"gid": int(r[0]), "name": r[1], "cc": r[8], "lat": float(r[4]), "lng": float(r[5]), "pop": pop})
    big.sort(key=lambda c: -c["pop"])
    # Dos entradas a menos de 6 km son la misma ciudad (p. ej. municipio y
    # capital administrativa): se queda la de más población.
    out: list[dict] = []
    for c in big:
        if all(_km(c, o) > 6 for o in out):
            out.append(c)
    return out


def _km(a: dict, b: dict) -> float:
    dlat = math.radians(b["lat"] - a["lat"])
    dlng = math.radians(b["lng"] - a["lng"])
    h = math.sin(dlat / 2) ** 2 + math.cos(math.radians(a["lat"])) * math.cos(math.radians(b["lat"])) * math.sin(dlng / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def _box(c: dict) -> str:
    dlat = HALF_SIDE_KM / 111.32
    dlng = HALF_SIDE_KM / (111.32 * math.cos(math.radians(c["lat"])))
    s, n, w, e = c["lat"] - dlat, c["lat"] + dlat, c["lng"] - dlng, c["lng"] + dlng
    # GBIF pide los polígonos en sentido antihorario.
    pts = [(w, s), (e, s), (e, n), (w, n), (w, s)]
    return "POLYGON((" + ",".join(f"{x:.5f} {y:.5f}" for x, y in pts) + "))"


def _names_es(cities: list[dict]) -> dict[int, str]:
    values = " ".join(f'"{c["gid"]}"' for c in cities)
    q = f"""SELECT ?gid ?es WHERE {{
      VALUES ?gid {{ {values} }}
      ?item wdt:P1566 ?gid ; rdfs:label ?es FILTER(LANG(?es) = "es")
    }}"""
    rows = fetch_json("https://query.wikidata.org/sparql", None, method="POST", data={"query": q, "format": "json"})
    out: dict[int, str] = {}
    for b in rows["data"]["results"]["bindings"]:
        out.setdefault(int(b["gid"]["value"]), b["es"]["value"])
    return out


def run() -> None:
    cities = _cities()
    names = _names_es(cities)
    for c in cities:
        c["name_es"] = names.get(c["gid"])
    print(f"[ciudad] {len(cities)} ciudades de más de {CITIES_MIN_POP:,} habitantes".replace(",", "."), flush=True)

    by_species: dict[str, list[list[int]]] = {}
    for i, c in enumerate(cities, 1):
        rec = fetch_json(
            "https://api.gbif.org/v1/occurrence/search",
            {
                "geometry": _box(c),
                "basisOfRecord": "HUMAN_OBSERVATION",
                "kingdomKey": 1,
                "occurrenceStatus": "PRESENT",
                "hasGeospatialIssue": "false",
                "year": f"{SINCE},2100",
                "facet": "speciesKey",
                "facetMincount": MIN_RECORDS,
                "facetLimit": 100000,
                "limit": 0,
            },
        )
        facets = (rec["data"] or {}).get("facets") or []
        counts = facets[0]["counts"] if facets else []
        c["species"] = len(counts)
        c["records"] = (rec["data"] or {}).get("count", 0)
        for f in counts:
            by_species.setdefault(f["name"], []).append([c["gid"], f["count"]])
        if i % 25 == 0:
            print(f"[ciudad] {i}/{len(cities)} · {len(by_species)} especies hasta ahora", flush=True)

    (config.OUT / "cities.json").write_text(json.dumps(cities, ensure_ascii=False), encoding="utf-8")
    with open(config.OUT / "urban.jsonl", "w", encoding="utf-8") as fh:
        for key, lst in by_species.items():
            lst.sort(key=lambda x: -x[1])
            fh.write(json.dumps({"gbif_key": key, "cities": lst}) + "\n")
    print(f"[ciudad] {len(by_species)} especies vistas en el centro de alguna gran ciudad → out/urban.jsonl")
