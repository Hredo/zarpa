"""
Exporta el codificador de imagen de BioCLIP a ExecuTorch (`.pte`) para el móvil.

Igual que el DINOv2 del TFG (tools/export_dinov2.py de TFG-2026), dentro del
grafo van la normalización de CLIP y la L2 final: React Native ExecuTorch solo
entrega los píxeles divididos entre 255 (ver `src/ai/engine.ts`), así que el
modelo y el índice de especies quedan como la misma función a los dos lados.

Cuantización: int8 dinámica por canal en las capas lineales (XNNPACK). En un ViT
casi todos los pesos están en las lineales: el fichero baja a ~¼ y el CPU del
móvil va más rápido. La pérdida se mide aquí mismo (coseno entre la salida fp32
de PyTorch y la cuantizada sobre fotos reales del banco) y se escribe junto al
.pte; si baja de 0,98 de media, se avisa.

Entorno: ~/.et14 (executorch==1.4.1, el runtime que trae react-native-executorch
0.10.4; los .pte no tienen compatibilidad hacia delante). En Windows hace falta
`flatc` (FLATC_EXECUTABLE), como documentó el TFG.

Uso:
  FLATC_EXECUTABLE=~/.etorch/Scripts/flatc.exe \
  ~/.et14/Scripts/python -m zarpa_models.export_pte --model bioclip --quant int8
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parent.parent
HUB = {"bioclip": "hf-hub:imageomics/bioclip", "bioclip-2": "hf-hub:imageomics/bioclip-2"}
MEAN = (0.48145466, 0.4578275, 0.40821073)
STD = (0.26862954, 0.26130258, 0.27577711)


class Encoder(torch.nn.Module):
    """Píxeles en [0, 1] → vector L2. Normalización de CLIP incluida."""

    def __init__(self, visual: torch.nn.Module):
        super().__init__()
        self.visual = visual
        self.register_buffer("mean", torch.tensor(MEAN).view(1, 3, 1, 1))
        self.register_buffer("std", torch.tensor(STD).view(1, 3, 1, 1))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = (x - self.mean) / self.std
        e = self.visual(x)
        return torch.nn.functional.normalize(e, dim=-1)


def load(name: str) -> tuple[Encoder, int]:
    import open_clip

    model, _, preprocess = open_clip.create_model_and_transforms(HUB[name])
    model.eval()
    size = model.visual.image_size if isinstance(model.visual.image_size, int) else model.visual.image_size[0]
    return Encoder(model.visual).eval(), int(size)


def sample_inputs(size: int, n: int = 24) -> list[torch.Tensor]:
    """Fotos del banco de pruebas, redimensionadas como lo hará el móvil (estirar)."""
    from PIL import Image

    bench = ROOT / "cache" / "bench"
    files = sorted(bench.glob("*/*.jpg"))[:n]
    out = []
    for f in files:
        im = Image.open(f).convert("RGB")
        side = min(im.size)
        left, top = (im.width - side) // 2, (im.height - side) // 2
        im = im.crop((left, top, left + side, top + side)).resize((size, size), Image.BILINEAR)
        t = torch.from_numpy(__import__("numpy").asarray(im).copy()).permute(2, 0, 1).float().unsqueeze(0) / 255.0
        out.append(t)
    if not out:
        out = [torch.rand(1, 3, size, size) for _ in range(4)]
    return out


def export(name: str, quant: str, out_dir: Path) -> Path:
    import os

    # El python de ~/.et14 (entorno de uv) define PYTHONHOME. Si lo hereda el
    # flatc de otro entorno (un lanzador de Python), ese intérprete carga una
    # biblioteca estándar ajena y falla con «SRE module mismatch».
    for var in ("PYTHONHOME", "UV_INTERNAL__PYTHONHOME"):
        os.environ.pop(var, None)

    from executorch.backends.xnnpack.partition.xnnpack_partitioner import XnnpackPartitioner
    from executorch.exir import to_edge_transform_and_lower

    encoder, size = load(name)
    example = (torch.rand(1, 3, size, size),)
    samples = sample_inputs(size)
    with torch.no_grad():
        reference = [encoder(x) for x in samples]

    module = encoder
    if quant == "int8":
        from executorch.backends.xnnpack.quantizer.xnnpack_quantizer import (
            XNNPACKQuantizer,
            get_symmetric_quantization_config,
        )
        from torchao.quantization.pt2e.quantize_pt2e import convert_pt2e, prepare_pt2e

        graph = torch.export.export(encoder, example).module()
        quantizer = XNNPACKQuantizer().set_global(get_symmetric_quantization_config(is_per_channel=True, is_dynamic=True))
        graph = prepare_pt2e(graph, quantizer)
        with torch.no_grad():
            for x in samples[:8]:
                graph(x)
        module = convert_pt2e(graph)

    with torch.no_grad():
        cos = [float(torch.nn.functional.cosine_similarity(module(x), r).item()) for x, r in zip(samples, reference)]
    fidelity = {"mean_cosine": sum(cos) / len(cos), "min_cosine": min(cos), "images": len(cos)}
    print(f"[export] {name} {quant}: coseno medio {fidelity['mean_cosine']:.4f}, mínimo {fidelity['min_cosine']:.4f}")
    if fidelity["mean_cosine"] < 0.98:
        print("[export] AVISO: la cuantización se aleja demasiado del modelo original")

    program = torch.export.export(module, example)
    edge = to_edge_transform_and_lower(program, partitioner=[XnnpackPartitioner()])
    et = edge.to_executorch()
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{name}_image_xnnpack_{quant}.pte"
    path.write_bytes(et.buffer)
    meta = {
        "model": name,
        "hub": HUB[name],
        "quant": quant,
        "input": [1, 3, size, size],
        "normalization": "CLIP mean/std dentro del grafo; entrada en [0,1]",
        "fidelity_vs_fp32": fidelity,
        "bytes": path.stat().st_size,
        "executorch": __import__("importlib").metadata.version("executorch"),
    }
    (out_dir / f"{path.stem}.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    print(f"[export] {path} ({path.stat().st_size / 1e6:.1f} MB)")
    return path


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="bioclip", choices=list(HUB))
    ap.add_argument("--quant", default="int8", choices=["fp32", "int8"])
    args = ap.parse_args()
    export(args.model, args.quant, ROOT / "models" / args.model)
