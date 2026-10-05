/*
 * Primitivas de movimiento de Zarpa. Todas con `withTiming` y curvas ease-out
 * (nada de muelles que boten) y todas respetan «reducir movimiento».
 *
 *   Appear          entrada escalonada (fundido + 12 px) de tarjetas y bloques
 *   AnimatedNumber  cifra que cuenta hasta su valor en el hilo de UI
 *   FadeImage       expo-image con fundido al cargar y hueco de color
 *   useFill         progreso 0–1 animado para barras y medidores (lo usa Meter)
 *   Press           pulsación con escala 0,97 (vive en components/Press)
 */
export { AnimatedNumber, formatEs } from './AnimatedNumber';
export { Appear } from './Appear';
export { FadeImage } from './FadeImage';
export { useFill } from './useFill';
export { Press } from '../Press';
