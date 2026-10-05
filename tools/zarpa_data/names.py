"""
Nombres comunes en español: filtros y elección.

Regla del proyecto: ningún nombre sale de una traducción automática ni se
inventa. Solo se usan nombres que una fuente escribe en español:

  1. iNaturalist, léxico «spanish» (España primero, luego variantes regionales).
  2. Wikidata: propiedad P1843 (nombre común) con idioma es y, si no, la
     etiqueta en español cuando no es el propio nombre científico.
  3. GBIF: nombres vernáculos con idioma `spa` del volcado de la taxonomía.

Si ninguna fuente tiene nombre, la especie queda sin él y la app enseña el nombre
científico con la etiqueta de su grupo (en español). `name_en` puede seguir en la
base de datos, pero la interfaz no debe mostrarlo.
"""

from __future__ import annotations

import re
import unicodedata


def norm(s: str | None) -> str:
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return " ".join(s.lower().replace("-", " ").split())


# --- Nombres en inglés colados --------------------------------------------------
# En español el nombre empieza por el sustantivo («Rana de ojos rojos»); en
# inglés, por el adjetivo («Giant pangasius»), y el sustantivo inglés va al final
# sin «de» delante. Las listas se han revisado a mano sobre las muestras reales.
EN_FIRST = {
    "giant", "common", "lesser", "greater", "northern", "southern", "eastern", "western",
    "spotted", "striped", "black", "white", "red", "blue", "green", "yellow", "brown",
    "grey", "gray", "little", "small", "large", "long", "short", "great", "american",
    "african", "asian", "european", "mayan", "dwarf", "pygmy", "golden", "silver",
    "banded", "crested", "tufted", "false", "true", "mountain", "sea", "river", "water",
    "wood", "tree", "the", "eurasian", "pacific", "atlantic", "indian", "australian",
    "lined", "ringed", "horned", "hairy", "slender", "broad", "narrow", "pale", "dark",
    "dusky", "sooty", "rusty", "streaked", "barred", "mottled", "plain", "variable",
    "forest", "island", "desert", "marsh", "swamp", "rock", "sand", "sandy", "stone",
    "painted", "orange", "purple", "pink", "scarlet", "crimson", "emerald", "ruby",
    "northwestern", "southwestern", "northeastern", "southeastern", "central", "mexican",
    "chinese", "japanese", "philippine", "bornean", "malayan", "brazilian",
    "california", "carolina", "texas", "florida", "virginia", "cuban", "caribbean",
}
EN_LAST = {
    "rat", "tit", "fish", "bird", "frog", "snake", "lizard", "shark", "moth", "butterfly",
    "beetle", "bee", "wasp", "ant", "fly", "spider", "crab", "shrimp", "mouse", "squirrel",
    "monkey", "deer", "owl", "hawk", "eagle", "duck", "goose", "dove", "pigeon", "warbler",
    "sparrow", "finch", "thrush", "wren", "snail", "slug", "worm", "bat", "toad", "turtle",
    "whale", "dolphin", "seal", "fox", "wolf", "bear", "cat", "dog", "horse", "nymph",
    "skipper", "bug", "halfbeak", "catfish", "lemur", "weevil", "hornet", "cricket",
    "grasshopper", "katydid", "cicada", "leafhopper", "planthopper", "skink",
    "gecko", "tortoise", "salamander", "newt", "ray", "eel", "goby", "wrasse", "damselfly",
    "dragonfly", "skimmer", "darner", "ladybug", "ladybird", "firefly", "lacewing",
    "longhorn", "borer", "bumblebee", "swallowtail", "sulphur", "hairstreak",
    "crow", "raven", "jay", "magpie", "heron", "egret", "gull", "tern", "plover", "sandpiper",
    "kingfisher", "woodpecker", "flycatcher", "starling", "bunting", "swift", "swallow",
    "cuckoo", "parrot", "parakeet", "hummingbird", "vulture", "falcon", "kite", "harrier",
    "lark", "pipit", "babbler", "bulbul", "robin", "redstart", "nuthatch", "creeper",
    "oriole", "tanager", "cardinal", "grosbeak", "towhee", "junco", "vireo", "shrike",
    "beetles", "bugs", "flies", "moths", "butterflies", "wasps", "bees", "ants",
}
# Palabras inglesas que, en cualquier posición, delatan un nombre inglés.
EN_ANY = {
    "the", "of", "and", "tailed", "headed", "backed", "bellied", "winged", "throated",
    "billed", "eyed", "footed", "legged", "crowned", "breasted", "faced", "necked", "capped",
    "fronted", "browed", "rumped", "sided", "naped", "cheeked", "leaf", "mimic", "bumble",
    "carpenter", "mining", "digger", "sweat", "mason", "leafcutter", "orb", "weaver",
    "jumping", "burrowing", "cobweb", "funnel", "huntsman", "sheetweb", "harvestman",
    "clearwing", "hawkmoth", "owlet", "underwing", "looper", "tussock", "leafroller",
    "casebearer", "webworm", "armyworm", "cutworm", "stinkbug", "treehopper",
    "spittlebug", "froghopper", "whitefly", "antlion", "dobsonfly", "stonefly", "mayfly",
    "caddisfly", "sawfly", "horntail", "midge", "gnat", "hover",
}
LINK = {"de", "del", "la", "las", "los", "el", "en", "con", "sin", "y", "e", "o", "para", "al"}
SPANISH_HINT = re.compile(r"[áéíóúñü¿¡]")


