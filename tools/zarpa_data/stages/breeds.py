"""
Etapa 9 · Razas oficiales de todo el mundo y especies domésticas.

| Autoridad | Animal | Ámbito | Qué aporta |
|---|---|---|---|
| FCI, Nomenclatura de razas (fichas oficiales en español) | perro | mundial | nombre oficial y su traducción oficial al español, grupo, sección, país de origen, reconocimiento (definitivo o provisional) y fecha, variedades, estándar en PDF |
| FIFe, Breeds | gato | mundial | código EMS, nombre oficial, reconocimiento completo o preliminar |
| FAO, DAD-IS (Sistema de Información sobre la Diversidad de los Animales Domésticos) | ganado y aves de corral | 182 países | razas de cada país con su nombre, otros nombres, si es autóctona, local o transfronteriza y su estado de riesgo, en la terminología oficial en español de la FAO |
| MAPA, Catálogo Oficial de Razas de Ganado de España (RD 45/2019) | ganado | España | complemento de las razas autóctonas españolas: lugar de origen y distribución |

DAD-IS es la base de datos mundial de la FAO: la alimentan los coordinadores
nacionales de cada país (en España, el propio MAPA). Se descartan las razas
que DAD-IS da por extinguidas o que solo existen como material crioconservado:
no se pueden ver.

Solo entran razas reconocidas por estas autoridades: una raza que no figura en
sus listas no existe para la app, aunque se hable de ella en otros sitios.

Fotos: solo de Wikimedia Commons con licencia libre, a través del elemento de
Wikidata de la raza. Las ilustraciones de la FCI y las fotos del MAPA y de la
FAO no se usan porque no tienen licencia libre.
  * Perros: Wikidata guarda el número de la FCI (P528 con catálogo Q38603 o Q2150520):
    la coincidencia es exacta.
  * Resto: nombre idéntico (sin tildes ni mayúsculas) dentro de la clase de
    raza de esa especie; si el elemento declara país de origen (P495), tiene
    que coincidir con el de la raza. Con dos candidatos o ninguno, sin foto.

Especies domésticas (`domestic`):
  * 2 = el taxón es el animal doméstico (perro, gato, vaca…).
  * 1 = especie silvestre con forma doméstica (jabalí y cerdo, gallo
    bankiva y gallina…).
Solo se marca una especie si lo prueba una autoridad de razas de esta etapa o
si el resumen de Wikipedia de la propia especie lo dice (la frase se guarda
como nota de procedencia). Ninguna otra especie se marca.

«Granja» (ambiente): especies con razas de ganado registradas en DAD-IS o en
el catálogo del MAPA.

Salidas: `out/breeds.jsonl`, `out/domestic.jsonl`.
"""

from __future__ import annotations

import csv
import html
import io
import json
import re
import unicodedata
from datetime import datetime, timezone

from babel import Locale

from .. import config
from ..http import FetchError, _get_client, _throttle, fetch_json, fetch_text
from .commons import describe

FCI = "https://www.fci.be"
DADIS_EXPORT = "https://us-central1-dadis-ws.cloudfunctions.net/export_livestock_data_csv"
DADIS_HOME = "https://www.fao.org/dad-is/es/"
FIFE = "https://fifeweb.org/cats/breeds/"
MAPA = "https://www.mapa.gob.es/es/ganaderia/temas/zootecnia/razas-ganaderas/razas/catalogo-razas/"
WDQS = "https://query.wikidata.org/sparql"

# Taxones de iNaturalist (comprobados en out/universe.jsonl el 2026-10-04).
DOG, CAT = 47144, 118552
CATTLE, SHEEP, GOAT, PIG = 74113, 121578, 123070, 42134
HORSE, DONKEY, DROMEDARY = 209233, 148030, 81542
CHICKEN, RABBIT = 882, 43151
DUCK, MUSCOVY, TURKEY, GUINEAFOWL, PIGEON = 6930, 7120, 906, 1428, 3017
BUFFALO, BACTRIAN, LLAMA, YAK, GUINEA_PIG = 81925, 524409, 121026, 889089, 119405

