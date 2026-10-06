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
 * 25ms soft boundary proximity tick (440Hz blip with fast decay)
 */
export function generateBoundaryTickWav(): string {
  const sampleRate = 22050;
  const duration = 0.035; // 35ms
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Uint8Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const decay = Math.exp(-t * 90);
    const wave = Math.sin(2 * Math.PI * 660 * t);
    samples[i] = Math.floor(128 + 110 * wave * decay);
  }

  const header = createWavHeader(numSamples, sampleRate);
  const combined = new Uint8Array(header.length + samples.length);
  combined.set(header);
  combined.set(samples, header.length);

  return `data:audio/wav;base64,${uint8ToBase64(combined)}`;
}

/**
 * 120ms low buzz tone for crossing outside cell (160Hz)
 */
export function generateOutsideWarningWav(): string {
  const sampleRate = 22050;
  const duration = 0.15; // 150ms
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Uint8Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const decay = 1 - (i / numSamples) * 0.4;
    const wave = Math.sin(2 * Math.PI * 160 * t);
    samples[i] = Math.floor(128 + 100 * wave * decay);
  }

  const header = createWavHeader(numSamples, sampleRate);
  const combined = new Uint8Array(header.length + samples.length);
  combined.set(header);
  combined.set(samples, header.length);

  return `data:audio/wav;base64,${uint8ToBase64(combined)}`;
}

/**
 * 350ms celebration chime for completed cell (523Hz -> 1046Hz)
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
