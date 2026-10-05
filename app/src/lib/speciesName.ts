import type { SpeciesRow } from '@/db/query';
import { GROUP_BY_CODE } from '@/lib/groups';

export type DisplayName = {
  /** Texto principal: nombre común en español o, si no hay, el científico. */
  name: string;
  /** True si `name` es el científico: se pinta en cursiva. */
  isSci: boolean;
  /**
   * Segunda línea: el científico si hay nombre común; si no, el nombre español
   * de su familia («Hormigas», «Polillas búho») o, a falta de él, el grupo.
   */
  sub: string;
  /** Grupo en singular y en español («Ave», «Reptil»…). */
  group: string;
};

/**
 * Nombre para mostrar. Nunca el inglés: sin nombre común en español se muestra
 * el científico (en cursiva con `isSci`) y debajo el nombre español de su
 * familia, que es un dato verificado (nunca traducido), o el grupo en español.
 */
export function displayName(sp: Pick<SpeciesRow, 'name_es' | 'sci'> & { grp?: string | null; family_es?: string | null }): DisplayName {
  const group = (sp.grp && GROUP_BY_CODE[sp.grp as keyof typeof GROUP_BY_CODE]?.singular) || 'Animal';
  if (sp.name_es) return { name: sp.name_es, isSci: false, sub: sp.sci, group };
  const family = sp.family_es?.trim();
  return { name: sp.sci, isSci: true, sub: family ? family[0].toUpperCase() + family.slice(1) : group, group };
}
