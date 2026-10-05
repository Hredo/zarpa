import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountButtons } from '@/components/AccountButtons';
import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { Appear } from '@/components/motion';
import { Press } from '@/components/Press';
import { Section } from '@/components/Section';
import { Txt } from '@/components/Txt';
import { fmtInt } from '@/lib/format';
import { fmtCode, removeFriend, respondFriendRequest, sendFriendRequest, SocialError, useSocial, type Friend, type FriendRequest } from '@/social';
import { useAuth } from '@/store/auth';
import { HIT, radius, space, usePalette } from '@/theme';

/*
 * Amigos. Solo se añade a alguien con su código (no hay buscador de personas:
 * Zarpa la usan también niños). Arriba, tu código para compartirlo; después,
 * añadir un código, las solicitudes que te llegan y tu lista de amigos.
 */
export default function Amigos() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const status = useAuth((s) => s.status);
  const profile = useAuth((s) => s.profile);
  const friends = useSocial((s) => s.friends);
  const requests = useSocial((s) => s.requests);
  const loaded = useSocial((s) => s.loaded);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'danger' | 'brand'; text: string } | null>(null);

  const myCode = profile?.friendCode ?? null;

  const send = async () => {
    if (busy || !code.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await sendFriendRequest(code);
      setCode('');
      setMessage({ tone: 'brand', text: res.status === 'friends' ? '¡Ya sois amigos!' : 'Solicitud enviada. Cuando la acepte, aparecerá en tu lista.' });
    } catch (e) {
      setMessage({ tone: 'danger', text: e instanceof SocialError ? e.message : 'No se pudo enviar.' });
    } finally {
      setBusy(false);
    }
  };

  const shareCode = () => {
    if (!myCode) return;
    void Share.share({ message: `Añádeme en Zarpa con mi código de amigo: ${fmtCode(myCode)}` });
  };

  if (status !== 'signedIn') {
    return (
      <View style={[styles.fill, { backgroundColor: palette.bg, paddingTop: insets.top + space.sm, paddingHorizontal: space.lg }]}>
        <BackButton />
        <Txt variant="title" accessibilityRole="header" style={styles.title}>
          Amigos
        </Txt>
        <Card style={styles.block}>
          <Txt variant="subheading">Comparte tu álbum con tus amigos</Txt>
          <Txt variant="body" tone="soft" style={styles.gap}>
            Para añadir amigos y ver sus álbumes necesitas una cuenta. Es opcional: sin ella Zarpa funciona igual.
          </Txt>
          <View style={styles.gapLg}>
            <AccountButtons />
          </View>
        </Card>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={[styles.fill, { backgroundColor: palette.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xxxl, paddingHorizontal: space.lg }}>
        <BackButton />
        <Appear>
          <Txt variant="title" accessibilityRole="header" style={styles.title}>
            Amigos
          </Txt>
          <Txt variant="body" tone="soft">
            Solo con código: nadie puede buscarte por tu nombre.
          </Txt>
        </Appear>

        <Appear index={1} style={styles.block}>
          <Card tone="tint" tint={palette.brandTint}>
            <Txt variant="label" tone="soft" upper>
              Tu código de amigo
            </Txt>
            <Txt variant="hero" style={styles.code} selectable accessibilityLabel={myCode ? `Tu código: ${myCode.split('').join(' ')}` : 'Preparando tu código'}>
              {myCode ? fmtCode(myCode) : '· · · ·'}
            </Txt>
            <Press
              disabled={!myCode}
              onPress={shareCode}
              accessibilityRole="button"
              accessibilityLabel="Compartir mi código"
              style={[styles.btn, { backgroundColor: palette.strong }]}>
              <Icon name="share" size={20} color={palette.onStrong} />
              <Txt variant="bodyStrong" tone="onStrong">
                Compartir mi código
              </Txt>
            </Press>
          </Card>
        </Appear>

        <Section title="Añadir un amigo" icon="plus" accent={palette.leaf} tint={palette.leafTint}>
          <View style={styles.row}>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={9}
              placeholder="ABCD EFGH"
              placeholderTextColor={palette.inkFaint}
              accessibilityLabel="Código de amigo"
              returnKeyType="send"
              onSubmitEditing={send}
              style={[styles.input, { color: palette.ink, backgroundColor: palette.surface, borderColor: palette.lineStrong }]}
            />
            <Press
              disabled={busy || code.replace(/\s/g, '').length < 8}
              onPress={send}
              haptic
              accessibilityRole="button"
              accessibilityLabel="Enviar solicitud"
              style={[styles.send, { backgroundColor: palette.brand }]}>
              <Txt variant="bodyStrong" tone="onBrand">
                {busy ? 'Enviando…' : 'Enviar'}
              </Txt>
            </Press>
          </View>
          {message ? (
            <Txt variant="small" tone={message.tone} style={styles.gap} accessibilityLiveRegion="polite">
              {message.text}
            </Txt>
          ) : null}
        </Section>

        {requests.length > 0 ? (
          <Section title="Te quieren añadir" icon="heart" accent={palette.red} tint={palette.redTint}>
            <Card padding={0}>
              {requests.map((r, i) => (
                <RequestRow key={r.uid} request={r} first={i === 0} />
              ))}
            </Card>
          </Section>
        ) : null}

        <Section title={friends.length ? `Tus amigos (${fmtInt(friends.length)})` : 'Tus amigos'} icon="eye" accent={palette.sky} tint={palette.skyTint}>
          {friends.length === 0 ? (
            <Card tone="outline">
              <Txt variant="body" tone="soft">
                {loaded ? 'Aún no tienes amigos en Zarpa. Comparte tu código o pide el suyo a quien salga contigo al campo.' : 'Cargando…'}
              </Txt>
            </Card>
          ) : (
            <Card padding={0}>
              {friends.map((f, i) => (
                <FriendRow key={f.uid} friend={f} first={i === 0} />
              ))}
            </Card>
          )}
        </Section>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function BackButton() {
  const palette = usePalette();
  return (
    <Press onPress={() => router.back()} accessibilityLabel="Volver" style={[styles.round, { backgroundColor: palette.surface }]}>
      <Icon name="back" />
    </Press>
  );
}

function RequestRow({ request, first }: { request: FriendRequest; first: boolean }) {
  const palette = usePalette();
  const [busy, setBusy] = useState(false);
  const respond = async (accept: boolean) => {
    setBusy(true);
    try {
      await respondFriendRequest(request.uid, accept);
    } catch (e) {
      Alert.alert('No se pudo completar', e instanceof SocialError ? e.message : 'Inténtalo de nuevo.');
      setBusy(false);
    }
  };
  return (
    <View style={[styles.item, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line }]}>
      <Avatar uri={request.photoURL} name={request.alias} size={44} />
      <Txt variant="bodyStrong" numberOfLines={1} style={styles.fill}>
        {request.alias}
      </Txt>
      <Press
        disabled={busy}
        onPress={() => void respond(false)}
        accessibilityRole="button"
        accessibilityLabel={`Rechazar a ${request.alias}`}
        style={[styles.small, { backgroundColor: palette.surfaceAlt }]}>
        <Icon name="close" size={18} color={palette.inkSoft} />
      </Press>
      <Press
        disabled={busy}
        onPress={() => void respond(true)}
        haptic
        accessibilityRole="button"
        accessibilityLabel={`Aceptar a ${request.alias}`}
        style={[styles.small, { backgroundColor: palette.leaf }]}>
        <Icon name="check" size={18} color={palette.onStrong} />
      </Press>
    </View>
  );
}

function FriendRow({ friend, first }: { friend: Friend; first: boolean }) {
  const palette = usePalette();
  const confirmRemove = () =>
    Alert.alert('Quitar amigo', `${friend.alias} dejará de ver tu álbum y tú el suyo.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: () => void removeFriend(friend.uid).catch((e) => Alert.alert('No se pudo quitar', e instanceof SocialError ? e.message : 'Inténtalo de nuevo.')),
      },
    ]);
  return (
    <Press
      onPress={() => router.push({ pathname: '/amigo/[uid]', params: { uid: friend.uid, alias: friend.alias } })}
      onLongPress={confirmRemove}
      accessibilityRole="button"
      accessibilityLabel={`${friend.alias}. ${friend.shareAlbum ? 'Ver su álbum' : 'No comparte su álbum'}`}
      accessibilityHint="Mantén pulsado para quitarle de tus amigos"
      style={[styles.item, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line }]}>
      <Avatar uri={friend.photoURL} name={friend.alias} size={44} />
      <View style={styles.fill}>
        <Txt variant="bodyStrong" numberOfLines={1}>
          {friend.alias}
        </Txt>
        <Txt variant="small" tone="soft">
          {friend.shareAlbum ? (friend.species != null ? `${fmtInt(friend.species)} especies en su álbum` : 'Comparte su álbum') : 'No comparte su álbum'}
        </Txt>
      </View>
      <Icon name="chevronRight" size={20} color={palette.inkFaint} />
    </Press>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  round: { width: HIT, height: HIT, borderRadius: HIT / 2, alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: space.lg },
  block: { marginTop: space.xl },
  gap: { marginTop: space.sm },
  gapLg: { marginTop: space.lg },
  code: { marginTop: space.xs, letterSpacing: 2 },
  btn: { flexDirection: 'row', gap: space.sm, minHeight: HIT, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: space.lg },
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  input: { flex: 1, height: HIT + 4, borderRadius: radius.md, borderWidth: 1.5, paddingHorizontal: space.md, fontSize: 18, letterSpacing: 2 },
  send: { height: HIT + 4, borderRadius: radius.pill, paddingHorizontal: space.lg, alignItems: 'center', justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, minHeight: HIT },
  small: { width: HIT, height: HIT, borderRadius: HIT / 2, alignItems: 'center', justifyContent: 'center' },
});
