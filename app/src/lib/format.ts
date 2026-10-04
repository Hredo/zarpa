/*
 * Formatos en español de España. `Intl` de Hermes cubre NumberFormat y
 * DateTimeFormat; con es-ES, los números de cuatro cifras van sin separador
 * (1234) y a partir de cinco con punto (96.874), como pide la RAE.
 */
const nf = new Intl.NumberFormat('es-ES');
const nf1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
const df = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
const tf = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });

export const fmtInt = (n: number) => nf.format(n);
export const fmt1 = (n: number) => nf1.format(n);
export const fmtDate = (iso: string) => df.format(parseDate(iso));

/**
 * «1955-01-01» es un día del calendario, no un instante: `new Date()` lo leería
 * como medianoche UTC y en América saldría el 31 de diciembre de 1954.
 */
function parseDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
}
export const fmtTime = (iso: string) => tf.format(new Date(iso));

export function fmtPercent(fraction: number): string {
  return `${nf1.format(fraction * 100)} %`;
}

/** «hace 3 días», «hoy»… para el último avistamiento. */
export function fmtAgo(iso: string, now = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? 'hace un mes' : `hace ${months} meses`;
  const years = Math.floor(days / 365);
  return years === 1 ? 'hace un año' : `hace ${years} años`;
}

/** Coordenadas legibles: 38,3452° N · 0,4810° O. */
export function fmtCoords(lat: number, lng: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const eo = lng >= 0 ? 'E' : 'O';
  const f = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return `${f.format(Math.abs(lat))}° ${ns} · ${f.format(Math.abs(lng))}° ${eo}`;
}
