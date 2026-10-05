"""
Punto de entrada: `uv run python -m zarpa_data <etapa> [<etapa> …]`.

Las etapas se ejecutan en el orden dado. Cada una lee lo que dejaron las
anteriores en `out/` y es reanudable gracias a la caché HTTP.
"""

from __future__ import annotations

import importlib
import sys

STAGES = [
    "universe",
    "taxa",
    "wikidata",
    "gbif",
    "countries",
    "split",
    "commons",
    "wikipedia",
    "worms",
    "traits",
    "breeds",
    "urban",
    "depth",
    "size",
    "inat_names",
    "gbif_names",
    "photos",
    "wiki_images",
    "gbif_media",
    "obs_photos",
    "rank_names",
    "build",
    "hosting",
]


def main(argv: list[str]) -> int:
    if not argv or argv[0] in {"-h", "--help"}:
        print(__doc__)
        print("Etapas:", ", ".join(STAGES))
        return 0
    for name in argv:
        if name not in STAGES:
            print(f"Etapa desconocida: {name}", file=sys.stderr)
            return 2
        module = importlib.import_module(f"zarpa_data.stages.{name}")
        module.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
