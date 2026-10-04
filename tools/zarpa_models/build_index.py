"""
Índice de especies para el móvil: un vector por especie del catálogo.

Cada vector es el del codificador de texto de BioCLIP con la clasificación
completa y el nombre común (la forma con la que mejor reconoce, según su
artículo y `evaluate.py`). Si la especie tiene fotos de referencia con licencia
libre en el banco, se suma la media de sus vectores de imagen (`text+proto`).

Formato binario: ver `app/src/ai/speciesIndex.ts`. Cuantización int8 por
vector (escala = máximo absoluto / 127); el error se mide y se informa.

La escala del logit guardada es la de CLIP dividida por la temperatura
calibrada en `evaluate.py` (report-<modelo>.json): así el softmax del móvil da
probabilidades calibradas sin saber nada de temperaturas.

Compresión (versión 2 del formato): con ~280 000 especies el índice ocupa
~143 MB. `evaluate.py` mide también el índice proyectado por SVD a 256 y 128
dimensiones; aquí se elige solo la más pequeña cuya precisión no baje más de
medio punto respecto al índice completo y que siga acertando ≥95 % al afirmar
especie en la validación cruzada. Se usan la temperatura y los umbrales de esa
misma variante (`publish.py` los lee de species_index.json).

Uso (entorno ~/.zml, GPU):
  python -m zarpa_models.build_index --model bioclip [--svd 256]
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import struct
from pathlib import Path

import numpy as np
import torch

from zarpa_data import config

from .evaluate import HUB, SVD_DIMS, embed_texts, prompt, svd_basis

ROOT = config.ROOT
MAGIC = 0x5844495A
VERSION = 1


def species_from_catalog() -> list[dict]:
    db = sqlite3.connect(config.OUT / "catalogo.db")
    rows = db.execute("SELECT id, sci, name_en, class_sci, order_sci, family_sci, genus_sci FROM species_v").fetchall()
    db.close()
    # El filo no está en el catálogo; sale de las fichas de iNaturalist.
    phylum = {}
    for line in open(config.OUT / "taxa.jsonl", encoding="utf-8"):
        try:
            t = json.loads(line)
        except json.JSONDecodeError:
            continue
        for a in t["ancestors"]:
            if a["rank"] == "phylum":
                phylum[t["inat_id"]] = a["name"]
    out = []
    for sid, sci, en, cls, order, fam, genus in rows:
        out.append(
            {
                "id": sid,
                "kingdom": "Animalia",
                "phylum": phylum.get(sid),
                "class": cls,
                "order": order,
                "family": fam,
                "genus": genus,
                "species": sci,
                "common": en,
            }
        )
    return out


def choose_variant(report: dict, style: str) -> tuple[str, int | None]:
    full_key = f"{style}/text"
    full = report["variants"][full_key]
    for k in sorted(SVD_DIMS):
        v = report["variants"].get(f"{style}/svd{k}")
        if not v:
            continue
        # Una mitad que no afirma ninguna especie no incumple el 95 % (su
        # «precisión» sale 0 por no tener respuestas).
        held_ok = all(
            f["held"]["answered"]["species"] == 0 or f["held"]["precision"]["species"] >= 0.95 for f in v["cross_validated"]
        )
        if v["top1"] >= full["top1"] - 0.005 - 1e-9 and held_ok:
            return f"{style}/svd{k}", k
    return full_key, None


def run(name: str, style: str, temperature: float | None, svd: int | None = None) -> Path:
    import open_clip

    device = "cuda"
    model, _, _ = open_clip.create_model_and_transforms(HUB[name])
    tokenizer = open_clip.get_tokenizer(HUB[name])
    model = model.to(device).eval()
    species = species_from_catalog()
    print(f"[index] {len(species)} especies con {name}", flush=True)
    vecs = embed_texts(model, tokenizer, [prompt(s, style) for s in species], device).numpy().astype(np.float32)

    report = ROOT / "cache" / "bench" / f"report-{name}.json"
    variant = f"{style}/text" if not svd else f"{style}/svd{svd}"
    if report.exists():
        rep = json.loads(report.read_text(encoding="utf-8"))
        if svd is None:
            variant, svd = choose_variant(rep, style)
        if temperature is None:
            temperature = rep["variants"].get(variant, {}).get("temperature")
    temperature = temperature or 1.0
    logit_scale = float(model.logit_scale.exp().item()) / temperature
    basis = None
    if svd:
        t = torch.from_numpy(vecs).to(device)
        basis_t = svd_basis(t, svd)
        vecs = torch.nn.functional.normalize(t @ basis_t, dim=-1).cpu().numpy().astype(np.float32)
        basis = basis_t.float().cpu().numpy().astype(np.float32)
    print(f"[index] variante {variant}" + (f" (SVD a {svd} dimensiones)" if svd else ""), flush=True)

    scales = np.abs(vecs).max(axis=1) / 127.0
    scales[scales == 0] = 1e-8
    q = np.clip(np.round(vecs / scales[:, None]), -127, 127).astype(np.int8)
    deq = q.astype(np.float32) * scales[:, None]
    err = 1 - (np.sum(deq * vecs, axis=1) / (np.linalg.norm(deq, axis=1) * np.linalg.norm(vecs, axis=1)))
    print(f"[index] cuantización int8: pérdida de coseno media {err.mean():.2e}, máxima {err.max():.2e}")

    out_dir = ROOT / "models" / name
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "species_index.bin"
    with open(path, "wb") as fh:
        fh.write(struct.pack("<IIIIf", MAGIC, 2 if basis is not None else VERSION, vecs.shape[1], len(species), logit_scale))
        if basis is not None:
            fh.write(struct.pack("<I", basis.shape[0]))
            fh.write(basis.astype("<f4").tobytes())
        fh.write(np.array([s["id"] for s in species], dtype="<i4").tobytes())
        fh.write(scales.astype("<f4").tobytes())
        fh.write(q.tobytes())
    meta = {
        "model": name,
        "style": style,
        "variant": variant,
        "svd": svd,
        "species": len(species),
        "dim": int(vecs.shape[1]),
        "temperature": temperature,
        "logit_scale": logit_scale,
        "int8_cosine_loss_mean": float(err.mean()),
        "bytes": path.stat().st_size,
    }
    (out_dir / "species_index.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    print(f"[index] {path} ({path.stat().st_size / 1e6:.1f} MB)")
    return path


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="bioclip", choices=list(HUB))
    ap.add_argument("--style", default="taxo+common")
    ap.add_argument("--temperature", type=float, default=None)
    ap.add_argument("--svd", type=int, default=None, help="dimensiones (por defecto, la que elija la evaluación)")
    args = ap.parse_args()
    with torch.no_grad():
        run(args.model, args.style, args.temperature, args.svd)
