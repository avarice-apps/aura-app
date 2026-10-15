import React, { useState } from 'react';
import { View, TextInput, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Screen, Display, Label, Body, Button, Gutter, Stack, Hairline, Row } from '@/ui';
import { Mark } from '@/components/Mark';
import { color, font, space } from '@/theme/tokens';
import { useStore } from '@/state/store';

type Step = 'intro' | 'how' | 'age' | 'consent' | 'train' | 'name' | 'ready';

const DEMO_AXES = { voice: 70, presence: 82, command: 64, composure: 76, read: 72 };

export default function Onboarding() {
  const [step, setStep] = useState<Step>('intro');
  const set = useStore((s) => s.set);
  const [name, setName] = useState('');
  const [ageOk, setAgeOk] = useState(false);

  const next = (s: Step) => {
    Haptics.selectionAsync();
    setStep(s);
  };

  return (
    <Screen surface="cobalt">
      <Gutter style={{ flex: 1 }}>
        {step === 'intro' && (
          <Animated.View key="intro" entering={FadeIn.duration(600)} exiting={FadeOut.duration(300)} style={styles.fill}>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Mark index={74} axes={DEMO_AXES} size={300} />
            </View>
            <Stack gap={space.l} style={{ paddingBottom: space.l }}>
              <Label color={color.w72}>Aura</Label>
              <Display size="d2">
                How you{'\n'}come across.{'\n'}Measured.
              </Display>
              <Body color={color.w72}>
                Sixty seconds on camera. Poise reads your voice, your eyes and your words, tells you the three things costing you, and trains them out.
              </Body>
              <Button label="Begin" surface="cobalt" onPress={() => next('how')} />
            </Stack>
          </Animated.View>
        )}

        {step === 'how' && (
          <Animated.View key="how" entering={FadeIn.duration(600)} exiting={FadeOut.duration(300)} style={styles.fill}>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Stack gap={0}>
                <Line n="01" title="Read" body="Answer one prompt to the camera. Forty-five seconds." />
                <Line n="02" title="Verdict" body="Your Index, your tier, three tells with evidence, one drill." />
                <Line n="03" title="Train" body="Four minutes a day. Pressure rounds, judgment calls, holding silence." />
                <Line n="04" title="Re-read" body="Every Sunday, the same prompt. Your Mark fills in, or it doesn't." last />
              </Stack>
            </View>
            <Stack gap={space.m} style={{ paddingBottom: space.l }}>
              <Body color={color.w48} small>
                Poise is direct. She cites what she measured and nothing else. She never comments on what you can't change.
              </Body>
              <Button label="Continue" surface="cobalt" onPress={() => next('age')} />
            </Stack>
          </Animated.View>
        )}

        {step === 'age' && (
          <Animated.View key="age" entering={FadeIn.duration(600)} exiting={FadeOut.duration(300)} style={styles.fill}>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Stack gap={space.l}>
                <Label>Before we start</Label>
                <Display size="d3">Aura is for adults.</Display>
                <Body color={color.w72}>You must be 18 or older to use Aura. There is no version for younger users.</Body>
                <Pressable onPress={() => { setAgeOk(!ageOk); Haptics.selectionAsync(); }}>
                  <Row gap={space.m} style={{ paddingVertical: space.m }}>
                    <View style={[styles.check, ageOk && styles.checkOn]} />
                    <Body color={color.white}>I am 18 or older.</Body>
                  </Row>
                </Pressable>
              </Stack>
            </View>
            <View style={{ paddingBottom: space.l }}>
              <Button label="Confirm" surface="cobalt" disabled={!ageOk} onPress={() => { set({ ageConfirmed: true }); next('consent'); }} />
            </View>
          </Animated.View>
        )}

        {step === 'consent' && (
          <Animated.View key="consent" entering={FadeIn.duration(600)} exiting={FadeOut.duration(300)} style={styles.fill}>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Stack gap={space.l}>
                <Label>Your clips</Label>
                <Display size="d3">What we measure,{'\n'}and what we keep.</Display>
                <Stack gap={space.m}>
                  <Body color={color.w72}>Your Read is analysed for voice, eye contact, posture and words. Numbers are kept. Face templates are never stored.</Body>
                  <Body color={color.w72}>Clips delete automatically after 30 days. You can delete everything, at any time, in one tap.</Body>
                  <Body color={color.w72}>Nothing from your face or voice is used for advertising, ever.</Body>
                </Stack>
              </Stack>
            </View>
            <Stack gap={space.s} style={{ paddingBottom: space.l }}>
              <Button label="I consent to analysis" surface="cobalt" onPress={() => { set({ biometricConsent: true }); next('train'); }} />
              <Body color={color.w48} small align="center">Required to use Aura. Full policy in Settings.</Body>
            </Stack>
          </Animated.View>
        )}

        {step === 'train' && (
          <Animated.View key="train" entering={FadeIn.duration(600)} exiting={FadeOut.duration(300)} style={styles.fill}>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Stack gap={space.l}>
                <Label>Optional</Label>
                <Display size="d3">Help train{'\n'}Poise's eye.</Display>
                <Stack gap={space.m}>
                  <Body color={color.w72}>Aura's scoring is learned from how real people perceive real clips. If you opt in, your Reads may be shown to a small paid panel of raters, who score how you come across. Never published, never sold, never used for ads.</Body>
                  <Body color={color.w72}>Training clips are kept for up to 12 months, then deleted. You can withdraw in Settings at any time and your clips are removed from the training set.</Body>
                  <Body color={color.w48} small>Saying no changes nothing about your Reads or your score.</Body>
                </Stack>
              </Stack>
            </View>
            <Stack gap={space.s} style={{ paddingBottom: space.l }}>
              <Button label="Yes, use my Reads for training" surface="cobalt" onPress={() => { set({ trainingConsent: true }); next('name'); }} />
              <Button label="No thanks" variant="secondary" surface="cobalt" onPress={() => { set({ trainingConsent: false }); next('name'); }} />
            </Stack>
          </Animated.View>
        )}

        {step === 'name' && (
          <Animated.View key="name" entering={FadeIn.duration(600)} exiting={FadeOut.duration(300)} style={styles.fill}>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Stack gap={space.l}>
                <Label>Poise will use it</Label>
                <Display size="d3">What should she call you?</Display>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="First name"
                  placeholderTextColor={color.w24}
                  autoCapitalize="words"
                  autoFocus
                  style={styles.input}
                />
              </Stack>
            </View>
            <View style={{ paddingBottom: space.l }}>
              <Button label="Continue" surface="cobalt" disabled={name.trim().length < 2} onPress={() => { set({ name: name.trim() }); next('ready'); }} />
            </View>
          </Animated.View>
        )}

        {step === 'ready' && (
          <Animated.View key="ready" entering={FadeIn.duration(600)} exiting={FadeOut.duration(300)} style={styles.fill}>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Mark index={12} axes={{ voice: 20, presence: 20, command: 20, composure: 20, read: 20 }} size={240} />
            </View>
            <Stack gap={space.l} style={{ paddingBottom: space.l }}>
              <Label>Your Mark, {name}</Label>
              <Display size="d3">Empty, for now.</Display>
              <Body color={color.w72}>Every Read adds rays. Every cleared tell makes them even. The first one takes a minute. Find a quiet room and some light on your face.</Body>
              <Button label="Start your first Read" surface="cobalt" onPress={() => { set({ onboarded: true }); router.replace('/read'); }} />
            </Stack>
          </Animated.View>
        )}
      </Gutter>
    </Screen>
  );
}

function Line({ n, title, body, last }: { n: string; title: string; body: string; last?: boolean }) {
  return (
    <View style={{ paddingVertical: space.l, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderColor: color.w16 }}>
      <Row gap={space.l} style={{ alignItems: 'flex-start' }}>
        <Label color={color.w48} style={{ width: 28, paddingTop: 6 }}>{n}</Label>
        <View style={{ flex: 1 }}>
          <Display size="d4">{title}</Display>
          <Body color={color.w72} style={{ marginTop: 6 }}>{body}</Body>
        </View>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  check: { width: 18, height: 18, borderWidth: 1, borderColor: color.w72, borderRadius: 2 },
  checkOn: { backgroundColor: color.lilac, borderColor: color.lilac },
  input: {
    fontFamily: font.display,
    fontSize: 44,
    color: color.white,
    paddingVertical: space.m,
    borderBottomWidth: 1,
    borderColor: color.w24,
  },
});
