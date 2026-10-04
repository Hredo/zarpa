"""
Etapa 7 · Medio (marino, salobre, agua dulce, terrestre) desde WoRMS.

El Registro Mundial de Especies Marinas (WoRMS, CC BY 4.0) es la autoridad
para saber si una especie vive en el mar. Cada registro trae cuatro marcas
(`isMarine`, `isBrackish`, `isFreshwater`, `isTerrestrial`) mantenidas por sus
editores taxonómicos.

  * Si Wikidata da el identificador de WoRMS (P850), se pide ese registro.
  * Si no, se busca por nombre exacto en peces e invertebrados no terrestres,
    y solo se acepta una coincidencia exacta con el nombre aceptado. Insectos,
    arácnidos, miriápodos y anfibios no son marinos; el medio de aves,
    mamíferos y reptiles ya lo dan AVONET, EltonTraits y ReptTraits (y los
    marinos de esos grupos suelen traer su identificador de WoRMS en Wikidata).

Salida: `out/worms.jsonl`.
"""

from __future__ import annotations

import json

from .. import config
from ..http import fetch_json
from ..incremental import stable_rows
from ..taxonomy import group_of

API = "https://www.marinespecies.org/rest"
BATCH = 50
SKIP_BY_NAME = {"insecto", "aracnido", "miriapodo", "anfibio", "ave", "mamifero", "reptil"}


def _flags(rec: dict) -> dict:
    return {
        "aphia_id": rec.get("valid_AphiaID") or rec.get("AphiaID"),
        "status": rec.get("status"),
        "marine": rec.get("isMarine"),
        "brackish": rec.get("isBrackish"),
        "freshwater": rec.get("isFreshwater"),
        "terrestrial": rec.get("isTerrestrial"),
        "extinct": rec.get("isExtinct"),
    }


def run() -> None:
    universe = stable_rows([json.loads(l) for l in open(config.OUT / "universe.jsonl", encoding="utf-8")])
    wd = {}
    for line in open(config.OUT / "wikidata.jsonl", encoding="utf-8"):
        try:
            w = json.loads(line)
        except json.JSONDecodeError:
            continue
        if w.get("worms_id") and str(w["worms_id"]).isdigit():
            wd[w["inat_id"]] = int(w["worms_id"])
    groups = {}
    for line in open(config.OUT / "taxa.jsonl", encoding="utf-8"):
        try:
            t = json.loads(line)
        except json.JSONDecodeError:
            continue
        groups[t["inat_id"]] = group_of([a["name"] for a in t["ancestors"]])

    by_id = [(u["inat_id"], wd[u["inat_id"]]) for u in universe if u["inat_id"] in wd]
    by_name = [
        (u["inat_id"], u["name"])
        for u in universe
        if u["inat_id"] not in wd and groups.get(u["inat_id"]) and groups[u["inat_id"]] not in SKIP_BY_NAME
    ]
    print(f"[worms] {len(by_id)} por identificador, {len(by_name)} por nombre", flush=True)

    out_path = config.OUT / "worms.jsonl"
    n = 0
    with open(out_path, "w", encoding="utf-8") as fh:
        for i in range(0, len(by_id), BATCH):
            chunk = by_id[i : i + BATCH]
            rec = fetch_json(f"{API}/AphiaRecordsByAphiaIDs", {"aphiaids[]": [a for _, a in chunk]}, allow_404=True)
            records = {r["AphiaID"]: r for r in (rec["data"] or []) if r}
            for inat_id, aphia in chunk:
                r = records.get(aphia)
                if r:
                    fh.write(json.dumps({"inat_id": inat_id, "via": "id", **_flags(r)}) + "\n")
                    n += 1
        for i in range(0, len(by_name), BATCH):
            chunk = by_name[i : i + BATCH]
            rec = fetch_json(
                f"{API}/AphiaRecordsByMatchNames",
                {"scientificnames[]": [nm for _, nm in chunk], "marine_only": "false"},
                allow_404=True,
            )
            results = rec["data"] or []
            for (inat_id, name), matches in zip(chunk, results):
                exact = [
                    m
                    for m in (matches or [])
                    if m
                    and m.get("match_type") == "exact"
                    and m.get("kingdom") == "Animalia"
                    and m.get("status") == "accepted"
                    and m.get("scientificname") == name
                ]
                if len(exact) == 1:
                    fh.write(json.dumps({"inat_id": inat_id, "via": "nombre", **_flags(exact[0])}) + "\n")
                    n += 1
            if (i // BATCH) % 40 == 0:
                print(f"[worms] nombres {i + len(chunk)}/{len(by_name)}", flush=True)
    print(f"[worms] {n} especies con marcas de medio: {out_path}")
