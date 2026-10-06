import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import {
  generateStereoBoundaryTickWav,
  generateStereoOutsideWarningWav,
  generateBackInsideWav,
  generateCompletionChimeWav,
} from '../utils/soundGenerator';

const PAN_BUCKETS = [-1.0, -0.67, -0.33, 0.0, 0.33, 0.67, 1.0];

let tickPlayers: AudioPlayer[] = [];
let outsidePlayers: AudioPlayer[] = [];
let backInsidePlayer: AudioPlayer | null = null;
let completePlayer: AudioPlayer | null = null;
let isAudioInitialized = false;

let lastSpeakTime = 0;
let lastTickTime = 0;

function getBucketIndex(pan: number): number {
  const clamped = Math.max(-1.0, Math.min(1.0, pan));
  return Math.max(0, Math.min(6, Math.round((clamped + 1) * 3)));
}

export async function initAudio(): Promise<void> {
  if (isAudioInitialized) return;

  try {
    // Configure audio mode to keep playing in background with other audio ducked
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'duckOthers',
    });

    // Pre-initialize stereo players for each spatial pan bucket
    tickPlayers = PAN_BUCKETS.map(pan =>
      createAudioPlayer({ uri: generateStereoBoundaryTickWav(pan) })
    );

    outsidePlayers = PAN_BUCKETS.map(pan =>
      createAudioPlayer({ uri: generateStereoOutsideWarningWav(pan) })
    );

    backInsidePlayer = createAudioPlayer({ uri: generateBackInsideWav() });
    completePlayer = createAudioPlayer({ uri: generateCompletionChimeWav() });

    isAudioInitialized = true;
  } catch (err) {
    console.warn('Could not initialize audio sounds:', err);
  }
}

/**
 * Plays a proximity tick near boundary with spatial stereo panning.
 * pan: -1.0 (Left ear) to +1.0 (Right ear), 0.0 (Center).
 */
export async function playBoundaryTick(pan: number = 0.0): Promise<void> {
  const now = Date.now();
  if (now - lastTickTime < 180) return;
  lastTickTime = now;

  try {
    if (!isAudioInitialized) await initAudio();
    const idx = getBucketIndex(pan);
    const player = tickPlayers[idx];
    if (player) {
      player.seekTo(0).catch(() => {});
      player.play();
    }
  } catch (e) {
    // Audio replay fallback
  }
}

/**
 * Plays a warning sound when stepping outside the boundary with spatial panning
 * pointing towards the safe inside zone so user turns towards the sound.
 * pan: -1.0 (Left ear) to +1.0 (Right ear), 0.0 (Center).
 */
export async function playOutsideWarning(pan: number = 0.0): Promise<void> {
  try {
    if (!isAudioInitialized) await initAudio();
    const idx = getBucketIndex(pan);
    const player = outsidePlayers[idx];
    if (player) {
      player.seekTo(0).catch(() => {});
      player.play();
    }
  } catch (e) {}
}

/**
 * Plays an upward confirmation sound when stepping back into the cell.
 */
export async function playBackInsideSound(): Promise<void> {
  try {
    if (!isAudioInitialized) await initAudio();
    if (backInsidePlayer) {
      backInsidePlayer.seekTo(0).catch(() => {});
      backInsidePlayer.play();
    }
  } catch (e) {}
}

/**
 * Plays a celebratory chime when a cell is completed.
 */
export async function playCompletionChime(): Promise<void> {
  try {
    if (!isAudioInitialized) await initAudio();
    if (completePlayer) {
      completePlayer.seekTo(0).catch(() => {});
      completePlayer.play();
    }
  } catch (e) {}
}

/**
 * Speaks a Swedish text prompt in the user's headphones (if voice enabled).
 */
export function speakCue(text: string, force = false): void {
  const now = Date.now();
  if (!force && now - lastSpeakTime < 3000) return;
  lastSpeakTime = now;

  try {
    Speech.stop();
    Speech.speak(text, {
      language: 'sv-SE',
      pitch: 1.0,
      rate: 1.05,
    });
  } catch (err) {
    console.warn('Speech synthesis failed:', err);
  }
}
