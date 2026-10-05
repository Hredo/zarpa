import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { listThumb } from '@/components/Cromo';
import { Icon } from '@/components/Icon';
import { Appear } from '@/components/motion';
import { FadeImage } from '@/components/motion/FadeImage';
import { Press } from '@/components/Press';
import { Txt } from '@/components/Txt';
import { getSpeciesByIds, type SpeciesRow } from '@/db/catalog';
import { fmtInt } from '@/lib/format';
import { displayName } from '@/lib/speciesName';
import { compareAlbums, fmtMonth, friendStickerUrl, loadFriendAlbum, useSocial, type FriendAlbumEntry } from '@/social';
import { useJournal } from '@/store/journal';
import { groupColor, HIT, radius, space, usePalette } from '@/theme';

type Item = FriendAlbumEntry & { sp: SpeciesRow | undefined };

/*
 * Álbum de un amigo: sus especies con su pegatina (o la foto del catálogo si
 * no hay), cuántas tenéis en común y cuáles te faltan. Solo se ve si sois
 * amigos y lo comparte (lo garantizan las reglas, no esta pantalla).
 */
export default function AlbumAmigo() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { uid, alias: aliasParam } = useLocalSearchParams<{ uid: string; alias?: string }>();
  const friend = useSocial((s) => s.friends.find((f) => f.uid === uid));
  const caught = useJournal((s) => s.caught);
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [onlyMissing, setOnlyMissing] = useState(false);

  const alias = friend?.alias ?? aliasParam ?? 'Tu amigo';
  const sharing = friend?.shareAlbum ?? true;

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    loadFriendAlbum(uid)
      .then(async (entries) => {
        const rows = await getSpeciesByIds(entries.map((e) => e.species_id));
        const byId = new Map(rows.map((r) => [r.id, r]));
        if (alive) setItems(entries.map((e) => ({ ...e, sp: byId.get(e.species_id) })));
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [uid, sharing]);

  const { common, missing } = useMemo(() => compareAlbums(new Set(caught.keys()), (items ?? []).map((i) => i.species_id)), [caught, items]);
  const missingSet = useMemo(() => new Set(missing), [missing]);
  const shown = onlyMissing ? (items ?? []).filter((i) => missingSet.has(i.species_id)) : (items ?? []);

  const cols = 3;
  const gap = space.md;
  const cell = Math.floor((width - space.lg * 2 - gap * (cols - 1)) / cols);

  const header = (
    <View>
      <Press onPress={() => router.back()} accessibilityLabel="Volver" style={[styles.round, { backgroundColor: palette.surface }]}>
        <Icon name="back" />
      </Press>
      <Appear>
        <View style={styles.identity}>
          <Avatar uri={friend?.photoURL} name={alias} size={80} />
          <Txt variant="title" accessibilityRole="header" numberOfLines={1}>
            {alias}
          </Txt>
          {items ? (
            <Txt variant="body" tone="soft" align="center">
              {`${fmtInt(items.length)} ${items.length === 1 ? 'especie' : 'especies'} · ${fmtInt(common)} en común · te ${missing.length === 1 ? 'falta' : 'faltan'} ${fmtInt(missing.length)}`}
            </Txt>
          ) : null}
        </View>
      </Appear>
      {items && items.length > 0 ? (
        <View style={styles.chips}>
          <Chip label="Todas" count={fmtInt(items.length)} selected={!onlyMissing} onPress={() => setOnlyMissing(false)} />
          <Chip label="Te faltan" count={fmtInt(missing.length)} selected={onlyMissing} onPress={() => setOnlyMissing(true)} />
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.fill, { backgroundColor: palette.bg }]}>
      <FlatList
        data={shown}
        keyExtractor={(i) => String(i.species_id)}
        numColumns={cols}
        columnWrapperStyle={{ gap }}
        contentContainerStyle={{ paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xxxl, paddingHorizontal: space.lg, gap }}
        ListHeaderComponent={header}
        ListEmptyComponent={
          failed || !sharing ? (
            <Card tone="outline" style={styles.empty}>
              <Txt variant="body" tone="soft">
                {sharing ? 'No se pudo cargar su álbum. Comprueba tu conexión.' : `${alias} no comparte su álbum por ahora.`}
              </Txt>
            </Card>
          ) : items === null ? (
            <ActivityIndicator color={palette.brand} style={styles.empty} />
          ) : (
            <Card tone="outline" style={styles.empty}>
              <Txt variant="body" tone="soft">
                {onlyMissing ? '¡Tienes todas las especies de su álbum!' : 'Su álbum aún está vacío.'}
              </Txt>
            </Card>
          )
        }
        renderItem={({ item }) => <Tile item={item} friendUid={uid} size={cell} mine={caught.has(item.species_id)} />}
      />
    </View>
  );
}

function Tile({ item, friendUid, size, mine }: { item: Item; friendUid: string; size: number; mine: boolean }) {
  const palette = usePalette();
  const g = groupColor(item.sp?.grp);
  const name = item.sp ? displayName(item.sp) : null;
  const [sticker, setSticker] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void friendStickerUrl(friendUid, item).then((u) => alive && setSticker(u));
    return () => {
      alive = false;
    };
  }, [friendUid, item]);
  const fallback = item.sp ? listThumb(item.sp.img) : null;
  return (
    <Press
      onPress={() => router.push({ pathname: '/especie/[id]', params: { id: String(item.species_id) } })}
      accessibilityRole="button"
      accessibilityLabel={`${name?.name ?? 'Especie'}, visto ${item.count} ${item.count === 1 ? 'vez' : 'veces'}${mine ? ', también en tu cuaderno' : ''}`}
      style={{ width: size }}>
      <View style={[styles.back, { width: size, height: size, backgroundColor: g.tint }]}>
        {sticker ? (
          <FadeImage source={sticker} style={styles.sticker} contentFit="contain" placeholderColor="transparent" />
        ) : fallback ? (
          <FadeImage source={fallback} style={StyleSheet.absoluteFill} contentFit="cover" placeholderColor={g.tint} />
        ) : (
          <Icon name="image" size={28} color={g.ink} />
        )}
        {mine ? (
          <View style={[styles.mine, { backgroundColor: palette.leaf }]} accessible={false}>
            <Icon name="check" size={14} color={palette.onStrong} />
          </View>
        ) : null}
      </View>
      <Txt variant="label" numberOfLines={1} style={[styles.name, name?.isSci ? styles.italic : null]}>
        {name?.name ?? `Especie ${item.species_id}`}
      </Txt>
      <Txt variant="small" tone="soft" numberOfLines={1}>
        {item.count > 1 ? `${item.count} veces · ` : ''}
        {fmtMonth(item.last)}
      </Txt>
    </Press>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  round: { width: HIT, height: HIT, borderRadius: HIT / 2, alignItems: 'center', justifyContent: 'center' },
  identity: { alignItems: 'center', gap: space.xs, marginTop: space.md, marginBottom: space.lg },
  chips: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  empty: { marginTop: space.lg },
  back: { borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sticker: { width: '86%', height: '86%' },
  mine: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  name: { marginTop: space.xs },
  italic: { fontStyle: 'italic' },
});
