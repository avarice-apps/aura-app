import { Platform } from 'react-native';
import { AudioSession, AudioDeviceModule, setupIOSAudioManagement, type AppleAudioConfiguration } from '@livekit/react-native';
import { setAudioModeAsync, setIsAudioActiveAsync } from 'expo-audio';
export { AUDIO_START_FAILED } from './audioErrors';

/**
 * The phone's audio session during a live call, owned by the call and nothing else.
 *
 * LiveKit's default iOS policy switches the session to playback-only whenever the engine is only playing
 * (e.g. the character's opening line arrives before the mic is up). An engine started in that state can
 * capture silence for the whole call. Here both states use the same duplex config, so the mic is always
 * available while a call is up. Bluetooth headsets play through A2DP; the phone's own mic is used, which is
 * more reliable than a headset mic that may be in a case or across the room.
 */
const DUPLEX: AppleAudioConfiguration = {
  audioCategory: 'playAndRecord',
  audioCategoryOptions: ['defaultToSpeaker', 'allowBluetoothA2DP', 'allowAirPlay'],
  audioMode: 'videoChat',
};

const ios = Platform.OS === 'ios';
let policySet = false;

/**
 * Before the call connects: leave the phone's audio in a clean, known-good state for the call to take over.
 * 1. Release whatever the app's UI sounds left active, so the call's activation is a fresh one.
 * 2. Set the duplex category up front (the order that activated reliably before).
 * 3. Hand the engine a duplex policy for both of its states.
 */
export async function prepareLiveAudio() {
  if (!ios) return;
  try {
    await setIsAudioActiveAsync(false);
  } catch {}
  try {
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
  } catch {}
  try {
    if (!policySet) {
      setupIOSAudioManagement(true, { recording: DUPLEX, playout: DUPLEX, deactivateOnStop: true });
      policySet = true;
    }
  } catch {}
}

/** iOS refused to start audio: drop everything, give the system a moment, and set up again. */
export async function resetLiveAudio() {
  if (!ios) return;
  try {
    await AudioSession.stopAudioSession();
  } catch {}
  await new Promise((r) => setTimeout(r, 700));
  await prepareLiveAudio();
}

/** After the call. Nothing to undo: the engine releases the session when it stops. */
export function endLiveAudio() {}

/** True for the "couldn't start the phone's audio" family of errors, which are worth one clean retry. */
export function isAudioStartError(m: unknown) {
  return /audio session|activation|activating|AVAudioSession/i.test(String(m ?? ''));
}

/** What the native audio engine thinks it is doing. Sent with a dead-mic report so the next fix isn't a guess. */
export function micState(): Record<string, unknown> {
  if (!ios) return { platform: Platform.OS };
  const read = (f: () => unknown) => {
    try {
      return f();
    } catch {
      return 'n/a';
    }
  };
  return {
    platform: `ios ${Platform.Version}`,
    engineRunning: read(() => AudioDeviceModule.isEngineRunning()),
    recording: read(() => AudioDeviceModule.isRecording()),
    playing: read(() => AudioDeviceModule.isPlaying()),
    micMuted: read(() => AudioDeviceModule.isMicrophoneMuted()),
    voiceProcessing: read(() => AudioDeviceModule.isVoiceProcessingEnabled()),
    bypassed: read(() => AudioDeviceModule.isVoiceProcessingBypassed()),
    availability: read(() => AudioDeviceModule.getEngineAvailability()),
    muteMode: read(() => AudioDeviceModule.getMuteMode()),
  };
}

/** The mic is up but hearing nothing: re-assert the session and kick the input once. */
export async function reviveMic(setMuted: (m: boolean) => void) {
  if (ios) {
    try {
      await AudioSession.setAppleAudioConfiguration(DUPLEX);
    } catch {}
    try {
      if (AudioDeviceModule.isMicrophoneMuted()) await AudioDeviceModule.setMicrophoneMuted(false);
    } catch {}
    try {
      if (!AudioDeviceModule.isRecording()) await AudioDeviceModule.startRecording();
    } catch {}
  }
  try {
    setMuted(true);
    await new Promise((r) => setTimeout(r, 250));
    setMuted(false);
  } catch {}
}
