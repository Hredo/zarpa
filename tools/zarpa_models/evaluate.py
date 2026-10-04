"""
Mide el reconocimiento de especies sobre el banco de pruebas (`bench.py`).

Compara modelos (BioCLIP, BioCLIP 2…) y formas de construir el índice:
  - `text`: solo el codificador de texto (cero ejemplos), con la clasificación
    completa y el nombre común, como en los artículos de BioCLIP;
  - `text+proto`: texto combinado con la media de las fotos de referencia con
    licencia libre de la especie, si las tiene.

Los candidatos son todas las especies del catálogo que se ven en España (≥3
observaciones en GBIF), no solo las del banco: así se mide como en el móvil,
con miles de parecidos compitiendo.

Además calibra:
  - la temperatura del softmax (validación cruzada en dos mitades), y
  - el umbral de cada nivel (clase … especie) para que la respuesta afirmada
    acierte al menos el 95 % de las veces en la mitad que no se usó para fijarlo.

Uso (entorno ~/.zml con CUDA):
  python -m zarpa_models.evaluate --models bioclip bioclip-2
Escribe `cache/bench/report-<modelo>.json`.
"""

from __future__ import annotations

import argparse
import json
import math
import random
from pathlib import Path

import numpy as np
import torch
from PIL import Image

from zarpa_data import config

BENCH = config.ROOT / "cache" / "bench"
HUB = {"bioclip": "hf-hub:imageomics/bioclip", "bioclip-2": "hf-hub:imageomics/bioclip-2"}
RANKS = ["class", "order", "family", "genus", "species"]
TARGET_PRECISION = 0.95


def load_taxonomy() -> dict[int, dict]:
    tax: dict[int, dict] = {}
    names_en = {}
    for line in open(config.OUT / "universe.jsonl", encoding="utf-8"):
        u = json.loads(line)
        names_en[u["inat_id"]] = u.get("name_en")
    for line in open(config.OUT / "taxa.jsonl", encoding="utf-8"):
        try:
            t = json.loads(line)
        except json.JSONDecodeError:
            continue
        anc = {a["rank"]: a["name"] for a in t["ancestors"]}
        tax[t["inat_id"]] = {
            "kingdom": anc.get("kingdom", "Animalia"),
            "phylum": anc.get("phylum"),
            "class": anc.get("class"),
            "order": anc.get("order"),
            "family": anc.get("family"),
            "genus": anc.get("genus"),
            "species": t["name"],
            "common": names_en.get(t["inat_id"]),
        }
    return tax


def spain_candidates(tax: dict[int, dict]) -> list[int]:
    gbif = {}
    for line in open(config.OUT / "gbif_taxa.jsonl", encoding="utf-8"):
        g = json.loads(line)
        if g.get("gbif_key"):
            gbif[str(g["gbif_key"])] = g["inat_id"]
    es = next(json.loads(l) for l in open(config.OUT / "gbif_countries.jsonl", encoding="utf-8") if '"cc": "ES"' in l)
    return sorted({gbif[k] for k, n in es["species"].items() if k in gbif and n >= 3 and gbif[k] in tax})


def prompt(t: dict, style: str) -> str:
    epithet = t["species"].split(" ", 1)[-1]
    taxo = " ".join(x for x in [t["kingdom"], t["phylum"], t["class"], t["order"], t["family"], t["genus"], epithet] if x)
    if style == "taxo+common" and t.get("common"):
        return f"a photo of {taxo} with common name {t['common']}."
    if style == "sci":
        return f"a photo of {t['species']}."
    return f"a photo of {taxo}."


@torch.no_grad()
def embed_texts(model, tokenizer, texts: list[str], device: str, bs: int = 256) -> torch.Tensor:
    out = []
    for i in range(0, len(texts), bs):
        tok = tokenizer(texts[i : i + bs]).to(device)
        with torch.autocast(device_type="cuda", dtype=torch.float16):
            e = model.encode_text(tok)
        out.append(torch.nn.functional.normalize(e.float(), dim=-1).cpu())
    return torch.cat(out)


