import { crashText, exitAsCrash, pickCrash, type Crash, type ExitInfo } from '@/lib/crashReport';

const exit = (over: Partial<ExitInfo> = {}): ExitInfo => ({ reason: 5, description: '', at: 1000, importance: 100, trace: '', ...over });

describe('registro de cierres', () => {
  it('un fallo nativo con la app a la vista se cuenta, con su volcado', () => {
    const c = exitAsCrash(exit({ trace: 'SIGSEGV\nlibexecutorch.so' }));
    expect(c).toMatchObject({ kind: 'exit', at: 1000, stack: 'SIGSEGV\nlibexecutorch.so' });
    expect(c?.message).toContain('fallo nativo');
  });

  it('no se cuentan las salidas normales ni las de la app en segundo plano', () => {
    expect(exitAsCrash(exit({ reason: 10 }))).toBeNull(); // la cerró el usuario
    expect(exitAsCrash(exit({ reason: 1 }))).toBeNull(); // salió ella misma
    expect(exitAsCrash(exit({ reason: 3, importance: 400 }))).toBeNull(); // memoria, en segundo plano
    expect(exitAsCrash(null)).toBeNull();
  });

  it('prefiere el error de JS (dice qué falló en el código) y nunca repite uno ya visto', () => {
    const js: Crash = { kind: 'js', message: 'Error: [Worklets] Tried to synchronously call a Remote Function', at: 2000 };
    const native: Crash = { kind: 'native', message: 'JavascriptException', at: 2001 };
    const sys = exitAsCrash(exit({ reason: 4, at: 2002 }));
    expect(pickCrash(js, native, sys, 0)).toBe(js);
    expect(pickCrash(null, native, sys, 0)).toBe(native);
    expect(pickCrash(null, null, sys, 0)).toBe(sys);
    expect(pickCrash(js, native, sys, 5000)).toBeNull();
  });

  it('el texto para compartir lleva versión, fecha, tipo, mensaje y pila', () => {
    const t = crashText({ kind: 'js', message: 'Error: boom', stack: 'at avistar.tsx:177', at: Date.UTC(2026, 9, 7, 10) }, '0.1.0 (1)');
    expect(t).toBe('Zarpa 0.1.0 (1) · 2026-10-07T10:00:00.000Z · js\nError: boom\n\nat avistar.tsx:177');
  });
});