# Especies de DAD-IS → taxón de iNaturalist. Solo las que corresponden a un
# único taxón sin duda. Fuera: «Goose (domestic)» (mezcla razas del ánsar común
# y del cisnal), «Quail», «Deer», «Nandu», «Chinchilla», «Polecat», «Fox»
# (varias especies posibles); avestruz, emú, bisonte, gaur, guanaco o vicuña
# (especies silvestres criadas, sin razas domésticas); y «Dog», que lleva la FCI.
DADIS_SPECIES = {
    "Cattle": CATTLE,
    "Sheep": SHEEP,
    "Goat": GOAT,
    "Pig": PIG,
    "Horse": HORSE,
    "Ass": DONKEY,
    "Chicken": CHICKEN,
    "Duck (domestic)": DUCK,
    "Muscovy duck": MUSCOVY,
    "Turkey": TURKEY,
    "Guinea fowl": GUINEAFOWL,
    "Rabbit": RABBIT,
    "Pigeon": PIGEON,
    "Buffalo": BUFFALO,
    "Dromedary": DROMEDARY,
    "Bactrian camel": BACTRIAN,
    "Llama": LLAMA,
    "Yak (domestic)": YAK,
    "Guinea pig": GUINEA_PIG,
}

# Clase de Wikidata de las razas de cada especie (para buscar sus fotos).
WD_BREED_CLASS = {
    DOG: {"Q39367"},
    CAT: {"Q43577"},
    CATTLE: {"Q12045585", "Q21521438"},
    SHEEP: {"Q15622363"},
    GOAT: {"Q15622387"},
    PIG: {"Q18786396"},
    HORSE: {"Q1160573"},
    DONKEY: {"Q61901018"},
    CHICKEN: {"Q15304943"},
    RABBIT: {"Q12045584"},
    DUCK: {"Q110536225"},
    TURKEY: {"Q110529992"},
    BUFFALO: {"Q110532675"},
    PIGEON: {"Q15623573"},
    GUINEA_PIG: {"Q110529959"},
}

MAPA_SPECIES = {
    "Bovino": CATTLE,
    "Ovino": SHEEP,
    "Caprino": GOAT,
    "Porcino": PIG,
    "Equino Caballar": HORSE,
    "Equino Asnal": DONKEY,
}

FREE = {"cc0", "pd", "cc-by", "cc-by-sa"}

# Nombres con los que la FIFe y Wikidata llaman distinto a la misma raza.
FIFE_ALIASES = {
    "Sacred Birman": "Birman",
    "European": "European Shorthair",
    "Exotic": "Exotic Shorthair",
    "Don Sphynx": "Donskoy",
    "Kurilean Bobtail Longhair": "Kurilian Bobtail",
    "Kurilean Bobtail Shorthair": "Kurilian Bobtail",
}

# Candidatos a especie doméstica. Solo se marcan si hay prueba (ver arriba).
DOMESTIC_TAXA = {
    "Canis familiaris": 2,
    "Felis catus": 2,
    "Bos taurus": 2,
    "Ovis aries": 2,
    "Capra hircus": 2,
    "Equus caballus": 2,
    "Equus asinus": 2,
    "Camelus dromedarius": 2,
    "Camelus bactrianus": 2,
    "Lama glama": 2,
    "Vicugna pacos": 2,
    "Bubalus bubalis": 2,
    "Bos grunniens": 2,
    "Bos frontalis": 2,
    "Cavia porcellus": 2,
    "Mustela furo": 2,
    "Streptopelia risoria": 2,
    "Sus scrofa": 1,
    "Gallus gallus": 1,
    "Anser anser": 1,
    "Anser cygnoides": 1,
    "Oryctolagus cuniculus": 1,
    "Columba livia": 1,
    "Meleagris gallopavo": 1,
    "Numida meleagris": 1,
    "Cairina moschata": 1,
    "Anas platyrhynchos": 1,
    "Apis mellifera": 1,
    "Serinus canaria": 1,
    "Melopsittacus undulatus": 1,
    "Carassius auratus": 1,
    "Cyprinus carpio": 1,
    "Coturnix japonica": 1,
    "Rangifer tarandus": 1,
    "Bos javanicus": 1,
    "Chinchilla lanigera": 1,
    "Lonchura striata": 1,
    "Betta splendens": 1,
    "Poecilia reticulata": 1,
}
DOMESTIC_WORD = re.compile(r"\b(dom[eé]stic\w*|domesticad\w*)", re.IGNORECASE)


# --- utilidades ----------------------------------------------------------------

def _norm(s: str | None) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(ch for ch in s if not unicodedata.combining(ch)).lower()
    s = re.sub(r"[^a-z0-9ñ]+", " ", s)
    return " ".join(s.split())


