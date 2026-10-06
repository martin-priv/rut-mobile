/**
 * Generates lightweight base64 WAV sound data URIs procedurally with true STEREO PANNING.
 * This guarantees 100% offline self-contained spatial audio feedback in headphones.
 */

function createStereoWavHeader(numFrames: number, sampleRate: number = 22050): Uint8Array {
  const dataLength = numFrames * 2; // 2 channels (stereo), 1 byte per sample (8-bit)
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);

  // RIFF chunk descriptor
  header.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  view.setUint32(4, 36 + dataLength, true);
  header.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"

  // "fmt " sub-chunk
  header.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, 2, true); // NumChannels (2 = STEREO)
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * 2, true); // ByteRate (sampleRate * 2 channels * 1 byte)
  view.setUint16(32, 2, true); // BlockAlign (2 channels * 1 byte)
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
 * 60ms crisp boundary proximity sonar ping (880Hz / A5 blip) with equal-power stereo panning.
 * pan: -1.0 (Full Left) to +1.0 (Full Right), 0.0 is Center.
 */
export function generateStereoBoundaryTickWav(pan: number = 0.0): string {
  const sampleRate = 22050;
  const duration = 0.06; // 60ms
  const numFrames = Math.floor(sampleRate * duration);
  const data = new Uint8Array(numFrames * 2);

  // Equal-power panning rule
  const p = Math.max(-1, Math.min(1, pan));
  const angle = (p + 1) * (Math.PI / 4); // 0 (left) to PI/2 (right)
  const leftVol = Math.cos(angle);
  const rightVol = Math.sin(angle);

  for (let i = 0; i < numFrames; i++) {
    const t = i / sampleRate;
    const decay = Math.exp(-t * 50);
    const wave = Math.sin(2 * Math.PI * 880 * t) * decay;

    data[i * 2] = Math.floor(128 + 120 * wave * leftVol);
    data[i * 2 + 1] = Math.floor(128 + 120 * wave * rightVol);
  }

  const header = createStereoWavHeader(numFrames, sampleRate);
  const combined = new Uint8Array(header.length + data.length);
  combined.set(header);
  combined.set(data, header.length);

  return `data:audio/wav;base64,${uint8ToBase64(combined)}`;
}

/**
 * 220ms distinct dual-burst alert for crossing outside cell ("BOP-BOP") with stereo panning.
 * Panned towards the inside safe zone so user can turn towards the sound!
 */
export function generateStereoOutsideWarningWav(pan: number = 0.0): string {
  const sampleRate = 22050;
  const duration = 0.22; // 220ms
  const numFrames = Math.floor(sampleRate * duration);
  const data = new Uint8Array(numFrames * 2);

  const p = Math.max(-1, Math.min(1, pan));
  const angle = (p + 1) * (Math.PI / 4);
  const leftVol = Math.cos(angle);
  const rightVol = Math.sin(angle);

  for (let i = 0; i < numFrames; i++) {
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
    const wave = Math.max(-127, Math.min(127, amp * 85));
    data[i * 2] = Math.floor(128 + wave * leftVol);
    data[i * 2 + 1] = Math.floor(128 + wave * rightVol);
  }

  const header = createStereoWavHeader(numFrames, sampleRate);
  const combined = new Uint8Array(header.length + data.length);
  combined.set(header);
  combined.set(data, header.length);

  return `data:audio/wav;base64,${uint8ToBase64(combined)}`;
}

/**
 * 180ms upward confirmation chime when stepping back inside the cell (523Hz -> 880Hz).
 * Centered stereo.
 */
export function generateBackInsideWav(): string {
  const sampleRate = 22050;
  const duration = 0.18; // 180ms
  const numFrames = Math.floor(sampleRate * duration);
  const data = new Uint8Array(numFrames * 2);

  for (let i = 0; i < numFrames; i++) {
    const t = i / sampleRate;
    let wave = 0;
    if (t < 0.08) {
      wave = Math.sin(2 * Math.PI * 523 * t) * Math.exp(-t * 20);
    } else {
      const t2 = t - 0.08;
      wave = Math.sin(2 * Math.PI * 880 * t2) * Math.exp(-t2 * 20);
    }
    const sample = Math.floor(128 + 115 * wave);
    data[i * 2] = sample;
    data[i * 2 + 1] = sample;
  }

  const header = createStereoWavHeader(numFrames, sampleRate);
  const combined = new Uint8Array(header.length + data.length);
  combined.set(header);
  combined.set(data, header.length);

  return `data:audio/wav;base64,${uint8ToBase64(combined)}`;
}

/**
 * 450ms celebration chime for completed cell (587Hz -> 1175Hz).
 * Centered stereo.
 */
export function generateCompletionChimeWav(): string {
  const sampleRate = 22050;
  const duration = 0.45; // 450ms
  const numFrames = Math.floor(sampleRate * duration);
  const data = new Uint8Array(numFrames * 2);

  for (let i = 0; i < numFrames; i++) {
    const t = i / sampleRate;
    const freq = t < 0.15 ? 587.33 : 1174.66; // D5 -> D6
    const noteT = t < 0.15 ? t : t - 0.15;
    const decay = Math.exp(-noteT * 7);
    const wave = Math.sin(2 * Math.PI * freq * t);
    const sample = Math.floor(128 + 115 * wave * decay);
    data[i * 2] = sample;
    data[i * 2 + 1] = sample;
  }

  const header = createStereoWavHeader(numFrames, sampleRate);
  const combined = new Uint8Array(header.length + data.length);
  combined.set(header);
  combined.set(data, header.length);

  return `data:audio/wav;base64,${uint8ToBase64(combined)}`;
}
