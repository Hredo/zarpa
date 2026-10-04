import { decide, DEFAULT_THRESHOLDS, softmax, Stabilizer, type Lineage } from '@/ai/decision';

/*
 * La regla «si no estás seguro, no lo afirmes», probada con linajes inventados
 * (no hace falta el modelo: la decisión es aritmética sobre probabilidades).
 */
const L: Record<number, Lineage> = {
  1: { class: 'Aves', order: 'Passeriformes', family: 'Paridae', genus: 'Parus' },
  2: { class: 'Aves', order: 'Passeriformes', family: 'Paridae', genus: 'Parus' },
  3: { class: 'Aves', order: 'Passeriformes', family: 'Paridae', genus: 'Cyanistes' },
  4: { class: 'Aves', order: 'Passeriformes', family: 'Fringillidae', genus: 'Fringilla' },
  5: { class: 'Insecta', order: 'Lepidoptera', family: 'Nymphalidae', genus: 'Vanessa' },
};
const lineage = (id: number) => L[id];

describe('decide', () => {
  it('afirma la especie solo si todos los niveles de encima son seguros', () => {
    const v = decide(
      [
        { id: 1, p: 0.9 },
        { id: 2, p: 0.06 },
        { id: 3, p: 0.04 },
      ],
      lineage,
    );
    expect(v.level).toBe('species');
    expect(v.speciesId).toBe(1);
  });

  it('se queda en el género si la especie no llega al umbral', () => {
    const v = decide(
      [
        { id: 1, p: 0.5 },
        { id: 2, p: 0.45 },
        { id: 3, p: 0.05 },
      ],
      lineage,
    );
    expect(v.level).toBe('genus');
    expect(v.taxon).toBe('Parus');
    expect(v.speciesId).toBeNull();
  });

  it('nunca afirma un nivel inferior si uno superior no es seguro', () => {
    // Clase dudosa (aves 0,6 frente a insectos 0,4): no se nombra nada, aunque
    // dentro de las aves una especie destaque.
    const v = decide(
      [
        { id: 1, p: 0.6 },
        { id: 5, p: 0.4 },
      ],
      lineage,
    );
    expect(v.level).toBeNull();
    expect(v.speciesId).toBeNull();
  });

  it('la escalera sigue siempre la misma rama', () => {
    const v = decide(
      [
        { id: 3, p: 0.3 },
        { id: 1, p: 0.25 },
        { id: 2, p: 0.25 },
        { id: 4, p: 0.2 },
      ],
      lineage,
    );
    // Paridae suma 0,8 > Fringillidae 0,2; dentro, Parus 0,5 > Cyanistes 0,3.
    expect(v.ladder.family?.name).toBe('Paridae');
    expect(v.ladder.genus?.name).toBe('Parus');
    expect(L[Number(v.ladder.species?.name)].genus).toBe('Parus');
  });

  it('los umbrales por defecto exigen más de un 70 % en cada nivel', () => {
    for (const t of Object.values(DEFAULT_THRESHOLDS)) expect(t).toBeGreaterThan(0.7);
  });
});

describe('softmax', () => {
  it('suma 1 y ordena de mayor a menor', () => {
    const p = softmax([
      { id: 1, logit: 10 },
      { id: 2, logit: 12 },
      { id: 3, logit: 8 },
    ]);
    expect(p.map((x) => x.id)).toEqual([2, 1, 3]);
    expect(p.reduce((a, b) => a + b.p, 0)).toBeCloseTo(1, 6);
  });
});

describe('Stabilizer', () => {
  it('fija la especie tras tres lecturas iguales seguidas', () => {
    const s = new Stabilizer(3);
    expect(s.push(7)).toBe(false);
    expect(s.push(7)).toBe(false);
    expect(s.push(7)).toBe(true);
    expect(s.push(8)).toBe(false);
    expect(s.push(null)).toBe(false);
  });
});
