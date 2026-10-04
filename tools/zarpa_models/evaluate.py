"""
Mide el reconocimiento de especies sobre el banco de pruebas (`bench.py`).

Compara modelos (BioCLIP, BioCLIP 2…) y formas de construir el índice:
  - `text`: solo el codificador de texto (cero ejemplos), con la clasificación
    completa y el nombre común, como en los artículos de BioCLIP;
  - `text+proto`: texto combinado con la media de las fotos de referencia con
    licencia libre de la especie, si las tiene.

Los candidatos de cada foto son, como en el móvil, las especies del catálogo
con presencia en el país donde se hizo (≥3 observaciones en GBIF); si el país
tiene menos de 50 o no se sabe, todo el catálogo. Así compiten miles de
parecidos, y una especie que no consta en ese país no se puede acertar (igual
que en la app).

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
# El 95 % se exige a la cota inferior de Wilson (unilateral al 90 %), no al
# acierto medido: con pocas fotos por encima del umbral, un 95 % medido puede
# ser suerte. Pasó en la calibración mundial del 2026-10-04: el umbral de
# especie fijado en una mitad acertó el 88,8 % en la otra.
WILSON_Z = 1.2816
# Umbral «nunca»: por encima de cualquier probabilidad (en float32 un softmax
# muy picudo llega a 1.0 exacto, así que 1.0 no basta).
NEVER = 1.01
SVD_DIMS = (256, 128)


def svd_basis(text: torch.Tensor, k: int) -> torch.Tensor:
    """
    Base de la proyección a `k` dimensiones: autovectores principales de TᵀT
    sin centrar, que es lo que mejor conserva los productos escalares (la
    similitud que usa el índice). D × k, de mayor a menor varianza.
    """
    c = text.T.float() @ text.float()
    _, vecs = torch.linalg.eigh(c)
    return vecs[:, -k:].flip(-1).to(text.dtype)


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


MIN_COUNTRY_CANDIDATES = 50  # igual que `candidatesFor` en app/src/ai/engine.ts
COUNTRY_MIN_OBS = 3  # igual que COUNTRY_MIN_OBS en app/src/db/query.ts


def catalog(tax: dict[int, dict]) -> list[int]:
    """Especies del catálogo (con cruce en GBIF), en un orden fijo."""
    ok = set()
    for line in open(config.OUT / "gbif_taxa.jsonl", encoding="utf-8"):
        g = json.loads(line)
        if g.get("match") and g["match"] != "none" and g["inat_id"] in tax:
            ok.add(g["inat_id"])
    return sorted(ok)


def country_pools(cand: list[int]) -> dict[str, np.ndarray]:
    """
    País → índices (en `cand`) de las especies presentes allí. La misma
    presencia que la tabla `country` del catálogo (`zarpa_data.presence`), que
    es de donde la app saca sus candidatos.
    """
    from collections import defaultdict

    from zarpa_data.presence import species_countries

    pos = {sid: i for i, sid in enumerate(cand)}
    per_cc: dict[str, set[int]] = defaultdict(set)
    for sid, countries in species_countries().items():
        if sid in pos:
            for cc, n in countries.items():
                if n >= COUNTRY_MIN_OBS:
                    per_cc[cc].add(pos[sid])
    return {cc: np.array(sorted(ids)) for cc, ids in per_cc.items() if len(ids) >= MIN_COUNTRY_CANDIDATES}


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


def rank_codes(cand: list[int], tax: dict[int, dict]) -> dict[str, np.ndarray]:
    """Código entero del taxón de cada candidato en cada nivel (-1 si falta)."""
    codes = {}
    for r in RANKS:
        names: dict[str, int] = {}
        arr = np.full(len(cand), -1, dtype=np.int64)
        for i, sid in enumerate(cand):
            n = tax[sid]["species"] if r == "species" else tax[sid].get(r)
            if n:
                arr[i] = names.setdefault(n, len(names))
        codes[r] = arr
    return codes


def verdicts(probs: np.ndarray, pool: np.ndarray, codes: dict[str, np.ndarray], thresholds: dict[str, float]):
    """
    Misma regla que `app/src/ai/decision.ts`: se suma la probabilidad por
    taxón en cada nivel siguiendo al mejor hijo; un nivel se afirma solo si
    lo superior ya se afirmó y supera su umbral; la especie, solo si el género
    es seguro. `probs` va alineado con `pool` (índices del catálogo).
    """
    alive = np.ones(len(pool), dtype=bool)
    level, certain = None, True
    ladder = {}
    for r in RANKS[:-1]:
        c = codes[r][pool]
        m = alive & (c >= 0)
        if not m.any():
            break
        sums = np.bincount(c[m], weights=probs[m])
        best = int(sums.argmax())
        ladder[r] = (best, float(sums[best]))
        if certain and sums[best] >= thresholds[r]:
            level = r
        else:
            certain = False
        alive &= c == best
    if alive.any():
        j = np.flatnonzero(alive)[int(probs[alive].argmax())]
        ladder["species"] = (int(codes["species"][pool[j]]), float(probs[j]))
        if certain and level == "genus" and probs[j] >= thresholds["species"]:
            level = "species"
    return level, ladder


def calibrate_temperature(logits: list[np.ndarray], truth: list[int]) -> float:
    pairs = [(l, t) for l, t in zip(logits, truth) if t >= 0]
    best_t, best_nll = 1.0, math.inf
    for t in np.exp(np.linspace(math.log(0.2), math.log(5.0), 60)):
        nll = 0.0
        for l, k in pairs:
            z = l / t
            z = z - z.max()
            nll -= z[k] - math.log(np.exp(z).sum())
        nll /= max(1, len(pairs))
        if nll < best_nll:
            best_t, best_nll = float(t), float(nll)
    return best_t


def wilson_lower(hits: int, n: int, z: float = WILSON_Z) -> float:
    """Cota inferior de Wilson de una proporción (`hits` aciertos de `n`)."""
    if n == 0:
        return 0.0
    p = hits / n
    centre = p + z * z / (2 * n)
    margin = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return (centre - margin) / (1 + z * z / n)


def thresholds_for_precision(rows: list[dict], rank: str) -> float:
    """
    Umbral mínimo de probabilidad acumulada en `rank` con el que lo afirmado
    acierta ≥95 % con confianza (cota de Wilson); `NEVER` si no hay ninguno.
    """
    pairs = sorted(((r["ladder"][rank][1], r["ladder"][rank][0] == r["truth"][rank]) for r in rows if rank in r["ladder"]), reverse=True)
    best = NEVER
    hits = 0
    for k, (p, ok) in enumerate(pairs, 1):
        hits += ok
        if wilson_lower(hits, k) >= TARGET_PRECISION:
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
    cand = catalog(tax)
    pos = {sid: i for i, sid in enumerate(cand)}
    pools = country_pools(cand)
    everything = np.arange(len(cand))
    codes = rank_codes(cand, tax)
    manifest = json.loads((BENCH / "manifest.json").read_text(encoding="utf-8"))
    manifest = [m for m in manifest if m["inat_id"] in pos and m["test"]]

    test_paths, test_truth, test_pool, test_group = [], [], [], []
    for m in manifest:
        for o in m["test"]:
            test_paths.append(BENCH / o["file"])
            test_truth.append(pos[m["inat_id"]])
            test_pool.append(pools.get(o.get("cc") or "", everything))
            test_group.append(m.get("iconic") or "?")
    img = torch.from_numpy(embed_images(model, preprocess, test_paths, device).numpy()).to(device)
    truth = np.array(test_truth)
    in_pool = np.array([t in set(p.tolist()) for t, p in zip(test_truth, test_pool)])

    report = {
        "model": name,
        "catalog": len(cand),
        "countries_with_pool": len(pools),
        "test_images": len(test_paths),
        "species": len(manifest),
        "truth_in_country_pool": float(in_pool.mean()),
        "variants": {},
    }
    texts: dict[str, torch.Tensor] = {}
    # Variantes: cada estilo de texto completo y, para el primero, el índice
    # comprimido por SVD (menos dimensiones = índice más pequeño en el móvil).
    variants = [(st, None) for st in styles] + [(styles[0], k) for k in SVD_DIMS]
    for style, svd in variants:
        if style not in texts:
            texts[style] = embed_texts(model, tokenizer, [prompt(tax[s], style) for s in cand], device).to(device)
        text, img_v = texts[style], img
        if svd:
            basis = svd_basis(text, svd)
            text = torch.nn.functional.normalize(text @ basis, dim=-1)
            img_v = torch.nn.functional.normalize(img @ basis, dim=-1)
        key = f"{style}/text" if not svd else f"{style}/svd{svd}"
        # Logits contra todo el catálogo por lotes; de cada foto se guardan solo
        # los de sus candidatos.
        logits = []
        for i in range(0, len(test_pool), 128):
            full = ((img_v[i : i + 128] @ text.T) * logit_scale).float().cpu().numpy()
            logits += [full[k][test_pool[i + k]] for k in range(full.shape[0])]
        local_truth = [int(np.flatnonzero(p == t)[0]) if t in set(p.tolist()) else -1 for t, p in zip(test_truth, test_pool)]
        top1 = float(np.mean([lt >= 0 and int(l.argmax()) == lt for l, lt in zip(logits, local_truth)]))
        top5 = float(np.mean([lt >= 0 and lt in np.argsort(-l)[:5] for l, lt in zip(logits, local_truth)]))

        # Validación cruzada en dos mitades por especie (no por foto): la misma
        # especie nunca está a la vez en calibración y en medida.
        species_ids = sorted(set(test_truth))
        rng = random.Random(11)
        rng.shuffle(species_ids)
        half = set(species_ids[: len(species_ids) // 2])
        fold_a = [i for i, t in enumerate(test_truth) if t in half]
        fold_b = [i for i, t in enumerate(test_truth) if t not in half]
        per_fold = []
        for fit, held in ((fold_a, fold_b), (fold_b, fold_a)):
            temp = calibrate_temperature([logits[i] for i in fit], [local_truth[i] for i in fit])
            rows_fit = _rows([logits[i] for i in fit], [test_pool[i] for i in fit], [truth[i] for i in fit], temp, codes, {r: 0.0 for r in RANKS})
            thr = {r: thresholds_for_precision(rows_fit, r) for r in RANKS}
            rows_held = _rows([logits[i] for i in held], [test_pool[i] for i in held], [truth[i] for i in held], temp, codes, thr)
            # Por grupo y fuera de muestra: el 95 % es una media y no se cumple
            # igual en todos (el banco tiene pocas fotos de peces, moluscos…
            # para calibrarlos por separado: se probó y fuera de muestra no mejoraba).
            held_by_group = {}
            for g in sorted({test_group[i] for i in held}):
                idx = [k for k, i in enumerate(held) if test_group[i] == g]
                held_by_group[g] = {"images": len(idx), **_summary([rows_held[k] for k in idx])}
            per_fold.append({"temperature": temp, "thresholds": thr, "held": _summary(rows_held), "held_by_group": held_by_group})
        temp_all = calibrate_temperature(logits, local_truth)
        rows_all = _rows(logits, test_pool, truth, temp_all, codes, {r: 0.0 for r in RANKS})
        thr_all = {r: thresholds_for_precision(rows_all, r) for r in RANKS}
        rows_final = _rows(logits, test_pool, truth, temp_all, codes, thr_all)
        # Respuestas por foto (sin umbrales): para estudiar otros criterios sin GPU.
        (BENCH / f"rows-{name}-{key.replace('/', '-')}.json").write_text(
            json.dumps({"temperature": temp_all, "fold_a": fold_a, "rows": rows_all}), encoding="utf-8"
        )
        by_group = {}
        for g in sorted(set(test_group)):
            idx = [i for i, x in enumerate(test_group) if x == g]
            by_group[g] = {"images": len(idx), **_summary([rows_final[i] for i in idx])}
        report["variants"][key] = {
            "top1": top1,
            "top5": top5,
            "temperature": temp_all,
            "thresholds": thr_all,
            "cross_validated": per_fold,
            "by_group": by_group,
        }
        print(
            f"[eval] {name} {key}: top1={top1:.3f} top5={top5:.3f} · especie afirmada en held-out "
            f"{[f['held']['answered']['species'] for f in per_fold]} con precisión "
            f"{[f['held']['precision']['species'] for f in per_fold]}",
            flush=True,
        )
    out = BENCH / f"report-{name}.json"
    out.write_text(json.dumps(report, indent=1, ensure_ascii=False), encoding="utf-8")
    return report


def _rows(logits, pools, truth, temp, codes, thr):
    rows = []
    for l, pool, t in zip(logits, pools, truth):
        z = l / temp
        z = z - z.max()
        p = np.exp(z)
        p /= p.sum()
        level, ladder = verdicts(p, pool, codes, thr)
        rows.append({"level": level, "ladder": ladder, "truth": {r: int(codes[r][t]) for r in RANKS}})
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
