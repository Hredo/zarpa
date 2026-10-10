import type { GroupCode } from './groups';
import type { Weather } from './weather';

/*
 * Qué animales se pueden ver hoy con el tiempo que hace donde está el usuario.
 *
 * Se parte de un dato real: las especies que la comunidad de iNaturalist ha
 * visto y confirmado a menos de 25 km en esta época del año (este mes y los dos
 * de al lado). Sobre esa lista se aplica cómo responde cada tipo de animal al
 * tiempo de ahora (lluvia, sol, frío, viento, día o noche), con reglas de
 * ecología conocidas y la actividad diaria del catálogo (diurno, nocturno…)
 * cuando la hay: los anfibios, caracoles y lombrices salen con la lluvia; los
 * reptiles y las mariposas, con sol y calma; los murciélagos y las rapaces
 * nocturnas, de noche… Es una orientación, no una garantía, y la app lo dice.
 *
 * Lógica pura (sin red ni nativo) para poder probarse en Jest.
 */

export type Conditions = {
  tempC: number;
  rain: boolean;
  heavyRain: boolean;
  snow: boolean;
  storm: boolean;
  fog: boolean;
  /** Despejado o casi (códigos WMO 0–1). */
  sunny: boolean;
  /** Parcialmente nublado (2). */
  partly: boolean;
  humid: boolean;
  windKmh: number;
  day: boolean;
  /** A menos de hora y media de la salida o la puesta del sol. */
  twilight: boolean;
};