def _lines(page: str) -> list[str]:
    page = re.sub(r"<script.*?</script>|<style.*?</style>|<!--.*?-->", "", page, flags=re.S)
    page = re.sub(r"<[^>]+>", "\n", page)
    page = html.unescape(page).replace("\xa0", " ")
    return [" ".join(l.split()) for l in page.split("\n") if l.strip()]


def _after(lines: list[str], label: str, start: int = 0) -> str | None:
    try:
        i = lines.index(label, start)
    except ValueError:
        return None
    return lines[i + 1] if i + 1 < len(lines) else None


def _countries_es() -> dict[str, str]:
    """Nombre del país en español (CLDR) → código ISO, más las formas de la FCI y el MAPA."""
    es = {_norm(name): code for code, name in Locale("es").territories.items() if len(code) == 2}
    es.update(
        {
            "gran bretana": "GB",
            "inglaterra": "GB",
            "escocia": "GB",
            "gales": "GB",
            "irlanda del norte": "GB",
            "estados unidos de america": "US",
            "republica checa": "CZ",
            "holanda": "NL",
            "corea republica de": "KR",
            "rusia federacion de": "RU",
            "siberia": "RU",
            "norte de rusia": "RU",
            "macedonia": "MK",
        }
    )
    return es


def _ccs(text: str | None, countries_es: dict[str, str]) -> list[str]:
    """
    «ALEMANIA, SUIZA» → ["DE", "CH"]. Países que ya no existen (Checoslovaquia,
    Yugoslavia) y regiones («Medio Oriente», «Tíbet (China)») no se traducen a
    un país actual: la app muestra el texto oficial tal cual.
    """
    out: list[str] = []
    for part in (text or "").split(","):
        cc = countries_es.get(_norm(part))
        found = [cc] if cc else [countries_es.get(_norm(x)) for x in re.split(r"\s+[yY]\s+", part)]
        for c in found:
            if c and c not in out:
                out.append(c)
    return out


# --- FCI ---------------------------------------------------------------------

def _fci_urls() -> list[str]:
    """Fichas en español de todas las razas (grupos 1-10 y provisionales)."""
    index = fetch_text(f"{FCI}/es/nomenclature/")["text"]
    groups = sorted(set(re.findall(r'href="(/es/nomenclature/\d+-[^"]+\.html)"', index)))
    urls = set(re.findall(r'href="(/es/nomenclature/[A-Z0-9][^"]*-\d+\.html)"', index))
    for g in groups:
        page = fetch_text(FCI + g)["text"]
        urls |= set(re.findall(r'href="(/es/nomenclature/[A-Z0-9][^"]*-\d+\.html)"', page))
    by_number = {}
    for u in urls:
        by_number.setdefault(int(re.search(r"-(\d+)\.html$", u).group(1)), u)
    return [by_number[n] for n in sorted(by_number)]


def _date_dmy(dmy: str | None) -> str | None:
    """Fechas de las fichas en español (D/M/AAAA) a ISO."""
    m = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", (dmy or "").strip())
    if not m:
        return None
    day, month, year = (int(x) for x in m.groups())
    return f"{year:04d}-{month:02d}-{day:02d}"


