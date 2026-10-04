"""
Etapa final · Construye el catálogo SQLite que viaja dentro de la app.

Aquí se aplican las reglas de verificación. Cada dato que llega a la ficha
cumple una de estas dos condiciones, y se guarda de dónde salió:

  1. Viene de la autoridad de ese dato (la UICN para la categoría de amenaza,
     la clasificación de iNaturalist contrastada con GBIF para la taxonomía, una
     base de rasgos revisada por pares para la dieta…), o
  2. Coinciden dos fuentes independientes.

Si un dato no cumple ninguna, **no se escribe**: la ficha muestra el hueco, no
una suposición. Las reglas concretas están en cada función `_verify_*`.

Lee lo que haya en `out/` (cada etapa añade una capa; las que faltan dejan sus
columnas vacías) y escribe:
  - `out/catalogo.db`
  - `app/assets/db/catalogo.db` y `app/src/db/catalogAsset.ts` (versión).
"""

from __future__ import annotations

import hashlib
import json
import shutil
import sqlite3
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from .. import config
from ..presence import species_by_gbif_key, species_countries
from ..taxonomy import GROUP_LABEL, group_of, rarity_of

APP = config.ROOT.parent / "app"

SCHEMA = """
PRAGMA journal_mode = OFF;
PRAGMA synchronous = OFF;

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- Fuentes citables. `url` admite plantillas con {id}, {gbif}, {wd}, {worms},
-- {eswiki}, {enwiki}: la app las completa con los campos de la especie.
CREATE TABLE source (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  url TEXT,
  license TEXT,
  retrieved TEXT
);

CREATE TABLE species (
  id INTEGER PRIMARY KEY,           -- taxón de iNaturalist
  sci TEXT NOT NULL,                -- nombre científico
  name_es TEXT,
  name_en TEXT,
  grp TEXT NOT NULL,                -- código de grupo (ver tabla grp)
  class_id INTEGER, order_id INTEGER, family_id INTEGER,  -- tabla taxon (el género sale del nombre)
  rg_obs INTEGER NOT NULL,          -- observaciones confirmadas en libertad
  rarity INTEGER NOT NULL,          -- 1 común … 5 legendaria
  iucn TEXT,                        -- categoría UICN verificada
  medium INTEGER NOT NULL DEFAULT 0,-- 1 terrestre, 2 agua dulce, 4 marino, 8 salobre
  diet TEXT,
  repro TEXT,
  domestic INTEGER NOT NULL DEFAULT 0,
  envs INTEGER NOT NULL DEFAULT 0,  -- ambientes (ver tabla env)
  img TEXT,                         -- URL de la imagen principal (Commons o iNat libre)
  img_ratio REAL,
  gbif INTEGER,
  wd TEXT,
  worms INTEGER,
  eswiki TEXT,
  enwiki TEXT,
  taxo TEXT NOT NULL,               -- cruce con GBIF: accepted | doubtful | synonym
  gbif_name TEXT,                   -- nombre aceptado en GBIF si difiere
  seq INTEGER NOT NULL              -- orden taxonómico (número del cromo)
);
CREATE INDEX species_grp ON species (grp, seq);

-- Clases, órdenes y familias, una sola vez (con 280 000 especies, repetir sus
-- nombres en cada fila pesaba decenas de MB).
CREATE TABLE taxon (id INTEGER PRIMARY KEY, rank TEXT NOT NULL, sci TEXT NOT NULL, es TEXT);

-- Lo que leen la app y las herramientas: la especie con los nombres de su
-- clasificación, como si estuvieran en la fila.
CREATE VIEW species_v AS
SELECT s.*,
  c.sci AS class_sci, c.es AS class_es,
  o.sci AS order_sci, o.es AS order_es,
  f.sci AS family_sci, f.es AS family_es,
  CASE WHEN instr(s.sci, ' ') > 0 THEN substr(s.sci, 1, instr(s.sci, ' ') - 1) ELSE s.sci END AS genus_sci
FROM species s
LEFT JOIN taxon c ON c.id = s.class_id
LEFT JOIN taxon o ON o.id = s.order_id
LEFT JOIN taxon f ON f.id = s.family_id;
CREATE INDEX species_obs ON species (rg_obs DESC);
CREATE INDEX species_iucn ON species (iucn);

CREATE TABLE detail (
  id INTEGER PRIMARY KEY,
  summary TEXT,                     -- introducción de Wikipedia en español
  summary_lang TEXT,
  summary_src TEXT,                 -- título del artículo
  aliases_es TEXT,                  -- otros nombres en español, separados por |
  conservation TEXT,                -- JSON: estados regionales con su autoridad
  diet_detail TEXT,                 -- desglose de la dieta según EltonTraits
  activity TEXT,                    -- diurno, nocturno…
  migration TEXT,                   -- sedentaria, migradora parcial, migradora (aves)
  cities TEXT,                      -- JSON [[ciudad, observaciones], …]: centros urbanos donde se ve (hasta 8)
  cities_n INTEGER                  -- en cuántas grandes ciudades se ve
);

-- Grandes ciudades (≥1 millón de habitantes, GeoNames) de la etapa urban.
CREATE TABLE city (id INTEGER PRIMARY KEY, name TEXT NOT NULL, cc TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL);

CREATE TABLE provenance (
  id INTEGER NOT NULL,
  field TEXT NOT NULL,
  sources TEXT NOT NULL,            -- códigos de `source`, separados por coma
  note TEXT,
  PRIMARY KEY (id, field)
) WITHOUT ROWID;

CREATE TABLE image (
  id INTEGER NOT NULL,
  rank INTEGER NOT NULL,
  url TEXT NOT NULL,
  ratio REAL,
  author TEXT,
  license TEXT,
  source TEXT NOT NULL,             -- commons | inat
  page TEXT,                        -- página de la imagen (atribución)
  PRIMARY KEY (id, rank)
) WITHOUT ROWID;

CREATE TABLE country (
  id INTEGER NOT NULL,
  cc TEXT NOT NULL,
  obs INTEGER NOT NULL,             -- observaciones humanas en GBIF
  means TEXT,                       -- native | endemic | introduced (iNaturalist)
  PRIMARY KEY (id, cc)
) WITHOUT ROWID;
CREATE INDEX country_cc ON country (cc, obs DESC);

-- Razas reconocidas por una autoridad (FCI, FIFe, FAO DAD-IS, MAPA).
CREATE TABLE breed (
  rid INTEGER PRIMARY KEY,          -- número estable (crc32 del id): búsqueda e índice de razas de la IA
  id TEXT NOT NULL UNIQUE,          -- autoridad:código (fci:166, fife:PER, fao:…, mapa:…)
  species_id INTEGER NOT NULL,
  authority TEXT NOT NULL,          -- fci | fife | fao | mapa
  code TEXT,                        -- número FCI, código EMS de la FIFe…
  name TEXT NOT NULL,               -- nombre que se muestra (oficial en español si existe)
  name_official TEXT,               -- nombre oficial en el idioma de origen
  names_other TEXT,                 -- otros nombres, separados por |
  grp TEXT,                         -- grupo FCI · categoría FIFe · local/transfronteriza (FAO)
  section TEXT,                     -- sección FCI
  status TEXT,                      -- reconocimiento (FCI, FIFe) o clasificación oficial (MAPA)
  adapt TEXT,                       -- autóctona, adaptada localmente, exótica (FAO)
  risk TEXT,                        -- estado de riesgo (FAO)
  accepted TEXT,                    -- fecha de reconocimiento (FCI)
  origin_cc TEXT,                   -- países de origen (ISO, separados por coma)
  origin_text TEXT,                 -- origen tal como lo escribe la autoridad
  origin_place TEXT,                -- lugar de origen (MAPA)
  distribution TEXT,                -- distribución (MAPA)
  countries TEXT,                   -- países con población registrada (FAO)
  varieties TEXT,                   -- variedades reconocidas, separadas por |
  url TEXT NOT NULL,                -- ficha en la autoridad
  standard_url TEXT,                -- estándar oficial (PDF de la FCI)
  img TEXT, img_ratio REAL, img_author TEXT, img_license TEXT, img_page TEXT,
  wd TEXT,
  retrieved TEXT,
  seq INTEGER NOT NULL
);
CREATE INDEX breed_species ON breed (species_id, seq);

-- Índices de búsqueda «sin contenido» (content=''): solo se usan para MATCH →
-- rowid, así que no hace falta guardar otra copia de los nombres.
CREATE VIRTUAL TABLE breed_fts USING fts5(
  name, other,
  content = '',
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE grp (code TEXT PRIMARY KEY, label TEXT NOT NULL, position INTEGER NOT NULL, total INTEGER NOT NULL);

CREATE VIRTUAL TABLE species_fts USING fts5(
  name_es, name_en, sci, aliases,
  content = '',
  tokenize = 'unicode61 remove_diacritics 2'
);
"""

