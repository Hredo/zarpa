import { fmtDate } from '@/lib/format';
import { expandUrl } from '@/lib/urls';

describe('URLs compactas del catálogo', () => {
  it('reconstruye Commons e iNaturalist y deja el resto igual', () => {
    expect(expandUrl('c:thumb/e/eb/A.jpg/960px-A.jpg')).toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/A.jpg/960px-A.jpg');
    expect(expandUrl('i:95268822/medium.jpg')).toBe('https://inaturalist-open-data.s3.amazonaws.com/photos/95268822/medium.jpg');
    expect(expandUrl('https://example.org/x.jpg')).toBe('https://example.org/x.jpg');
    expect(expandUrl(null)).toBeNull();
  });
});

describe('fechas de calendario', () => {
  it('un día sin hora no cambia con la zona horaria', () => {
    expect(fmtDate('1955-01-01')).toContain('1955');
    expect(fmtDate('1955-01-01')).not.toContain('1954');
  });
});
