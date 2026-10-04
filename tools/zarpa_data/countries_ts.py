"""
Genera `app/src/lib/countries.ts`: código ISO, nombre en español (CLDR, vía
Babel) y región de GBIF de cada país que aparece en la presencia por país.

Hermes no implementa `Intl.DisplayNames`, así que los nombres no se pueden
pedir al sistema en tiempo de ejecución: viajan en la app.
"""

from __future__ import annotations

import json

from babel import Locale

from . import config
from .http import fetch_json

REGION_ES = {
    "AFRICA": "África",
    "ANTARCTICA": "Antártida",
    "ASIA": "Asia",
    "EUROPE": "Europa",
    "LATIN_AMERICA": "Latinoamérica y Caribe",
    "NORTH_AMERICA": "Norteamérica",
    "OCEANIA": "Oceanía",
}


def main() -> None:
    es = Locale("es", "ES")
    rec = fetch_json("https://api.gbif.org/v1/enumeration/country")
    rows = []
    for c in rec["data"]:
        iso = c.get("iso2")
        if not iso:
            continue
        name = es.territories.get(iso) or c.get("title")
        rows.append((iso, name, c.get("gbifRegion") or ""))
    rows.sort(key=lambda r: r[1])
    lines = [
        "// Generado por tools/zarpa_data/countries_ts.py (CLDR + regiones de GBIF). No editar a mano.",
        "export type Region = " + " | ".join(f"'{k}'" for k in REGION_ES) + ";",
        "",
        "export const REGION_LABEL: Record<Region, string> = " + json.dumps(REGION_ES, ensure_ascii=False, indent=2) + ";",
        "",
        "export const COUNTRIES: { cc: string; name: string; region: Region | null }[] = [",
    ]
    for iso, name, region in rows:
        lines.append(f"  {{ cc: '{iso}', name: {json.dumps(name, ensure_ascii=False)}, region: {json.dumps(region) if region else 'null'} }},")
    lines += [
        "];",
        "",
        "export const COUNTRY_NAME: Record<string, string> = Object.fromEntries(COUNTRIES.map((c) => [c.cc, c.name]));",
        "",
    ]
    out = config.ROOT.parent / "app" / "src" / "lib" / "countries.ts"
    out.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(f"{len(rows)} países -> {out}")


if __name__ == "__main__":
    main()
