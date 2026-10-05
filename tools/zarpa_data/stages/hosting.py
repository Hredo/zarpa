"""
Etapa · El catálogo en Firebase Hosting (plan gratuito), para que la app no lo lleve dentro.

Parte `out/catalogo.db` (lo deja `build`) en lo que el móvil necesita tener y
lo que puede pedir cuando lo usa:

  c/<versión>/indice.db.gz   índice ligero para buscar, filtrar y ordenar (nombres,
                             grupo, rareza, UICN, ambientes, foto principal…, ~35 MB
                             sin comprimir). Se sirve con `Content-Encoding: gzip`
                             (firebase.json): el móvil baja ~15 MB y lo guarda ya
                             descomprimido. `indice.db`, igual sin comprimir, de respaldo.
  c/<versión>/d/<n>.json     la ficha completa de cada especie (resumen de Wikipedia,
                             galería con autoría, estado por regiones, países, de dónde
                             sale cada dato…), en trozos: la especie `id` está en
                             `n = id % SHARDS`. El móvil baja el trozo al abrir la ficha
                             y lo guarda en el índice (caché acotada).
  c/<versión>/cc/<CC>.json   especies de cada país con su nº de observaciones
                             [[id, obs], …], de más a menos vista (filtro por país,
                             «qué puedes ver aquí», candidatas de la IA).
  c/manifest.json            versión, esquema, tamaños y MD5 del índice (sin caché).

El índice lleva vacías las tablas que se llenan en el móvil (`country`, `shard`)
y la vista `species_v` de siempre, así que las consultas de la app no cambian.
Las fotos de Commons a 960 px se guardan como `t:<hash>/<fichero>` (la app
reconstruye la URL de la miniatura: ver app/src/lib/urls.ts).

Se conservan la versión actual y la anterior (una app que aún no ha
actualizado su índice sigue pudiendo pedir sus fichas). Publicar:

    pnpm dlx firebase-tools deploy --only hosting

(firebase.json apunta `hosting.public` a `tools/out/hosting`). Hosting en el plan
Spark: 10 GB de almacenamiento y 360 MB/día de descarga, de sobra para esto.

`INDEX_SCHEMA` es el contrato con la app (`CATALOG_SCHEMA` en
app/src/db/catalogRemote.ts): súbelo en los dos sitios si cambian tablas o
columnas que la app consulta. `out/indice.db` queda también para las pruebas
de la app (app/tests).
"""

from __future__ import annotations

import gzip
import hashlib
import json
import re
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .. import config

INDEX_SCHEMA = 4
SHARDS = 4096
KEEP = 2
# Igual que POOL en app/src/lib/quiz.ts: las especies que pueden salir en el
# quiz llevan su resumen en el índice (la pregunta lo usa sin red).
QUIZ_POOL = 3000
QUIZ_MIN_OBS = 300

THUMB = re.compile(r"^c:thumb/([0-9a-f]/[0-9a-f]{2})/([^/]+)/960px-(.+)$")


def compact(url: str | None) -> str | None:
    """`c:thumb/a/ab/F/960px-F` → `t:a/ab/F` (el nombre del fichero va una vez)."""
    if not url:
        return url
    m = THUMB.match(url)
    if m and m.group(3) == m.group(2):
        return f"t:{m.group(1)}/{m.group(2)}"
    return url


