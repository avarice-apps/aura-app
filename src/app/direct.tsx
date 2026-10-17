import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, Switch, Linking, Alert, ActivityIndicator, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Screen, Icon, ICON } from '@/ui';
import { font, useTheme } from '@/theme';
import { Display, Kicker, Pill, RowLink, Hair } from '@/components/Kit';
import { directStatus, directLink, directUnlink, directHistory, directClearHistory, type DirectStatus } from '@/lib/api';
import { syncDirectContext } from '@/lib/direct';
import { useTier } from '@/lib/plan';

/**
 * Poise Direct (Kleos Black): text Poise from Messages. You link your number by texting a one-time code from it
 * (Kleos never takes a typed number), choose what Poise may know, and can read or delete the thread here.
 */
export default function Direct() {
  const t = useTheme();
  const tier = useTier();
  const [st, setSt] = useState<DirectStatus | null | undefined>(undefined);
  const [code, setCode] = useState<{ code: string; text: string; to: string; sms: string | null } | null>(null);
  const [thread, setThread] = useState<{ role: 'user' | 'poise'; text: string; created: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let alive = true;
    directStatus().then((x) => alive && setSt(x));
    directHistory().then((h) => alive && setThread(h)).catch(() => {});
    return () => {
      alive = false;
      if (poll.current) clearInterval(poll.current);
    };
  }, []);

  async function getCode() {
    setBusy(true);
    setErr('');
    try {
      const c = await directLink();
      setCode(c);
      // Watch for the link to land (they text the code, the server binds the number).
      if (poll.current) clearInterval(poll.current);
      const started = Date.now();
      poll.current = setInterval(async () => {
        const x = await directStatus();
        if (x?.linked || Date.now() - started > 10 * 60 * 1000) {
          if (poll.current) clearInterval(poll.current);
          if (x) setSt(x);
          if (x?.linked) setCode(null);
        }
      }, 4000);
    } catch (e: any) {
      if (e?.name !== 'PlanError') setErr(e?.message ?? 'Couldn’t get a code.');
    } finally {
      setBusy(false);
    }
  }

  async function allow(k: 'occasion' | 'style', v: boolean) {
    if (!st) return;
    const next = { ...st.allow, [k]: v };
    setSt({ ...st, allow: next });
    await syncDirectContext(next);
  }

  function unlink() {
    Alert.alert('Unlink your number?', 'Poise will stop replying to it. You can link it again any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unlink', style: 'destructive', onPress: async () => setSt(await directUnlink()) },
    ]);
  }

  function clearThread() {
    Alert.alert('Delete the thread?', 'The messages kept for Poise Direct are deleted from our server. Your phone’s Messages app keeps its own copy.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await directClearHistory(); setThread([]); } },
    ]);
  }

  const channelName = st?.channel === 'imessage' ? 'iMessage' : 'text message';

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ paddingHorizontal: 22, paddingTop: 8 }}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={ICON.back} size={16} color={t.ink} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(400)} style={{ gap: 10 }}>
          <Kicker>Poise Direct · Kleos Black</Kicker>
          <Display text="Text " em="Poise." size={44} />
          <RNText style={{ fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: t.ink2 }}>
            Paste a message you’re about to send and get it read before it goes. Ask what to wear, how to reply, what to say first. Same Poise, in your Messages.
          </RNText>
        </Animated.View>

        {st === undefined ? (
          <ActivityIndicator style={{ marginTop: 30 }} color={t.accent} />
        ) : !st || !st.enabled ? (
          <Animated.View entering={FadeIn.duration(300)} style={{ marginTop: 26, gap: 8 }}>
            <RNText style={{ fontFamily: font.medium, fontSize: 16, color: t.ink }}>Opening soon.</RNText>
            <RNText style={{ fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: t.ink2 }}>Poise Direct is in a small pilot for Kleos Black. When it opens to you, you’ll link your number here.</RNText>
          </Animated.View>
        ) : tier !== 'black' && !st.black ? (
          <View style={{ marginTop: 26, gap: 14 }}>
            <RNText style={{ fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: t.ink2 }}>Poise Direct is part of Kleos Black.</RNText>
            <Pill label="See Kleos Black" onPress={() => router.push({ pathname: '/paywall', params: { reason: 'direct' } })} />
          </View>
        ) : !st.linked ? (
          <View style={{ marginTop: 26, gap: 16 }}>
            <Step n={1} text="Get a one-time code. It works for ten minutes." />
            <Step n={2} text={`Send it as a ${channelName} from your phone to the Kleos number. Texting it from your number is what proves it’s yours.`} />
            <Step n={3} text="Poise replies to confirm. Then just text." />
            {code ? (
              <Animated.View entering={FadeIn.duration(250)} style={{ borderRadius: 22, backgroundColor: t.inverse, padding: 18, gap: 10 }}>
                <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.6, color: 'rgba(255,255,255,0.75)' }}>{`SEND TO ${code.to}`}</RNText>
                <RNText selectable style={{ fontFamily: font.mono, fontSize: 30, letterSpacing: 3, color: '#FFF' }}>{code.text}</RNText>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {code.sms ? (
                    <Pressable onPress={() => Linking.openURL(code.sms!)} style={{ height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#FFF', justifyContent: 'center' }}>
                      <RNText style={{ fontFamily: font.medium, fontSize: 14, color: t.inverse }}>Open Messages</RNText>
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => Clipboard.setStringAsync(code.text)} style={{ height: 40, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', justifyContent: 'center' }}>
                    <RNText style={{ fontFamily: font.medium, fontSize: 14, color: '#FFF' }}>Copy</RNText>
                  </Pressable>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color="#FFF" />
                  <RNText style={{ fontFamily: font.regular, fontSize: 12.5, color: 'rgba(255,255,255,0.8)' }}>Waiting for your text…</RNText>
                </View>
              </Animated.View>
            ) : (
              <Pill label={busy ? 'Getting a code…' : 'Get my code'} onPress={getCode} disabled={busy} />
            )}
          </View>
        ) : (
          <View style={{ marginTop: 26 }}>
            <RowLink first title="Linked" sub={`Text Poise at ${st.number ?? 'the Kleos number'}. Text UNLINK to stop.`} right={<Icon d={ICON.check} size={16} color={t.accent} stroke={2.4} />} />
            <Hair />
            <View style={{ marginTop: 28 }}>
              <Kicker>What Poise Direct may know</Kicker>
              <RowLink first title="What’s coming up" sub="The occasion you set in Kleos" right={<Switch value={st.allow.occasion} onValueChange={(v) => allow('occasion', v)} trackColor={{ true: t.accent }} />} />
              <RowLink title="Your taste" sub="Your style lane and colours" right={<Switch value={st.allow.style} onValueChange={(v) => allow('style', v)} trackColor={{ true: t.accent }} />} />
              <Hair />
              <RNText style={{ marginTop: 10, fontFamily: font.regular, fontSize: 12, lineHeight: 17, color: t.ink3 }}>Never your coaching history, your calls or anyone else’s messages. Off means it isn’t sent at all.</RNText>
            </View>
            <View style={{ marginTop: 28 }}>
              <Kicker>The thread</Kicker>
              {thread.length === 0 ? (
                <RNText style={{ marginTop: 10, fontFamily: font.regular, fontSize: 14, color: t.ink3 }}>Nothing yet. Text Poise anything.</RNText>
              ) : (
                <View style={{ marginTop: 10, gap: 8 }}>
                  {thread.slice(-12).map((m, i) => (
                    <View key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '86%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: m.role === 'user' ? t.accent : t.card, borderWidth: m.role === 'user' ? 0 : 1, borderColor: t.line }}>
                      <RNText style={{ fontFamily: font.regular, fontSize: 14, lineHeight: 19, color: m.role === 'user' ? t.onAccent : t.ink }}>{m.text}</RNText>
                    </View>
                  ))}
                </View>
              )}
              <RNText style={{ marginTop: 10, fontFamily: font.regular, fontSize: 12, lineHeight: 17, color: t.ink3 }}>Kept 30 days so Poise can follow the conversation.</RNText>
            </View>
            <View style={{ marginTop: 22 }}>
              {thread.length ? <RowLink first title="Delete the thread" sub="From our server" onPress={clearThread} /> : null}
              <RowLink first={!thread.length} title="Unlink this number" sub="Poise stops replying to it" onPress={unlink} />
              <Hair />
            </View>
          </View>
        )}
        {err ? <RNText style={{ marginTop: 16, fontFamily: font.regular, fontSize: 14, color: t.accent }}>{err}</RNText> : null}
        <RNText style={{ marginTop: 30, fontFamily: font.regular, fontSize: 12, lineHeight: 17, color: t.ink3 }}>
          Poise only replies to messages you send it, and never messages anyone else. Copying a suggestion doesn’t send it. Standard message rates may apply.
        </RNText>
      </ScrollView>
    </Screen>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: t.lineStrong, alignItems: 'center', justifyContent: 'center' }}>
        <RNText style={{ fontFamily: font.mono, fontSize: 11, color: t.ink2 }}>{n}</RNText>
      </View>
      <RNText style={{ flex: 1, fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: t.ink }}>{text}</RNText>
    </View>
  );
}
