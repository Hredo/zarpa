"""
Reconocimiento de raza: retrato medio de cada raza y umbral calibrado.

Con las fotos de `breed_photos.py`, el codificador de imagen de BioCLIP (el
mismo que corre en el móvil) da un vector por foto. Para cada raza:

  - 3 de cada 4 fotos forman su «retrato medio» (media normalizada);
  - la cuarta se guarda para medir: se compara solo con las razas de su misma
    especie (un perro contra razas de perro).

Con esas fotos de prueba se calibra, en dos mitades por raza, la temperatura
del softmax y el umbral de probabilidad con el que la raza más probable acierta
al menos el 95 % de las veces. Por debajo, la app solo sugiere razas y decide
la persona. El índice final usa todas las fotos.

Formato: el mismo que el índice de especies ('ZIDX', ver
app/src/ai/speciesIndex.ts), con el `rid` estable de cada raza como id.

Uso (entorno ~/.zml, GPU): python -m zarpa_models.breed_index --model bioclip
"""

from __future__ import annotations

import argparse
import json
import random
import sqlite3
import struct
import zlib
from pathlib import Path

import numpy as np
import torch

from zarpa_data import config

from .evaluate import HUB, NEVER, TARGET_PRECISION, calibrate_temperature, embed_images, wilson_lower

ROOT = config.ROOT
BREEDS = ROOT / "cache" / "breeds"
MAGIC = 0x5844495A
MIN_PHOTOS = 4


def _rid(breed_id: str) -> int:
    return zlib.crc32(breed_id.encode("utf-8")) & 0x7FFFFFFF


def _threshold(pairs: list[tuple[float, bool]]) -> float:
    """Igual que en `evaluate.py`: el 95 % se exige a la cota de Wilson."""
    best, hits = NEVER, 0
    for k, (p, ok) in enumerate(sorted(pairs, reverse=True), 1):
        hits += ok
        if wilson_lower(hits, k) >= TARGET_PRECISION:
            best = p
    return best


def run(name: str) -> Path:
    import open_clip

    device = "cuda"
    model, _, preprocess = open_clip.create_model_and_transforms(HUB[name])
    model = model.to(device).eval()
    logit_scale = float(model.logit_scale.exp().item())

    manifest = [m for m in json.loads((BREEDS / "manifest.json").read_text(encoding="utf-8")) if len(m["photos"]) >= MIN_PHOTOS]
    db = sqlite3.connect(config.OUT / "catalogo.db")
    known = {r[0] for r in db.execute("SELECT id FROM breed")}
    db.close()
    manifest = [m for m in manifest if m["breed"] in known]
    print(f"[razas-ia] {len(manifest)} razas con al menos {MIN_PHOTOS} fotos", flush=True)

    paths, owner = [], []
    for i, m in enumerate(manifest):
        for p in sorted(m["photos"]):
            paths.append(BREEDS / p)
            owner.append(i)
    with torch.no_grad():
        emb = embed_images(model, preprocess, paths, device).numpy()
    owner = np.array(owner)

    # Reparto fijo: una de cada cuatro fotos de cada raza, a medir.
    test_mask = np.zeros(len(paths), dtype=bool)
    for i in range(len(manifest)):
        idx = np.flatnonzero(owner == i)
        test_mask[idx[3::4]] = True

    def prototypes(mask: np.ndarray) -> np.ndarray:
        protos = np.zeros((len(manifest), emb.shape[1]), dtype=np.float32)
        for i in range(len(manifest)):
            v = emb[(owner == i) & mask].mean(axis=0)
            protos[i] = v / np.linalg.norm(v)
        return protos

    protos = prototypes(~test_mask)
    species = np.array([m["species"] for m in manifest])
    rows = []  # (logits sobre razas de la misma especie, índice local de la verdad, raza)
    for j in np.flatnonzero(test_mask):
        same = np.flatnonzero(species == species[owner[j]])
        logits = (protos[same] @ emb[j]) * logit_scale
        rows.append((logits, int(np.flatnonzero(same == owner[j])[0]), int(owner[j])))

    top1 = float(np.mean([int(l.argmax()) == t for l, t, _ in rows]))
    top3 = float(np.mean([t in np.argsort(-l)[:3] for l, t, _ in rows]))

    breeds = sorted({b for _, _, b in rows})
    random.Random(5).shuffle(breeds)
    half = set(breeds[: len(breeds) // 2])
    folds = [[r for r in rows if r[2] in half], [r for r in rows if r[2] not in half]]
    cv = []
    for fit, held in (folds, folds[::-1]):
        temp = calibrate_temperature([l for l, _, _ in fit], [t for _, t, _ in fit])
        thr = _threshold(_pairs(fit, temp))
        held_pairs = _pairs(held, temp)
        answered = [ok for p, ok in held_pairs if p >= thr]
        cv.append({"temperature": temp, "threshold": thr, "answered": len(answered) / max(1, len(held_pairs)), "precision": float(np.mean(answered)) if answered else None})
    temp = calibrate_temperature([l for l, _, _ in rows], [t for _, t, _ in rows])
    thr = _threshold(_pairs(rows, temp))

    final = prototypes(np.ones(len(paths), dtype=bool))
    scales = np.abs(final).max(axis=1) / 127.0
    q = np.clip(np.round(final / scales[:, None]), -127, 127).astype(np.int8)
    out_dir = ROOT / "models" / name
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "breed_index.bin"
    with open(path, "wb") as fh:
        fh.write(struct.pack("<IIIIf", MAGIC, 1, final.shape[1], len(manifest), logit_scale / temp))
        fh.write(np.array([_rid(m["breed"]) for m in manifest], dtype="<i4").tobytes())
        fh.write(scales.astype("<f4").tobytes())
        fh.write(q.tobytes())
    report = {
        "model": name,
        "breeds": len(manifest),
        "photos": len(paths),
        "test_photos": int(test_mask.sum()),
        "top1": top1,
        "top3": top3,
        "temperature": temp,
        "threshold": thr,
        "cross_validated": cv,
        "species": {str(s): int((species == s).sum()) for s in sorted(set(species.tolist()))},
    }
    (ROOT / "cache" / "bench" / f"report-breeds-{name}.json").parent.mkdir(parents=True, exist_ok=True)
    (ROOT / "cache" / "bench" / f"report-breeds-{name}.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    print(f"[razas-ia] top1={top1:.3f} top3={top3:.3f} · umbral {thr:.3f} · validación cruzada {cv}")
    print(f"[razas-ia] {path} ({path.stat().st_size / 1e6:.2f} MB)")
    return path


def _pairs(rows, temp):
    out = []
    for logits, truth, _ in rows:
        z = logits / temp
        z = z - z.max()
        p = np.exp(z)
        p /= p.sum()
        out.append((float(p.max()), int(p.argmax()) == truth))
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="bioclip")
    args = ap.parse_args()
    run(args.model)
