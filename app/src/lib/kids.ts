import type { IconName } from '@/components/Icon';

import { formatLength, formatMass } from './sizeScale';

/*
 * Modo niños: frases cortas por plantilla a partir de datos ya verificados del
 * catálogo. Nada se inventa: si un dato falta, esa frase no sale.
 */

export type KidFact = { icon: IconName; text: string };

export type KidsInput = {
  /** Código del grupo (coincide con el nombre de su icono). */
  grp: string;
  /** «Ave», «Mamífero»… */
  singular: string;
  diet: string | null;
  medium: number;
  /** Países con presencia (ya filtrados por observaciones mínimas). */
  countries: number;
  endemic: string[];
  iucn: string | null;
  rarity: number;
  domestic: number;
  mass_g?: number | null;
  length_mm?: number | null;
};

const DIET_TEXT: Record<string, { text: string; icon: IconName }> = {
  Herbívoro: { text: 'Come plantas', icon: 'leaf' },
  Frugívoro: { text: 'Come frutas', icon: 'leaf' },
  Granívoro: { text: 'Come semillas', icon: 'leaf' },
  Nectarívoro: { text: 'Bebe el néctar de las flores', icon: 'leaf' },
  Invertívoro: { text: 'Come insectos y otros bichitos', icon: 'insecto' },
  Carnívoro: { text: 'Come carne', icon: 'mamifero' },
  Piscívoro: { text: 'Come peces', icon: 'pez' },
  'Depredador acuático': { text: 'Caza animales que viven en el agua', icon: 'pez' },
  Carroñero: { text: 'Limpia la naturaleza: come restos de animales', icon: 'eye' },
  Omnívoro: { text: 'Come de todo: plantas y animales', icon: 'sparkle' },
};

const MEDIUM_TEXT: { bit: number; text: string; icon: IconName }[] = [
  { bit: 1, text: 'la tierra', icon: 'tree' },
  { bit: 2, text: 'los ríos y lagos', icon: 'drop' },
  { bit: 4, text: 'el mar', icon: 'wave' },
  { bit: 8, text: 'las aguas de la costa', icon: 'wave' },
];

const IUCN_TEXT: Record<string, { text: string; icon: IconName }> = {
  CR: { text: 'Está en peligro: quedan muy pocos', icon: 'warning' },
  EN: { text: 'Está en peligro: quedan pocos', icon: 'warning' },
  VU: { text: 'Está en riesgo: cada vez hay menos', icon: 'warning' },
  NT: { text: 'Casi está en peligro: hay que cuidarla', icon: 'heart' },
  LC: { text: 'No está en peligro: hay muchos', icon: 'heart' },
  EW: { text: 'Ya no vive en libertad: solo con cuidados de las personas', icon: 'hourglass' },
  EX: { text: 'Ya no existe: se extinguió', icon: 'hourglass' },
};

function listEs(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

export function kidsFacts(i: KidsInput): KidFact[] {
  const out: KidFact[] = [];
  const art = i.grp === 'esponja' ? 'una' : 'un';
  out.push({ icon: i.grp as IconName, text: `Es ${art} ${i.singular.toLowerCase()}` });

  const diet = i.diet ? DIET_TEXT[i.diet] : undefined;
  if (diet) out.push({ icon: diet.icon, text: diet.text });

  const places = MEDIUM_TEXT.filter((m) => (i.medium & m.bit) !== 0);
  if (places.length) out.push({ icon: places[0].icon, text: `Vive en ${listEs(places.map((p) => p.text))}` });

  if (i.endemic.length > 0 && i.endemic.length <= 3) {
    out.push({ icon: 'pin', text: `Solo vive en ${listEs(i.endemic)}` });
  } else if (i.countries === 1) {
    out.push({ icon: 'globe', text: 'Vive en un solo país' });
  } else if (i.countries > 1) {
    out.push({ icon: 'globe', text: `Vive en ${i.countries} países` });
  }

  if (i.length_mm && i.length_mm > 0) out.push({ icon: 'ruler', text: `Mide hasta ${formatLength(i.length_mm)}` });
  if (i.mass_g && i.mass_g > 0) out.push({ icon: 'weight', text: `Pesa unos ${formatMass(i.mass_g)}` });

  if (i.domestic === 2) out.push({ icon: 'heart', text: 'Vive con las personas' });

  const iucn = i.iucn ? IUCN_TEXT[i.iucn] : undefined;
  if (iucn) out.push({ icon: iucn.icon, text: iucn.text });

  if (i.rarity >= 4) out.push({ icon: 'sparkle', text: 'Es muy difícil de encontrar' });
  else if (i.rarity <= 2) out.push({ icon: 'eye', text: 'Es fácil de encontrar' });

  return out;
}
