"""
Etapa · Tamaño corporal verificado (masa y longitud) para la comparativa con una persona.

Fuentes (las mismas bases de rasgos revisadas por pares de la etapa `traits`):

  * Aves: masa de AVONET (solo medida, no inferida: `Inference == NO`) y de
    EltonTraits (solo valor a nivel de especie, `SpecLevel == 1`). Si hay las dos y
    una es más de 1,5 veces la otra, NO se pone masa («dato dudoso = dato que no se
    muestra»). Sin longitud: ninguna base trae la longitud total de las aves.
  * Mamíferos: masa de EltonTraits (solo a nivel de especie). Sin longitud.
  * Reptiles: ReptTraits, masa máxima, longitud total máxima (TL) y, si falta,
    longitud hocico-cloaca (SVL; caparazón recto SCL en tortugas).
  * Anfibios: AmphiBIO, masa y tamaño corporal (hocico-cloaca).

`length_src_kind` dice qué longitud es (TL, SVL, SCL) para que la ficha no
presente como «largo total» lo que es hocico-cloaca. Los peces, insectos y demás
invertebrados no tienen base de rasgos con tamaño: quedan sin dato.

Salida: `out/size.jsonl` con `{inat_id, mass_g, length_mm, mass_src, length_src, length_kind}`.
"""

from __future__ import annotations

import csv
import json

from .. import config

T = config.EXTERNAL / "traits"
MAX_RATIO = 1.5


def _f(v) -> float | None:
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return x if x > 0 else None


def _avonet() -> dict[str, float]:
    import openpyxl

    ws = openpyxl.load_workbook(T / "avonet.xlsx", read_only=True)["AVONET1_BirdLife"]
    rows = ws.iter_rows(values_only=True)
    i = {h: k for k, h in enumerate(next(rows))}
    out = {}
    for r in rows:
        m = _f(r[i["Mass"]])
        if r[i["Species1"]] and m and str(r[i["Inference"]]).upper() == "NO":
            out[r[i["Species1"]]] = m
    return out


def _elton(file: str) -> dict[str, float]:
    out = {}
    with open(T / file, encoding="latin-1") as fh:
        for r in csv.DictReader(fh, delimiter="\t"):
            m = _f(r.get("BodyMass-Value"))
            if r.get("Scientific") and m and (r.get("BodyMass-SpecLevel") or "").strip() == "1":
                out[r["Scientific"].strip()] = m
    return out


def _rept() -> dict[str, dict]:
    import openpyxl

    ws = openpyxl.load_workbook(T / "repttraits.xlsx", read_only=True)["Data"]
    rows = ws.iter_rows(values_only=True)
    hdr = next(rows)
    i = {h: k for k, h in enumerate(hdr) if h}
    mass = i["Maximum body mass (g)"]
    tl = i['Maximum total length ("TL", mm)']
    svl = next(k for h, k in i.items() if h.startswith('Maximum length ("SVL"'))
    out = {}
    for r in rows:
        name = r[i["Species"]]
        if not name:
            continue
        rec = {"mass": _f(r[mass])}
        if _f(r[tl]):
            rec["length"], rec["kind"] = _f(r[tl]), "TL"
        elif _f(r[svl]):
            rec["length"] = _f(r[svl])
            rec["kind"] = "SCL" if str(r[i["Order"]]).lower() == "testudines" else "SVL"
        out[name] = rec
    return out


def _amphibio() -> dict[str, dict]:
    out = {}
    with open(T / "AmphiBIO_v1.csv", encoding="utf-8", errors="replace") as fh:
        for r in csv.DictReader(fh):
            n = (r.get("Species") or "").strip()
            if n:
                out[n] = {"mass": _f(r.get("Body_mass_g")), "length": _f(r.get("Body_size_mm")), "kind": "SVL"}
    return out


def run() -> None:
    universe = [json.loads(l) for l in open(config.OUT / "universe.jsonl", encoding="utf-8")]
    gbif_names = {}
    for line in open(config.OUT / "gbif_taxa.jsonl", encoding="utf-8"):
        g = json.loads(line)
        if g.get("gbif_name"):
            gbif_names[g["inat_id"]] = g["gbif_name"]
    avonet, eb, em, rept, amph = _avonet(), _elton("BirdFuncDat.txt"), _elton("MamFuncDat.txt"), _rept(), _amphibio()
    print(f"[size] AVONET {len(avonet)} · Elton aves {len(eb)} · Elton mamíferos {len(em)} · ReptTraits {len(rept)} · AmphiBIO {len(amph)}", flush=True)

    def first(db: dict, names: list[str]):
        for n in names:
            if n in db:
                return db[n]
        return None

    n_mass = n_len = doubtful = 0
    with open(config.OUT / "size.jsonl", "w", encoding="utf-8") as fh:
        for u in universe:
            names = [u["name"]] + ([gbif_names[u["inat_id"]]] if u["inat_id"] in gbif_names else [])
            cls = u.get("iconic")
            rec: dict = {}
            if cls == "Aves":
                a, e = first(avonet, names), first(eb, names)
                if a and e:
                    if max(a, e) / min(a, e) <= MAX_RATIO:
                        rec = {"mass_g": round(a, 2), "mass_src": "avonet,eltontraits"}
                    else:
                        doubtful += 1
                elif a:
                    rec = {"mass_g": round(a, 2), "mass_src": "avonet"}
                elif e:
                    rec = {"mass_g": round(e, 2), "mass_src": "eltontraits"}
            elif cls == "Mammalia":
                e = first(em, names)
                if e:
                    rec = {"mass_g": round(e, 2), "mass_src": "eltontraits"}
            elif cls in ("Reptilia", "Amphibia"):
                db, src = (rept, "repttraits") if cls == "Reptilia" else (amph, "amphibio")
                d = first(db, names)
                if d:
                    if d.get("mass"):
                        rec["mass_g"], rec["mass_src"] = d["mass"], src
                    if d.get("length"):
                        rec["length_mm"], rec["length_src"], rec["length_kind"] = d["length"], src, d["kind"]
            if rec:
                n_mass += "mass_g" in rec
                n_len += "length_mm" in rec
                rec["inat_id"] = u["inat_id"]
                fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
    print(f"[size] masa: {n_mass} · longitud: {n_len} · aves con masas discrepantes (omitidas): {doubtful}")
