import { COUNTRY_NAME } from './countries';

/*
 * Cantos y sonidos de iNaturalist: observaciones de grado investigación con
 * sonido propio y licencia Creative Commons. Se muestra siempre autor, licencia
 * y lugar, con enlace a la observación original. Sin sonido, la sección no sale.
 */

export type Sound = {
  /** Id del sonido en iNaturalist. */
  id: number;
  url: string;
  author: string;
  /** Código de licencia de iNaturalist («cc-by-nc»). */
  license: string;
  licenseLabel: string;
  licenseUrl: string;
  /** «España», «Massachusetts, US»… tal como la anotó quien grabó. */
  place: string | null;
  observedOn: string | null;
  obsUrl: string;
};

type RawSound = {
  id: number;
  file_url?: string | null;
  file_content_type?: string | null;
  license_code?: string | null;
  attribution?: string | null;
  hidden?: boolean;
};
export type RawObservation = {
  id: number;
  place_guess?: string | null;
  observed_on?: string | null;
  user?: { login?: string; name?: string | null } | null;
  sounds?: RawSound[];
};

/** Grupos en los que tiene sentido buscar sonidos (evita peticiones inútiles). */
export const SOUND_GROUPS = new Set(['ave', 'anfibio', 'insecto', 'mamifero', 'reptil', 'pez']);

/**
 * Licencias aceptadas: las que permiten cualquier uso, también comercial (como
 * las fotos del catálogo: nada NC, para no atar la app a un uso no comercial).
 * ND vale porque el sonido se reproduce tal cual, sin modificarlo.
 */
const LICENSES: Record<string, { label: string; url: string }> = {
  cc0: { label: 'CC0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  'cc-by': { label: 'CC BY', url: 'https://creativecommons.org/licenses/by/4.0/' },
  'cc-by-sa': { label: 'CC BY-SA', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  'cc-by-nd': { label: 'CC BY-ND', url: 'https://creativecommons.org/licenses/by-nd/4.0/' },
};

/** Para la consulta a iNaturalist (`sound_license`). */
export const SOUND_LICENSES = Object.keys(LICENSES).join(',');

/** Formatos que reproducen iOS y Android (nada de ogg/opus/flac). */
const PLAYABLE_EXT = ['mp3', 'm4a', 'mp4', 'aac', 'wav'];

function extOf(url: string): string {
  const path = url.split('?')[0];
  return path.slice(path.lastIndexOf('.') + 1).toLowerCase();
}

/** «(c) Misha Zitser, some rights reserved (CC BY-NC)» → «Misha Zitser». */
export function authorOf(attribution: string | null | undefined, fallback: string | null | undefined): string | null {
  const m = /^\((?:c|C)\)\s*(.+?),\s*(?:some|no) rights reserved/.exec(attribution ?? '');
  return (m?.[1] ?? fallback ?? '').trim() || null;
}

/**
 * País o lugar legible. iNaturalist guarda el texto libre del observador
 * («Madrid, ES»): si acaba en un código de país conocido se pone su nombre en
 * español; si no, se deja tal cual.
 */
export function placeLabel(guess: string | null | undefined): string | null {
  const g = (guess ?? '').trim();
  if (!g) return null;
  const parts = g.split(',').map((p) => p.trim());
  const last = parts[parts.length - 1];
  const country = /^[A-Z]{2}$/.test(last) ? COUNTRY_NAME[last] : undefined;
  if (country) return parts.length > 1 ? `${parts[0]}, ${country}` : country;
  return g;
}

/** Filtra y ordena: solo licencias libres sin NC, formatos reproducibles, un sonido por autor, ligeros primero. */
export function parseSounds(results: RawObservation[], limit = 3): Sound[] {
  const seen = new Set<string>();
  const out: (Sound & { heavy: boolean })[] = [];
  for (const o of results) {
    for (const s of o.sounds ?? []) {
      const lic = s.license_code ? LICENSES[s.license_code] : undefined;
      if (!lic || !s.file_url || s.hidden) continue;
      const ext = extOf(s.file_url);
      if (!PLAYABLE_EXT.includes(ext)) continue;
      const author = authorOf(s.attribution, o.user?.name || o.user?.login);
      if (!author) continue;
      out.push({
        id: s.id,
        url: s.file_url.replace(/^http:/, 'https:'),
        author,
        license: s.license_code as string,
        licenseLabel: lic.label,
        licenseUrl: lic.url,
        place: placeLabel(o.place_guess),
        observedOn: o.observed_on ?? null,
        obsUrl: `https://www.inaturalist.org/observations/${o.id}`,
        heavy: ext === 'wav',
      });
    }
  }
  // Los WAV pesan decenas de MB: solo si no hay nada más ligero.
  out.sort((a, b) => Number(a.heavy) - Number(b.heavy));
  const unique = out.filter((s) => (seen.has(s.author) ? false : (seen.add(s.author), true)));
  return unique.slice(0, limit).map(({ heavy: _heavy, ...s }) => s);
}

/**
 * Forma de onda ilustrativa y estable: no es el espectro real de la grabación,
 * solo un dibujo (determinista por sonido) para el reproductor. Valores 0,15–1.
 */
export function waveformBars(seed: number, n = 44): number[] {
  let s = (seed >>> 0) || 1;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const out: number[] = [];
  let level = 0.5;
  for (let i = 0; i < n; i++) {
    level = Math.min(1, Math.max(0.15, level + (rnd() - 0.5) * 0.7));
    const edge = Math.min(1, (Math.min(i, n - 1 - i) + 2) / 6);
    out.push(Math.max(0.15, level * edge));
  }
  return out;
}