def looks_english(name: str) -> bool:
    words = norm(name).split()
    if not words:
        return False
    if words[0] in EN_FIRST:
        return True
    # Con tilde o eñe, o con un enlace español («de», «del»…), no es inglés.
    if SPANISH_HINT.search(name.lower()) or any(w in LINK for w in words[1:]):
        return False
    # «Rana lémur» (Agalychnis lemur) es español aunque lleve el sustantivo al final.
    if len(words) >= 2 and words[-1] in EN_LAST and words[0] not in {"rana", "ranita"}:
        return True
    return len(words) >= 2 and any(w in EN_ANY for w in words)


# --- Presentación --------------------------------------------------------------

_CONNECT = {"de", "del", "la", "las", "los", "el", "y", "e", "o", "a", "al", "con", "sin", "en", "por", "para"}


def clean(name: str) -> str | None:
    """Limpia espacios y descarta lo que no es un nombre (códigos, signos raros)."""
    n = re.sub(r"[​‌‍﻿]", "", name)
    n = " ".join(n.replace(" ", " ").split()).strip(" ,;.")
    if not n or len(n) > 70 or len(n) < 3:
        return None
    if re.search(r"[0-9()\[\]{}<>/\\=_@#*+|:]", n) or "," in n or "�" in n:
        return None
    if n.upper() == n and len(n) > 5:
        n = n.lower()
    return n


# Palabras que en los nombres escritos «a la española» van en minúscula en medio
# del nombre (agua, norte, cabeza…). Se aprende del propio conjunto de nombres
# (`learn_vocabulary`): lo que nunca aparece en minúscula (Fox, Darwin, Baja
# California) es un nombre propio y conserva la mayúscula.
_LOWER_VOCAB: set[str] = set()


def learn_vocabulary(all_names: list[str], min_count: int = 3) -> int:
    from collections import Counter

    c: Counter = Counter()
    for n in all_names:
        for w in n.split()[1:]:
            if w[:1].islower():
                c[w] += 1
    _LOWER_VOCAB.clear()
    _LOWER_VOCAB.update(w for w, k in c.items() if k >= min_count)
    return len(_LOWER_VOCAB)


