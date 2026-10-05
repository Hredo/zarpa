/*
 * Fase del día a partir de la hora local del móvil. Es una aproximación por
 * reloj (no usa la hora real del orto y el ocaso, que cambian con la latitud y
 * la estación): sirve para decir «al amanecer» o «de noche» en el diario y para
 * ajustar el horario de la excursión, no para astronomía.
 */
export type DayPhase = 'noche' | 'amanecer' | 'manana' | 'mediodia' | 'tarde' | 'atardecer';

export const PHASES: { code: DayPhase; label: string; range: string; from: number; to: number }[] = [
  { code: 'amanecer', label: 'Amanecer', range: '5 – 8 h', from: 5, to: 8 },
  { code: 'manana', label: 'Mañana', range: '8 – 12 h', from: 8, to: 12 },
  { code: 'mediodia', label: 'Mediodía', range: '12 – 16 h', from: 12, to: 16 },
  { code: 'tarde', label: 'Tarde', range: '16 – 19 h', from: 16, to: 19 },
  { code: 'atardecer', label: 'Atardecer', range: '19 – 21 h', from: 19, to: 21 },
  { code: 'noche', label: 'Noche', range: '21 – 5 h', from: 21, to: 5 },
];

export function dayPhaseOfHour(hour: number): DayPhase {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h >= 5 && h < 8) return 'amanecer';
  if (h >= 8 && h < 12) return 'manana';
  if (h >= 12 && h < 16) return 'mediodia';
  if (h >= 16 && h < 19) return 'tarde';
  if (h >= 19 && h < 21) return 'atardecer';
  return 'noche';
}

export function dayPhase(date: Date | string = new Date()): DayPhase {
  const d = typeof date === 'string' ? new Date(date) : date;
  return dayPhaseOfHour(d.getHours());
}

export function phaseLabel(phase: string | null | undefined): string {
  return PHASES.find((p) => p.code === phase)?.label ?? '';
}

/** `true` si la fase es de luz diurna (para elegir sol o luna). */
export function isDaylight(phase: DayPhase): boolean {
  return phase !== 'noche';
}