SOURCES = [
    ("inat", "iNaturalist", "https://www.inaturalist.org/taxa/{id}", "CC BY-NC (datos de observación)"),
    ("gbif", "GBIF · Taxonomía de referencia", "https://www.gbif.org/species/{gbif}", "CC BY 4.0"),
    ("gbif-occ", "GBIF · Observaciones por país", "https://www.gbif.org/occurrence/search?taxon_key={gbif}&basis_of_record=HUMAN_OBSERVATION", "CC BY 4.0"),
    ("wikidata", "Wikidata", "https://www.wikidata.org/wiki/{wd}", "CC0"),
    ("iucn", "Lista Roja de la UICN", "https://www.iucnredlist.org/search?query={sci}", None),
    ("commons", "Wikimedia Commons", None, "Según cada imagen"),
    ("wikipedia-es", "Wikipedia en español", "https://es.wikipedia.org/wiki/{eswiki}", "CC BY-SA 4.0"),
    ("wikipedia-en", "Wikipedia en inglés", "https://en.wikipedia.org/wiki/{enwiki}", "CC BY-SA 4.0"),
    ("worms", "WoRMS · Registro Mundial de Especies Marinas", "https://www.marinespecies.org/aphia.php?p=taxdetails&id={worms}", "CC BY 4.0"),
    ("avonet", "AVONET (Tobias et al. 2022, Ecology Letters)", "https://doi.org/10.1111/ele.13898", "CC BY 4.0"),
    ("eltontraits", "EltonTraits 1.0 (Wilman et al. 2014, Ecology)", "https://doi.org/10.1890/13-1917.1", None),
    ("repttraits", "ReptTraits (Oskyrko et al. 2024, Scientific Data)", "https://doi.org/10.1038/s41597-024-03079-5", "CC BY 4.0"),
    ("amphibio", "AmphiBIO (Oliveira et al. 2017, Scientific Data)", "https://doi.org/10.1038/sdata.2017.123", "CC BY 4.0"),
    ("clase", "Rasgo común a toda su clase", None, None),
    ("orden", "Rasgo común a todo su orden", None, None),
    ("fci", "FCI · Nomenclatura de razas", "https://www.fci.be/es/nomenclature/", None),
    ("fife", "FIFe · Razas de gato reconocidas", "https://fifeweb.org/cats/breeds/", None),
    ("fao", "FAO · DAD-IS, diversidad de los animales domésticos", "https://www.fao.org/dad-is/es/", None),
    ("mapa", "MAPA · Catálogo Oficial de Razas de Ganado de España", "https://www.mapa.gob.es/es/ganaderia/temas/zootecnia/razas-ganaderas/razas/catalogo-razas/", None),
]

