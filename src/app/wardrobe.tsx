import React, { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, TextInput, Alert, Linking, StyleSheet, ActivityIndicator, useWindowDimensions, Text as RNText } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Directory, File, Paths } from 'expo-file-system';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { font, HERITAGE, HeritageName, IVORY, NAVY } from '@/theme';
import { useStore } from '@/state/store';
import { readStyle, scanWardrobe, buildFits } from '@/lib/api';
import type { BuiltFit, StyleProfile, StyleRead, Swatch, WardrobeItem } from '@/lib/types';
import { useTier } from '@/lib/plan';
import { play } from '@/lib/sound';
import { track } from '@/lib/analytics';
import { occasionFresh } from '@/lib/occasion';

/*
 * The style section. Printed like a heritage catalogue: Kleos blue on ivory, the same in light and dark mode.
 * 1. A five-question quiz (free) → Poise's read of his taste: "your path to aura".
 * 2. Kleos Black unlocks the Wardrobe: scan what you own, get fits built for the room and the presence you want.
 */

const BLUE = '#1608F2';
const INK2 = 'rgba(12,6,120,0.62)';
const LINE = 'rgba(12,6,120,0.16)';

const LANES = ['Old money', 'Quiet luxury', 'Italian', 'Downtown', 'Minimal', 'Streetwear', 'Workwear', 'Preppy', 'Athletic', 'Techwear', 'Dark'];
const COLOURS: Swatch[] = [
  { name: 'Black', hex: '#111111' }, { name: 'White', hex: '#F7F7F2' }, { name: 'Grey', hex: '#8C8C8C' }, { name: 'Navy', hex: '#1F2A44' },
  { name: 'Beige', hex: '#D8C7A6' }, { name: 'Brown', hex: '#6F4728' }, { name: 'Olive', hex: '#5B6236' }, { name: 'Denim', hex: '#4A6584' },
  { name: 'Cream', hex: '#EFE6D2' }, { name: 'Burgundy', hex: '#6D1F2C' }, { name: 'Pastels', hex: '#C9D8E8' }, { name: 'Bright colours', hex: '#E0482F' },
];
const LIFE = ['Office', 'Campus', 'Gym', 'Nights out', 'Dates', 'Dinners', 'Travel', 'Creative work', 'Weekends outdoors', 'Events'];
const FEELING = ['Not enough of it', 'Plenty, but nothing goes together', 'I like it, I want it sharper', 'I don’t know what suits me', 'I don’t like what I put together'];
const PRESENCE = ['Quiet authority', 'Effortless', 'Sharp', 'Warm and easy', 'Magnetic', 'Mysterious'];
const OCCASIONS = ['Date night', 'Work', 'Interview', 'Night out', 'Wedding guest', 'Meeting the parents', 'Weekend', 'Travel day'];
/** Today's occasion speaks in impressions; the wardrobe in presences. */
const IMPRESSION_TO_PRESENCE: Record<string, string> = { Relaxed: 'Effortless', Sharp: 'Sharp', Warm: 'Warm and easy', Magnetic: 'Magnetic', 'Quietly confident': 'Quiet authority', Funny: 'Warm and easy' };
const CATEGORY_LABEL: Record<WardrobeItem['category'], string> = { outer: 'Outerwear', top: 'Tops', bottom: 'Bottoms', full: 'One-piece', shoes: 'Shoes', accessory: 'Accessories' };

export default function Wardrobe() {
  const profile = useStore((s) => s.styleProfile);
  const tier = useTier();
  const [retake, setRetake] = useState(false);
  if (!profile?.read || retake) return <Quiz onDone={() => setRetake(false)} onClose={() => (profile?.read ? setRetake(false) : router.back())} />;
  if (tier !== 'black') return <ReadPage profile={profile} onRetake={() => setRetake(true)} />;
  return <WardrobeHome profile={profile} onRetune={() => setRetake(true)} />;
}

// ------------------------------------------------------------------ shared pieces

