import { useState } from 'react';
import { View } from 'react-native';

import { space } from '@/theme';

import { Icon } from '../Icon';
import { Press } from '../Press';
import { Txt } from '../Txt';

/**
 * Texto largo plegado: el primer párrafo siempre y el resto tras «Leer más».
 * Sin animación de altura (cambiaría el diseño entero): el texto aparece.
 */
export function ReadMore({ paragraphs, accent }: { paragraphs: string[]; accent?: string }) {
  const [open, setOpen] = useState(false);
  const [first, ...rest] = paragraphs;
  return (
    <View style={{ gap: space.md }}>
      <Txt variant="body">{first}</Txt>
      {open
        ? rest.map((p, i) => (
            <Txt key={i} variant="body">
              {p}
            </Txt>
          ))
        : null}
      {rest.length > 0 ? (
        <Press
          onPress={() => setOpen((v) => !v)}
          accessibilityRole="button"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 48 }}>
          <Txt variant="label" color={accent}>
            {open ? 'Leer menos' : 'Leer más'}
          </Txt>
          <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
            <Icon name="chevronDown" size={18} color={accent} />
          </View>
        </Press>
      ) : null}
    </View>
  );
}