# Bits de la columna `medium` y de `envs` (iguales en app/src/lib/groups.ts).
MEDIUM = {"terrestre": 1, "agua_dulce": 2, "marino": 4, "salobre": 8}
ENV_GRANJA = 2048
ENV_CIUDAD = 1024

FREE_LICENSES = {"cc0", "cc-by", "cc-by-sa", "pd", "public domain"}

# Regla «visible sin ayuda» para grupos enteros (por filo, clase u orden; nunca
# por género: «Acanthocephala» es también un género de chinches bien visibles).
#   - Siempre fuera: microscópicos (rotíferos, tardígrados…) y nematodos, cuyas
#     especies visibles a simple vista son todas parásitos internos.
#   - Mixtos y parásitos internos: casi todos se ven solo con microscopio o
#     abriendo al huésped, pero algunos sí a simple vista (el piojo del salmón,
#     la tenia del perro, Leucochloridium en los tentáculos del caracol). Se
#     excluyen solo si casi nadie los ha fotografiado (menos de DEEP_MAX_RG_OBS).
ALWAYS_MICROSCOPIC = {
    "Tardigrada", "Rotifera", "Gastrotricha", "Kinorhyncha", "Loricifera", "Gnathostomulida",
    "Micrognathozoa", "Cycliophora", "Placozoa", "Nematoda", "Dicyemida", "Orthonectida",
}
RARELY_VISIBLE = {
    "Copepoda", "Ostracoda",  # crustáceos de 1 mm
    "Cestoda", "Trematoda", "Monogenea", "Acanthocephala", "Myxozoa", "Pentastomida",  # parásitos internos
}
GROUP_RANKS = {"phylum", "subphylum", "class", "subclass", "order"}

# Por encima de este número de avistamientos confirmados, una especie marina
# profunda se considera accesible (lonja, buceo, costa): ver depth.py.
DEEP_MAX_RG_OBS = 25

# Igual que COUNTRY_MIN_OBS en app/src/db/query.ts: por debajo, el país no se
# muestra ni filtra (divagantes), así que tampoco viaja en el catálogo.
COUNTRY_MIN_OBS = 3

# Prefijos de URL que se repiten cientos de miles de veces. La app los
# reconstruye (app/src/lib/urls.ts); la base pesa ~15 MB menos.
URL_PREFIXES = [
    ("c:", "https://upload.wikimedia.org/wikipedia/commons/"),
    ("f:", "https://commons.wikimedia.org/wiki/File:"),
    ("i:", "https://inaturalist-open-data.s3.amazonaws.com/photos/"),
    ("s:", "https://static.inaturalist.org/photos/"),
    ("p:", "https://www.inaturalist.org/photos/"),
]


def _short(url: str | None) -> str | None:
    if not url:
        return url
    for code, prefix in URL_PREFIXES:
        if url.startswith(prefix):
            return code + url[len(prefix) :]
    return url


def _intro(text: str | None) -> str | None:
    """Los dos primeros párrafos (lo que enseña la ficha, que enlaza al artículo)."""
    if not text:
        return text
    paras = [x for x in text.split("\n") if x.strip()][:2]
    out = "\n".join(paras)
    if len(out) > 1600:
        cut = out[:1600]
        out = cut[: cut.rfind(". ") + 1] or cut
    return out


def _read(name: str) -> list[dict]:
    path = config.OUT / name
    if not path.exists():
        return []
    out = []
    for line in open(path, encoding="utf-8"):
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            # Última línea a medio escribir si la etapa sigue en marcha: se
            # construye con lo que ya hay y la siguiente pasada la recoge.
            continue
    return out


def _norm(s: str | None) -> str:
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return " ".join(s.lower().replace("-", " ").split())


# Nombres en inglés colados en la lista en español de iNaturalist («Giant
# pangasius», «Small Wood-Nymph», «Maki Rat», «Mono Tit»). En español el nombre
# empieza por el sustantivo; en inglés, por el adjetivo, y el sustantivo inglés
# va al final sin «de» delante (los epónimos «Tejedor de Fox» no cuentan).
# Revisado a mano sobre los ~28 000 nombres de 2026-10-04: 8 casos, todos inglés.
_EN_FIRST = {
    "giant", "common", "lesser", "greater", "northern", "southern", "eastern", "western",
    "spotted", "striped", "black", "white", "red", "blue", "green", "yellow", "brown",
    "grey", "gray", "little", "small", "large", "long", "short", "great", "american",
    "african", "asian", "european", "mayan", "dwarf", "pygmy", "golden", "silver",
    "banded", "crested", "tufted", "false", "true", "mountain", "sea", "river", "water",
    "wood", "tree",
}
_EN_LAST = {
    "rat", "tit", "fish", "bird", "frog", "snake", "lizard", "shark", "moth", "butterfly",
    "beetle", "bee", "wasp", "ant", "fly", "spider", "crab", "shrimp", "mouse", "squirrel",
    "monkey", "deer", "owl", "hawk", "eagle", "duck", "goose", "dove", "pigeon", "warbler",
    "sparrow", "finch", "thrush", "wren", "snail", "slug", "worm", "bat", "toad", "turtle",
    "whale", "dolphin", "seal", "fox", "wolf", "bear", "cat", "dog", "horse", "nymph",
    "skipper", "bug", "halfbeak", "catfish", "lemur",
}
_LINK = {"de", "del", "la", "las", "los", "monte", "isla", "rio", "lago", "sierra", "cerro"}