function Page({ children, plate, plateH, onBack }: { children: React.ReactNode; plate?: HeritageName; plateH?: number; onBack?: () => void }) {
  const { height } = useWindowDimensions();
  const h = plateH ?? Math.round(height * 0.42);
  return (
    <View style={{ flex: 1, backgroundColor: IVORY }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {plate ? <Plate name={plate} height={h} /> : <View style={{ height: 100 }} />}
        <View style={{ paddingHorizontal: 24, marginTop: plate ? -28 : 0 }}>{children}</View>
      </ScrollView>
      <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0 }}>
        <Pressable onPress={onBack ?? (() => router.back())} hitSlop={12} style={{ margin: 16, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(241,235,221,0.88)', alignItems: 'center', justifyContent: 'center' }}>
          <RNText style={{ fontFamily: font.serif, fontSize: 22, color: NAVY, marginTop: -2 }}>‹</RNText>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

/** A print, full-bleed, fading into the ivory page; the credit sits under it like a catalogue caption. */
function Plate({ name, height }: { name: HeritageName; height: number }) {
  const p = HERITAGE[name];
  return (
    <View>
      <Animated.View entering={FadeIn.duration(600)} style={{ height }}>
        <Image source={p.src} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
        <LinearGradient colors={['rgba(241,235,221,0)', 'rgba(241,235,221,0)', IVORY]} locations={[0, 0.72, 1]} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <RNText style={{ position: 'absolute', bottom: 34, right: 24, fontFamily: font.mono, fontSize: 8.5, letterSpacing: 0.8, color: INK2 }}>{p.credit.toUpperCase()}</RNText>
    </View>
  );
}

function Kicker({ children }: { children: string }) {
  return <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.8, color: BLUE }}>{children.toUpperCase()}</RNText>;
}
function H({ children, size = 36 }: { children: React.ReactNode; size?: number }) {
  return <RNText style={{ fontFamily: font.serif, fontSize: size, lineHeight: size * 1.08, letterSpacing: -size * 0.01, color: NAVY }}>{children}</RNText>;
}
function P({ children, dim, italic }: { children: React.ReactNode; dim?: boolean; italic?: boolean }) {
  return <RNText style={{ fontFamily: italic ? font.serifItalic : font.regular, fontSize: italic ? 19 : 15, lineHeight: italic ? 25 : 22, color: dim ? INK2 : NAVY }}>{children}</RNText>;
}
function Rule() {
  return <View style={{ height: 1, backgroundColor: LINE, marginVertical: 18 }} />;
}

function Choice({ label, on, onPress, swatch }: { label: string; on: boolean; onPress: () => void; swatch?: string }) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 15, height: 40, borderRadius: 20, borderWidth: 1, borderColor: on ? NAVY : 'rgba(12,6,120,0.28)', backgroundColor: on ? NAVY : 'transparent' }}
    >
      {swatch ? <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: swatch, borderWidth: 1, borderColor: on ? 'rgba(241,235,221,0.6)' : LINE }} /> : null}
      <RNText style={{ fontFamily: on ? font.medium : font.regular, fontSize: 14, color: on ? IVORY : NAVY }}>{label}</RNText>
    </Pressable>
  );
}

function Primary({ label, onPress, disabled, light }: { label: string; onPress: () => void; disabled?: boolean; light?: boolean }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        play('select');
        onPress();
      }}
      style={({ pressed }) => ({ height: 54, borderRadius: 27, backgroundColor: light ? IVORY : NAVY, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : pressed ? 0.85 : 1 })}
    >
      <RNText style={{ fontFamily: font.medium, fontSize: 16, color: light ? NAVY : IVORY }}>{label}</RNText>
    </Pressable>
  );
}
function Quiet({ label, onPress, light }: { label: string; onPress: () => void; light?: boolean }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={{ alignSelf: 'center', paddingVertical: 10 }}>
      <RNText style={{ fontFamily: font.regular, fontSize: 14, color: light ? 'rgba(241,235,221,0.85)' : INK2, textDecorationLine: 'underline' }}>{label}</RNText>
    </Pressable>
  );
}

function Dots({ list, size = 22 }: { list: Swatch[]; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {list.map((s) => (
        <View key={s.name + s.hex} style={{ alignItems: 'center', gap: 5, width: 58 }}>
          <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: s.hex, borderWidth: 1, borderColor: LINE }} />
          <RNText numberOfLines={2} style={{ fontFamily: font.regular, fontSize: 10.5, color: INK2, textAlign: 'center' }}>{s.name}</RNText>
        </View>
      ))}
    </View>
  );
}

// ------------------------------------------------------------------ 1 · the quiz

type Step = { plate: HeritageName; title: string; sub: string };
const STEPS: Step[] = [
  { plate: 'rider', title: 'Which of these feel like you?', sub: 'Pick up to three. Mixing is normal.' },
  { plate: 'deauville', title: 'What colours do you mostly own?', sub: 'Be honest. Poise builds from what’s already there.' },
  { plate: 'rowers', title: 'What does your week look like?', sub: 'Where your clothes actually have to work.' },
  { plate: 'pockets', title: 'How do you feel about your wardrobe?', sub: 'There’s no wrong answer here.' },
  { plate: 'jockeys', title: 'How do you want to come across?', sub: 'When you walk in, before you say a word.' },
];

