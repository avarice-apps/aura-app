import React from 'react';
import { View, ScrollView, Pressable, Linking, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import { Screen, Icon, ICON } from '@/ui';
import { font, useTheme } from '@/theme';
import { Display, Kicker, Hair } from '@/components/Kit';

// Mirrors server/pipeline/lab.py REFS. Kept short and honest about what each one shows.
const RESEARCH = [
  { t: 'First impressions form fast, and they hold up', d: 'Strangers who watched under a minute of someone’s behaviour, with no sound, predicted how that person was rated after a full term (Ambady & Rosenthal’s “thin slices”).', url: 'https://www.scientificamerican.com/blog/psysociety/rest-in-peace-nalini-ambady/' },
  { t: 'Delivery predicts how you’re rated', d: 'In an MIT study of 138 recorded mock interviews, measured features predicted how people were rated (correlation above 0.65). Speaking fluently, using fewer filler words and smiling more were among the strongest.', url: 'https://arxiv.org/abs/1504.03425' },
  { t: 'What a charismatic voice does', d: 'Research on charismatic speakers links a wider pitch range, stronger emphasis and fewer stumbles to higher charisma ratings; very fast or very flat speech works against it.', url: 'https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2022.857647/full' },
  { t: 'How often people say uh and um', d: 'In everyday English conversation, “uh” and “um” come up about once every 50 words for men and every 70 for women. Kleos’s band sits at that level.', url: 'https://marginalrevolution.com/marginalrevolution/2017/12/facts-uh-um.html' },
  { t: 'Where people look', d: 'In conversation, listeners look at the speaker more than speakers look at listeners. On camera the lens is the listener, so holding it reads as eye contact.', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5844880' },
];

function P({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <RNText style={{ fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: t.ink2 }}>{children}</RNText>;
}
function H({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <RNText style={{ fontFamily: font.serif, fontSize: 26, lineHeight: 30, color: t.ink, marginTop: 26, marginBottom: 8 }}>{children}</RNText>;
}

/** How Kleos measures: what's measured, what's judged, what never happens, and where the ranges come from. */
export default function Methods() {
  const t = useTheme();
  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ paddingHorizontal: 22, paddingTop: 8 }}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={ICON.back} size={16} color={t.ink} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Kicker>The method</Kicker>
        <Display text="How Kleos " em="measures." size={40} />

        <H>Measured</H>
        <P>Your recording is turned into numbers by signal processing, not by an AI’s opinion. Every word gets a timestamp, which gives pace, pauses, filler words and how fast you start. Pitch and loudness are tracked through each sentence: how much your voice moves, whether endings rise like questions, whether they fade out. On camera, face and posture landmarks show where your eyes go, how often you look away, how still you hold, and when you smile.</P>

        <H>Judged</H>
        <P>One part is judgement: what you said. Did you answer, say something specific and your own, and finish the thought? Poise writes that read and the three tells, and must cite something measured or quoted for every claim. It’s labelled “judged” wherever it appears.</P>

        <H>Never</H>
        <P>Kleos never rates your face, body, height, accent or the sound of your voice, only what you can train. It isn’t a medical or psychological test and doesn’t diagnose anything. Videos are measured and deleted; only the numbers and the read stay.</P>

        <H>Where the ranges come from</H>
        <P>Ranges marked ◆ follow published findings. The others are Kleos working ranges, tuned on practice takes and labelled as such until a validation study backs them.</P>
        <View style={{ marginTop: 14 }}>
          {RESEARCH.map((r, i) => (
            <Pressable key={r.url} onPress={() => Linking.openURL(r.url)} style={{ paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderColor: t.line, gap: 4 }}>
              <RNText style={{ fontFamily: font.medium, fontSize: 15, color: t.ink }}>{r.t}</RNText>
              <RNText style={{ fontFamily: font.regular, fontSize: 13.5, lineHeight: 19, color: t.ink2 }}>{r.d}</RNText>
              <RNText style={{ fontFamily: font.mono, fontSize: 11, color: t.accent }}>READ THE SOURCE ↗</RNText>
            </Pressable>
          ))}
          <Hair />
        </View>

        <H>Honest limits</H>
        <P>One take is one take: light, a bad mic or a strange question move the numbers, which is why the same question comes back each week. A single thirty seconds is a snapshot, not a verdict on you.</P>
      </ScrollView>
    </Screen>
  );
}