def _looks_english(name: str) -> bool:
    words = _norm(name).split()
    if not words:
        return False
    if words[0] in _EN_FIRST:
        return True
    # «Rana lémur» (Agalychnis lemur) es español aunque lleve el sustantivo al final.
    return len(words) >= 2 and words[-1] in _EN_LAST and words[-2] not in _LINK and words[0] not in {"rana", "ranita"}


def _verify_iucn(taxon: dict | None, wd: dict | None) -> tuple[str | None, str, str | None]:
    """
    Categoría global de la UICN.

    Dos copias independientes de la misma autoridad: la que publica
    iNaturalist (estado sin lugar y con autoridad UICN) y la de Wikidata (P141).
      - Coinciden → se muestra.
      - Solo hay una → se muestra (es la autoridad, con enlace a la UICN).
      - No coinciden → NO se muestra: alguna está desfasada y no se sabe cuál.
    """
    inat = None
    if taxon:
        for st in taxon.get("statuses", []):
            auth = (st.get("authority") or "").lower()
            if st.get("place_id") is None and "iucn" in auth:
                code = (st.get("status") or "").upper()
                inat = code if code in {"LC", "NT", "VU", "EN", "CR", "EW", "EX", "DD"} else _iucn_from_name(code)
                break
    wiki = None
    if wd and wd.get("iucn_status"):
        statuses = [s for s in wd["iucn_status"] if s in {"LC", "NT", "VU", "EN", "CR", "EW", "EX", "DD"}]
        wiki = statuses[0] if len(statuses) == 1 else None
    if inat and wiki:
        if inat == wiki:
            return inat, "iucn,inat,wikidata", None
        return None, "", f"discrepancia iNaturalist={inat} Wikidata={wiki}"
    if inat:
        return inat, "iucn,inat", None
    if wiki:
        return wiki, "iucn,wikidata", None
    return None, "", None


def _iucn_from_name(name: str) -> str | None:
    table = {
        "LEAST CONCERN": "LC",
        "NEAR THREATENED": "NT",
        "VULNERABLE": "VU",
        "ENDANGERED": "EN",
        "CRITICALLY ENDANGERED": "CR",
        "EXTINCT IN THE WILD": "EW",
        "EXTINCT": "EX",
        "DATA DEFICIENT": "DD",
    }
    return table.get(name.upper())


def _verify_name_es(u: dict, taxon: dict | None, wd: dict | None) -> tuple[str | None, str, list[str]]:
    """
    Nombre común en español.

    La fuente principal es iNaturalist con los nombres de España (sus listas las
    mantienen conservadores y muchas siguen a SEO/BirdLife u otras sociedades).
    Se contrasta con Wikidata (etiqueta y P1843). El nombre se muestra si viene
    de iNaturalist; la procedencia indica si Wikidata lo confirma. Los demás
    nombres de Wikidata se guardan como alias para la búsqueda.
    """
    name = (taxon or {}).get("name_es") or u.get("name_es")
    aliases: list[str] = []
    wd_names: list[str] = []
    if wd:
        wd_names = [n for n in [wd.get("label_es"), *wd.get("common_es", [])] if n]
    if name and _norm(name) == _norm(u["name"]):
        # A veces el «nombre común» es el científico repetido: no es un nombre.
        name = None
    if name and _looks_english(name):
        name = None
    srcs = "inat" if name else ""
    if name and any(_norm(n) == _norm(name) for n in wd_names):
        srcs = "inat,wikidata"
    for n in wd_names:
        if _norm(n) != _norm(name) and _norm(n) != _norm(u["name"]) and n not in aliases:
            aliases.append(n)
    return name, srcs, aliases


def _images(u: dict, taxon: dict | None, wd: dict | None, commons: dict[str, dict]) -> list[dict]:
    """
    Imágenes con licencia libre y autor conocido.

    Primero la imagen que la comunidad de Wikidata eligió como representativa
    (P18, en Commons). Después las fotos del taxón en iNaturalist solo si su
    licencia permite reutilizarlas (CC0, CC BY, CC BY-SA): las NC no se usan,
    para no atar la app a un uso no comercial.
    """
    out: list[dict] = []
    for fname in (wd or {}).get("images", [])[:3]:
        meta = commons.get(fname)
        if not meta or (meta.get("license") or "").lower() not in FREE_LICENSES:
            continue
        out.append(
            {
                "url": meta["thumb"],
                "ratio": meta.get("ratio"),
                "author": meta.get("author"),
                "license": meta.get("license_label") or meta.get("license"),
                "source": "commons",
                "page": meta.get("page"),
            }
        )
    photos = (taxon or {}).get("photos") or ([u["inat_photo"]] if u.get("inat_photo") else [])
    for p in photos:
        if len(out) >= 6:
            break
        lic = (p.get("license") or "").lower()
        if lic not in FREE_LICENSES or not p.get("url"):
            continue
        dims = p.get("dims") or {}
        ratio = (dims.get("width") / dims.get("height")) if dims.get("width") and dims.get("height") else None
        out.append(
            {
                "url": p["url"].replace("/square.", "/medium.").replace("/small.", "/medium."),
                "ratio": ratio,
                "author": (p.get("attribution") or "").replace("(c) ", "").split(",")[0].strip() or None,
                "license": lic.upper().replace("CC-", "CC "),
                "source": "inat",
                "page": f"https://www.inaturalist.org/photos/{p.get('id')}" if p.get("id") else None,
            }
        )
    return out


