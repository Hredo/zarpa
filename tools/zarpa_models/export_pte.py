"""
Exporta el codificador de imagen de BioCLIP a ExecuTorch (`.pte`) para el móvil.

Igual que el DINOv2 del TFG (tools/export_dinov2.py de TFG-2026), dentro del
grafo van la normalización de CLIP y la L2 final: React Native ExecuTorch solo
entrega los píxeles divididos entre 255 (ver `src/ai/engine.ts`), así que el
modelo y el índice de especies quedan como la misma función a los dos lados.

La normalización (x − media) / desviación NO va como resta y división: se pliega
en los pesos y el sesgo de la primera convolución (la de los parches, sin
relleno: es exactamente la misma función). Con la resta y la división delante de
la convolución cuantizada, XNNPACK no sabía propagar las formas y el móvil
fallaba en cada inferencia («Propagating input shapes failed:
xnn_status_invalid_parameter», `forward` → Error::Internal).

Cuantización: int8 dinámica por canal en las capas lineales (XNNPACK). En un ViT
casi todos los pesos están en las lineales: el fichero baja a ~¼ y el CPU del
móvil va más rápido. La pérdida se mide aquí mismo (coseno entre la salida fp32
de PyTorch y la cuantizada sobre fotos reales del banco) y se escribe junto al
.pte; si baja de 0,98 de media, se avisa.

Después se EJECUTA el .pte con el runtime de ExecuTorch y se compara con PyTorch:
un .pte que no corre no se da por bueno. El runtime de Python (una DLL sin firmar)
lo bloquea el Control de aplicaciones de Windows, así que esa comprobación pide
Linux o WSL; en Windows se avisa y el .pte queda sin verificar.

Entorno: executorch==1.4.1 (el runtime que trae react-native-executorch 0.10.4;
los .pte no tienen compatibilidad hacia delante), torch 2.14 y open_clip_torch.

Uso (WSL o Linux, recomendado):
  python -m zarpa_models.export_pte --model bioclip --quant int8
En Windows (~/.et14, sin verificación) hace falta `flatc`, como documentó el TFG:
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
    """Píxeles en [0, 1] → vector L2. La normalización de CLIP va plegada en `visual` (ver `fold_normalization`)."""

    def __init__(self, visual: torch.nn.Module):
        super().__init__()
        self.visual = visual

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        e = self.visual(x)
        return torch.nn.functional.normalize(e, dim=-1)


class Reference(torch.nn.Module):
    """El modelo original, con la normalización como resta y división: la referencia fp32."""

    def __init__(self, visual: torch.nn.Module):
        super().__init__()
        self.visual = visual
        self.register_buffer("mean", torch.tensor(MEAN).view(1, 3, 1, 1))
        self.register_buffer("std", torch.tensor(STD).view(1, 3, 1, 1))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        e = self.visual((x - self.mean) / self.std)
        return torch.nn.functional.normalize(e, dim=-1)


def fold_normalization(visual: torch.nn.Module) -> torch.nn.Module:
    """
    Copia de `visual` cuya primera convolución recibe píxeles en [0, 1]:
    conv(W, (x − m) / s) = conv(W / s, x) − Σ W·m/s, que es exacto porque la
    convolución de los parches no tiene relleno.
    """
    import copy

    folded = copy.deepcopy(visual)
    conv: torch.nn.Conv2d = folded.conv1
    pad = conv.padding if isinstance(conv.padding, tuple) else (conv.padding,)
    if any(p != 0 for p in pad):
        raise SystemExit("La primera convolución tiene relleno: plegar la normalización no sería exacto")
    mean = torch.tensor(MEAN).view(1, 3, 1, 1)
    std = torch.tensor(STD).view(1, 3, 1, 1)
    with torch.no_grad():
        weight = conv.weight / std
        bias = -(conv.weight * (mean / std)).sum(dim=(1, 2, 3))
        if conv.bias is not None:
            bias = bias + conv.bias
        new = torch.nn.Conv2d(
            conv.in_channels, conv.out_channels, conv.kernel_size, stride=conv.stride, padding=0, bias=True
        )
        new.weight.copy_(weight)
        new.bias.copy_(bias)
    folded.conv1 = new
    return folded.eval()


def load(name: str) -> tuple[Encoder, int, Reference]:
    import open_clip

    model, _, preprocess = open_clip.create_model_and_transforms(HUB[name])
    model.eval()
    size = model.visual.image_size if isinstance(model.visual.image_size, int) else model.visual.image_size[0]
    return Encoder(fold_normalization(model.visual)).eval(), int(size), Reference(model.visual).eval()


def verify_pte(buffer: bytes, samples: list[torch.Tensor], reference: list[torch.Tensor]) -> dict | None:
    """
    Ejecuta el .pte con el runtime de ExecuTorch y lo compara con la referencia
    fp32. Sale con error si no corre; devuelve None si aquí no hay runtime.
    """
    try:
        from executorch.runtime import Runtime
    except (ImportError, OSError) as e:
        print(f"[export] AVISO: no se puede ejecutar el .pte aquí ({e}). Verifícalo en Linux o WSL antes de publicarlo.")
        return None
    # El programa tiene que seguir vivo mientras se usa el método: si Python lo
    # libera, el método lee pesos ya liberados y devuelve basura (o se cierra).
    program = Runtime.get().load_program(buffer)
    method = program.load_method("forward")
    cos = []
    for x, r in zip(samples, reference):
        try:
            # ExecuTorch lee la memoria tal cual: sin `contiguous()` recibiría la foto desordenada.
            out = method.execute([x.contiguous()])[0]
        except RuntimeError as e:
            raise SystemExit(f"[export] El .pte no se ejecuta en ExecuTorch: {e}") from e
        cos.append(float(torch.nn.functional.cosine_similarity(out, r).item()))
    result = {"mean_cosine": sum(cos) / len(cos), "min_cosine": min(cos), "images": len(cos)}
    print(f"[export] .pte ejecutado en ExecuTorch: coseno medio {result['mean_cosine']:.4f}, mínimo {result['min_cosine']:.4f}")
    if result["mean_cosine"] < 0.98:
        raise SystemExit("[export] La salida del .pte se aleja demasiado del modelo original")
    return result


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
        t = torch.from_numpy(__import__("numpy").asarray(im).copy()).permute(2, 0, 1).float().unsqueeze(0).contiguous() / 255.0
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

    encoder, size, original = load(name)
    example = (torch.rand(1, 3, size, size),)
    samples = sample_inputs(size)
    with torch.no_grad():
        reference = [original(x) for x in samples]
        folding = min(float(torch.nn.functional.cosine_similarity(encoder(x), r).item()) for x, r in zip(samples, reference))
    print(f"[export] normalización plegada en la convolución: coseno mínimo con el original {folding:.6f}")
    if folding < 0.9999:
        raise SystemExit("[export] Plegar la normalización cambió el modelo")

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
    # Antes de escribir nada: un .pte que no corre no debe quedar donde lo busca publish.py.
    runtime = verify_pte(et.buffer, samples, reference)
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{name}_image_xnnpack_{quant}.pte"
    path.write_bytes(et.buffer)
    meta = {
        "model": name,
        "hub": HUB[name],
        "quant": quant,
        "input": [1, 3, size, size],
        "normalization": "CLIP mean/std plegada en la primera convolución; entrada en [0,1]",
        "fidelity_vs_fp32": fidelity,
        "executorch_runtime_vs_fp32": runtime,
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
