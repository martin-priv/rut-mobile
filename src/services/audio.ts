import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import {
  generateBoundaryTickWav,
  generateOutsideWarningWav,
  generateBackInsideWav,
  generateCompletionChimeWav,
} from '../utils/soundGenerator';

let tickPlayer: AudioPlayer | null = null;
let outsidePlayer: AudioPlayer | null = null;
let backInsidePlayer: AudioPlayer | null = null;
let completePlayer: AudioPlayer | null = null;
let isAudioInitialized = false;

let lastSpeakTime = 0;
let lastTickTime = 0;

export async function initAudio(): Promise<void> {
  if (isAudioInitialized) return;

  try {
    // Configure audio mode to keep playing when screen is locked or silent switch is on
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'duckOthers',
    });

    tickPlayer = createAudioPlayer({ uri: generateBoundaryTickWav() });
    outsidePlayer = createAudioPlayer({ uri: generateOutsideWarningWav() });
    backInsidePlayer = createAudioPlayer({ uri: generateBackInsideWav() });
    completePlayer = createAudioPlayer({ uri: generateCompletionChimeWav() });

    isAudioInitialized = true;
  } catch (err) {
    console.warn('Could not initialize audio sounds:', err);
  }
}

/**
 * Plays a proximity tick when near boundary.
 */
export async function playBoundaryTick(): Promise<void> {
  const now = Date.now();
  if (now - lastTickTime < 180) return;
  lastTickTime = now;

  try {
    if (!tickPlayer) await initAudio();
    if (tickPlayer) {
      tickPlayer.seekTo(0).catch(() => {});
      tickPlayer.play();
    }
  } catch (e) {
    // Audio replay error fallback
  }
}

/**
 * Plays a warning sound when stepping outside the boundary.
 */
export async function playOutsideWarning(): Promise<void> {
  try {
    if (!outsidePlayer) await initAudio();
    if (outsidePlayer) {
      outsidePlayer.seekTo(0).catch(() => {});
      outsidePlayer.play();
    }
  } catch (e) {}
}

/**
 * Plays an upward confirmation sound when stepping back into the cell.
 */
export async function playBackInsideSound(): Promise<void> {
  try {
    if (!backInsidePlayer) await initAudio();
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
    if (!completePlayer) await initAudio();
    if (completePlayer) {
      completePlayer.seekTo(0).catch(() => {});
      completePlayer.play();
    }
  } catch (e) {}
}

/**
 * Speaks a Swedish text prompt in the user's headphones.
 * Throttles non-urgent messages so they don't overlap.
 */
export function speakCue(text: string, force = false): void {
  const now = Date.now();
  // Don't interrupt unless forced, wait at least 3 seconds between spoken cues
  if (!force && now - lastSpeakTime < 3000) return;
  lastSpeakTime = now;

  try {
    Speech.stop();
    Speech.speak(text, {
      language: 'sv-SE',
      pitch: 1.0,
      rate: 1.05, // slightly brisk for natural field feedback
    });
  } catch (err) {
    console.warn('Speech synthesis failed:', err);
  }
}