/** Minutos desde medianoche de «2026-10-10T08:05». */
function minutesOf(iso: string | null | undefined): number | null {
  const m = /T(\d{2}):(\d{2})/.exec(iso ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function conditionsOf(w: Weather): Conditions {
  const c = w.code;
  const precip = w.precipMm ?? 0;
  const rain = (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95 || precip >= 0.2;
  const now = minutesOf(w.localTime);
  const rise = minutesOf(w.sunrise);
  const set = minutesOf(w.sunset);
  const twilight = now != null && ((rise != null && Math.abs(now - rise) <= 90) || (set != null && Math.abs(now - set) <= 90));
  return {
    tempC: w.tempC,
    rain,
    heavyRain: c === 65 || c === 67 || c === 82 || precip >= 4,
    snow: (c >= 71 && c <= 77) || c === 85 || c === 86,
    storm: c >= 95,
    fog: c === 45 || c === 48,
    sunny: c <= 1,
    partly: c === 2,
    humid: (w.humidity ?? 0) >= 85,
    windKmh: w.windKmh ?? 0,
    day: w.isDay,
    twilight,
  };
}

/** Lo que el catálogo sabe de cada especie para decidir (grupo, taxonomía, medio y actividad). */
export type FaunaTaxon = {
  grp: GroupCode;
  class_sci: string | null;
  order_sci: string | null;
  family_sci: string | null;
  /** Máscara de MEDIUM (1 terrestre, 2 agua dulce, 4 marino, 8 salobre). */
  medium: number;
  /** «Diurno», «Nocturno», «Crepuscular»… (traits del catálogo) o null. */
  activity: string | null;
};

export type Profile =
  | 'anfibio'
  | 'reptil'
  | 'geco'
  | 'mariposa'
  | 'polilla'
  | 'libelula'
  | 'abeja'
  | 'hormiga'
  | 'luciernaga'
  | 'saltamontes'
  | 'mosquito'
  | 'insecto'
  | 'arana'
  | 'escorpion'
  | 'humedad'
  | 'pajaro'
  | 'nocturna'
  | 'acuatica'
  | 'rapaz'
  | 'aerea'
  | 'murcielago'
  | 'mamifero'
  | 'agua';

/** Nombre en plural para el titular («buen momento para anfibios, caracoles…»). */
export const PROFILE_LABEL: Record<Profile, string> = {
  anfibio: 'anfibios',
  reptil: 'reptiles',
  geco: 'salamanquesas',
  mariposa: 'mariposas',
  polilla: 'polillas',
  libelula: 'libélulas',
  abeja: 'abejas y avispas',
  hormiga: 'hormigas',
  luciernaga: 'luciérnagas',
  saltamontes: 'saltamontes y grillos',
  mosquito: 'mosquitos',
  insecto: 'insectos',
  arana: 'arañas',
  escorpion: 'escorpiones',
  humedad: 'caracoles, babosas y lombrices',
  pajaro: 'pájaros',
  nocturna: 'aves nocturnas',
  acuatica: 'aves acuáticas',
  rapaz: 'rapaces',
  aerea: 'vencejos y golondrinas',
  murcielago: 'murciélagos',
  mamifero: 'mamíferos',
  agua: 'animales acuáticos',
};

const BUTTERFLY_FAMILIES = new Set(['Papilionidae', 'Nymphalidae', 'Pieridae', 'Lycaenidae', 'Hesperiidae', 'Riodinidae']);
const WATERBIRD_ORDERS = new Set([
  'Anseriformes',
  'Charadriiformes',
  'Pelecaniformes',
  'Ciconiiformes',
  'Gruiformes',
  'Podicipediformes',
  'Suliformes',
  'Gaviiformes',
  'Procellariiformes',
  'Phoenicopteriformes',
  'Sphenisciformes',
]);
const RAPTOR_ORDERS = new Set(['Accipitriformes', 'Falconiformes', 'Cathartiformes']);
const NIGHTBIRD_ORDERS = new Set(['Strigiformes', 'Caprimulgiformes', 'Nyctibiiformes', 'Podargiformes']);
const AERIAL_FAMILIES = new Set(['Apodidae', 'Hirundinidae']);
/** Salamanquesas y gecos: casi todos cazan de noche. */
const GECKO_FAMILIES = new Set(['Gekkonidae', 'Phyllodactylidae', 'Sphaerodactylidae', 'Diplodactylidae', 'Carphodactylidae', 'Eublepharidae']);
/** Avispas de las agallas: lo que se observa es la agalla, que está ahí haga el tiempo que haga. */
const GALL_FAMILIES = new Set(['Cynipidae']);

const TERRESTRIAL = 1;

/** Tipo de animal frente al tiempo. */
export function profileOf(t: FaunaTaxon): Profile {
  const onlyWater = t.medium !== 0 && (t.medium & TERRESTRIAL) === 0;
  switch (t.grp) {
    case 'anfibio':
      return 'anfibio';
    case 'reptil':
      if (onlyWater) return 'agua';
      return GECKO_FAMILIES.has(t.family_sci ?? '') ? 'geco' : 'reptil';
    case 'ave':
      if (NIGHTBIRD_ORDERS.has(t.order_sci ?? '')) return 'nocturna';
      if (RAPTOR_ORDERS.has(t.order_sci ?? '')) return 'rapaz';
      if (AERIAL_FAMILIES.has(t.family_sci ?? '')) return 'aerea';
      if (WATERBIRD_ORDERS.has(t.order_sci ?? '')) return 'acuatica';
      return 'pajaro';
    case 'mamifero':
      if (t.order_sci === 'Chiroptera') return 'murcielago';
      return onlyWater ? 'agua' : 'mamifero';
    case 'insecto':
      if (t.order_sci === 'Lepidoptera') return BUTTERFLY_FAMILIES.has(t.family_sci ?? '') ? 'mariposa' : 'polilla';
      if (t.order_sci === 'Odonata') return 'libelula';
      if (t.family_sci === 'Formicidae') return 'hormiga';
      if (GALL_FAMILIES.has(t.family_sci ?? '')) return 'insecto';
      if (t.order_sci === 'Hymenoptera') return 'abeja';
      if (t.family_sci === 'Lampyridae') return 'luciernaga';
      if (t.order_sci === 'Orthoptera') return 'saltamontes';
      if (t.family_sci === 'Culicidae') return 'mosquito';
      return onlyWater ? 'agua' : 'insecto';
    case 'aracnido':
      if (t.order_sci === 'Scorpiones') return 'escorpion';
      return onlyWater ? 'agua' : 'arana';
    case 'molusco':
      return t.class_sci === 'Gastropoda' && (t.medium & TERRESTRIAL) !== 0 ? 'humedad' : 'agua';
    case 'anelido':
    case 'miriapodo':
      return onlyWater ? 'agua' : 'humedad';
    case 'crustaceo':
      return t.order_sci === 'Isopoda' && (t.medium & TERRESTRIAL) !== 0 ? 'humedad' : 'agua';
    default:
      return onlyWater || t.grp === 'pez' || t.grp === 'cnidario' || t.grp === 'equinodermo' || t.grp === 'esponja' ? 'agua' : 'insecto';
  }
}

export type Fit = { score: number; reason: string };

const f = (score: number, reason: string): Fit => ({ score, reason });

/** Cómo le va a un tipo de animal el tiempo de ahora: de 0 (no saldrá) a 3 (es su momento). */
export function profileFit(p: Profile, c: Conditions): Fit {
  const t = c.tempC;
  const calm = c.windKmh < 30;
  switch (p) {
    case 'anfibio':
      if (t < 3 || c.snow) return f(0, 'Con este frío están escondidos');
      if (c.rain && !c.storm) return f(3, 'Salen con la lluvia');
      if (c.humid || c.fog) return f(2.5, 'La humedad los saca');
      if (!c.day) return f(2, 'Más activos de noche');
      return t > 28 && c.sunny ? f(0.5, 'Con sol y calor se esconden') : f(1, 'Mejor cerca del agua');
    case 'reptil':
      if (c.rain || c.snow || t < 12) return f(0, 'Con frío o lluvia se esconden');
      if (!c.day) return f(0.3, 'De noche se refugian');
      if (t > 33) return f(1.5, 'Con tanto calor, a primera y última hora');
      if ((c.sunny || c.partly) && t >= 15) return f(3, 'Salen a tomar el sol');
      return t >= 15 ? f(1.2, 'Con nubes salen menos') : f(0.6, 'Aún hace fresco para ellos');
    case 'geco':
      if (c.rain || t < 14) return f(0.3, 'Con frío o lluvia se esconden');
      if (!c.day || c.twilight) return f(3, 'Cazan insectos al anochecer, cerca de las luces');
      return f(1, 'De día, en grietas de muros y rocas');
    case 'mariposa':
      if (!c.day || c.rain || t < 13 || !calm) return f(0.2, 'Necesitan sol, calor y calma');
      if (c.sunny && t >= 17) return f(3, 'Vuelan con sol y calma');
      return c.sunny || c.partly ? f(2, 'Vuelan entre nubes y claros') : f(1, 'Con el cielo cubierto vuelan poco');
    case 'polilla':
      if (!c.day && t >= 10 && !c.rain && c.windKmh < 25) return f(3, 'Noche templada y sin viento');
      return c.day ? f(0.8, 'De día descansan casi todas') : f(0.5, 'Con frío, lluvia o viento vuelan poco');
    case 'libelula':
      return c.day && c.sunny && t >= 16 && calm && !c.rain ? f(3, 'Cazan al sol junto al agua') : f(0.3, 'Necesitan sol y calor');
    case 'abeja':
      if (!c.day || c.rain || t < 12 || !calm) return f(0.3, 'Con frío, lluvia o viento no salen');
      return c.sunny || c.partly ? f(3, 'Vuelan con sol y temperatura suave') : f(2, 'Salen aunque esté nublado');
    case 'hormiga':
      if (c.rain || t < 10) return f(0.4, 'Con frío o lluvia, dentro del hormiguero');
      return t >= 15 ? f(2.5, 'Activas con calor') : f(1.5, 'Con fresco salen poco');
    case 'luciernaga':
      return !c.day && t >= 15 && !c.rain ? f(3, 'Brillan en noches cálidas') : f(0.2, 'Se ven en noches cálidas');
    case 'saltamontes':
      if (c.rain || t < 16) return f(0.4, 'Necesitan calor');
      return c.day ? f(c.sunny ? 3 : 2, 'Saltan con calor') : f(2, 'Los grillos cantan de noche');
    case 'mosquito':
      return t >= 15 && (c.humid || c.twilight || !c.day) ? f(2.5, 'Calor y humedad: su momento') : f(0.5, 'Con fresco o sequedad, pocos');
    case 'insecto':
      if (t < 8) return f(0.3, 'Con frío casi no se mueven');
      if (c.rain) return f(0.8, 'Con lluvia se refugian');
      return c.day && (c.sunny || c.partly) && t >= 15 ? f(2, 'Activos con sol y calor') : f(1.4, 'Busca bajo piedras y troncos');
    case 'arana':
      if (t < 5) return f(0.5, 'Con frío se esconden');
      if (c.fog || (c.humid && !c.rain)) return f(2.5, 'Con rocío o niebla se ven sus telas');
      return f(1.5, 'Mira entre la vegetación');
    case 'escorpion':
      return !c.day && t >= 18 && !c.rain ? f(2.5, 'Cazan en noches cálidas') : f(0.3, 'Salen en noches cálidas');
    case 'humedad':
      if (t < 2 || c.snow) return f(0.3, 'Con este frío están enterrados');
      if (c.rain) return f(3, 'Salen con la lluvia');
      if (c.humid || c.fog) return f(2.5, 'La humedad los saca');
      if (c.sunny && t > 25) return f(0.3, 'Con sol y calor se esconden');
      return !c.day ? f(1.8, 'Más activos de noche') : f(1, 'Mira bajo piedras y hojas');
    case 'pajaro':
      if (c.storm || c.heavyRain) return f(0.5, 'Con temporal se resguardan');
      if (!c.day) return f(0.3, 'De noche duermen');
      if (c.windKmh > 45) return f(0.8, 'Con tanto viento se esconden');
      if (c.snow) return f(2, 'Con nieve se acercan a buscar comida');
      if (c.rain || c.fog) return f(1.2, 'Con lluvia se mueven menos');
      return f(c.twilight ? 3 : 2.3, c.twilight ? 'Primeras y últimas horas: cantan y comen' : 'Activos con buen tiempo');
    case 'nocturna':
      return !c.day && !c.storm && c.windKmh < 35 ? f(3, 'Cazan de noche') : c.twilight ? f(1.8, 'Salen al anochecer') : f(0.3, 'De día descansan');
    case 'acuatica':
      if (c.storm) return f(0.8, 'Con temporal se resguardan');
      if (!c.day) return f(0.8, 'De noche se ven poco');
      return c.rain ? f(2.2, 'La lluvia no les molesta') : f(2, 'Busca en humedales, ríos y costa');
    case 'rapaz':
      if (!c.day) return f(0.2, 'De noche no cazan');
      if (!c.rain && (c.sunny || c.partly) && t >= 10) return f(3, 'Planean con las térmicas del sol');
      return c.rain ? f(0.6, 'Con lluvia vuelan poco') : f(1.2, 'Sin sol vuelan menos');
    case 'aerea':
      return c.day && !c.rain && t >= 12 ? f(2.5, 'Cazan insectos al vuelo') : f(0.4, 'Con frío o lluvia vuelan poco');
    case 'murcielago':
      if (c.day) return f(c.twilight ? 1.5 : 0.1, c.twilight ? 'Salen al anochecer' : 'De día duermen');
      return t >= 10 && !c.rain && c.windKmh < 25 ? f(3, 'Cazan en noches templadas') : f(0.5, 'Con frío, lluvia o viento salen poco');
    case 'mamifero':
      if (c.storm) return f(0.5, 'Con temporal se refugian');
      if (c.twilight) return f(2.5, 'Al amanecer y al atardecer se mueven más');
      return c.day ? f(c.rain ? 1 : 1.5, 'Busca rastros y huellas') : f(1.8, 'De noche se mueven más');
    case 'agua':
      return c.storm ? f(0.5, 'Con temporal, mejor no acercarse al agua') : f(1.5, 'Bajo el agua el tiempo importa poco');
  }
}

/** Ajusta por la actividad diaria conocida de la especie (un nocturno de día casi no se ve). */
export function weatherFit(t: FaunaTaxon, c: Conditions): Fit & { profile: Profile } {
  const profile = profileOf(t);
  const base = profileFit(profile, c);
  const act = t.activity ?? '';
  if (act.startsWith('Nocturno') && c.day && !c.twilight) return { profile, score: Math.min(base.score, 0.5), reason: 'Nocturno: de día está escondido' };
  if (act.startsWith('Nocturno') && !c.day && base.score < 2) return { profile, score: 2, reason: 'Nocturno: es su hora' };
  if (act === 'Diurno' && !c.day) return { profile, score: Math.min(base.score, 0.3), reason: 'Diurno: de noche descansa' };
  if (act === 'Crepuscular' && c.twilight) return { profile, score: Math.max(base.score, 2.5), reason: 'Crepuscular: es su hora' };
  return { profile, ...base };
}

/** Lo mínimo para mostrarla como «puedes verla con este tiempo». */
export const MIN_FIT = 2;

export type Ranked<T> = T & { fit: number; reason: string; profile: Profile; local: number };

/**
 * Ordena las especies de la zona por lo bien que les va el tiempo de ahora y
 * por cuántas veces se han visto aquí en esta época. Deja fuera las que no
 * llegan a `MIN_FIT` y las que ya tienes.
 */
export function rankByWeather<T extends FaunaTaxon & { id: number }>(
  rows: readonly T[],
  counts: ReadonlyMap<number, number>,
  c: Conditions,
  owned: { has(id: number): boolean },
  max = 20,
  perProfile = 5,
): Ranked<T>[] {
  const sorted = rows
    .filter((r) => !owned.has(r.id))
    .map((r) => {
      const w = weatherFit(r, c);
      return { ...r, fit: w.score, reason: w.reason, profile: w.profile, local: counts.get(r.id) ?? 0 };
    })
    .filter((r) => r.fit >= MIN_FIT)
    .sort((a, b) => b.fit * Math.log2(2 + b.local) - a.fit * Math.log2(2 + a.local));
  // Variedad: como mucho `perProfile` de cada tipo mientras haya otros; luego se rellena.
  const picked: Ranked<T>[] = [];
  const per = new Map<Profile, number>();
  for (const r of sorted) {
    if (picked.length >= max) break;
    if ((per.get(r.profile) ?? 0) >= perProfile) continue;
    per.set(r.profile, (per.get(r.profile) ?? 0) + 1);
    picked.push(r);
  }
  for (const r of sorted) {
    if (picked.length >= max) break;
    if (!picked.includes(r)) picked.push(r);
  }
  return picked;
}

/** «Lluvia débil y 14 °C: buen momento para ver anfibios, caracoles…». */
export function weatherHeadline(skyLabel: string, c: Conditions, ranked: readonly { profile: Profile }[]): string {
  const sky = `${skyLabel} y ${Math.round(c.tempC)} °C`;
  const order: Profile[] = [];
  for (const r of ranked) if (!order.includes(r.profile) && r.profile !== 'agua') order.push(r.profile);
  if (order.length === 0) return `${sky}: ahora se ven pocos animales por aquí. Prueba en otro momento del día.`;
  const names = order.slice(0, 3).map((p) => PROFILE_LABEL[p]);
  // «caracoles, babosas y lombrices, y anfibios»: coma delante de la última «y» si algún nombre ya lleva una.
  const and = names.some((n) => n.includes(' y ')) ? ', y ' : ' y ';
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')}${and}${names[names.length - 1]}`;
  return `${sky}: buen momento para ver ${list}.`;
}

/** Meses de «esta época»: el actual y los dos de al lado (1–12). */
export function seasonMonths(now = new Date()): number[] {
  const m = now.getMonth() + 1;
  return [((m + 10) % 12) + 1, m, (m % 12) + 1];
}
