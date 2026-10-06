/**
 * Generates lightweight base64 WAV sound data URIs procedurally.
 * This guarantees 100% offline self-contained audio feedback
 * without requiring any downloaded assets.
 */

function createWavHeader(dataLength: number, sampleRate: number = 22050): Uint8Array {
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);

  // RIFF chunk descriptor
  header.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  view.setUint32(4, 36 + dataLength, true);
  header.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"

  // "fmt " sub-chunk
  header.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, 1, true); // NumChannels (1 for mono)
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate, true); // ByteRate (SampleRate * 1 * 1)
  view.setUint16(32, 1, true); // BlockAlign (1 * 1)
  view.setUint16(34, 8, true); // BitsPerSample (8-bit PCM)

  // "data" sub-chunk
  header.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
  view.setUint32(40, dataLength, true);

  return header;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * 60ms crisp boundary proximity sonar ping (880Hz / A5 blip).
 * Designed to cut through hearing protection and engine rumble.
 */
export function generateBoundaryTickWav(): string {
  const sampleRate = 22050;
  const duration = 0.06; // 60ms
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Uint8Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const decay = Math.exp(-t * 50);
    const wave = Math.sin(2 * Math.PI * 880 * t);
    samples[i] = Math.floor(128 + 120 * wave * decay);
  }

  const header = createWavHeader(numSamples, sampleRate);
  const combined = new Uint8Array(header.length + samples.length);
  combined.set(header);
  combined.set(samples, header.length);

  return `data:audio/wav;base64,${uint8ToBase64(combined)}`;
}

/**
 * 220ms distinct dual-burst alert for crossing outside cell ("BOP-BOP").
 * 260Hz + 220Hz with harmonics, unmistakably warning you to turn around.
 */
export function generateOutsideWarningWav(): string {
  const sampleRate = 22050;
  const duration = 0.22; // 220ms
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Uint8Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let amp = 0;
    if (t < 0.09) {
      // First pulse (260Hz)
      amp = Math.sin(2 * Math.PI * 260 * t) + 0.4 * Math.sin(2 * Math.PI * 520 * t);
    } else if (t >= 0.12 && t < 0.21) {
      // Second pulse (220Hz)
      const t2 = t - 0.12;
      amp = Math.sin(2 * Math.PI * 220 * t2) + 0.4 * Math.sin(2 * Math.PI * 440 * t2);
    }
    samples[i] = Math.floor(128 + Math.max(-127, Math.min(127, amp * 85)));
  }

  const header = createWavHeader(numSamples, sampleRate);
  const combined = new Uint8Array(header.length + samples.length);
  combined.set(header);
  combined.set(samples, header.length);

  return `data:audio/wav;base64,${uint8ToBase64(combined)}`;
}

/**
 * 180ms upward confirmation chime when stepping back inside the cell (523Hz -> 880Hz).
 * Gives immediate positive auditory reassurance without needing speech.
 */
export function generateBackInsideWav(): string {
  const sampleRate = 22050;
  const duration = 0.18; // 180ms
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Uint8Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let wave = 0;
    if (t < 0.08) {
      wave = Math.sin(2 * Math.PI * 523 * t) * Math.exp(-t * 20);
    } else {
      const t2 = t - 0.08;
      wave = Math.sin(2 * Math.PI * 880 * t2) * Math.exp(-t2 * 20);
    }
    samples[i] = Math.floor(128 + 115 * wave);
  }

  const header = createWavHeader(numSamples, sampleRate);
  const combined = new Uint8Array(header.length + samples.length);
  combined.set(header);
  combined.set(samples, header.length);

  return `data:audio/wav;base64,${uint8ToBase64(combined)}`;
}

/**
 * 450ms celebration chime for completed cell (587Hz -> 1175Hz).
 */
export function generateCompletionChimeWav(): string {
  const sampleRate = 22050;
  const duration = 0.45; // 450ms
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Uint8Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const freq = t < 0.15 ? 587.33 : 1174.66; // D5 -> D6
    const noteT = t < 0.15 ? t : t - 0.15;
    const decay = Math.exp(-noteT * 7);
    const wave = Math.sin(2 * Math.PI * freq * t);
    samples[i] = Math.floor(128 + 115 * wave * decay);
  }

  const header = createWavHeader(numSamples, sampleRate);
  const combined = new Uint8Array(header.length + samples.length);
  combined.set(header);
  combined.set(samples, header.length);

  return `data:audio/wav;base64,${uint8ToBase64(combined)}`;
}