def _fci_breed(path: str, countries_es: dict[str, str]) -> dict | None:
    rec = fetch_text(FCI + path)
    page = rec["text"]
    if not page:
        return None
    lines = _lines(page)
    try:
        g = lines.index("Grupo :")
    except ValueError:
        return None
    number = int(lines[g - 2]) if lines[g - 2].isdigit() else None
    names = {}
    for lang, label in (("en", "English"), ("fr", "Français"), ("de", "Deutsch"), ("es", "Español")):
        v = _after(lines, label, g)
        if v and not re.fullmatch(r"\d{1,2}/\d{1,2}/\d{4}", v):
            names[lang] = v
    definitive = _after(lines, "Fecha de reconocimiento a título definitivo por la FCI", g)
    provisional = _after(lines, "Fecha de reconocimiento a título provisional por la FCI", g)
    country = _after(lines, "País de origen de la raza", g)
    gm = re.match(r"n°\s*(\d+)\s*-\s*(.+)", lines[g + 1])
    varieties = []
    if "Variedades" in lines[g:]:
        i = lines.index("Variedades", g) + 1
        while i < len(lines) and lines[i] not in ("Ilustraciones", "Política de protección de datos"):
            m = re.match(r"^[a-z]\)\s*(.+)", lines[i])
            if m:
                varieties.append(m.group(1))
            i += 1
    standards = {
        lang: f"{FCI}/Nomenclature/Standards/{code}-{lang}.pdf"
        for code, lang in re.findall(r"Standards/(\d+g\d+)-(\w\w)\.pdf", page)
    }
    return {
        "authority": "fci",
        "code": str(number) if number is not None else None,
        "name_official": lines[g - 4],
        "name_es": names.get("es"),
        "name_en": names.get("en"),
        "group": f"Grupo {gm.group(1)}" if gm else None,
        "group_name": gm.group(2) if gm else None,
        "section": _after(lines, "Sección", g),
        "status": "definitivo" if definitive else "provisional" if provisional else None,
        "status_label": _after(lines, "Estatus de la raza", g),
        "accepted": _date_dmy(definitive or provisional),
        "origin_cc": _ccs(country, countries_es),
        "origin_text": country,
        "varieties": varieties,
        "standard_url": standards.get("es") or standards.get("en"),
        "standard_lang": "es" if "es" in standards else "en" if "en" in standards else None,
        "url": FCI + path,
        "retrieved_at": rec["retrieved_at"],
        "species": DOG,
    }


# --- FIFe --------------------------------------------------------------------

def _fife() -> list[dict]:
    rec = fetch_text(FIFE)
    lines = _lines(rec["text"])
    profiles = dict(
        (html.unescape(name).strip(), url)
        for url, name in re.findall(r'href="(https://fifeweb\.org/cats/breeds/[a-z0-9-]+/)"[^>]*>([^<]+)<', rec["text"])
    )
    out = []
    preliminary = False
    seen = set()
    for line in lines:
        if line.startswith("Preliminary Recognised Breeds and Varieties"):
            # La primera aparición es el índice; la lista empieza tras las categorías.
            preliminary = bool(out)
            continue
        m = re.match(r"^([A-Z]{3}) ?[–-] ?(.+)$", line)
        if not m:
            continue
        code, name = m.group(1), m.group(2).strip()
        if code in ("HCL", "HCS") or code in seen:  # «House Cat»: gatos sin raza
            continue
        seen.add(code)
        out.append(
            {
                "authority": "fife",
                "code": code,
                "name_official": name,
                "name_en": name,
                "name_es": None,
                "status": "preliminar" if preliminary else "completo",
                "url": profiles.get(name) or FIFE,
                "retrieved_at": rec["retrieved_at"],
                "species": CAT,
            }
        )
    return out


# --- MAPA --------------------------------------------------------------------