function Quiz({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const st = useStore();
  const { height } = useWindowDimensions();
  const prev = st.styleProfile;
  const [step, setStep] = useState(-1); // -1 = the opening page
  const [lanes, setLanes] = useState<string[]>(prev?.lanes ?? []);
  const [colours, setColours] = useState<string[]>(prev?.colours ?? []);
  const [life, setLife] = useState<string[]>(prev?.life ?? []);
  const [feeling, setFeeling] = useState(prev?.feeling ?? '');
  const [presence, setPresence] = useState(prev?.presence ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const toggle = (list: string[], set: (v: string[]) => void, v: string, max = 12) => set(list.includes(v) ? list.filter((x) => x !== v) : list.length >= max ? list : [...list, v]);
  const ok = [lanes.length > 0, colours.length > 0, life.length > 0, !!feeling, !!presence][step] ?? true;

  async function finish() {
    setBusy(true);
    setErr('');
    const p: StyleProfile = { lanes, colours, life, feeling, presence };
    try {
      const read = await readStyle(p);
      st.set({ styleProfile: { ...p, read, at: new Date().toISOString() }, styleLane: `${read.signature} (${lanes.join(', ')})` });
      track('style_profile', { lanes: lanes.join(','), feeling });
      play('reveal');
      onDone();
    } catch (e: any) {
      setErr(e?.message ?? 'Poise couldn’t read that. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (step === -1) {
    return (
      <Page plate="sailing" plateH={Math.round(height * 0.58)} onBack={onClose}>
        <Animated.View entering={FadeInDown.duration(500).delay(150)} style={{ gap: 14 }}>
          <Kicker>Your style</Kicker>
          <H size={42}>Every man has his own path to aura.</H>
          <P dim>Five questions. Poise learns your taste, then shows you yours: your direction, your rules, and the three pieces that would change the most.</P>
          <View style={{ height: 8 }} />
          <Primary label="Begin" onPress={() => setStep(0)} />
        </Animated.View>
      </Page>
    );
  }

  if (busy) {
    return (
      <Page plate="gentleman" onBack={() => {}}>
        <View style={{ gap: 12, alignItems: 'flex-start' }}>
          <Kicker>One moment</Kicker>
          <H>Poise is reading your taste.</H>
          <ActivityIndicator color={NAVY} style={{ marginTop: 8 }} />
        </View>
      </Page>
    );
  }

  const s = STEPS[step];
  return (
    <Page plate={s.plate} onBack={() => setStep(step - 1)}>
      <Animated.View key={step} entering={FadeInDown.duration(400)} style={{ gap: 12 }}>
        <Kicker>{`0${step + 1} / 0${STEPS.length}`}</Kicker>
        <H size={32}>{s.title}</H>
        <P dim>{s.sub}</P>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
          {step === 0 && LANES.map((l) => <Choice key={l} label={l} on={lanes.includes(l)} onPress={() => toggle(lanes, setLanes, l, 3)} />)}
          {step === 1 && COLOURS.map((c) => <Choice key={c.name} label={c.name} swatch={c.hex} on={colours.includes(c.name)} onPress={() => toggle(colours, setColours, c.name)} />)}
          {step === 2 && LIFE.map((l) => <Choice key={l} label={l} on={life.includes(l)} onPress={() => toggle(life, setLife, l)} />)}
          {step === 3 && FEELING.map((f) => <Choice key={f} label={f} on={feeling === f} onPress={() => setFeeling(f)} />)}
          {step === 4 && PRESENCE.map((p) => <Choice key={p} label={p} on={presence === p} onPress={() => setPresence(p)} />)}
        </View>
        {err ? <P dim>{err}</P> : null}
        <View style={{ height: 10 }} />
        <Primary label={step === STEPS.length - 1 ? 'Show me mine' : 'Continue'} disabled={!ok} onPress={() => (step === STEPS.length - 1 ? finish() : setStep(step + 1))} />
      </Animated.View>
    </Page>
  );
}

// ------------------------------------------------------------------ 2 · the read (free) and the Black pitch

function ReadBlock({ read }: { read: StyleRead }) {
  return (
    <View>
      <Kicker>Your path to aura</Kicker>
      <View style={{ height: 8 }} />
      <H size={40}>{read.signature}</H>
      <View style={{ height: 12 }} />
      <P>{read.read}</P>
      <Rule />
      <Kicker>Your rules</Kicker>
      <View style={{ gap: 10, marginTop: 10 }}>
        {read.principles.map((p, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
            <RNText style={{ fontFamily: font.serif, fontSize: 20, color: BLUE, width: 16 }}>{i + 1}</RNText>
            <View style={{ flex: 1 }}><P>{p}</P></View>
          </View>
        ))}
      </View>
      <Rule />
      <Kicker>Own these three</Kicker>
      <View style={{ gap: 12, marginTop: 10 }}>
        {read.core.map((c, i) => (
          <View key={i} style={{ gap: 2 }}>
            <RNText style={{ fontFamily: font.medium, fontSize: 16, color: NAVY }}>{c.piece}</RNText>
            <P dim>{c.why}</P>
          </View>
        ))}
      </View>
      <Rule />
      <Kicker>Build around</Kicker>
      <View style={{ height: 12 }} />
      <Dots list={read.palette} size={30} />
      <Rule />
      <P italic>{read.presence}</P>
    </View>
  );
}

function ReadPage({ profile, onRetake }: { profile: StyleProfile; onRetake: () => void }) {
  return (
    <Page plate="polo">
      <Animated.View entering={FadeInDown.duration(500)}>
        <ReadBlock read={profile.read!} />
      </Animated.View>
      <Animated.View entering={FadeInDown.duration(500).delay(250)} style={{ marginTop: 28, borderRadius: 26, overflow: 'hidden' }}>
        <Image source={HERITAGE.trouville.src} style={StyleSheet.absoluteFill} contentFit="cover" />
        <LinearGradient colors={['rgba(12,6,120,0.55)', 'rgba(12,6,120,0.92)']} style={StyleSheet.absoluteFill} />
        <View style={{ padding: 22, gap: 14 }}>
          <RNText style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: 1.8, color: 'rgba(241,235,221,0.8)' }}>KLEOS BLACK · YOUR WARDROBE</RNText>
          <RNText style={{ fontFamily: font.serif, fontSize: 32, lineHeight: 35, color: IVORY }}>Now make it real.</RNText>
          {[
            ['Scan what you own', 'Photograph your clothes once. Poise catalogues every piece, colour and formality.'],
            ['Name the room', 'Date, interview, wedding, night out. And how you want to come across.'],
            ['Get the fit', `Built from your own clothes, in your lane (${profile.read!.signature.toLowerCase()}), with the one missing piece if there is one.`],
          ].map(([t, d]) => (
            <View key={t} style={{ gap: 2 }}>
              <RNText style={{ fontFamily: font.medium, fontSize: 15, color: IVORY }}>{t}</RNText>
              <RNText style={{ fontFamily: font.regular, fontSize: 13.5, lineHeight: 19, color: 'rgba(241,235,221,0.82)' }}>{d}</RNText>
            </View>
          ))}
          <View style={{ height: 4 }} />
          <Primary light label="Unlock with Kleos Black" onPress={() => router.push({ pathname: '/paywall', params: { reason: 'wardrobe' } })} />
          <Quiet light label="Rate a fit for free first" onPress={() => router.push({ pathname: '/capture', params: { mode: 'fit' } })} />
        </View>
      </Animated.View>
      <Quiet label="Retake the quiz" onPress={onRetake} />
    </Page>
  );
}

// ------------------------------------------------------------------ 3 · the Wardrobe (Black)

const wardrobeDir = () => {
  const d = new Directory(Paths.document, 'wardrobe');
  if (!d.exists) d.create();
  return d;
};

function WardrobeHome({ profile, onRetune }: { profile: StyleProfile; onRetune: () => void }) {
  const st = useStore();
  const items = useMemo(() => st.wardrobe ?? [], [st.wardrobe]);
  const { from } = useLocalSearchParams<{ from?: string }>();
  const coming = from === 'occasion' && occasionFresh(st.occasion) ? st.occasion : undefined;
  const [occasion, setOccasion] = useState('');
  const [custom, setCustom] = useState(coming ? [coming.what, coming.who].filter(Boolean).join('. ').slice(0, 120) : '');
  const [presence, setPresence] = useState((coming?.impression && IMPRESSION_TO_PRESENCE[coming.impression]) || profile.presence || PRESENCE[0]);
  const [fits, setFits] = useState<BuiltFit[] | null>(null);
  const [building, setBuilding] = useState(false);
  const [adding, setAdding] = useState('');
  const [err, setErr] = useState('');
  const [showRead, setShowRead] = useState(false);

  const has = (c: WardrobeItem['category']) => items.some((x) => x.category === c);
  const ready = (has('top') || has('full')) && (has('bottom') || has('full')) && has('shoes');
  const occ = custom.trim() || occasion;
  const byId = useMemo(() => Object.fromEntries(items.map((x) => [x.id, x])), [items]);

  async function add(source: 'camera' | 'library') {
    setErr('');
    let uris: string[] = [];
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setErr('Kleos needs the camera for this. Turn it on in Settings › Kleos.');
        if (!perm.canAskAgain) Linking.openSettings();
        return;
      }
      const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
      if (r.canceled) return;
      uris = r.assets.map((a) => a.uri);
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setErr('Kleos needs photo access for this. Turn it on in Settings › Kleos › Photos.');
        if (!perm.canAskAgain) Linking.openSettings();
        return;
      }
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 8, quality: 0.6 });
      if (r.canceled) return;
      uris = r.assets.map((a) => a.uri).slice(0, 8);
    }
    setAdding(`Cataloguing ${uris.length === 1 ? 'that piece' : `${uris.length} photos`}…`);
    try {
      // Keep the photos on the phone (documents, not cache), then send them once to be catalogued.
      const dir = wardrobeDir();
      const kept: string[] = [];
      for (const u of uris) {
        const dest = new File(dir, `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.jpg`);
        await new File(u).copy(dest);
        kept.push(dest.uri);
      }
      const found = await scanWardrobe(kept);
      if (!found.length) {
        setErr('Poise couldn’t see clothing in that. Lay the piece flat or hang it, in good light.');
        kept.forEach((u) => {
          try {
            new File(u).delete();
          } catch {}
        });
        return;
      }
      const now = new Date().toISOString();
      const added: WardrobeItem[] = found.map((f, i) => ({ id: `${Date.now().toString(36)}${i}${Math.random().toString(36).slice(2, 5)}`, uri: kept[f.photo] ?? kept[0], category: f.category, name: f.name, colour: f.colour, formality: f.formality, addedAt: now }));
      // photos the model found nothing in aren't kept
      kept.forEach((u, i) => {
        if (!found.some((f) => f.photo === i)) {
          try {
            new File(u).delete();
          } catch {}
        }
      });
      st.set({ wardrobe: [...added, ...items].slice(0, 300) });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      track('wardrobe_add', { n: added.length });
    } catch (e: any) {
      setErr(e?.message ?? 'Couldn’t add those. Try again.');
    } finally {
      setAdding('');
    }
  }

  function remove(it: WardrobeItem) {
    Alert.alert('Remove this piece?', it.name, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          const rest = items.filter((x) => x.id !== it.id);
          st.set({ wardrobe: rest });
          if (!rest.some((x) => x.uri === it.uri)) {
            try {
              new File(it.uri).delete();
            } catch {}
          }
        },
      },
    ]);
  }

  async function build() {
    if (!ready || !occ) return;
    setBuilding(true);
    setErr('');
    setFits(null);
    try {
      const colouring = (st.fits ?? []).find((f) => f.colouring)?.colouring ?? null;
      const out = await buildFits({ items, occasion: occ, presence, colouring });
      setFits(out.filter((f) => f.items.some((id) => byId[id])));
      play('reveal');
      track('wardrobe_build', { occasion: occ, presence });
    } catch (e: any) {
      setErr(e?.message ?? 'Couldn’t build that. Try again.');
    } finally {
      setBuilding(false);
    }
  }

  const groups = (Object.keys(CATEGORY_LABEL) as WardrobeItem['category'][]).map((c) => [c, items.filter((x) => x.category === c)] as const).filter(([, l]) => l.length);

  return (
    <Page plate="trouville" plateH={260}>
      <View style={{ gap: 6 }}>
        <Kicker>{`Wardrobe · ${items.length} ${items.length === 1 ? 'piece' : 'pieces'}`}</Kicker>
        <H size={36}>{profile.read?.signature ?? 'Your wardrobe'}</H>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <Quiet label={showRead ? 'Hide your read' : 'Your read'} onPress={() => setShowRead(!showRead)} />
          <Quiet label="Retune" onPress={onRetune} />
        </View>
      </View>
      {showRead && profile.read ? <Animated.View entering={FadeInDown.duration(300)} style={{ marginTop: 6 }}><ReadBlock read={profile.read} /></Animated.View> : null}

      <Rule />
      <Kicker>Build the fit</Kicker>
      <View style={{ height: 10 }} />
      <P dim>Where are you going?</P>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        {OCCASIONS.map((o) => <Choice key={o} label={o} on={!custom.trim() && occasion === o} onPress={() => { setCustom(''); setOccasion(occasion === o ? '' : o); }} />)}
      </View>
      <TextInput value={custom} onChangeText={setCustom} placeholder="Or describe it: rooftop birthday, 8pm, smart" placeholderTextColor={INK2} style={{ marginTop: 10, fontFamily: font.regular, fontSize: 15, color: NAVY, paddingVertical: 10, borderBottomWidth: 1, borderColor: LINE }} />
      <View style={{ height: 14 }} />
      <P dim>How do you want to come across?</P>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        {PRESENCE.map((p) => <Choice key={p} label={p} on={presence === p} onPress={() => setPresence(p)} />)}
      </View>
      <View style={{ height: 16 }} />
      <Primary label={building ? 'Building…' : 'Build the fit'} disabled={!ready || !occ || building} onPress={build} />
      {!ready ? <View style={{ marginTop: 8 }}><P dim>{items.length ? 'Add at least a top, bottoms and shoes to build a fit.' : 'Start by adding a few pieces below: a top, bottoms and shoes is enough.'}</P></View> : null}

      {fits?.map((f, i) => (
        <Animated.View key={i} entering={FadeInDown.duration(400).delay(i * 120)} style={{ marginTop: 22, padding: 18, borderRadius: 24, backgroundColor: 'rgba(12,6,120,0.05)', borderWidth: 1, borderColor: LINE, gap: 10 }}>
          <Kicker>{i === 0 ? 'The fit' : 'Or'}</Kicker>
          <H size={26}>{f.name}</H>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {f.items.map((id) => byId[id]).filter(Boolean).map((it) => (
              <View key={it!.id} style={{ width: 96, gap: 4 }}>
                <Image source={{ uri: it!.uri }} style={{ width: 96, height: 120, borderRadius: 14, backgroundColor: 'rgba(12,6,120,0.08)' }} contentFit="cover" />
                <RNText numberOfLines={2} style={{ fontFamily: font.regular, fontSize: 11.5, color: NAVY }}>{it!.name}</RNText>
              </View>
            ))}
          </ScrollView>
          <P>{f.why}</P>
          <P italic>{f.presence}</P>
          {f.missing ? (
            <View style={{ borderTopWidth: 1, borderColor: LINE, paddingTop: 10, gap: 2 }}>
              <RNText style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: 1.4, color: BLUE }}>THE ONE MISSING PIECE</RNText>
              <RNText style={{ fontFamily: font.medium, fontSize: 15, color: NAVY }}>{f.missing.piece}</RNText>
              <P dim>{f.missing.why}</P>
            </View>
          ) : null}
        </Animated.View>
      ))}

      <Rule />
      <Kicker>Your pieces</Kicker>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <View style={{ flex: 1 }}><Primary label="Photograph" onPress={() => add('camera')} disabled={!!adding} /></View>
        <View style={{ flex: 1 }}><Primary light label="From photos" onPress={() => add('library')} disabled={!!adding} /></View>
      </View>
      <View style={{ marginTop: 8 }}><P dim>{adding || 'One piece per photo works best: laid flat or hung, in daylight. Photos stay on your phone.'}</P></View>
      {err ? <View style={{ marginTop: 6 }}><P>{err}</P></View> : null}

      {groups.map(([c, list]) => (
        <View key={c} style={{ marginTop: 18 }}>
          <RNText style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: 1.4, color: INK2, marginBottom: 8 }}>{`${CATEGORY_LABEL[c].toUpperCase()} · ${list.length}`}</RNText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {list.map((it) => (
              <Pressable key={it.id} onLongPress={() => remove(it)} delayLongPress={350} style={{ width: '30.5%', gap: 4 }}>
                <Image source={{ uri: it.uri }} style={{ width: '100%', aspectRatio: 4 / 5, borderRadius: 14, backgroundColor: 'rgba(12,6,120,0.08)' }} contentFit="cover" />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: it.colour.hex, borderWidth: 1, borderColor: LINE }} />
                  <RNText numberOfLines={1} style={{ flex: 1, fontFamily: font.regular, fontSize: 11, color: NAVY }}>{it.name}</RNText>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      {items.length ? <View style={{ marginTop: 12 }}><P dim>Press and hold a piece to remove it.</P></View> : null}
    </Page>
  );
}