INDEX_SQL = """
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE species (
  id INTEGER PRIMARY KEY,
  sci TEXT NOT NULL,
  name_es TEXT,
  grp TEXT NOT NULL,
  class_id INTEGER, order_id INTEGER, family_id INTEGER,
  rg_obs INTEGER NOT NULL,
  rarity INTEGER NOT NULL,
  iucn TEXT,
  medium INTEGER NOT NULL DEFAULT 0,
  diet TEXT,
  repro TEXT,
  domestic INTEGER NOT NULL DEFAULT 0,
  envs INTEGER NOT NULL DEFAULT 0,
  img TEXT,
  img_ratio REAL,
  gbif INTEGER,
  seq INTEGER NOT NULL,
  mass_g REAL,
  length_mm REAL
);
CREATE INDEX species_grp ON species (grp, seq);
CREATE INDEX species_obs ON species (rg_obs DESC);

-- Lo que las consultas de la app filtran de la ficha (actividad, migración) y
-- el resumen de las especies del quiz. El resto de la ficha viene de Hosting.
CREATE TABLE detail (
  id INTEGER PRIMARY KEY,
  activity TEXT,
  migration TEXT,
  summary TEXT,
  summary_lang TEXT
);

-- Solo MATCH → rowid con prefijos ("gat"* AND "mont"*): sin posiciones ni
-- tamaños de documento, que ocupan y no se usan.
CREATE VIRTUAL TABLE species_fts USING fts5(
  name_es, sci, aliases,
  content = '',
  detail = 'none',
  columnsize = 0,
  tokenize = 'unicode61 remove_diacritics 2'
);
CREATE VIRTUAL TABLE breed_fts USING fts5(
  name, other,
  content = '',
  detail = 'none',
  columnsize = 0,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- Se llenan en el móvil, bajo demanda.
CREATE TABLE country (
  id INTEGER NOT NULL,
  cc TEXT NOT NULL,
  obs INTEGER NOT NULL,
  PRIMARY KEY (id, cc)
) WITHOUT ROWID;
CREATE INDEX country_cc ON country (cc, obs DESC);
CREATE TABLE country_loaded (cc TEXT PRIMARY KEY, at TEXT NOT NULL);
CREATE TABLE shard (
  n INTEGER PRIMARY KEY,
  json TEXT NOT NULL,
  used_at INTEGER NOT NULL,
  keep INTEGER NOT NULL DEFAULT 0
);
"""

SPECIES_V = """
CREATE VIEW species_v AS
SELECT s.*,
  c.sci AS class_sci, c.es AS class_es,
  o.sci AS order_sci, o.es AS order_es,
  f.sci AS family_sci, f.es AS family_es,
  CASE WHEN instr(s.sci, ' ') > 0 THEN substr(s.sci, 1, instr(s.sci, ' ') - 1) ELSE s.sci END AS genus_sci
FROM species s
LEFT JOIN taxon c ON c.id = s.class_id
LEFT JOIN taxon o ON o.id = s.order_id
LEFT JOIN taxon f ON f.id = s.family_id
"""

# Columnas de la ficha que viajan en los trozos (las de `detail` y de `species`
# que el índice no lleva).
DETAIL_COLS = ["summary", "summary_lang", "summary_src", "aliases_es", "conservation", "diet_detail", "cities", "cities_n"]
SPECIES_COLS = ["wd", "worms", "eswiki", "enwiki", "taxo", "gbif_name"]


def _copy_table(db: sqlite3.Connection, name: str, transform: dict[str, str] | None = None) -> None:
    """Crea la tabla con la misma definición que en la base completa y copia sus filas."""
    sql = db.execute("SELECT sql FROM s.sqlite_master WHERE type = 'table' AND name = ?", (name,)).fetchone()[0]
    db.execute(sql)
    cols = [r[1] for r in db.execute(f"PRAGMA s.table_info({name})")]
    sel = ", ".join((transform or {}).get(c, c) for c in cols)
    db.execute(f"INSERT INTO main.{name} SELECT {sel} FROM s.{name}")