def run() -> None:
    universe = _read("universe.jsonl")
    if not universe:
        raise SystemExit("Falta out/universe.jsonl: ejecuta antes la etapa universe")
    taxa = {t["inat_id"]: t for t in _read("taxa.jsonl")}
    wikidata = {w["inat_id"]: w for w in _read("wikidata.jsonl")}
    gbif = {g["inat_id"]: g for g in _read("gbif_taxa.jsonl")}
    commons = {c["file"]: c for c in _read("commons.jsonl")}
    wiki_es = {w["inat_id"]: w for w in _read("wikipedia.jsonl")}
    traits = {t["inat_id"]: t for t in _read("traits.jsonl")}
    worms = {w["inat_id"]: w for w in _read("worms.jsonl")}
    domestic = {d["inat_id"]: d for d in _read("domestic.jsonl")}
    breeds = _read("breeds.jsonl")
    urban_by_gbif = {u["gbif_key"]: u["cities"] for u in _read("urban.jsonl")}
    deep_keys = {d["gbif_key"] for d in _read("depth.jsonl") if d.get("deep_only")}
    cities_path = config.OUT / "cities.json"
    cities = json.loads(cities_path.read_text(encoding="utf-8")) if cities_path.exists() else []

    db_path = config.OUT / "catalogo.db"
    if db_path.exists():
        db_path.unlink()
    db = sqlite3.connect(db_path)
    db.executescript(SCHEMA)

    built_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    retrieved = universe[0].get("retrieved_at", {}).get("es")
    for code, label, url, lic in SOURCES:
        db.execute("INSERT INTO source VALUES (?,?,?,?,?)", (code, label, url, lic, retrieved))

    # GBIF agrupa a veces bajo una clave varias especies de iNaturalist: los
    # datos de esa clave (países, ciudades) no son de ninguna en concreto. Los
    # países salen de `presence` (recuento por nombre original); las ciudades
    # de una clave compartida no se atribuyen.
    by_key = species_by_gbif_key()
    shared_keys = {k for k, ids in by_key.items() if len(ids) > 1}
    split_ok = (config.OUT / "gbif_split.jsonl").exists()
    print(
        f"[build] {len(shared_keys)} claves de GBIF compartidas; presencia separada: "
        + ("sí" if split_ok else "NO (falta la etapa split: esas especies quedan sin países)"),
        flush=True,
    )

    rows = []
    excluded: dict[str, int] = defaultdict(int)
    for u in universe:
        inat_id = u["inat_id"]
        t = taxa.get(inat_id)
        w = wikidata.get(inat_id)
        g = gbif.get(inat_id)
        if u.get("extinct") or (t and t.get("extinct")):
            excluded["extinguida"] += 1
            continue
        if t and t.get("is_active") is False:
            excluded["taxón inactivo en iNaturalist"] += 1
            continue
        # Regla de las dos autoridades: si GBIF ya se cruzó y no reconoce el
        # nombre, la especie no entra. Mientras la etapa gbif no haya corrido,
        # se marca «pendiente» y la app la oculta de los recuentos verificados.
        if gbif:
            if not g or g.get("match") == "none":
                excluded["sin cruce con GBIF"] += 1
                continue
            taxo = g["match"]
        else:
            taxo = "pending"
        # Regla del submarino (etapa depth): solo marina, registrada solo por
        # debajo de 40 m y casi sin fotos de personas (ver depth.py).
        wm = worms.get(inat_id) or {}
        marine_only = wm.get("marine") == 1 and wm.get("terrestrial") != 1 and wm.get("freshwater") != 1
        if marine_only and g and str(g.get("gbif_key")) in deep_keys and u["rg_obs"] < DEEP_MAX_RG_OBS:
            excluded["solo en aguas profundas (más de 40 m)"] += 1
            continue

        anc = {a["rank"]: a for a in (t or {}).get("ancestors", [])}
        anc_names = [a["name"] for a in (t or {}).get("ancestors", [])] or [u.get("iconic") or ""]
        groups_up = {a["name"] for a in (t or {}).get("ancestors", []) if a.get("rank") in GROUP_RANKS}
        if ALWAYS_MICROSCOPIC & groups_up:
            excluded["microscópica o parásito interno (hace falta microscopio o abrir al huésped)"] += 1
            continue
        if RARELY_VISIBLE & groups_up and u["rg_obs"] < DEEP_MAX_RG_OBS:
            excluded["microscópica o parásito interno, casi sin fotos de personas"] += 1
            continue
        grp = group_of(anc_names)
        name_es, name_src, aliases = _verify_name_es(u, t, w)
        iucn, iucn_src, iucn_note = _verify_iucn(t, w)
        imgs = _images(u, t, w, commons)
        gkey = str((g or {}).get("gbif_key") or "")
        urban = urban_by_gbif.get(gkey) if gkey not in shared_keys else None
        facts = _facts(traits.get(inat_id), worms.get(inat_id), domestic.get(inat_id), urban)
        rows.append(
            {
                "u": u,
                "t": t,
                "w": w,
                "g": g,
                "grp": grp,
                "anc": anc,
                "name_es": name_es,
                "name_src": name_src,
                "aliases": aliases,
                "iucn": iucn,
                "iucn_src": iucn_src,
                "iucn_note": iucn_note,
                "imgs": imgs,
                "taxo": taxo,
                "facts": facts,
            }
        )

    # Número de cromo: orden taxonómico dentro del grupo (clase › orden ›
    # familia › nombre). Así el álbum se recorre como una guía de campo y las
    # especies parecidas quedan juntas.
    def tax_key(r):
        a = r["anc"]
        return (
            r["grp"],
            (a.get("class") or {}).get("name", ""),
            (a.get("order") or {}).get("name", ""),
            (a.get("family") or {}).get("name", ""),
            r["u"]["name"],
        )

    rows.sort(key=tax_key)
    seq_by_group: dict[str, int] = defaultdict(int)

    taxa_ids: dict[tuple[str, str], int] = {}

    def taxon_id(rank: str, a: dict | None) -> int | None:
        if not a or not a.get("name"):
            return None
        key = (rank, a["name"])
        if key not in taxa_ids:
            taxa_ids[key] = len(taxa_ids) + 1
            db.execute("INSERT INTO taxon VALUES (?,?,?,?)", (taxa_ids[key], rank, a["name"], a.get("name_es")))
        return taxa_ids[key]

    for r in rows:
        u, t, w, g, a = r["u"], r["t"], r["w"], r["g"], r["anc"]
        seq_by_group[r["grp"]] += 1
        img = r["imgs"][0] if r["imgs"] else None
        name_en = u.get("name_en")
        if name_en and _norm(name_en) == _norm(u["name"]):
            name_en = None
        db.execute(
            """INSERT INTO species VALUES (?,?,?,?,?, ?,?,?, ?,?, ?,?,?,?,?,?, ?,?, ?,?,?,?,?, ?,?,?)""",
            (
                u["inat_id"],
                u["name"],
                r["name_es"],
                name_en,
                r["grp"],
                taxon_id("class", a.get("class")),
                taxon_id("order", a.get("order")),
                taxon_id("family", a.get("family")),
                u["rg_obs"],
                rarity_of(u["rg_obs"]),
                r["iucn"],
                r["facts"]["medium"],
                r["facts"]["diet"],
                r["facts"]["repro"],
                r["facts"]["domestic"],
                r["facts"]["envs"],
                _short(img["url"]) if img else None,
                img["ratio"] if img else None,
                (g or {}).get("gbif_key") or (int(w["gbif_id"]) if w and (w.get("gbif_id") or "").isdigit() else None),
                (w or {}).get("qid"),
                int(w["worms_id"]) if w and (w.get("worms_id") or "").isdigit() else None,
                _wiki_title((w or {}).get("eswiki")),
                _wiki_title((w or {}).get("enwiki")),
                r["taxo"],
                (g or {}).get("gbif_name") if (g or {}).get("match") == "synonym" else None,
                seq_by_group[r["grp"]],
            ),
        )
        summary = wiki_es.get(u["inat_id"])
        db.execute(
            "INSERT INTO detail VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (
                u["inat_id"],
                _intro(summary.get("extract")) if summary else None,
                summary.get("lang") if summary else None,
                summary.get("title") if summary else None,
                "|".join(r["aliases"]) or None,
                json.dumps(_regional_statuses(t), ensure_ascii=False) if t else None,
                r["facts"]["diet_detail"],
                r["facts"]["activity"],
                r["facts"]["migration"],
                json.dumps(r["facts"]["cities"][:8]) if r["facts"]["cities"] else None,
                len(r["facts"]["cities"]) or None,
            ),
        )
        # Taxonomía (iNaturalist + GBIF) y observaciones (iNaturalist) valen para
        # todas las especies: la app las añade sin guardarlas 90 000 veces.
        prov = [] if r["taxo"] != "pending" else [("taxonomy", "inat", None)]
        if r["name_src"]:
            prov.append(("name_es", r["name_src"], None))
        if r["iucn_src"] or r["iucn_note"]:
            prov.append(("iucn", r["iucn_src"] or "", r["iucn_note"]))
        if summary:
            prov.append(("summary", f"wikipedia-{summary.get('lang', 'es')}", None))
        prov += r["facts"]["prov"]
        for field, srcs, note in prov:
            db.execute("INSERT INTO provenance VALUES (?,?,?,?)", (u["inat_id"], field, srcs, note))
        for rank, im in enumerate(r["imgs"]):
            db.execute(
                "INSERT INTO image VALUES (?,?,?,?,?,?,?,?)",
                (u["inat_id"], rank, _short(im["url"]), im.get("ratio"), im.get("author"), im.get("license"), im["source"], _short(im.get("page"))),
            )
        db.execute(
            "INSERT INTO species_fts (rowid, name_es, name_en, sci, aliases) VALUES (?,?,?,?,?)",
            (u["inat_id"], r["name_es"] or "", name_en or "", u["name"], " ".join(r["aliases"] + r["facts"]["search"])),
        )

    # Presencia por país (GBIF) + establecimiento (iNaturalist, solo países).
    place_cc = _place_codes()
    means_by: dict[tuple[int, str], str] = {}
    for inat_id, t in taxa.items():
        for lt in t.get("listed", []):
            cc = place_cc.get(_norm(lt.get("place")))
            if lt.get("admin_level") == 0 and cc and lt.get("means") in ("native", "endemic", "introduced"):
                means_by[(inat_id, cc)] = lt["means"]
    included = {r["u"]["inat_id"] for r in rows}
    for inat_id, per_cc in species_countries(by_key).items():
        if inat_id not in included:
            continue
        for cc, n in per_cc.items():
            if n >= COUNTRY_MIN_OBS:
                db.execute("INSERT OR REPLACE INTO country VALUES (?,?,?,?)", (inat_id, cc, n, means_by.get((inat_id, cc))))

    n_breeds = _insert_breeds(db, breeds, included)
    for c in cities:
        db.execute("INSERT INTO city VALUES (?,?,?,?,?)", (c["gid"], c.get("name_es") or c["name"], c["cc"], c["lat"], c["lng"]))

    for position, (code, label) in enumerate(GROUP_LABEL.items()):
        total = db.execute("SELECT COUNT(*) FROM species WHERE grp = ?", (code,)).fetchone()[0]
        db.execute("INSERT INTO grp VALUES (?,?,?,?)", (code, label, position, total))

    db.execute("INSERT INTO species_fts(species_fts) VALUES ('optimize')")
    total = db.execute("SELECT COUNT(*) FROM species").fetchone()[0]
    db.execute("INSERT INTO meta VALUES ('built_at', ?)", (built_at,))
    db.execute("INSERT INTO meta VALUES ('species', ?)", (str(total),))
    db.execute("INSERT INTO meta VALUES ('min_rg_observations', ?)", (str(config.MIN_RG_OBSERVATIONS),))
    db.execute("INSERT INTO meta VALUES ('excluded', ?)", (json.dumps(excluded, ensure_ascii=False),))
    db.execute("INSERT INTO meta VALUES ('breeds', ?)", (str(n_breeds),))
    # Cuántas especies tienen cada dato verificado (lo enseña el panel de filtros
    # sin recorrer 280 000 filas cada vez que se abre).
    q = lambda sql: db.execute(sql).fetchone()[0]  # noqa: E731
    env_bits = 0
    for (bits,) in db.execute("SELECT DISTINCT envs FROM species WHERE envs != 0"):
        env_bits |= bits
    coverage = {
        "medium": q("SELECT COUNT(*) FROM species WHERE medium != 0"),
        "diet": q("SELECT COUNT(*) FROM species WHERE diet IS NOT NULL"),
        "repro": q("SELECT COUNT(*) FROM species WHERE repro IS NOT NULL"),
        "domestic": q("SELECT COUNT(*) FROM species WHERE domestic >= 1"),
        "envs": q("SELECT COUNT(*) FROM species WHERE envs != 0"),
        "envBits": env_bits,
        "diets": [r[0] for r in db.execute("SELECT DISTINCT diet FROM species WHERE diet IS NOT NULL")],
        "repros": [r[0] for r in db.execute("SELECT DISTINCT repro FROM species WHERE repro IS NOT NULL")],
    }
    db.execute("INSERT INTO meta VALUES ('coverage', ?)", (json.dumps(coverage, ensure_ascii=False),))
    db.commit()
    db.execute("VACUUM")
    db.close()

    version = hashlib.sha256(db_path.read_bytes()).hexdigest()[:12]
    _publish(db_path, version, total)
    print(f"[build] {total} especies · {n_breeds} razas · excluidas {dict(excluded)} · versión {version}")


