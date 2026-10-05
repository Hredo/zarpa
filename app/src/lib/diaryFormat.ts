/** «1:05» para una duración en milisegundos. */
export function fmtClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** «21,4 °C» (una cifra decimal, coma española). */
export function fmtTemp(c: number): string {
  return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(Math.round(c))} °C`;
}
