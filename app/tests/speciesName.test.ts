import { displayName } from '@/lib/speciesName';

describe('nombre para mostrar', () => {
  it('con nombre común: el común y debajo el científico', () => {
    expect(displayName({ name_es: 'Petirrojo europeo', sci: 'Erithacus rubecula', grp: 'ave' })).toMatchObject({
      name: 'Petirrojo europeo',
      isSci: false,
      sub: 'Erithacus rubecula',
    });
  });

  it('sin nombre común: el científico y debajo su familia en español', () => {
    expect(displayName({ name_es: null, sci: 'Camponotus cruentatus', grp: 'insecto', family_es: 'hormigas' })).toMatchObject({
      name: 'Camponotus cruentatus',
      isSci: true,
      sub: 'Hormigas',
    });
  });

  it('sin familia en español: el grupo', () => {
    expect(displayName({ name_es: null, sci: 'Thanatus vulgaris', grp: 'aracnido', family_es: null }).sub).toBe(displayName({ name_es: null, sci: 'x', grp: 'aracnido' }).group);
  });
});