def build_index(src: Path, dst: Path, version: str, info: dict) -> None:
    if dst.exists():
        dst.unlink()
    db = sqlite3.connect(dst)
    db.create_function("compact", 1, compact, deterministic=True)
    db.execute("PRAGMA page_size = 4096")
    db.execute("ATTACH ? AS s", (str(src),))
    db.executescript(INDEX_SQL)
    for t in ("source", "taxon", "grp", "city"):
        _copy_table(db, t, {"img": "compact(img)"})
    _copy_table(db, "breed", {"img": "compact(img)"})
    db.execute("CREATE INDEX breed_species ON breed (species_id, seq)")
    db.execute(SPECIES_V)

    db.execute(
        """INSERT INTO species SELECT id, sci, name_es, grp, class_id, order_id, family_id, rg_obs, rarity, iucn,
             medium, diet, repro, domestic, envs, compact(img), round(img_ratio, 3), gbif, seq, mass_g, length_mm
           FROM s.species"""
    )
    db.execute(
        """INSERT INTO detail (id, activity, migration)
           SELECT id, activity, migration FROM s.detail WHERE activity IS NOT NULL OR migration IS NOT NULL"""
    )
    pool = [
        r[0]
        for r in db.execute(
            "SELECT id FROM species WHERE img IS NOT NULL AND name_es IS NOT NULL AND rg_obs >= ? ORDER BY rg_obs DESC, id LIMIT ?",
            (QUIZ_MIN_OBS, QUIZ_POOL),
        )
    ]
    db.executemany(
        """INSERT INTO detail (id, summary, summary_lang)
           SELECT id, summary, summary_lang FROM s.detail WHERE id = ?1
           ON CONFLICT (id) DO UPDATE SET summary = excluded.summary, summary_lang = excluded.summary_lang""",
        [(i,) for i in pool],
    )
    db.execute(
        """INSERT INTO species_fts (rowid, name_es, sci, aliases)
           SELECT s.id, COALESCE(s.name_es, ''), s.sci, COALESCE(x.aliases, '') FROM s.species s LEFT JOIN s.search x ON x.id = s.id"""
    )
    db.execute("INSERT INTO species_fts (species_fts) VALUES ('optimize')")
    db.execute(
        """INSERT INTO breed_fts (rowid, name, other)
           SELECT b.rid, b.name, COALESCE(x.other, '') FROM s.breed b LEFT JOIN s.breed_search x ON x.rid = b.rid"""
    )
    db.execute("INSERT INTO breed_fts (breed_fts) VALUES ('optimize')")

    meta = dict(db.execute("SELECT key, value FROM s.meta").fetchall())
    meta.update(
        {
            "schema": str(INDEX_SCHEMA),
            "version": version,
            "catalog_version": info["version"],
            "built_at": info["built_at"],
            "shards": str(SHARDS),
        }
    )
    db.executemany("INSERT INTO meta VALUES (?, ?)", sorted(meta.items()))
    db.commit()
    db.execute("DETACH s")
    db.execute("VACUUM")
    db.close()


def build_shards(src: Path, out: Path, version: str) -> tuple[int, int]:
    """Fichas completas en `out/d/<n>.json`. Devuelve (nº de ficheros, bytes)."""
    db = sqlite3.connect(f"file:{src}?mode=ro", uri=True)
    shards: dict[int, dict[str, dict]] = {}

    def entry(i: int) -> dict:
        return shards.setdefault(i % SHARDS, {}).setdefault(str(i), {})

    cols = ", ".join(f"d.{c}" for c in DETAIL_COLS) + ", " + ", ".join(f"s.{c}" for c in SPECIES_COLS)
    names = DETAIL_COLS + SPECIES_COLS
    for row in db.execute(f"SELECT s.id, {cols} FROM species s LEFT JOIN detail d ON d.id = s.id"):
        d = {k: v for k, v in zip(names, row[1:]) if v is not None}
        e = entry(row[0])
        if d:
            e["d"] = d
    for i, rank, url, ratio, author, lic, source, page in db.execute(
        "SELECT id, rank, url, ratio, author, license, source, page FROM image ORDER BY id, rank"
    ):
        entry(i).setdefault("i", []).append([rank, compact(url), round(ratio, 3) if ratio else ratio, author, lic, source, page])
    for i, field, sources, note in db.execute("SELECT id, field, sources, note FROM provenance ORDER BY id, field"):
        entry(i).setdefault("p", []).append([field, sources, note])
    for i, cc, obs, means in db.execute("SELECT id, cc, obs, means FROM country ORDER BY id, obs DESC"):
        entry(i).setdefault("c", []).append([cc, obs, means])
    db.close()

    d_dir = out / "d"
    d_dir.mkdir(parents=True, exist_ok=True)
    total = 0
    for n in range(SHARDS):
        body = json.dumps({"v": version, "n": n, "sp": shards.get(n, {})}, ensure_ascii=False, separators=(",", ":"))
        (d_dir / f"{n}.json").write_text(body, encoding="utf-8")
        total += len(body.encode("utf-8"))
    return SHARDS, total


