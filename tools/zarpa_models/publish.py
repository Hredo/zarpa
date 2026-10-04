"""
Mete el modelo de especies en la app: copia el codificador (.pte) y el índice
a `app/assets/models/` y genera `app/src/ai/modelAsset.ts` con los umbrales
calibrados en `evaluate.py`.

Sin informe de evaluación no hay umbrales medidos, y sin umbrales medidos la
app no debe afirmar especies: en ese caso no se publica nada y el visor sigue
en modo «sin IA de especies».

Uso: python -m zarpa_models.publish --model bioclip --quant int8
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil

from zarpa_data import config

ROOT = config.ROOT
APP = ROOT.parent / "app"
STYLE = "taxo+common"


def run(name: str, quant: str) -> None:
    pte = ROOT / "models" / name / f"{name}_image_xnnpack_{quant}.pte"
    index = ROOT / "models" / name / "species_index.bin"
    report_path = ROOT / "cache" / "bench" / f"report-{name}.json"
    for f in (pte, index, report_path):
        if not f.exists():
            raise SystemExit(f"Falta {f}: no se publica un modelo sin calibrar")
    report = json.loads(report_path.read_text(encoding="utf-8"))
    # La variante que eligió build_index (completa o comprimida por SVD).
    index_meta = json.loads((index.with_suffix(".json")).read_text(encoding="utf-8"))
    variant = report["variants"][index_meta.get("variant") or f"{STYLE}/text"]
    # Un nivel cuyo umbral bajó del 95 % en la mitad de la validación cruzada
    # que no se usó para fijarlo no ha demostrado aguantar con especies nuevas:
    # se queda con el más exigente de los calculados («nunca» si alguno lo es).
    thresholds = {}
    for rank, thr in variant["thresholds"].items():
        folds = variant["cross_validated"]
        failed = any(f["held"]["answered"][rank] > 0 and f["held"]["precision"][rank] < 0.95 for f in folds)
        safe = max([float(thr)] + [float(f["thresholds"][rank]) for f in folds]) if failed else float(thr)
        if failed:
            print(f"[publish] {rank}: bajó del 95 % en la validación cruzada; umbral {float(thr):.3f} → {safe:.3f}", flush=True)
        thresholds[rank] = round(safe, 4)
    meta = json.loads((pte.with_suffix(".json")).read_text(encoding="utf-8"))

    dest = APP / "assets" / "models"
    dest.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(pte, dest / f"{name}_{quant}.pte")
    shutil.copyfile(index, dest / "species_index.bin")
    digest = hashlib.sha256(pte.read_bytes() + index.read_bytes()).hexdigest()[:10]

    # Razas (opcional): retratos medios y umbral calibrado en breed_index.py.
    breeds_ts = "export const BUNDLED_BREEDS: BreedModel | null = null;\n"
    breed_index = ROOT / "models" / name / "breed_index.bin"
    breed_report = ROOT / "cache" / "bench" / f"report-breeds-{name}.json"
    if breed_index.exists() and breed_report.exists():
        br = json.loads(breed_report.read_text(encoding="utf-8"))
        # El umbral más exigente entre el global y los de cada mitad de la
        # validación cruzada: con pocas fotos por encima del umbral, una mitad
        # puede quedarse por debajo del 95 % (pasó: 83 %).
        safe = max([float(br["threshold"])] + [float(f["threshold"]) for f in br["cross_validated"]])
    else:
        safe = None
    stale = dest / "breed_index.bin"
    if safe is None or safe >= 1.0:
        # Sin umbral alcanzable la IA nunca afirmaría una raza: no se empaqueta.
        stale.unlink(missing_ok=True)
        why = "sin índice de razas" if safe is None else "ningún umbral llega al 95 % con confianza"
        print(f"[publish] razas: {why}; la app no sugiere raza por IA", flush=True)
    else:
        shutil.copyfile(breed_index, dest / "breed_index.bin")
        breeds_ts = (
            f"// Razas: {br['breeds']} razas de perro y gato, umbral calibrado sobre {br['test_photos']} fotos.\n"
            "const BREED_INDEX: number = require('../../assets/models/breed_index.bin');\n\n"
            "export const BUNDLED_BREEDS: BreedModel | null = {\n"
            "  index: { kind: 'asset', module: BREED_INDEX },\n"
            f"  threshold: {round(safe, 4)},\n"
            "};\n"
        )

    ts = f"""// Generado por tools/zarpa_models/publish.py. No editar a mano.
// Modelo: {report['model']} ({quant}), índice de {index_meta['species']} especies ({index_meta['variant']}).
// Umbrales calibrados para acertar al menos el 95 % (cota de Wilson, validación cruzada por
// especies) sobre {report['test_images']} fotos verificadas de {report['species']} especies que el modelo no vio al entrenar.
import type {{ BreedModel, SpeciesModel }} from './config';

// Como en catalogAsset.ts: los `require` de recursos, en constantes de primer nivel.
const ENCODER: number = require('../../assets/models/{name}_{quant}.pte');
const INDEX: number = require('../../assets/models/species_index.bin');

export const BUNDLED_MODEL: SpeciesModel | null = {{
  id: '{name}-{quant}-{digest}',
  encoder: {{ kind: 'asset', module: ENCODER }},
  index: {{ kind: 'asset', module: INDEX }},
  thresholds: {json.dumps(thresholds)},
  inputSize: {meta['input'][-1]},
}};

{breeds_ts}"""
    (APP / "src" / "ai" / "modelAsset.ts").write_text(ts, encoding="utf-8", newline="\n")
    print(f"[publish] {name}-{quant}-{digest} → app/assets/models, umbrales {thresholds}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="bioclip")
    ap.add_argument("--quant", default="int8")
    args = ap.parse_args()
    run(args.model, args.quant)
