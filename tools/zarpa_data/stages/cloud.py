"""
Etapa · Publica el catálogo en Cloud Storage (Firebase) para que la app lo
actualice sin sacar una versión nueva.

La app trae un catálogo dentro (funciona sin red desde el primer día) y una vez
al día, con wifi, mira `catalog/manifest.json`. Si hay uno más nuevo de su mismo
esquema, lo baja, comprueba su MD5 y lo usa al volver a abrirse.

Sube `out/catalogo.db` (lo deja `build`) a `catalog/v/<versión>/`:

  catalogo.db.gz  comprimido y servido con `Content-Encoding: gzip`: el móvil
                  baja ~40 % de los bytes y lo descomprime solo al recibirlo.
  catalogo.db     sin comprimir, de respaldo si el móvil no lo descomprimiera
                  (la app lo detecta porque el MD5 no cuadra).

y reescribe el manifiesto. Conserva las `KEEP` últimas versiones y borra las
anteriores. Las reglas de Storage dejan leer `catalog/` a cualquiera y no dejan
escribirlo a nadie desde la app: solo esta etapa, con credenciales de admin.

Credenciales: las de aplicación por defecto de Google (ADC), una vez por equipo:

    gcloud auth application-default login

con una cuenta con permiso sobre el proyecto. Nunca se guarda una clave en el
repositorio. Cubo: `ZARPA_BUCKET` o `<proyecto>.firebasestorage.app` según
`.firebaserc`. Con `ZARPA_CLOUD_DRY=1` prepara todo y no sube nada.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import os
import shutil
from datetime import datetime, timezone

from .. import config

KEEP = 3
PREFIX = "catalog"


def _bucket_name() -> str:
    if os.environ.get("ZARPA_BUCKET"):
        return os.environ["ZARPA_BUCKET"]
    rc = json.loads((config.ROOT.parent / ".firebaserc").read_text(encoding="utf-8"))
    return f"{rc['projects']['default']}.firebasestorage.app"


def _gzip(src, dst) -> None:
    with open(src, "rb") as fi, gzip.open(dst, "wb", compresslevel=6) as fo:
        shutil.copyfileobj(fi, fo, length=4 * 1024 * 1024)


def manifest_for(info: dict, gz_size: int, now: str) -> dict:
    """Manifiesto que lee la app (`app/src/db/catalogUpdate.ts`)."""
    base = f"{PREFIX}/v/{info['version']}"
    return {
        "version": info["version"],
        "schema": info["schema"],
        "built_at": info["built_at"],
        "species": info["species"],
        "breeds": info.get("breeds"),
        "size": info["size"],
        "md5": info["md5"],
        "files": {
            "gz": {"path": f"{base}/catalogo.db.gz", "size": gz_size},
            "raw": {"path": f"{base}/catalogo.db", "size": info["size"]},
        },
        "published_at": now,
    }


def run() -> None:
    db_path = config.OUT / "catalogo.db"
    info_path = config.OUT / "catalogo.json"
    if not db_path.exists() or not info_path.exists():
        raise SystemExit("Falta out/catalogo.db o out/catalogo.json: ejecuta antes la etapa build")
    info = json.loads(info_path.read_text(encoding="utf-8"))

    # La ficha debe ser la de este fichero (por si se reconstruyó sin publicar).
    md5 = hashlib.md5()
    with open(db_path, "rb") as fh:
        for chunk in iter(lambda: fh.read(8 * 1024 * 1024), b""):
            md5.update(chunk)
    if md5.hexdigest() != info["md5"]:
        raise SystemExit("out/catalogo.json no corresponde a out/catalogo.db: vuelve a ejecutar build")

    gz_path = config.OUT / "catalogo.db.gz"
    print(f"[cloud] comprimiendo {info['size'] / 1e6:.1f} MB…", flush=True)
    _gzip(db_path, gz_path)
    gz_size = gz_path.stat().st_size
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    manifest = manifest_for(info, gz_size, now)
    (config.OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[cloud] versión {info['version']} · {gz_size / 1e6:.1f} MB comprimido ({gz_size / info['size']:.0%})", flush=True)

    if os.environ.get("ZARPA_CLOUD_DRY"):
        print("[cloud] ZARPA_CLOUD_DRY: no se sube nada. Manifiesto en out/manifest.json")
        return

    try:
        from google.cloud import storage
    except ImportError as exc:  # pragma: no cover - depende del entorno
        raise SystemExit("Falta google-cloud-storage: uv sync en tools/") from exc

    try:
        client = storage.Client(project=json.loads((config.ROOT.parent / ".firebaserc").read_text(encoding="utf-8"))["projects"]["default"])
        bucket = client.bucket(_bucket_name())
    except Exception as exc:  # credenciales ausentes o caducadas
        raise SystemExit(f"Sin credenciales de Google: ejecuta «gcloud auth application-default login» ({exc})") from exc

    immutable = "public, max-age=31536000, immutable"
    gz_blob = bucket.blob(manifest["files"]["gz"]["path"])
    gz_blob.content_encoding = "gzip"
    gz_blob.cache_control = immutable
    print(f"[cloud] subiendo {gz_blob.name}…", flush=True)
    gz_blob.upload_from_filename(str(gz_path), content_type="application/vnd.sqlite3", timeout=1800)

    raw_blob = bucket.blob(manifest["files"]["raw"]["path"])
    raw_blob.cache_control = immutable
    print(f"[cloud] subiendo {raw_blob.name}…", flush=True)
    raw_blob.upload_from_filename(str(db_path), content_type="application/vnd.sqlite3", timeout=1800)

    # El manifiesto, el último: hasta que no está, ninguna app ve la versión nueva.
    man_blob = bucket.blob(f"{PREFIX}/manifest.json")
    man_blob.cache_control = "public, max-age=300"
    man_blob.upload_from_string(json.dumps(manifest, ensure_ascii=False), content_type="application/json")
    print(f"[cloud] manifiesto publicado en gs://{bucket.name}/{man_blob.name}", flush=True)

    # Limpieza: se conservan las KEEP versiones más recientes.
    versions: dict[str, datetime] = {}
    for blob in client.list_blobs(bucket, prefix=f"{PREFIX}/v/"):
        v = blob.name.split("/")[2]
        versions[v] = max(versions.get(v, blob.updated), blob.updated)
    old = sorted(versions, key=versions.get, reverse=True)[KEEP:]
    for v in old:
        if v == info["version"]:
            continue
        for blob in client.list_blobs(bucket, prefix=f"{PREFIX}/v/{v}/"):
            blob.delete()
        print(f"[cloud] borrada la versión antigua {v}")
    print(f"[cloud] listo: versión {info['version']} publicada")