@torch.no_grad()
def embed_images(model, preprocess, paths: list[Path], device: str, bs: int = 64) -> torch.Tensor:
    out = []
    for i in range(0, len(paths), bs):
        batch = torch.stack([preprocess(Image.open(p).convert("RGB")) for p in paths[i : i + bs]]).to(device)
        with torch.autocast(device_type="cuda", dtype=torch.float16):
            e = model.encode_image(batch)
        out.append(torch.nn.functional.normalize(e.float(), dim=-1).cpu())
    return torch.cat(out)


def lineage_of(tax, sid, rank):
    return tax[sid]["species"] if rank == "species" else tax[sid].get(rank)


def verdicts(probs: np.ndarray, cand: list[int], tax, thresholds: dict[str, float]):
    """Misma regla que `app/src/ai/decision.ts`: linaje del mejor hijo, nivel a nivel."""
    pool = np.arange(len(cand))
    level, taxon, certain = None, None, True
    ladder = {}
    for rank in RANKS[:-1]:
        totals: dict[str, float] = {}
        for j in pool:
            name = tax[cand[j]].get(rank)
            if name:
                totals[name] = totals.get(name, 0.0) + float(probs[j])
        if not totals:
            break
        best = max(totals.items(), key=lambda kv: kv[1])
        ladder[rank] = best
        if certain and best[1] >= thresholds[rank]:
            level, taxon = rank, best[0]
        else:
            certain = False
        pool = np.array([j for j in pool if tax[cand[j]].get(rank) == best[0]])
    if len(pool):
        j = pool[np.argmax(probs[pool])]
        ladder["species"] = (tax[cand[j]]["species"], float(probs[j]))
        if certain and level == "genus" and probs[j] >= thresholds["species"]:
            level, taxon = "species", tax[cand[j]]["species"]
    return level, taxon, ladder


def calibrate_temperature(logits: np.ndarray, truth: np.ndarray) -> float:
    best_t, best_nll = 1.0, math.inf
    for t in np.exp(np.linspace(math.log(0.2), math.log(5.0), 60)):
        z = logits / t
        z = z - z.max(axis=1, keepdims=True)
        logp = z - np.log(np.exp(z).sum(axis=1, keepdims=True))
        nll = -logp[np.arange(len(truth)), truth].mean()
        if nll < best_nll:
            best_t, best_nll = float(t), float(nll)
    return best_t


def thresholds_for_precision(rows: list[dict], rank: str) -> float:
    """Umbral mínimo de probabilidad acumulada en `rank` que da ≥95 % de acierto."""
    pairs = sorted(((r["ladder"][rank][1], r["ladder"][rank][0] == r["truth"][rank]) for r in rows if rank in r["ladder"]), reverse=True)
    best = 1.0
    hits = 0
    for k, (p, ok) in enumerate(pairs, 1):
        hits += ok
        if hits / k >= TARGET_PRECISION:
            best = p
    return best


