import { fileExt, fromRemote, planSync, remoteIsNewer, rowHash, stickerExtOf, storagePath, toRemote, voiceExtOf, voiceKey, voiceUploaded, type ItemState } from '@/sync/schema';

const row = { id: 'a1', species_id: 5, created_at: '2026-10-05T10:00:00Z', method: 'ia', verified: 0, photo: 'file:///x.jpg', sticker: 'file:///s.png', note: null, weather: 'sol' };

describe('mapeo del cuaderno a la nube', () => {
  it('no sube rutas locales ni el id, y marca la foto', () => {
    const doc = toRemote(row, true);
    expect(doc).not.toHaveProperty('photo');
    expect(doc).not.toHaveProperty('sticker');
    expect(doc).not.toHaveProperty('id');
    expect(doc.weather).toBe('sol');
    expect(doc.has_photo).toBe(true);
  });

  it('al bajar ignora columnas que este móvil no conoce', () => {
    const local = fromRemote({ species_id: 5, nueva_columna: 1, has_photo: true, photo: 'x' }, ['id', 'species_id', 'photo']);
    expect(local).toEqual({ species_id: 5 });
  });

  it('el hash cambia con los datos, no con las rutas locales', () => {
    expect(rowHash(row)).toBe(rowHash({ ...row, photo: 'file:///otra.jpg' }));
    expect(rowHash(row)).not.toBe(rowHash({ ...row, note: 'nota' }));
  });
});

describe('plan de sincronización', () => {
  const synced = (id: string, hash: string): ItemState => ({ id, hash, photo_ok: 1, status: 'synced', attempts: 0 });

  it('sube lo nuevo y lo cambiado, no lo que está al día', () => {
    const plan = planSync([{ id: 'a', hash: '1' }, { id: 'b', hash: '2' }, { id: 'c', hash: '3' }], [synced('a', '1'), synced('b', 'viejo')]);
    expect(plan.push).toEqual(['b', 'c']);
    expect(plan.remove).toEqual([]);
  });

  it('borra en la nube lo que se borró en local y ya estaba subido', () => {
    expect(planSync([], [synced('z', '9')]).remove).toEqual(['z']);
  });

  it('no borra nada que nunca se subió', () => {
    const pending: ItemState = { id: 'p', hash: null, photo_ok: 0, status: 'pending', attempts: 0 };
    expect(planSync([], [pending]).remove).toEqual([]);
  });

  it('deja de reintentar tras demasiados fallos salvo orden manual', () => {
    const bad: ItemState = { id: 'e', hash: null, photo_ok: 0, status: 'error', attempts: 5 };
    expect(planSync([{ id: 'e', hash: '1' }], [bad]).push).toEqual([]);
    expect(planSync([{ id: 'e', hash: '1' }], [bad], { retryExhausted: true }).push).toEqual(['e']);
  });
});

describe('pegatinas y notas de voz', () => {
  const synced = (id: string, hash: string, extra: Partial<ItemState> = {}): ItemState => ({
    id,
    hash,
    photo_ok: 1,
    sticker_ok: 1,
    voice_path: null,
    status: 'synced',
    attempts: 0,
    ...extra,
  });

  it('no sube la ruta de la nota de voz, pero sí su duración y qué ficheros hay', () => {
    const doc = toRemote({ ...row, voice_note: 'notas-voz/a1-1.m4a', voice_ms: 4200 }, { photo: true, sticker: true, voice: true });
    expect(doc).not.toHaveProperty('voice_note');
    expect(doc.voice_ms).toBe(4200);
    expect(doc.has_sticker).toBe(true);
    expect(doc.sticker_ext).toBe('png');
    expect(doc.has_voice).toBe(true);
    expect(doc.voice_ext).toBe('m4a');
  });

  it('sin ficheros en la nube no anuncia extensiones', () => {
    const doc = toRemote(row, false);
    expect(doc.sticker_ext).toBeNull();
    expect(doc.voice_ext).toBeNull();
  });

  it('vuelve a subir si se grabó, cambió o quitó la nota de voz', () => {
    const st = [synced('a', '1', { voice_path: 'notas-voz/a-1.m4a' })];
    expect(planSync([{ id: 'a', hash: '1', voice: 'notas-voz/a-1.m4a' }], st).push).toEqual([]);
    expect(planSync([{ id: 'a', hash: '1', voice: 'notas-voz/a-2.m4a' }], st).push).toEqual(['a']);
    expect(planSync([{ id: 'a', hash: '1', voice: null }], st).push).toEqual(['a']);
  });

  it('una nota que faltaba en el móvil no se reintenta en cada pasada', () => {
    const st = [synced('a', '1', { voice_path: '!notas-voz/a-1.m4a' })];
    expect(planSync([{ id: 'a', hash: '1', voice: 'notas-voz/a-1.m4a' }], st).push).toEqual([]);
    expect(voiceUploaded('!notas-voz/a-1.m4a')).toBe(false);
    expect(voiceKey('!notas-voz/a-1.m4a')).toBe('notas-voz/a-1.m4a');
  });

  it('sube la pegatina pendiente de instalaciones anteriores', () => {
    expect(planSync([{ id: 'a', hash: '1' }], [synced('a', '1', { sticker_ok: 0 })]).push).toEqual(['a']);
  });

  it('extensiones y rutas de Storage', () => {
    expect(fileExt('file:///x/y/Z.PNG')).toBe('png');
    expect(fileExt('sin-extension')).toBeNull();
    expect(stickerExtOf('file:///a.png')).toBe('png');
    expect(stickerExtOf('file:///a.jpeg')).toBe('jpg');
    expect(voiceExtOf('notas-voz/a.caf')).toBe('caf');
    expect(voiceExtOf('notas-voz/a.wav')).toBe('m4a');
    expect(storagePath.photo('u', 'a')).toBe('users/u/sightings/a.jpg');
    expect(storagePath.sticker('u', 'a', 'png')).toBe('users/u/sightings/a.sticker.png');
    expect(storagePath.voice('u', 'a', 'm4a')).toBe('users/u/sightings/a.voice.m4a');
  });

  it('gana la edición más reciente', () => {
    expect(remoteIsNewer('2026-10-05T10:00:00Z', '2026-10-05T11:00:00Z')).toBe(true);
    expect(remoteIsNewer('2026-10-05T11:00:00Z', '2026-10-05T10:00:00Z')).toBe(false);
    expect(remoteIsNewer('2026-10-05T10:00:00Z', '2026-10-05T10:00:00Z')).toBe(false);
    expect(remoteIsNewer(null, '2026-10-05T10:00:00Z')).toBe(true);
    expect(remoteIsNewer('2026-10-05T10:00:00Z', undefined)).toBe(false);
  });
});
