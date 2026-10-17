import React, { useEffect, useState } from 'react';
import { View, ScrollView, TextInput, Pressable, Alert, Linking, Platform, KeyboardAvoidingView, ActivityIndicator, Text as RNText } from 'react-native';
import { router } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Directory, Paths } from 'expo-file-system';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Screen, Icon, ICON } from '@/ui';
import { font, useTheme } from '@/theme';
import { useStore } from '@/state/store';
import { Display, Kicker, RowLink, Hair, Pill } from '@/components/Kit';
import { emailStart, emailVerify, appleSignIn, deleteAccount } from '@/lib/api';
import { refreshAccount, signOut } from '@/lib/session';
import { LEGAL_URL, OFFLINE } from '@/lib/config';
import { play } from '@/lib/sound';

const PLAN = { free: 'Free', plus: 'Kleos+', black: 'Kleos Black' } as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Account. Kleos works from the first launch without one (a private guest account on this phone). Saving it with
 * Apple or an emailed code lets the plan, the week's allowance and your register number follow you to a new phone
 * and to the Members page. Signing out keeps your progress on this phone; deleting removes the account everywhere.
 */
export default function AccountScreen() {
  const t = useTheme();
  const s = useStore();
  const a = s.account;
  const [apple, setApple] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync().then(setApple).catch(() => setApple(false));
    refreshAccount().catch(() => {});
  }, []);

  function done(switched: boolean) {
    play('cleared');
    setMsg(switched ? 'Welcome back. This phone is now on your saved account.' : 'Saved. Your plan and progress follow you now.');
    setStep('email');
    setCode('');
  }

  async function withApple() {
    setMsg('');
    try {
      const cred = await AppleAuthentication.signInAsync({ requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL] });
      if (!cred.identityToken) throw new Error('Apple didn’t return a sign-in. Try again.');
      setBusy(true);
      const name = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ');
      const r = await appleSignIn(cred.identityToken, name || undefined);
      done(r.switched);
    } catch (e: any) {
      if (e?.code === 'ERR_REQUEST_CANCELED') return;
      setMsg(e?.message ?? 'Sign in with Apple didn’t work. Try the email code.');
    } finally {
      setBusy(false);
    }
  }

  async function sendCode() {
    const e = email.trim().toLowerCase();
    if (!EMAIL.test(e)) return setMsg('That email doesn’t look right.');
    setBusy(true);
    setMsg('');
    try {
      await emailStart(e);
      setStep('code');
      setMsg(`We sent a 6-digit code to ${e}. It works for 15 minutes.`);
    } catch (x: any) {
      setMsg(x?.message ?? 'Couldn’t send the code. Try again in a minute.');
    } finally {
      setBusy(false);
    }
  }

  async function verify(c: string) {
    if (c.length !== 6) return;
    setBusy(true);
    setMsg('');
    try {
      const r = await emailVerify(email.trim().toLowerCase(), c);
      done(r.switched);
    } catch (x: any) {
      setCode('');
      setMsg(x?.message ?? 'That code didn’t work.');
    } finally {
      setBusy(false);
    }
  }

  function askSignOut() {
    Alert.alert('Sign out?', 'Your progress stays on this phone. Your plan stays with your saved account; sign back in any time to get it here.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', onPress: async () => { await signOut(); setMsg('Signed out.'); } },
    ]);
  }

  function askDelete() {
    Alert.alert(
      'Delete your account?',
      'This deletes your Kleos account and everything our server keeps for it: your saved sign-in, allowance, summary, duels and any training clips. Progress on this phone is cleared too. A subscription isn’t cancelled by this; cancel it in Settings › Apple ID › Subscriptions.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await deleteAccount();
            } catch (x: any) {
              setBusy(false);
              setMsg(x?.message ?? 'Couldn’t delete the account. Try again.');
              return;
            }
            try {
              const d = new Directory(Paths.document, 'wardrobe');
              if (d.exists) d.delete();
            } catch {}
            await signOut();
            useStore.getState().reset();
            setBusy(false);
            router.replace('/onboarding');
          },
        },
      ],
    );
  }

  const field = { fontFamily: font.regular, fontSize: 17, color: t.ink, paddingVertical: 12, borderBottomWidth: 1, borderColor: t.lineStrong } as const;

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 22, paddingTop: 8 }}>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Close" style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon d={ICON.close} size={15} color={t.ink} />
          </Pressable>
          {busy ? <ActivityIndicator color={t.accent} /> : null}
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 18, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(400)} style={{ gap: 10 }}>
            <Kicker>{a?.saved ? 'Your account' : 'Save your account'}</Kicker>
            <Display text={a?.saved ? 'You’re ' : 'Keep it '} em={a?.saved ? 'saved.' : 'yours.'} size={42} />
            <RNText style={{ fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: t.ink2 }}>
              {a?.saved
                ? 'Your plan, this week’s allowance and your register number follow you to a new phone and to the Members page.'
                : 'Kleos works without an account. Save one so your plan and progress follow you to a new phone and to joinkleos.com. No password, ever.'}
            </RNText>
          </Animated.View>

          {OFFLINE ? (
            <RNText style={{ marginTop: 24, fontFamily: font.regular, fontSize: 14, color: t.ink3 }}>Accounts need the Kleos server. This build is running offline.</RNText>
          ) : !a?.saved ? (
            <Animated.View entering={FadeIn.duration(400).delay(100)} style={{ marginTop: 28, gap: 18 }}>
              {apple ? (
                <>
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                    buttonStyle={t.dark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                    cornerRadius={25}
                    style={{ height: 50 }}
                    onPress={withApple}
                  />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Hair style={{ flex: 1 }} />
                    <RNText style={{ fontFamily: font.regular, fontSize: 13, color: t.ink3 }}>or with a code</RNText>
                    <Hair style={{ flex: 1 }} />
                  </View>
                </>
              ) : null}
              {step === 'email' ? (
                <View style={{ gap: 14 }}>
                  <TextInput value={email} onChangeText={setEmail} placeholder="you@email.com" placeholderTextColor={t.ink3} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" autoComplete="email" returnKeyType="send" onSubmitEditing={sendCode} style={field} />
                  <Pill label="Send me a code" quiet={apple} onPress={sendCode} disabled={busy || !email.trim()} />
                </View>
              ) : (
                <View style={{ gap: 14 }}>
                  <TextInput
                    value={code}
                    onChangeText={(v) => {
                      const c = v.replace(/\D/g, '').slice(0, 6);
                      setCode(c);
                      if (c.length === 6) verify(c);
                    }}
                    placeholder="6-digit code"
                    placeholderTextColor={t.ink3}
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    autoComplete="one-time-code"
                    autoFocus
                    style={[field, { fontFamily: code ? font.mono : font.regular, fontSize: 22, letterSpacing: code ? 8 : 0 }]}
                  />
                  <View style={{ flexDirection: 'row', gap: 18 }}>
                    <Pressable onPress={() => { setStep('email'); setCode(''); setMsg(''); }} hitSlop={8}>
                      <RNText style={{ fontFamily: font.regular, fontSize: 14, color: t.ink2 }}>Different email</RNText>
                    </Pressable>
                    <Pressable onPress={sendCode} hitSlop={8} disabled={busy}>
                      <RNText style={{ fontFamily: font.regular, fontSize: 14, color: t.ink2 }}>Send it again</RNText>
                    </Pressable>
                  </View>
                </View>
              )}
            </Animated.View>
          ) : (
            <Animated.View entering={FadeIn.duration(400).delay(100)} style={{ marginTop: 24 }}>
              <RowLink first title={a.email ?? (a.apple ? 'Signed in with Apple' : 'Saved')} sub={a.email && a.apple ? 'Also linked to Apple' : a.email ? 'Signs in with a code' : 'Signs in with Apple'} />
              {a.waitlist_no ? <RowLink title={`No. ${String(a.waitlist_no).padStart(4, '0')} on the register`} sub="From the waitlist. It stays yours." /> : null}
              <RowLink title={PLAN[a.plan] ?? 'Free'} sub={a.plan === 'free' ? 'See what Kleos+ and Black add' : a.plan_until ? `Renews or ends ${new Date(a.plan_until * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : 'Manage in Settings › Apple ID › Subscriptions'} onPress={() => router.push({ pathname: '/paywall', params: { reason: 'plan' } })} />
              <RowLink title="The Members page" sub="Your register number and progress on joinkleos.com" onPress={() => Linking.openURL(`${LEGAL_URL}/r/members.html`)} />
              <RowLink title="Sign out" sub="Progress stays on this phone" onPress={askSignOut} />
              <Hair />
            </Animated.View>
          )}

          {msg ? <RNText style={{ marginTop: 18, fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: t.ink }}>{msg}</RNText> : null}

          {!OFFLINE ? (
            <View style={{ marginTop: 40 }}>
              <Kicker>Delete</Kicker>
              <View style={{ marginTop: 4 }}>
                <RowLink first title="Delete account" sub="Removes the account and everything the server keeps for it" onPress={askDelete} />
                <Hair />
              </View>
              <RNText style={{ marginTop: 14, fontFamily: font.regular, fontSize: 12, lineHeight: 17, color: t.ink3 }}>
                Sign-in codes are sent from Kleos and expire in fifteen minutes. We never see your Apple ID password. Details in Terms and privacy.
              </RNText>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