def _facts(tr: dict | None, wm: dict | None, dom: dict | None, urban: list | None = None) -> dict:
    """
    Rasgos de la especie con su procedencia.

      - Medio: unión de lo que afirman WoRMS (autoridad de lo marino) y las bases
        de rasgos; cada bit lo respalda al menos una fuente, y se citan todas.
        Una marca de WoRMS vacía (sin dato) no cuenta como «no».
      - Dieta, reproducción, actividad, migración y ambientes: de `traits`.
      - Doméstica y «granja»: de la etapa de razas.
      - «Ciudad»: vista en el centro de alguna gran ciudad (etapa urban), salvo
        si es solo marina: verla desde el puerto no la hace animal de ciudad.
    """
    tr = tr or {}
    srcs = dict(tr.get("sources") or {})
    medium = int(tr.get("medium") or 0)
    medium_src = [x for x in (srcs.get("medium") or "").split(",") if x]
    if wm:
        bits = 0
        for flag, bit in (("marine", "marino"), ("brackish", "salobre"), ("freshwater", "agua_dulce"), ("terrestrial", "terrestre")):
            if wm.get(flag) == 1:
                bits |= MEDIUM[bit]
        if bits:
            medium |= bits
            medium_src.append("worms")
    envs = int(tr.get("envs") or 0)
    env_src = [x for x in (srcs.get("envs") or "").split(",") if x]
    domestic = 0
    search: list[str] = []
    prov: list[tuple[str, str, str | None]] = []
    if dom:
        domestic = int(dom["domestic"])
        prov.append(("domestic", ",".join(dom["sources"]), dom.get("note")))
        if dom.get("farm"):
            envs |= ENV_GRANJA
            env_src += [x for x in dom["sources"] if x in ("fao", "mapa") and x not in env_src]
    city_list = urban or []
    marine_only = medium != 0 and medium & (MEDIUM["terrestre"] | MEDIUM["agua_dulce"]) == 0
    if city_list and not marine_only:
        envs |= ENV_CIUDAD
        env_src.append("gbif-occ")
    else:
        city_list = []
    if medium:
        prov.append(("medium", ",".join(dict.fromkeys(medium_src)), None))
    if envs:
        prov.append(("envs", ",".join(dict.fromkeys(env_src)), None))
    for field in ("diet", "diet_detail", "repro", "activity", "migration"):
        if tr.get(field):
            prov.append((field, srcs.get(field, ""), None))
    return {
        "medium": medium,
        "diet": tr.get("diet"),
        "diet_detail": tr.get("diet_detail"),
        "repro": tr.get("repro"),
        "activity": tr.get("activity"),
        "migration": tr.get("migration"),
        "domestic": domestic,
        "envs": envs,
        "search": search,
        "prov": prov,
        "cities": city_list,
    }


