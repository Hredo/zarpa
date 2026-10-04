/*
 * Grupos de animales (álbumes). El código lo fija `tools/zarpa_data/taxonomy.py`
 * a partir de la clasificación; aquí solo se le pone nombre y orden.
 */
export type GroupCode =
  | 'mamifero'
  | 'ave'
  | 'reptil'
  | 'anfibio'
  | 'pez'
  | 'insecto'
  | 'aracnido'
  | 'crustaceo'
  | 'miriapodo'
  | 'molusco'
  | 'cnidario'
  | 'equinodermo'
  | 'anelido'
  | 'esponja'
  | 'otro';

export const GROUPS: { code: GroupCode; label: string; singular: string }[] = [
  { code: 'mamifero', label: 'Mamíferos', singular: 'Mamífero' },
  { code: 'ave', label: 'Aves', singular: 'Ave' },
  { code: 'reptil', label: 'Reptiles', singular: 'Reptil' },
  { code: 'anfibio', label: 'Anfibios', singular: 'Anfibio' },
  { code: 'pez', label: 'Peces', singular: 'Pez' },
  { code: 'insecto', label: 'Insectos', singular: 'Insecto' },
  { code: 'aracnido', label: 'Arácnidos', singular: 'Arácnido' },
  { code: 'crustaceo', label: 'Crustáceos', singular: 'Crustáceo' },
  { code: 'miriapodo', label: 'Ciempiés y milpiés', singular: 'Miriápodo' },
  { code: 'molusco', label: 'Moluscos', singular: 'Molusco' },
  { code: 'cnidario', label: 'Medusas, corales y anémonas', singular: 'Cnidario' },
  { code: 'equinodermo', label: 'Estrellas y erizos de mar', singular: 'Equinodermo' },
  { code: 'anelido', label: 'Gusanos anillados', singular: 'Anélido' },
  { code: 'esponja', label: 'Esponjas', singular: 'Esponja' },
  { code: 'otro', label: 'Otros invertebrados', singular: 'Invertebrado' },
];

export const GROUP_BY_CODE = Object.fromEntries(GROUPS.map((g) => [g.code, g])) as Record<
  GroupCode,
  (typeof GROUPS)[number]
>;

/*
 * Rareza de avistamiento, con el código de colores de los senderos de España:
 * cuanto más largo y exigente el recorrido, más difícil el encuentro.
 * Los cortes (observaciones confirmadas en libertad) están en taxonomy.py.
 */
export const RARITY = [
  { tier: 1, label: 'Común', mark: 'white', minObs: 5000 },
  { tier: 2, label: 'Frecuente', mark: 'green', minObs: 1000 },
  { tier: 3, label: 'Escasa', mark: 'yellow', minObs: 250 },
  { tier: 4, label: 'Rara', mark: 'red', minObs: 60 },
  { tier: 5, label: 'Legendaria', mark: 'foil', minObs: 25 },
] as const;

export type RarityTier = (typeof RARITY)[number]['tier'];

export function rarityInfo(tier: number) {
  return RARITY.find((r) => r.tier === tier) ?? RARITY[0];
}

export const IUCN_LABEL: Record<string, string> = {
  EX: 'Extinta',
  EW: 'Extinta en estado silvestre',
  CR: 'En peligro crítico',
  EN: 'En peligro',
  VU: 'Vulnerable',
  NT: 'Casi amenazada',
  LC: 'Preocupación menor',
  DD: 'Datos insuficientes',
};

/** Medio en el que vive, como máscara de bits (lo escribe build.py). */
export const MEDIUM = [
  { bit: 1, label: 'Terrestre' },
  { bit: 2, label: 'Agua dulce' },
  { bit: 4, label: 'Marino' },
  { bit: 8, label: 'Aguas salobres' },
] as const;

/**
 * Ambientes, como máscara de bits (la misma tabla en
 * tools/zarpa_data/stages/traits.py). Los tres primeros son los que más se
 * buscan; el resto sigue el hábitat principal de AVONET y ReptTraits.
 */
export const ENVS = [
  { bit: 1024, label: 'Ciudad' },
  { bit: 2048, label: 'Granja' },
  { bit: 4096, label: 'Selva tropical' },
  { bit: 1, label: 'Bosque' },
  { bit: 2, label: 'Matorral' },
  { bit: 4, label: 'Praderas y sabanas' },
  { bit: 8, label: 'Humedales' },
  { bit: 16, label: 'Ríos' },
  { bit: 32, label: 'Costa' },
  { bit: 64, label: 'Mar' },
  { bit: 128, label: 'Roquedos y cantiles' },
  { bit: 256, label: 'Desierto' },
  { bit: 512, label: 'Zonas humanizadas' },
] as const;

/** Categorías de dieta que escribe traits.py, en orden de la planta a la presa. */
export const DIETS: { label: string; hint: string }[] = [
  { label: 'Herbívoro', hint: 'Come sobre todo plantas' },
  { label: 'Frugívoro', hint: 'Come sobre todo frutos' },
  { label: 'Granívoro', hint: 'Come sobre todo semillas' },
  { label: 'Nectarívoro', hint: 'Se alimenta sobre todo de néctar' },
  { label: 'Invertívoro', hint: 'Come sobre todo invertebrados: insectos, arañas, gusanos…' },
  { label: 'Carnívoro', hint: 'Come sobre todo otros vertebrados' },
  { label: 'Piscívoro', hint: 'Come sobre todo peces' },
  { label: 'Depredador acuático', hint: 'Caza sobre todo animales acuáticos' },
  { label: 'Carroñero', hint: 'Se alimenta sobre todo de carroña' },
  { label: 'Omnívoro', hint: 'Come de todo, sin un alimento dominante' },
];

export const DOMESTIC_LABEL: Record<number, string> = {
  2: 'Animal doméstico',
  1: 'Silvestre, con forma doméstica',
};

/** Cómo está establecida en cada país, según iNaturalist. */
export const MEANS_LABEL: Record<string, string> = {
  native: 'Nativa',
  endemic: 'Endémica',
  introduced: 'Introducida',
};

export const AUTHORITY_LABEL: Record<string, string> = {
  fci: 'FCI',
  fife: 'FIFe',
  fao: 'FAO · DAD-IS',
  mapa: 'MAPA',
};
