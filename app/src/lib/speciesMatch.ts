import type { GroupCode } from './groups';

/*
 * Qué especies cuentan para un reto. Un `Matcher` se evalúa de dos maneras que
 * deben coincidir: en JS sobre los datos de una especie avistada (`matches`) y
 * en SQL sobre el catálogo para proponer especies concretas (`matcherSql`).
 * tests/missions.test.ts comprueba que ambas dan lo mismo en el catálogo real.
 */

/** Lector mínimo de SQLite: lo cumplen expo-sqlite y el adaptador de las pruebas. */
export type Reader = {
  getAllAsync<T>(sql: string, params: (string | number)[]): Promise<T[]>;
};

export type SpeciesMeta = {
  id: number;
  grp: GroupCode;
  rarity: number;
  iucn: string | null;
  envs: number;
  diet: string | null;
  family: string | null;
  order: string | null;
  migration: string | null;
};

export type Matcher = {
  grp?: GroupCode;
  /** Rareza mínima (3 = escasa o más rara). */
  minRarity?: number;
  /** Categorías UICN que valen. */
  iucn?: string[];
  /** Máscara de ambiente: basta uno. */
  env?: number;
  /** Ave migradora (total o parcial). */
  migratory?: boolean;
  /** Insecto polinizador: abejas, moscas de las flores y mariposas. */
  pollinator?: boolean;
};

export const THREATENED = ['VU', 'EN', 'CR'] as const;

/** Familias de himenópteros y dípteros que polinizan; las mariposas entran por orden. */
export const POLLINATOR_FAMILIES = [
  'Apidae',
  'Halictidae',
  'Andrenidae',
  'Megachilidae',
  'Colletidae',
  'Melittidae',
  'Syrphidae',
  'Bombyliidae',
] as const;
export const POLLINATOR_ORDER = 'Lepidoptera';

export function matches(sp: SpeciesMeta, m: Matcher): boolean {
  if (m.grp && sp.grp !== m.grp) return false;
  if (m.minRarity && sp.rarity < m.minRarity) return false;
  if (m.iucn && !(sp.iucn && m.iucn.includes(sp.iucn))) return false;
  if (m.env && (sp.envs & m.env) === 0) return false;
  if (m.migratory && !(sp.migration && sp.migration.startsWith('Migradora'))) return false;
  if (m.pollinator) {
    const ok = sp.grp === 'insecto' && (sp.order === POLLINATOR_ORDER || (sp.family != null && (POLLINATOR_FAMILIES as readonly string[]).includes(sp.family)));
    if (!ok) return false;
  }
  return true;
}

/** Condiciones SQL sobre `species_v s` LEFT JOIN `detail d`. */
export function matcherSql(m: Matcher): { clauses: string[]; params: (string | number)[] } {
  const clauses: string[] = [];
  const params: (string | number)[] = [];
  if (m.grp) {
    clauses.push('s.grp = ?');
    params.push(m.grp);
  }
  if (m.minRarity) {
    clauses.push('s.rarity >= ?');
    params.push(m.minRarity);
  }
  if (m.iucn?.length) {
    clauses.push(`s.iucn IN (${m.iucn.map(() => '?').join(',')})`);
    params.push(...m.iucn);
  }
  if (m.env) {
    clauses.push('(s.envs & ?) != 0');
    params.push(m.env);
  }
  if (m.migratory) clauses.push("d.migration LIKE 'Migradora%'");
  if (m.pollinator) {
    clauses.push(
      `s.grp = 'insecto' AND (s.order_sci = '${POLLINATOR_ORDER}' OR s.family_sci IN (${POLLINATOR_FAMILIES.map((f) => `'${f}'`).join(',')}))`,
    );
  }
  return { clauses, params };
}

/** Datos de las especies avistadas que necesitan logros y misiones (una sola consulta). */
export async function loadSpeciesMeta(catalog: Reader, ids: number[]): Promise<Map<number, SpeciesMeta>> {
  if (!ids.length) return new Map();
  const rows = await catalog.getAllAsync<SpeciesMeta>(
    `SELECT s.id, s.grp, s.rarity, s.iucn, s.envs, s.diet, s.family_sci AS family, s.order_sci AS "order", d.migration
     FROM species_v s LEFT JOIN detail d ON d.id = s.id
     WHERE s.id IN (SELECT value FROM json_each(?))`,
    [JSON.stringify(ids)],
  );
  return new Map(rows.map((r) => [r.id, r]));
}
