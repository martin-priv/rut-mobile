import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import {
  generateBoundaryTickWav,
  generateOutsideWarningWav,
  generateCompletionChimeWav,
} from '../utils/soundGenerator';

let tickSound: Audio.Sound | null = null;
let outsideSound: Audio.Sound | null = null;
let completeSound: Audio.Sound | null = null;
let isAudioInitialized = false;

let lastSpeakTime = 0;
let lastTickTime = 0;

export async function initAudio(): Promise<void> {
  if (isAudioInitialized) return;

  try {
    // Configure audio mode to keep playing when screen is locked or silent switch is on
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });

    const [tickObj, outsideObj, completeObj] = await Promise.all([
      Audio.Sound.createAsync({ uri: generateBoundaryTickWav() }),
      Audio.Sound.createAsync({ uri: generateOutsideWarningWav() }),
      Audio.Sound.createAsync({ uri: generateCompletionChimeWav() }),
    ]);

    tickSound = tickObj.sound;
    outsideSound = outsideObj.sound;
    completeSound = completeObj.sound;

    isAudioInitialized = true;
  } catch (err) {
    console.warn('Could not initialize audio sounds:', err);
  }
}

/**
 * Plays a proximity tick when near boundary.
 * Throttles minimum 250ms between ticks.
 */
export async function playBoundaryTick(): Promise<void> {
  const now = Date.now();
  if (now - lastTickTime < 250) return;
  lastTickTime = now;

  try {
    if (!tickSound) await initAudio();
    if (tickSound) {
      await tickSound.replayAsync();
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
    if (!outsideSound) await initAudio();
    if (outsideSound) {
      await outsideSound.replayAsync();
    }
  } catch (e) {}
}

/**
 * Plays a celebratory chime when a cell is completed.
 */
export async function playCompletionChime(): Promise<void> {
  try {
    if (!completeSound) await initAudio();
    if (completeSound) {
      await completeSound.replayAsync();
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
