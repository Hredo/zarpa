import { cameraErrorText, extraLenses, safe, zoomLabel, zoomPresets, zoomRange, type CamInfo } from '@/ai/cameraPick';

const cam = (over: Partial<CamInfo> & { id: string }): CamInfo => ({
  position: 'back',
  type: 'wide-angle',
  minZoom: 1,
  maxZoom: 8,
  physicalDevices: [],
  ...over,
});

describe('objetivos de la cámara', () => {
  it('la cámara lógica ya cubre ultra gran angular y tele: no se ofrece nada aparte', () => {
    const main = cam({ id: '0', type: 'triple', minZoom: 0.6, maxZoom: 100, physicalDevices: [{}, {}, {}] });
    const ultra = cam({ id: '2', type: 'ultra-wide-angle' });
    expect(extraLenses(main, [main, ultra])).toEqual([]);
  });

  it('ofrece el ultra gran angular y el tele que el fabricante publica sueltos', () => {
    const main = cam({ id: '0', maxZoom: 10 });
    const ultra = cam({ id: '2', type: 'ultra-wide-angle', maxZoom: 4 });
    const tele = cam({ id: '3', type: 'telephoto', maxZoom: 6 });
    const front = cam({ id: '1', position: 'front', type: 'ultra-wide-angle' });
    expect(extraLenses(main, [main, ultra, tele, front])).toEqual([
      { id: '2', kind: 'ultra' },
      { id: '3', kind: 'tele' },
    ]);
  });

  it('una cámara cuyo tipo lanza una excepción nativa no tumba nada: se ignora', () => {
    const main = cam({ id: '0' });
    const broken = cam({ id: '5' });
    Object.defineProperty(broken, 'type', {
      get() {
        throw new Error('intrinsicZoomRatio no disponible');
      },
    });
    expect(extraLenses(main, [main, broken])).toEqual([]);
    expect(safe(() => broken.type, 'unknown')).toBe('unknown');
  });

  it('no se fía de un zoom 0 (la cámara aún no lo ha dicho)', () => {
    expect(zoomRange({ minZoom: 0, maxZoom: 0 })).toEqual({ min: 1, max: 1 });
    expect(zoomRange({ minZoom: 0.5, maxZoom: 30 })).toEqual({ min: 0.5, max: 30 });
  });
});

describe('atajos de zoom', () => {
  it('cubre del ultra gran angular al máximo real del móvil', () => {
    expect(zoomPresets(0.6, 100, 1)).toEqual([0.6, 1, 2, 5, 10, 100]);
  });

  it('en iOS usa los cambios de objetivo y el 1× es el gran angular principal', () => {
    // Triple cámara: zoom 1 = ultra (0,5×), 2 = principal, 6 = tele 3×.
    expect(zoomPresets(1, 30, 2, [2, 6])).toEqual([0.5, 1, 2, 3, 10, 15]);
  });

  it('sin ultra gran angular empieza en 1×', () => {
    expect(zoomPresets(1, 8, 1)).toEqual([1, 2, 5, 8]);
  });

  it('escribe el aumento con coma decimal', () => {
    expect(zoomLabel(0.6)).toBe('0,6×');
    expect(zoomLabel(2.54)).toBe('2,5×');
    expect(zoomLabel(30.4)).toBe('30×');
  });
});

describe('avisos de error de la cámara', () => {
  const stack = '\n\tat com.margelo.nitro.core.Promise$Companion$async$1.invokeSuspend(Promise.kt:148)\n\tat kotlinx.coroutines.DispatchedTask.run(DispatchedTask.kt:100)';

  it('no enseña los zoom cancelados de CameraX (no son fallos)', () => {
    expect(cameraErrorText(`androidx.camera.core.CameraControl$OperationCanceledException: Camera is not active.${stack}`)).toBeNull();
    expect(cameraErrorText(`androidx.camera.core.CameraControl$OperationCanceledException: Cancelled by another setZoomRatio()${stack}`)).toBeNull();
    expect(cameraErrorText('')).toBeNull();
    expect(cameraErrorText(undefined)).toBeNull();
  });

  it('se queda con la primera línea, sin el tipo ni la pila de Java', () => {
    expect(cameraErrorText(`java.lang.Error: \`zoom\` is out of range! Expected value within 0.6...10.0, received 12.0.${stack}`)).toBe(
      '`zoom` is out of range! Expected value within 0.6...10.0, received 12.0.',
    );
    expect(cameraErrorText('Error: Camera is in use by another app')).toBe('Camera is in use by another app');
  });

  it('acorta los mensajes larguísimos', () => {
    const t = cameraErrorText(`java.lang.IllegalStateException: ${'x'.repeat(400)}`);
    expect(t?.length).toBe(158);
    expect(t?.endsWith('…')).toBe(true);
  });
});
