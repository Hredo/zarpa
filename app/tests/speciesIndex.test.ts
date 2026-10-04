import { l2normalize, parseIndex, scoreCandidates } from '@/ai/speciesIndex';

/** Construye un índice binario igual que build_index.py, en pequeño. */
function makeIndex(ids: number[], vecs: number[][], logitScale = 100): ArrayBuffer {
  const dim = vecs[0].length;
  const n = ids.length;
  const buf = new ArrayBuffer(20 + n * 4 + n * 4 + n * dim);
  const view = new DataView(buf);
  view.setUint32(0, 0x5844495a, true);
  view.setUint32(4, 1, true);
  view.setUint32(8, dim, true);
  view.setUint32(12, n, true);
  view.setFloat32(16, logitScale, true);
  let off = 20;
  ids.forEach((id, i) => view.setInt32(off + i * 4, id, true));
  off += n * 4;
  const q = vecs.map((v) => {
    const max = Math.max(...v.map(Math.abs));
    const scale = max / 127;
    return { scale, ints: v.map((x) => Math.round(x / scale)) };
  });
  q.forEach((x, i) => view.setFloat32(off + i * 4, x.scale, true));
  off += n * 4;
  const bytes = new Int8Array(buf, off, n * dim);
  q.forEach((x, i) => x.ints.forEach((v, k) => (bytes[i * dim + k] = v)));
  return buf;
}

describe('índice de especies', () => {
  const ids = [10, 20, 30];
  const vecs = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 0.6, 0.8],
  ];

  it('lee la cabecera y las posiciones', () => {
    const idx = parseIndex(makeIndex(ids, vecs));
    expect(idx.dim).toBe(4);
    expect(idx.count).toBe(3);
    expect(idx.position.get(30)).toBe(2);
  });

  it('puntúa por producto escalar y respeta la lista de candidatos', () => {
    const idx = parseIndex(makeIndex(ids, vecs));
    const q = l2normalize(new Float32Array([0, 0.1, 0.6, 0.8]));
    const all = scoreCandidates(idx, q);
    const best = all.reduce((a, b) => (b.logit > a.logit ? b : a));
    expect(best.id).toBe(30);
    const restricted = scoreCandidates(idx, q, [10, 20]);
    expect(restricted.map((s) => s.id).sort()).toEqual([10, 20]);
  });

  it('rechaza un fichero que no es un índice', () => {
    expect(() => parseIndex(new ArrayBuffer(32))).toThrow();
  });
});