def _place_codes() -> dict[str, str]:
    """Nombre de país de iNaturalist (inglés) → ISO. CLDR en inglés + títulos de GBIF."""
    from babel import Locale

    out = {_norm(name): code for code, name in Locale("en").territories.items() if len(code) == 2}
    path = config.CACHE / "probe" / "gbif_countries_enum.json"
    if not path.exists():
        from ..http import fetch_json

        rows = fetch_json("https://api.gbif.org/v1/enumeration/country")["data"]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(rows), encoding="utf-8")
    for r in json.loads(path.read_text(encoding="utf-8")):
        if r.get("iso2") and r.get("title"):
            out.setdefault(_norm(r["title"]), r["iso2"])
    out.update({_norm("United States"): "US", _norm("Russia"): "RU", _norm("Congo (Kinshasa)"): "CD", _norm("Congo (Brazzaville)"): "CG"})
    return out


def _breed_rid(breed_id: str) -> int:
    """Número estable de una raza entre construcciones del catálogo (el índice de
    razas de la IA lo usa como clave)."""
    import zlib

    return zlib.crc32(breed_id.encode("utf-8")) & 0x7FFFFFFF


def _breed_id(b: dict, name: str) -> str:
    """Identificador estable. FCI y FIFe tienen código propio; en la FAO y el MAPA
    el mismo nombre se repite entre especies (la «Mallorquina» es gallina y cabra)."""
    code = b.get("code") or _norm(name).replace(" ", "-")
    if b["authority"] in ("fci", "fife"):
        return f"{b['authority']}:{code}"
    return f"{b['authority']}:{b['species']}:{code}"