def sentence_case(name: str) -> str:
    """
    «urraca común» → «Urraca común»; «Mantis Religiosa» → «Mantis religiosa».

    Si todas las palabras llevan inicial mayúscula (estilo «Title Case» de
    iNaturalist) se pasa a minúscula todo salvo la primera palabra y los nombres
    propios: una palabra tras «de/del» que la mayoría de nombres escribe siempre
    con mayúscula (ver `learn_vocabulary`): «Tejedor de Fox», «Serpiente de agua
    del norte».
    """
    words = name.split()
    if not words:
        return name
    significant = [w for w in words[1:] if w.lower() not in _CONNECT]
    if significant and all(w[:1].isupper() for w in significant) and words[0][:1].isupper():
        out = [words[0]]
        prev_de = False
        for w in words[1:]:
            lw = w.lower()
            if lw in _CONNECT:
                out.append(lw)
                # «de las Molucas»: el artículo tras «de» no corta la cadena del nombre propio.
                prev_de = lw in {"de", "del"} or (prev_de and lw in {"la", "las", "los", "el"})
            else:
                known_common = lw in _LOWER_VOCAB or lw in _LOWER_DEFAULT
                out.append(w if (prev_de and not known_common) else lw)
                prev_de = False
        words = out
    first = words[0]
    words[0] = first[:1].upper() + first[1:]
    return " ".join(words)


# Puntos cardinales y poco más: siempre comunes aunque el vocabulario aprendido falte.
_LOWER_DEFAULT = {"norte", "sur", "este", "oeste", "centro", "agua", "monte", "campo", "bosque", "cabeza", "cola", "pecho"}


def pick_name(
    sci: str,
    inat_pref: str | None,
    inat_es: list[str],
    inat_en: list[str],
    wd_common: list[str],
    wd_label: str | None,
    gbif_spa: list[str],
    legacy: str | None = None,
    wiki_es: list[str] | None = None,
) -> tuple[str | None, str, list[str]]:
    """
    Elige el nombre en español y devuelve (nombre, fuentes, otros nombres).

    Orden: iNaturalist (el preferido de España, luego sus otras variantes),
    Wikidata y GBIF. Entre las fuentes que no son iNaturalist gana el nombre que
    escriben dos fuentes. Se descarta el científico repetido, el que coincide
    con el inglés de iNaturalist (si tiene más de una palabra) y el de aspecto
    inglés.
    """
    sci_n = norm(sci)
    en_n = {norm(x) for x in inat_en}
    cands: list[tuple[str, str]] = []  # (nombre, fuente)

    sci_equal: dict[str, set[str]] = {}

    def add(raw: str | None, src: str, label: bool = False) -> None:
        if not raw:
            return
        n = clean(raw)
        if not n:
            return
        k = norm(n)
        if not k:
            return
        if k == sci_n:
            if label:
                return  # la etiqueta de Wikidata repite el científico en casi todos los taxones
            # El nombre común coincide con el científico (Mantis religiosa): solo
            # vale si dos fuentes independientes lo escriben como nombre común.
            sci_equal.setdefault(src, set()).add(n)
            return
        if looks_english(n):
            return
        if k in en_n and len(k.split()) > 1:
            return  # el inglés de iNaturalist escrito como «español»
        cands.append((sentence_case(n), src))

    add(inat_pref, "inat")
    if legacy and (not inat_es or legacy in inat_es):
        add(legacy, "inat")
    for n in inat_es:
        add(n, "inat")
    for n in wd_common:
        add(n, "wikidata")
    add(wd_label, "wikidata", label=True)
    for n in gbif_spa:
        add(n, "gbif")
    for n in wiki_es or []:
        add(n, "wikipedia-es")
    if len(sci_equal) >= 2:
        cands.append((sentence_case(next(iter(next(iter(sci_equal.values()))))), next(iter(sci_equal))))
        for src in list(sci_equal)[1:]:
            cands.append((cands[-1][0], src))
    if not cands:
        return None, "", []

    support: dict[str, set[str]] = {}
    for n, s in cands:
        support.setdefault(norm(n), set()).add(s)
    best = next((n for n, s in cands if s == "inat"), None)
    if best is None:
        # Sin iNaturalist: el nombre respaldado por más fuentes; a igualdad, el primero.
        best = max(enumerate(cands), key=lambda ic: (len(support[norm(ic[1][0])]), -ic[0]))[1][0]
    bk = norm(best)
    aliases: list[str] = []
    seen = {bk}
    for n, _ in cands:
        k = norm(n)
        if k not in seen:
            seen.add(k)
            aliases.append(n)
    srcs = sorted(support[bk], key=["inat", "wikidata", "gbif", "wikipedia-es"].index)
    return best, ",".join(srcs), aliases[:8]