def build_countries(src: Path, out: Path, version: str) -> int:
    db = sqlite3.connect(f"file:{src}?mode=ro", uri=True)
    by_cc: dict[str, list[list[int]]] = {}
    for cc, i, obs in db.execute("SELECT cc, id, obs FROM country ORDER BY cc, obs DESC, id"):
        by_cc.setdefault(cc, []).append([i, obs])
    db.close()
    cc_dir = out / "cc"
    cc_dir.mkdir(parents=True, exist_ok=True)
    for cc, rows in by_cc.items():
        body = json.dumps({"v": version, "cc": cc, "s": rows}, separators=(",", ":"))
        (cc_dir / f"{cc}.json").write_text(body, encoding="utf-8")
    return len(by_cc)


def _md5(path: Path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(4 * 1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _check(index: Path) -> None:
    """Comprobaciones rápidas: la búsqueda por prefijos y la vista funcionan."""
    db = sqlite3.connect(f"file:{index}?mode=ro", uri=True)
    hit = db.execute("SELECT COUNT(*) FROM species WHERE id IN (SELECT rowid FROM species_fts WHERE species_fts MATCH '\"zorr\"* AND \"comun\"*')").fetchone()[0]
    fam = db.execute("SELECT COUNT(*) FROM species_v WHERE family_sci IS NOT NULL").fetchone()[0]
    db.close()
    if hit == 0 or fam == 0:
        raise SystemExit(f"[hosting] el índice no responde como debe (búsqueda {hit}, familias {fam})")


def run() -> None:
    src = config.OUT / "catalogo.db"
    info_path = config.OUT / "catalogo.json"
    if not src.exists() or not info_path.exists():
        raise SystemExit("Falta out/catalogo.db o out/catalogo.json: ejecuta antes la etapa build")
    info = json.loads(info_path.read_text(encoding="utf-8"))
    version = hashlib.sha256(f"{info['version']}:{INDEX_SCHEMA}:{SHARDS}".encode()).hexdigest()[:12]
    root = config.OUT / "hosting"
    base = root / "c" / version
    if base.exists():
        shutil.rmtree(base)
    base.mkdir(parents=True)

    index = config.OUT / "indice.db"
    print(f"[hosting] índice {version}…", flush=True)
    build_index(src, index, version, info)
    _check(index)
    shutil.copyfile(index, base / "indice.db")
    with open(index, "rb") as fi, gzip.open(base / "indice.db.gz", "wb", compresslevel=9) as fo:
        shutil.copyfileobj(fi, fo, length=4 * 1024 * 1024)
    size = index.stat().st_size
    gz_size = (base / "indice.db.gz").stat().st_size
    print(f"[hosting] índice: {size / 1e6:.1f} MB ({gz_size / 1e6:.1f} MB comprimido)", flush=True)

    n_shards, shard_bytes = build_shards(src, base, version)
    print(f"[hosting] fichas: {n_shards} trozos, {shard_bytes / 1e6:.1f} MB en total", flush=True)
    n_cc = build_countries(src, base, version)
    print(f"[hosting] países: {n_cc}", flush=True)

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    manifest = {
        "version": version,
        "schema": INDEX_SCHEMA,
        "built_at": info["built_at"],
        "species": info["species"],
        "breeds": info.get("breeds"),
        "shards": SHARDS,
        "size": size,
        "md5": _md5(index),
        "files": {
            "gz": {"path": f"c/{version}/indice.db.gz", "size": gz_size},
            "raw": {"path": f"c/{version}/indice.db", "size": size},
        },
        "published_at": now,
    }
    (base / "info.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (root / "c" / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    index_html = root / "index.html"
    if not index_html.exists():
        index_html.write_text(
            '<!doctype html><html lang="es"><meta charset="utf-8"><title>Zarpa</title>'
            "<p>Catálogo de especies de la app Zarpa.</p></html>\n",
            encoding="utf-8",
        )

    # Se conservan la versión nueva y la anterior.
    versions = []
    for d in (root / "c").iterdir():
        if d.is_dir() and (d / "info.json").exists():
            versions.append((json.loads((d / "info.json").read_text(encoding="utf-8"))["published_at"], d))
    for _, d in sorted(versions, reverse=True)[KEEP:]:
        shutil.rmtree(d)
        print(f"[hosting] borrada la versión antigua {d.name}")
    print(f"[hosting] listo: {root} · publica con `pnpm dlx firebase-tools deploy --only hosting`")