def _insert_breeds(db: sqlite3.Connection, breeds: list[dict], included: set[int]) -> int:
    """Razas de las especies que están en el catálogo, en orden de autoridad y nombre."""
    order = {"fci": 0, "fife": 1, "mapa": 2, "fao": 3}

    def key(b: dict):
        group = int(b["group"].split()[-1]) if b.get("authority") == "fci" and b.get("group") else 0
        return (b["species"], order.get(b["authority"], 9), group, _norm(b.get("name_es") or b.get("name_official")))

    seq: dict[int, int] = defaultdict(int)
    seen: set[str] = set()
    rids: dict[int, str] = {}
    n = 0
    for b in sorted((b for b in breeds if b["species"] in included), key=key):
        name = b.get("name_es") or b.get("name_official")
        if not name or _breed_id(b, name) in seen:
            continue
        seen.add(_breed_id(b, name))
        seq[b["species"]] += 1
        mapa = b.get("mapa") or {}
        other = [x for x in [b.get("name_official"), b.get("name_en"), *(b.get("other_names") or [])] if x and _norm(x) != _norm(name)]
        if b["authority"] == "fao":
            for pop in b.get("populations", []):
                if _norm(pop["name"]) != _norm(name) and pop["name"] not in other:
                    other.append(pop["name"])
        other = list(dict.fromkeys(other))[:30]
        img = b.get("img") or {}
        status = b.get("status_label") or b.get("status") or b.get("classification") or mapa.get("classification")
        if b["authority"] == "fife":
            status = "Reconocimiento completo" if b.get("status") == "completo" else "Reconocimiento preliminar"
        grp = b.get("group_name") and f"{b['group']} · {b['group_name']}" or b.get("geo")
        bid = _breed_id(b, name)
        rid = _breed_rid(bid)
        if rid in rids:
            raise SystemExit(f"Colisión de rid entre {bid} y {rids[rid]}: cambiar _breed_rid")
        rids[rid] = bid
        db.execute(
            """INSERT INTO breed (rid, id, species_id, authority, code, name, name_official, names_other, grp, section, status,
               adapt, risk, accepted, origin_cc, origin_text, origin_place, distribution, countries, varieties, url,
               standard_url, img, img_ratio, img_author, img_license, img_page, wd, retrieved, seq)
               VALUES (?,?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?,?)""",
            (
                rid,
                bid,
                b["species"],
                b["authority"],
                b.get("code"),
                name,
                b.get("name_official"),
                "|".join(other) or None,
                grp,
                b.get("section"),
                status,
                b.get("adapt"),
                b.get("risk"),
                b.get("accepted"),
                ",".join(b.get("origin_cc") or []) or None,
                b.get("origin_text") or mapa.get("origin_text"),
                b.get("origin_place") or mapa.get("origin_place"),
                b.get("distribution") or mapa.get("distribution"),
                ",".join(b.get("countries") or []) or None,
                "|".join(b.get("varieties") or []) or None,
                b.get("url") or mapa.get("url"),
                b.get("standard_url"),
                _short(img.get("thumb")),
                img.get("ratio"),
                img.get("author"),
                img.get("license_label") or img.get("license"),
                _short(img.get("page")),
                b.get("wd"),
                b.get("retrieved_at"),
                seq[b["species"]],
            ),
        )
        db.execute("INSERT INTO breed_fts (rowid, name, other) VALUES (?,?,?)", (rid, name, " ".join(other)))
        n += 1
    db.execute("INSERT INTO breed_fts(breed_fts) VALUES ('optimize')")
    return n


def _regional_statuses(t: dict) -> list[dict]:
    out = []
    for st in t.get("statuses", []):
        if st.get("place_id") is None:
            continue
        out.append({"authority": st.get("authority"), "status": st.get("status"), "url": st.get("url"), "place_id": st.get("place_id")})
    return out[:40]


def _wiki_title(url: str | None) -> str | None:
    if not url:
        return None
    from urllib.parse import unquote

    return unquote(url.rsplit("/wiki/", 1)[-1])


def _publish(db_path: Path, version: str, total: int) -> None:
    assets = APP / "assets" / "db"
    assets.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(db_path, assets / "catalogo.db")
    (APP / "src" / "db" / "catalogAsset.ts").write_text(
        "// Generado por tools/zarpa_data/stages/build.py. No editar a mano.\n"
        f"export const CATALOG_VERSION = '{version}';\n"
        f"export const CATALOG_SPECIES = {total};\n"
        "export const CATALOG_ASSET: number = require('../../assets/db/catalogo.db');\n",
        encoding="utf-8",
        newline="\n",  # en Windows, sin esto sale con CRLF y git lo ve todo cambiado
    )