def run_model(name: str, styles: list[str]) -> dict:
    import open_clip

    device = "cuda"
    model, _, preprocess = open_clip.create_model_and_transforms(HUB[name])
    tokenizer = open_clip.get_tokenizer(HUB[name])
    model = model.to(device).eval()
    logit_scale = float(model.logit_scale.exp().item())

    tax = load_taxonomy()
    cand = spain_candidates(tax)
    pos = {sid: i for i, sid in enumerate(cand)}
    manifest = json.loads((BENCH / "manifest.json").read_text(encoding="utf-8"))
    manifest = [m for m in manifest if m["inat_id"] in pos and m["test"]]

    test_paths, test_truth = [], []
    for m in manifest:
        for o in m["test"]:
            test_paths.append(BENCH / o["file"])
            test_truth.append(m["inat_id"])
    img = embed_images(model, preprocess, test_paths, device).numpy()

    proto_paths, proto_owner = [], []
    for m in manifest:
        for o in m["proto"]:
            proto_paths.append(BENCH / o["file"])
            proto_owner.append(m["inat_id"])
    proto = embed_images(model, preprocess, proto_paths, device).numpy() if proto_paths else np.zeros((0, img.shape[1]))

    report = {"model": name, "candidates": len(cand), "test_images": len(test_paths), "species": len(manifest), "variants": {}}
    for style in styles:
        text = embed_texts(model, tokenizer, [prompt(tax[s], style) for s in cand], device).numpy()
        for mode in ("text", "text+proto"):
            idx = text.copy()
            if mode == "text+proto":
                if not len(proto):
                    continue
                sums: dict[int, np.ndarray] = {}
                for v, owner in zip(proto, proto_owner):
                    sums[owner] = sums.get(owner, 0) + v
                for owner, s in sums.items():
                    p = s / np.linalg.norm(s)
                    mix = idx[pos[owner]] + p
                    idx[pos[owner]] = mix / np.linalg.norm(mix)
            logits = (img @ idx.T) * logit_scale
            truth = np.array([pos[t] for t in test_truth])
            top1 = float((logits.argmax(1) == truth).mean())
            top5 = float(np.mean([t in np.argsort(-l)[:5] for l, t in zip(logits, truth)]))

            # Validación cruzada en dos mitades por especie (no por foto): la
            # misma especie nunca está a la vez en calibración y en medida.
            species_ids = sorted(set(test_truth))
            rng = random.Random(11)
            rng.shuffle(species_ids)
            half = set(species_ids[: len(species_ids) // 2])
            folds = [np.array([t in half for t in test_truth]), np.array([t not in half for t in test_truth])]
            per_fold = []
            for fit, held in (folds, folds[::-1]):
                temp = calibrate_temperature(logits[fit], truth[fit])
                rows_fit = _rows(logits[fit], truth[fit], temp, cand, tax, {r: 0.0 for r in RANKS})
                thr = {r: thresholds_for_precision(rows_fit, r) for r in RANKS}
                rows_held = _rows(logits[held], truth[held], temp, cand, tax, thr)
                per_fold.append({"temperature": temp, "thresholds": thr, "held": _summary(rows_held)})
            temp_all = calibrate_temperature(logits, truth)
            rows_all = _rows(logits, truth, temp_all, cand, tax, {r: 0.0 for r in RANKS})
            thr_all = {r: thresholds_for_precision(rows_all, r) for r in RANKS}
            report["variants"][f"{style}/{mode}"] = {
                "top1": top1,
                "top5": top5,
                "temperature": temp_all,
                "thresholds": thr_all,
                "cross_validated": per_fold,
            }
            print(f"[eval] {name} {style}/{mode}: top1={top1:.3f} top5={top5:.3f} · "
                  f"afirma especie en held-out: {[f['held']['answered']['species'] for f in per_fold]} "
                  f"precisión {[f['held']['precision']['species'] for f in per_fold]}", flush=True)
    out = BENCH / f"report-{name}.json"
    out.write_text(json.dumps(report, indent=1), encoding="utf-8")
    return report


def _rows(logits, truth, temp, cand, tax, thr):
    rows = []
    for l, t in zip(logits, truth):
        z = l / temp
        z = z - z.max()
        p = np.exp(z)
        p /= p.sum()
        level, taxon, ladder = verdicts(p, cand, tax, thr)
        rows.append({"level": level, "taxon": taxon, "ladder": ladder, "truth": {r: lineage_of(tax, cand[t], r) for r in RANKS}})
    return rows


def _summary(rows):
    answered, precision = {}, {}
    for r in RANKS:
        # Respuestas que afirman al menos este nivel.
        deep = [x for x in rows if x["level"] and RANKS.index(x["level"]) >= RANKS.index(r)]
        answered[r] = round(len(deep) / max(1, len(rows)), 3)
        ok = [x for x in deep if x["ladder"][r][0] == x["truth"][r]]
        precision[r] = round(len(ok) / max(1, len(deep)), 3)
    return {"answered": answered, "precision": precision}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", nargs="+", default=["bioclip", "bioclip-2"])
    ap.add_argument("--styles", nargs="+", default=["taxo+common", "taxo"])
    args = ap.parse_args()
    for m in args.models:
        run_model(m, args.styles)
