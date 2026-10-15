import { Platform } from 'react-native';
import { AudioSession, AudioDeviceModule, setupIOSAudioManagement, type AppleAudioConfiguration } from '@livekit/react-native';

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

/** Before the call connects. */
export async function prepareLiveAudio() {
  if (!ios) return;
  try {
    if (!policySet) {
      setupIOSAudioManagement(true, { recording: DUPLEX, playout: DUPLEX, deactivateOnStop: true });
      policySet = true;
    }
  } catch {}
  try {
    // Keep the mic input initialised from the start, so the first words aren't clipped either.
    await AudioDeviceModule.setRecordingAlwaysPreparedMode(true);
  } catch {}
}

/** After the call. */
export function endLiveAudio() {
  if (!ios) return;
  AudioDeviceModule.setRecordingAlwaysPreparedMode(false).catch(() => {});
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
    prepared: read(() => AudioDeviceModule.isRecordingAlwaysPreparedMode()),
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
