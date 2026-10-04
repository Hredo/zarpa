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
  class_sci TEXT, order_sci TEXT, family_sci TEXT, genus_sci TEXT,
  class_es TEXT, order_es TEXT, family_es TEXT,
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
CREATE INDEX species_obs ON species (rg_obs DESC);
CREATE INDEX species_iucn ON species (iucn);

CREATE TABLE detail (
  id INTEGER PRIMARY KEY,
  summary TEXT,                     -- introducción de Wikipedia en español
  summary_lang TEXT,
  summary_src TEXT,                 -- título del artículo
  aliases_es TEXT,                  -- otros nombres en español, separados por |
  conservation TEXT                 -- JSON: estados regionales con su autoridad
);

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

CREATE TABLE grp (code TEXT PRIMARY KEY, label TEXT NOT NULL, position INTEGER NOT NULL, total INTEGER NOT NULL);

CREATE VIRTUAL TABLE species_fts USING fts5(
  name_es, name_en, sci, aliases,
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
]

FREE_LICENSES = {"cc0", "cc-by", "cc-by-sa", "pd", "public domain"}


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
    countries = _read("gbif_countries.jsonl")

    db_path = config.OUT / "catalogo.db"
    if db_path.exists():
        db_path.unlink()
    db = sqlite3.connect(db_path)
    db.executescript(SCHEMA)

    built_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    retrieved = universe[0].get("retrieved_at", {}).get("es")
    for code, label, url, lic in SOURCES:
        db.execute("INSERT INTO source VALUES (?,?,?,?,?)", (code, label, url, lic, retrieved))

    # GBIF: clave aceptada → especie de iNaturalist (para la presencia por país).
    gbif_to_inat: dict[str, int] = {}
    for inat_id, g in gbif.items():
        if g.get("gbif_key"):
            gbif_to_inat[str(g["gbif_key"])] = inat_id

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

        anc = {a["rank"]: a for a in (t or {}).get("ancestors", [])}
        anc_names = [a["name"] for a in (t or {}).get("ancestors", [])] or [u.get("iconic") or ""]
        grp = group_of(anc_names)
        name_es, name_src, aliases = _verify_name_es(u, t, w)
        iucn, iucn_src, iucn_note = _verify_iucn(t, w)
        imgs = _images(u, t, w, commons)
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

    for r in rows:
        u, t, w, g, a = r["u"], r["t"], r["w"], r["g"], r["anc"]
        seq_by_group[r["grp"]] += 1
        img = r["imgs"][0] if r["imgs"] else None
        name_en = u.get("name_en")
        if name_en and _norm(name_en) == _norm(u["name"]):
            name_en = None
        db.execute(
            """INSERT INTO species VALUES (?,?,?,?,?, ?,?,?,?, ?,?,?, ?,?, ?,?,?,?,?,?, ?,?, ?,?,?,?,?, ?,?,?)""",
            (
                u["inat_id"],
                u["name"],
                r["name_es"],
                name_en,
                r["grp"],
                (a.get("class") or {}).get("name"),
                (a.get("order") or {}).get("name"),
                (a.get("family") or {}).get("name"),
                (a.get("genus") or {}).get("name"),
                (a.get("class") or {}).get("name_es"),
                (a.get("order") or {}).get("name_es"),
                (a.get("family") or {}).get("name_es"),
                u["rg_obs"],
                rarity_of(u["rg_obs"]),
                r["iucn"],
                0,
                None,
                None,
                0,
                0,
                img["url"] if img else None,
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
            "INSERT INTO detail VALUES (?,?,?,?,?,?)",
            (
                u["inat_id"],
                summary.get("extract") if summary else None,
                summary.get("lang") if summary else None,
                summary.get("title") if summary else None,
                "|".join(r["aliases"]) or None,
                json.dumps(_regional_statuses(t), ensure_ascii=False) if t else None,
            ),
        )
        prov = [("taxonomy", "inat,gbif" if r["taxo"] != "pending" else "inat", None), ("observations", "inat", None)]
        if r["name_src"]:
            prov.append(("name_es", r["name_src"], None))
        if r["iucn_src"] or r["iucn_note"]:
            prov.append(("iucn", r["iucn_src"] or "", r["iucn_note"]))
        if summary:
            prov.append(("summary", f"wikipedia-{summary.get('lang', 'es')}", None))
        for field, srcs, note in prov:
            db.execute("INSERT INTO provenance VALUES (?,?,?,?)", (u["inat_id"], field, srcs, note))
        for rank, im in enumerate(r["imgs"]):
            db.execute(
                "INSERT INTO image VALUES (?,?,?,?,?,?,?,?)",
                (u["inat_id"], rank, im["url"], im.get("ratio"), im.get("author"), im.get("license"), im["source"], im.get("page")),
            )
        db.execute(
            "INSERT INTO species_fts (rowid, name_es, name_en, sci, aliases) VALUES (?,?,?,?,?)",
            (u["inat_id"], r["name_es"] or "", name_en or "", u["name"], " ".join(r["aliases"])),
        )

    # Presencia por país (GBIF) + establecimiento (iNaturalist, solo países).
    means_by: dict[tuple[int, str], str] = {}
    for inat_id, t in taxa.items():
        for lt in t.get("listed", []):
            if lt.get("admin_level") == 0 and lt.get("place"):
                means_by[(inat_id, lt["place"])] = lt["means"]
    included = {r["u"]["inat_id"] for r in rows}
    for c in countries:
        for gkey, n in c["species"].items():
            inat_id = gbif_to_inat.get(gkey)
            if inat_id in included:
                db.execute("INSERT OR REPLACE INTO country VALUES (?,?,?,?)", (inat_id, c["cc"], n, None))

    for position, (code, label) in enumerate(GROUP_LABEL.items()):
        total = db.execute("SELECT COUNT(*) FROM species WHERE grp = ?", (code,)).fetchone()[0]
        db.execute("INSERT INTO grp VALUES (?,?,?,?)", (code, label, position, total))

    db.execute("INSERT INTO species_fts(species_fts) VALUES ('optimize')")
    total = db.execute("SELECT COUNT(*) FROM species").fetchone()[0]
    db.execute("INSERT INTO meta VALUES ('built_at', ?)", (built_at,))
    db.execute("INSERT INTO meta VALUES ('species', ?)", (str(total),))
    db.execute("INSERT INTO meta VALUES ('min_rg_observations', ?)", (str(config.MIN_RG_OBSERVATIONS),))
    db.execute("INSERT INTO meta VALUES ('excluded', ?)", (json.dumps(excluded, ensure_ascii=False),))
    db.commit()
    db.execute("VACUUM")
    db.close()

    version = hashlib.sha256(db_path.read_bytes()).hexdigest()[:12]
    _publish(db_path, version, total)
    print(f"[build] {total} especies · excluidas {dict(excluded)} · versión {version}")


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
    )