def _tables(page: str) -> list[list[list[str]]]:
    out = []
    for t in re.findall(r'<table[^>]*class="data-table"[^>]*>(.*?)</table>', page, flags=re.S):
        rows = []
        for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", t, flags=re.S):
            cells = [" ".join(html.unescape(re.sub(r"<[^>]+>", " ", c)).split()) for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", tr, flags=re.S)]
            rows.append(cells)
        out.append(rows)
    return out


def _mapa(countries_es: dict[str, str]) -> list[dict]:
    rec = fetch_text(MAPA)
    page = rec["text"]
    out = []
    for block in re.split(r'<h3 class="cbp-nttrigger">', page)[1:]:
        heading = html.unescape(block.split("</h3>", 1)[0]).strip()
        for alt, href, title in re.findall(
            r'<img[^>]*alt="([^"]*)"[^>]*>\s*<a[^>]*href="(/es/ganaderia/temas/zootecnia/razas-ganaderas/razas/catalogo-razas/[^"]+)"\s*title="([^"]*)"',
            block,
        ):
            slug = href.rstrip("/").rsplit("/", 1)[1]
            if heading in MAPA_SPECIES:
                species = MAPA_SPECIES[heading]
            elif heading == "Aviar":
                # Las ocas no entran: ver «Goose (domestic)» en DADIS_SPECIES.
                species = None if ("oca" in slug.split("-") or "antzara" in slug) else CHICKEN
            elif heading == "Otras Especies":
                species = DROMEDARY if slug.startswith("camello") else RABBIT if slug.startswith("conejo") else None
            else:
                species = None
            if species is None:
                print(f"[razas] MAPA sin especie asignable, no entra: {heading} / {slug}")
                continue
            detail = fetch_text("https://www.mapa.gob.es" + href)
            facts: dict[str, str] = {}
            names: list[dict] = []
            for rows in _tables(detail["text"] or ""):
                if not rows:
                    continue
                head = rows[0]
                if head[:1] == ["Nombre de la raza"]:
                    for r in rows[1:]:
                        if r and r[0]:
                            names.append({"name": r[0], "lang": r[1] if len(r) > 1 else None, "meaning": r[2] if len(r) > 2 else None})
                elif head[:1] == ["Clasificación oficial de la raza"] and len(rows) > 1:
                    facts["classification"] = rows[1][0]
                else:
                    for r in rows[1:]:
                        if len(r) == 2 and r[1]:
                            facts[r[0].rstrip(":").strip()] = r[1]
            country = facts.get("País de origen")
            out.append(
                {
                    "authority": "mapa",
                    "code": slug,
                    "name_official": title.strip() or alt.strip(),
                    "name_es": alt.strip() or title.strip(),
                    "names": names,
                    "classification": facts.get("classification"),
                    "origin_place": facts.get("Localización del Origen"),
                    "origin_cc": _ccs(country, countries_es),
                    "origin_text": country,
                    "distribution": facts.get("Comentarios sobre la distribución geográfica"),
                    "url": "https://www.mapa.gob.es" + href,
                    "retrieved_at": detail["retrieved_at"],
                    "species": species,
                    "mapa_group": heading,
                }
            )
    return out


# --- FAO DAD-IS ----------------------------------------------------------------

DADIS_COLUMNS = {
    "country": "País",
    "iso3": "ISO3",
    "id": "Raza/Nombre ID",
    "name": "Raza/Nombre más común",
    "transboundary": "Nombre de la raza transfronteriza",
    "other": "Otro nombre",
    "adapt": "Clasificación de las razas (capacidad de adaptación)",
    "geo": "Clasificación de las razas (geográfica)",
    "risk": "Estado de riesgo local",
    "risk_detail": "Estado de riesgo local detallado",
    "risk_regional": "Riesgo Transfronterizo Regional (detallado)",
    "risk_international": "Riesgo Transfronterizo Internacional (detallado)",
}
GONE = {"Extinta", "Sólo crioconservada"}


def _iso3_to_iso2() -> dict[str, str]:
    rows = fetch_json("https://api.gbif.org/v1/enumeration/country")["data"]
    return {r["iso3"]: r["iso2"] for r in rows if r.get("iso3") and r.get("iso2")}


def _dadis_csv(species: str, iso3: list[str]) -> tuple[list[dict], str]:
    """
    Exportación pública de DAD-IS (la misma que usa el formulario «Data Export ·
    Breeds» de la FAO): la función devuelve la URL de un CSV temporal. El CSV se
    guarda en la caché para no repetir la exportación.
    """
    cache = config.CACHE / "dadis" / f"{re.sub(r'[^a-z]+', '-', species.lower()).strip('-')}.csv"
    stamp = cache.with_suffix(".txt")
    if not cache.exists():
        params = (
            f"typeOfData=metadata&startYear=null&endYear=null&iso3={','.join(iso3)}"
            f"&specie={species}&breed=null&lang=es"
            "&categories=general|breedID|classification|riskAndCryo&fileFormat=CSV"
        )
        client = _get_client()
        for attempt in range(4):
            try:
                _throttle("us-central1-dadis-ws.cloudfunctions.net")
                url = client.get(f"{DADIS_EXPORT}?{params}", headers={"Accept": "*/*"}, timeout=300).text.strip()
                if not url.startswith("https://storage.googleapis.com/"):
                    raise FetchError(f"DAD-IS {species}: respuesta inesperada {url[:120]}")
                data = client.get(url, headers={"Accept": "*/*"}, timeout=300).content.decode("utf-8-sig")
                if not data.strip():
                    raise FetchError(f"DAD-IS {species}: CSV vacío")
                break
            except Exception as exc:  # red o función en frío: reintento
                if attempt == 3:
                    raise
                print(f"[razas] DAD-IS {species}: reintento ({exc})", flush=True)
                import time

                time.sleep(10 * (attempt + 1))
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(data, encoding="utf-8")
        stamp.write_text(datetime.now(timezone.utc).isoformat(timespec="seconds"), encoding="utf-8")
    rows = list(csv.DictReader(io.StringIO(cache.read_text(encoding="utf-8"))))
    return rows, stamp.read_text(encoding="utf-8").strip() if stamp.exists() else ""


def _dadis() -> list[dict]:
    iso3to2 = _iso3_to_iso2()
    iso3 = sorted(iso3to2)
    out: list[dict] = []
    for dadis_name, species in DADIS_SPECIES.items():
        rows, retrieved = _dadis_csv(dadis_name, iso3)
        groups: dict[tuple, dict] = {}
        for r in rows:
            g = {k: (r.get(col) or "").strip() for k, col in DADIS_COLUMNS.items()}
            if not g["name"] or g["risk"] in GONE or g["risk_detail"] in GONE:
                continue
            cc = iso3to2.get(g["iso3"])
            population = {
                "cc": cc,
                "name": g["name"],
                "other": [x.strip() for x in g["other"].split(",") if x.strip()],
                "adapt": g["adapt"] or None,
                "risk": g["risk_detail"] or g["risk"] or None,
            }
            if g["transboundary"]:
                key = ("tb", species, _norm(g["transboundary"]))
                b = groups.get(key)
                if b is None:
                    b = groups[key] = {
                        "authority": "fao",
                        "code": f"tb:{_norm(g['transboundary']).replace(' ', '-')}",
                        "name_official": g["transboundary"],
                        "name_es": g["transboundary"],
                        "geo": g["geo"] or "Transfronteriza",
                        "risk": g["risk_international"] or g["risk_regional"] or None,
                        "populations": [],
                        "url": DADIS_HOME,
                        "retrieved_at": retrieved,
                        "species": species,
                    }
                b["populations"].append(population)
            else:
                key = ("local", species, g["iso3"], _norm(g["name"]))
                if key in groups:
                    continue
                groups[key] = {
                    "authority": "fao",
                    "code": g["id"] or f"{g['iso3']}:{_norm(g['name']).replace(' ', '-')}",
                    "name_official": g["name"],
                    "name_es": g["name"],
                    "other_names": population["other"],
                    "geo": g["geo"] or "Local",
                    "adapt": population["adapt"],
                    "risk": population["risk"],
                    "populations": [population],
                    "url": DADIS_HOME,
                    "retrieved_at": retrieved,
                    "species": species,
                }
        for b in groups.values():
            ccs = []
            for pop in b["populations"]:
                if pop["cc"] and pop["cc"] not in ccs:
                    ccs.append(pop["cc"])
            b["countries"] = ccs
            if b["geo"] == "Local":
                b["origin_cc"] = ccs
        out.extend(groups.values())
        print(f"[razas] DAD-IS {dadis_name}: {len(groups)} razas de {len(rows)} poblaciones nacionales", flush=True)
    return out


def _merge_mapa(fao: list[dict], mapa: list[dict]) -> list[dict]:
    """
    Las razas españolas de DAD-IS las aporta el MAPA, así que suelen estar las
    dos. El catálogo del MAPA añade lugar de origen y distribución: se pegan a la
    raza local española de DAD-IS con el mismo nombre. Una raza autóctona del
    MAPA que no esté en DAD-IS entra por su cuenta; una integrada (de origen
    extranjero) sin pareja no, porque ya está como raza transfronteriza.
    """
    index: dict[tuple[int, str], dict] = {}
    for b in fao:
        if b.get("geo") == "Local" and b.get("countries") == ["ES"]:
            for n in [b["name_official"], *b.get("other_names", [])]:
                index.setdefault((b["species"], _norm(n)), b)
    extra = []
    for m in mapa:
        names = [m["name_es"], m["name_official"], *[n["name"] for n in m.get("names", [])]]
        hit = next((index[(m["species"], _norm(n))] for n in names if (m["species"], _norm(n)) in index), None)
        if hit:
            hit["mapa"] = {
                k: m.get(k)
                for k in ("code", "name_es", "classification", "origin_place", "origin_text", "distribution", "url", "retrieved_at")
            }
            hit["name_es"] = m["name_es"]
        elif "autóctona" in (m.get("classification") or "").lower():
            extra.append(m)
    print(f"[razas] MAPA: {sum(1 for b in fao if b.get('mapa'))} unidas a DAD-IS, {len(extra)} solo en el MAPA", flush=True)
    return extra


# --- Wikidata y Commons ----------------------------------------------------------

def _wd_breeds() -> list[dict]:
    base = """SELECT ?item ?cls ?img ?fci ?cc WHERE {
      ?item wdt:P31 ?cls . ?cls wdt:P279* wd:Q38829 .
      OPTIONAL { ?item wdt:P18 ?img }
      OPTIONAL { ?item p:P528 ?st . ?st ps:P528 ?fci ; pq:P972 ?fcat . FILTER(?fcat IN (wd:Q38603, wd:Q2150520)) }
      OPTIONAL { ?item wdt:P495/wdt:P297 ?cc }
      FILTER NOT EXISTS { ?item wdt:P225 [] }
    }"""
    labels = """SELECT ?item ?l ?alt WHERE {
      ?item wdt:P31/wdt:P279* wd:Q38829 .
      { ?item rdfs:label ?l FILTER(LANG(?l) IN ("es","en","fr","de","it","pt","nl")) }
      UNION { ?item skos:altLabel ?alt FILTER(LANG(?alt) IN ("es","en")) }
    }"""
    items: dict[str, dict] = {}
    for b in fetch_json(WDQS, {"query": base, "format": "json"})["data"]["results"]["bindings"]:
        qid = b["item"]["value"].rsplit("/", 1)[1]
        it = items.setdefault(qid, {"qid": qid, "classes": set(), "es": None, "names": set(), "img": None, "fci": set(), "cc": set()})
        it["classes"].add(b["cls"]["value"].rsplit("/", 1)[1])
        if "img" in b and not it["img"]:
            it["img"] = b["img"]["value"].rsplit("/", 1)[1]
        if "fci" in b:
            it["fci"].add(b["fci"]["value"].strip())
        if "cc" in b:
            it["cc"].add(b["cc"]["value"])
    for b in fetch_json(WDQS, {"query": labels, "format": "json"})["data"]["results"]["bindings"]:
        it = items.get(b["item"]["value"].rsplit("/", 1)[1])
        if not it:
            continue
        for k in ("l", "alt"):
            if k in b:
                it["names"].add(_norm(b[k]["value"]))
                if k == "l" and b[k].get("xml:lang") == "es" and not it["es"]:
                    it["es"] = b[k]["value"]
    return list(items.values())


def _match(breeds: list[dict], wd: list[dict]) -> None:
    by_fci: dict[str, list[dict]] = {}
    for it in wd:
        for code in it["fci"]:
            by_fci.setdefault(code, []).append(it)
    pools: dict[int, list[dict]] = {}
    for species, classes in WD_BREED_CLASS.items():
        pools[species] = [it for it in wd if it["classes"] & classes]

    def by_name(species: int, countries: list[str], *names: str | None) -> dict | None:
        pool = pools.get(species, [])
        for name in names:
            if not name:
                continue
            key = _norm(name)
            hits = [it for it in pool if key in it["names"]]
            if countries:
                hits = [it for it in hits if not it["cc"] or it["cc"] & set(countries)]
            if len(hits) == 1:
                return hits[0]
        return None

    for b in breeds:
        it = None
        if b["authority"] == "fci" and b.get("code"):
            hits = by_fci.get(b["code"], [])
            it = hits[0] if len(hits) == 1 else None
        elif b["authority"] == "fife":
            base = re.sub(r"\s+(Longhair|Shorthair)$", "", b["name_en"])
            alias = FIFE_ALIASES.get(b["name_en"])
            it = by_name(CAT, [], b["name_en"], alias, f"{b['name_en']} cat", base if base != b["name_en"] else None)
        elif b["authority"] in ("mapa", "fao"):
            names = [b["name_es"], b["name_official"], *b.get("other_names", [])]
            stripped = re.sub(r"^(gallina|galiña|cabra|oveja|vaca|cerdo|caballo|asno|burro|conejo|raza)\s+", "", b["name_es"], flags=re.I)
            countries = b.get("countries") if b.get("geo") == "Local" else (b.get("origin_cc") or [])
            it = by_name(b["species"], countries or [], *names, stripped)
        if it:
            b["wd"] = it["qid"]
            b["wd_label_es"] = it["es"]
            b["img_file"] = it["img"]


# --- especies domésticas -------------------------------------------------------------

def _wiki_intro(name: str) -> dict | None:
    """Introducción del artículo de Wikipedia (es, si no en) al que redirige el binomio."""
    for lang in ("es", "en"):
        rec = fetch_json(
            f"https://{lang}.wikipedia.org/w/api.php",
            {"action": "query", "prop": "extracts", "exintro": 1, "explaintext": 1, "redirects": 1, "titles": name, "format": "json", "formatversion": 2},
        )
        pages = (rec["data"] or {}).get("query", {}).get("pages", [])
        for p in pages:
            text = p.get("extract") or ""
            # Solo si el artículo es de verdad sobre ese binomio.
            if text and name.lower() in text.lower():
                return {"lang": lang, "extract": text}
    return None


def _domestic(breeds: list[dict]) -> list[dict]:
    universe = {}
    for line in open(config.OUT / "universe.jsonl", encoding="utf-8"):
        u = json.loads(line)
        universe[u["name"]] = u["inat_id"]
    extracts: dict[int, dict] = {}
    for line in open(config.OUT / "wikipedia.jsonl", encoding="utf-8"):
        w = json.loads(line)
        extracts[w["inat_id"]] = w
    with_breeds: dict[int, set[str]] = {}
    for b in breeds:
        with_breeds.setdefault(b["species"], set()).add(b["authority"])

    out = []
    for name, level in DOMESTIC_TAXA.items():
        sid = universe.get(name)
        if sid is None:
            continue
        sources = sorted(with_breeds.get(sid, set()))
        note = None
        if not sources:
            w = extracts.get(sid) or _wiki_intro(name)
            sentence = None
            if w:
                for s in re.split(r"(?<=[.;])\s+", w["extract"]):
                    if DOMESTIC_WORD.search(s):
                        sentence = s.strip()
                        break
            if not sentence:
                print(f"[razas] {name}: sin prueba de domesticación, no se marca")
                continue
            sources = [f"wikipedia-{w['lang']}"]
            note = sentence[:300]
        out.append(
            {
                "inat_id": sid,
                "name": name,
                "domestic": level,
                "farm": bool({"fao", "mapa"} & set(sources)),
                "sources": sources,
                "note": note,
            }
        )
    return out


def run() -> None:
    countries_es = _countries_es()

    paths = _fci_urls()
    print(f"[razas] FCI: {len(paths)} fichas de raza", flush=True)
    breeds: list[dict] = []
    for i, p in enumerate(paths):
        b = _fci_breed(p, countries_es)
        if b:
            breeds.append(b)
        if i % 50 == 0:
            print(f"[razas] FCI {i}/{len(paths)}", flush=True)
    unmapped = sorted({b["origin_text"] for b in breeds if b.get("origin_text") and not b.get("origin_cc")})
    if unmapped:
        print(f"[razas] FCI: orígenes sin país actual (se muestra el texto oficial): {unmapped}")

    cats = _fife()
    print(f"[razas] FIFe: {len(cats)} razas", flush=True)
    breeds += cats

    fao = _dadis()
    mapa = _mapa(countries_es)
    print(f"[razas] MAPA: {len(mapa)} razas", flush=True)
    breeds += fao + _merge_mapa(fao, mapa)

    _match(breeds, _wd_breeds())
    files = sorted({b["img_file"] for b in breeds if b.get("img_file")})
    meta = {m["file"]: m for m in describe(files)} if files else {}
    from urllib.parse import unquote

    for b in breeds:
        f = b.pop("img_file", None)
        m = meta.get(unquote(f).replace(" ", "_")) if f else None
        if m and m["license"] in FREE and m.get("author"):
            b["img"] = {k: m[k] for k in ("thumb", "ratio", "author", "license", "license_label", "license_url", "page")}

    with open(config.OUT / "breeds.jsonl", "w", encoding="utf-8") as fh:
        for b in breeds:
            fh.write(json.dumps(b, ensure_ascii=False) + "\n")
    domestic = _domestic(breeds)
    with open(config.OUT / "domestic.jsonl", "w", encoding="utf-8") as fh:
        for d in domestic:
            fh.write(json.dumps(d, ensure_ascii=False) + "\n")

    by_auth: dict[str, list[int]] = {}
    for b in breeds:
        a = by_auth.setdefault(b["authority"], [0, 0, 0])
        a[0] += 1
        a[1] += 1 if b.get("wd") else 0
        a[2] += 1 if b.get("img") else 0
    for k, (n, wd, img) in by_auth.items():
        print(f"[razas] {k}: {n} razas · {wd} enlazadas a Wikidata · {img} con foto libre")
    print(f"[razas] especies domésticas: {len(domestic)} → out/breeds.jsonl, out/domestic.jsonl")
