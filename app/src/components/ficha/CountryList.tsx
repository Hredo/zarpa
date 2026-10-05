import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { COUNTRIES, COUNTRY_NAME, REGION_LABEL, type Region } from '@/lib/countries';
import { fmtInt } from '@/lib/format';
import { MEANS_LABEL } from '@/lib/groups';
import { space, usePalette, type GroupColor } from '@/theme';

import { Meter } from '../Meter';
import { Press } from '../Press';
import { Txt } from '../Txt';
import { flagOf } from './flags';
import { Tag } from './Tag';

export type CountryRow = { cc: string; obs: number; means: string | null };

const REGION_OF: Record<string, Region | null> = Object.fromEntries(COUNTRIES.map((c) => [c.cc, c.region]));

/** Regiones del mundo con presencia, de más a menos países. */
export function regionCounts(rows: CountryRow[]): { region: Region; n: number }[] {
  const by = new Map<Region, number>();
  for (const r of rows) {
    const reg = REGION_OF[r.cc];
    if (reg) by.set(reg, (by.get(reg) ?? 0) + 1);
  }
  return [...by.entries()].map(([region, n]) => ({ region, n })).sort((a, b) => b.n - a.n);
}

/**
 * Países con bandera y barra proporcional (escala logarítmica: unos pocos
 * países concentran casi todo). Las barras se llenan en cadena.
 */
export function CountryList({ rows, group, initial = 8 }: { rows: CountryRow[]; group: GroupColor; initial?: number }) {
  const palette = usePalette();
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, initial);
  const maxObs = rows[0]?.obs ?? 1;
  const regions = regionCounts(rows);

  return (
    <View>
      {regions.length > 0 && (
        <View style={styles.regions}>
          {regions.map((r) => (
            <Tag key={r.region} label={`${REGION_LABEL[r.region]} · ${r.n}`} icon="globe" color={group.color} tint={group.tint} ink={group.ink} />
          ))}
        </View>
      )}
      {shown.map((c, i) => {
        const value = Math.max(0.03, Math.log10(c.obs + 1) / Math.log10(maxObs + 1));
        return (
          <View key={c.cc} style={styles.row}>
            <Txt variant="subheading" style={styles.flag}>
              {flagOf(c.cc)}
            </Txt>
            <View style={styles.main}>
              <View style={styles.head}>
                <Txt variant="bodyStrong" numberOfLines={1} style={styles.name}>
                  {COUNTRY_NAME[c.cc] ?? c.cc}
                </Txt>
                {c.means ? (
                  <Txt variant="small" tone={c.means === 'introduced' ? 'red' : 'soft'}>
                    {MEANS_LABEL[c.means]}
                  </Txt>
                ) : null}
                <Txt variant="data" tone="faint">
                  {fmtInt(c.obs)}
                </Txt>
              </View>
              <Meter value={value} color={c.means === 'introduced' ? palette.red : group.color} height={6} delay={Math.min(i, 8) * 45} />
            </View>
          </View>
        );
      })}
      {rows.length > initial && (
        <Press onPress={() => setAll((v) => !v)} style={styles.more}>
          <Txt variant="label" color={group.ink}>
            {all ? 'Ver menos' : `Ver los ${rows.length} países`}
          </Txt>
        </Press>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  regions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48, paddingVertical: space.xs },
  flag: { width: 32, textAlign: 'center' },
  main: { flex: 1, gap: space.xs },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  name: { flex: 1 },
  more: { minHeight: 48, justifyContent: 'center' },
});