# --- Primera frase de Wikipedia en español ---------------------------------------
# «La abeja europea (Apis mellifera), también conocida como abeja doméstica…»:
# el nombre común va justo antes del nombre científico entre paréntesis, es texto
# escrito por la comunidad de la Wikipedia en español (no traducido).
_ARTICLE = re.compile(r"^(?:el|la|los|las|un|una)\s+", re.I)
_VERBISH = re.compile(r"\b(es|son|fue|fueron|era|que|se|ha|han|de la familia|conocid[oa]s?|también|llamad[oa]s?)\b", re.I)


_LLAMADO = re.compile(
    r"\b(?:comúnmente\s+|vulgarmente\s+|popularmente\s+)?(?:llamad[oa]s?|conocid[oa]s?(?:\s+(?:comúnmente|vulgarmente|popularmente))?\s+como|conocid[oa]s?\s+(?:comúnmente|vulgarmente|popularmente))\s+"
    r"([^.;()]{3,140})",
    re.I,
)


_NOT_A_NAME = re.compile(
    r"(familia|orden|género|especie|subfamilia|descrit[oa]|gracias|análisis|cuy[oa]s?|propio|endémic[oa]|distribuid[oa]|ejemplar|nombre|científic[oa]|\d{3,})|[0-9]|[ãõçê]",
    re.I,
)


def wiki_called_names(extract: str | None) -> list[str]:
    """
    «…de la familia Mantidae comúnmente llamado santateresa, silbata o mamboretá.»
    Nombres que el artículo en español da expresamente como comunes, en la primera frase.
    """
    if not extract:
        return []
    first = extract.strip().split("\n", 1)[0]
    m = _LLAMADO.search(first[:400])
    if not m:
        return []
    tail = re.sub(r"\b(?:simplemente|también|además)\b", "", m.group(1), flags=re.I)
    tail = re.sub(r"[\"“”«»'‘’]", "", tail)
    parts = [p.strip(" ,") for p in re.split(r",\s*|\s+o\s+|\s+u\s+|\s+y\s+", tail)]
    out = []
    for p in parts:
        p = re.sub(r"[​-‏﻿]", "", p).strip(" ,")
        w = p.split()
        if not (3 <= len(p) <= 50 and 1 <= len(w) <= 4) or _VERBISH.search(p) or _NOT_A_NAME.search(p):
            continue
        if re.match(r"(?:en|por|de|del|la|las|el|los|o|u|y|cuya|cuyo|que)\s", p, re.I):
            continue
        if p[:1].isupper() and len(w) == 1 and p.endswith(("idae", "inae", "iformes", "ales", "ia")):
            continue  # un taxón («Hylobatidae»), no un nombre común
        if not p[:1].islower() or len(w[-1]) == 1 or re.search(r"\b(así|muy|encontrad[oa]|como|y)\b", p, re.I):
            if not out:
                return []  # el primero manda: si no es un nombre limpio, el artículo no sirve
            continue
        out.append(p)
    return out[:3]


def wiki_lead_names(extract: str | None, sci: str) -> list[str]:
    return _wiki_paren_names(extract, sci) or wiki_called_names(extract)


def _wiki_paren_names(extract: str | None, sci: str) -> list[str]:
    if not extract:
        return []
    head = extract.strip().split("\n", 1)[0][:260]
    genus = sci.split()[0]
    m = re.search(r"\(\s*(?:la |el |el |los )?(?:especie\s+)?[\"“]?%s[^)]{0,40}\)" % re.escape(genus), head)
    if not m or m.start() < 3:
        return []
    before = head[: m.start()].strip(" ,")
    if not _ARTICLE.match(before):
        return []  # «Mantis religiosa (…)» sin artículo: el título, no un nombre común
    before = _ARTICLE.sub("", before)
    if len(before) > 90 or _VERBISH.search(before.replace(" o ", " ")):
        return []
    before = re.sub(r"[​‌‍﻿]", "", before)
    parts = [p.strip() for p in re.split(r",\s*|\s+o\s+|\s+u\s+", before) if p.strip()]
    return [p for p in parts if 3 <= len(p) <= 60]
