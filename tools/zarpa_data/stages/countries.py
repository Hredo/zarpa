"""
Etapa 4b · Presencia por país (GBIF), separada del cruce taxonómico.

No depende de nada más que de la API de GBIF, así que puede correr mientras las
otras etapas siguen bajando. Ver `gbif._countries`.
"""

from __future__ import annotations

from .gbif import _countries


def run() -> None:
    _countries()
