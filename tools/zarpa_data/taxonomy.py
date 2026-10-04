"""
Grupos de animales que ve el usuario, derivados de la clasificación.

Son deterministas: dependen solo de los antepasados del taxón, no de ninguna
fuente de texto, así que no hay nada que contrastar. El orden de `GROUPS` es el
orden de los álbumes en la app.
"""

from __future__ import annotations

# (código, etiqueta en español, nombres de taxón que lo definen). El primero que
# aparezca entre los antepasados gana: por eso los grupos más concretos van antes.
GROUPS: list[tuple[str, str, set[str]]] = [
    ("mamifero", "Mamíferos", {"Mammalia"}),
    ("ave", "Aves", {"Aves"}),
    ("reptil", "Reptiles", {"Reptilia"}),
    ("anfibio", "Anfibios", {"Amphibia"}),
    # Peces no es un grupo natural: se juntan las clases de vertebrados acuáticos
    # con aletas, que es lo que el público entiende por «pez».
    ("pez", "Peces", {"Actinopterygii", "Elasmobranchii", "Holocephali", "Myxini", "Petromyzonti", "Dipnoi", "Coelacanthi", "Chondrichthyes"}),
    ("insecto", "Insectos", {"Insecta"}),
    ("aracnido", "Arácnidos", {"Arachnida"}),
    ("crustaceo", "Crustáceos", {"Crustacea"}),
    ("miriapodo", "Ciempiés y milpiés", {"Myriapoda"}),
    ("molusco", "Moluscos", {"Mollusca"}),
    ("cnidario", "Medusas, corales y anémonas", {"Cnidaria"}),
    ("equinodermo", "Estrellas y erizos de mar", {"Echinodermata"}),
    ("anelido", "Gusanos anillados", {"Annelida"}),
    ("esponja", "Esponjas", {"Porifera"}),
]

OTHER = ("otro", "Otros invertebrados")

GROUP_LABEL = {code: label for code, label, _ in GROUPS} | {OTHER[0]: OTHER[1]}


def group_of(ancestor_names: list[str]) -> str:
    names = set(ancestor_names)
    for code, _, members in GROUPS:
        if names & members:
            return code
    return OTHER[0]


# Rareza de avistamiento: cuántas veces se ha fotografiado y confirmado la
# especie en libertad (grado investigación de iNaturalist, en todo el mundo).
# Mide lo difícil que es encontrarla para una persona, no su estado de
# conservación (eso es la UICN, que va aparte). Los cortes salen de la
# distribución medida el 2026-10-04 sobre las 96 877 especies observables.
RARITY_CUTS = [
    (5000, 1),  # común
    (1000, 2),  # frecuente
    (250, 3),  # escasa
    (60, 4),  # rara
    (0, 5),  # legendaria
]


def rarity_of(rg_obs: int) -> int:
    for cut, tier in RARITY_CUTS:
        if rg_obs >= cut:
            return tier
    return 5
