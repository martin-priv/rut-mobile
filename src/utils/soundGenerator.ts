/**
 * Studio-quality 44,100 Hz 16-bit PCM Stereo procedural sound generator.
 * Zero quantization noise, smooth anti-aliased envelopes, and true equal-power spatial panning.
 */

function createStereo16WavHeader(numFrames: number, sampleRate: number = 44100): Uint8Array {
  const bytesPerSample = 2; // 16-bit PCM
  const channels = 2; // Stereo
  const dataLength = numFrames * channels * bytesPerSample;
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);

  // RIFF chunk descriptor
  header.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  view.setUint32(4, 36 + dataLength, true);
  header.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"

  // "fmt " sub-chunk
  header.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, channels, true); // 2 channels (Stereo)
  view.setUint32(24, sampleRate, true); // 44100 Hz
  view.setUint32(28, sampleRate * channels * bytesPerSample, true); // ByteRate (176400)
  view.setUint16(32, channels * bytesPerSample, true); // BlockAlign (4 bytes per sample frame)
  view.setUint16(34, 16, true); // 16-bit resolution!

  // "data" sub-chunk
  header.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
  view.setUint32(40, dataLength, true);

  return header;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  // Chunked encoding for high performance without call-stack limits
  for (let i = 0; i < len; i += 8192) {
    const chunk = bytes.subarray(i, Math.min(i + 8192, len));
    binary += String.fromCharCode.apply(null, chunk as any);
  }
  return btoa(binary);
}

/**
 * 65ms crisp, warm acoustic woodblock / sonar ping (880Hz + harmonics).
 * 16-bit 44.1kHz stereo with equal-power panning.
 * Cuts cleanly through engine/chainsaw rumble without being shrill.
 */
export function generateStereoBoundaryTickWav(pan: number = 0.0): string {
  const sampleRate = 44100;
  const duration = 0.065; // 65ms
  const numFrames = Math.floor(sampleRate * duration);
  const buffer = new ArrayBuffer(numFrames * 4); // 2 ch * 2 bytes = 4 bytes per frame
  const view = new DataView(buffer);

  // Equal-power panning rule
  const p = Math.max(-1, Math.min(1, pan));
  const angle = (p + 1) * (Math.PI / 4); // 0 (left) to PI/2 (right)
  const leftVol = Math.cos(angle);
  const rightVol = Math.sin(angle);

  for (let i = 0; i < numFrames; i++) {
    const t = i / sampleRate;
    // 2ms smooth linear attack (zero transient pop) + natural acoustic decay
    const attack = Math.min(1, t / 0.002);
    const decay = Math.exp(-t * 52);
    const env = attack * decay;

    // Harmonic blend: 880Hz fundamental + 1760Hz overtone for tactile presence
    const wave = (Math.sin(2 * Math.PI * 880 * t) + 0.35 * Math.sin(2 * Math.PI * 1760 * t)) * env;
    const amp = wave * 27000;

    const left = Math.max(-32768, Math.min(32767, Math.floor(amp * leftVol)));
    const right = Math.max(-32768, Math.min(32767, Math.floor(amp * rightVol)));

    view.setInt16(i * 4, left, true);
    view.setInt16(i * 4 + 2, right, true);
  }

  const header = createStereo16WavHeader(numFrames, sampleRate);
  const total = new Uint8Array(header.length + buffer.byteLength);
  total.set(header);
  total.set(new Uint8Array(buffer), header.length);

  return `data:audio/wav;base64,${uint8ToBase64(total)}`;
}

/**
 * 220ms modern dual-burst acoustic proximity warning ("BOP ... BOP").
 * 16-bit 44.1kHz stereo with smooth cosine attack/release (zero clicks).
 * Panned towards the safe inside zone.
 */
export function generateStereoOutsideWarningWav(pan: number = 0.0): string {
  const sampleRate = 44100;
  const duration = 0.22; // 220ms
  const numFrames = Math.floor(sampleRate * duration);
  const buffer = new ArrayBuffer(numFrames * 4);
  const view = new DataView(buffer);

  const p = Math.max(-1, Math.min(1, pan));
  const angle = (p + 1) * (Math.PI / 4);
  const leftVol = Math.cos(angle);
  const rightVol = Math.sin(angle);

  for (let i = 0; i < numFrames; i++) {
    const t = i / sampleRate;
    let wave = 0;

    // Pulse 1: 0ms to 80ms
    if (t < 0.08) {
      const p1T = t / 0.08;
      const env = Math.sin(p1T * Math.PI); // smooth cosine window
      wave = (Math.sin(2 * Math.PI * 280 * t) + 0.35 * Math.sin(2 * Math.PI * 420 * t) + 0.2 * Math.sin(2 * Math.PI * 140 * t)) * env;
    }
    // Gap: 80ms to 110ms (clean silence)
    // Pulse 2: 110ms to 190ms (slightly deeper resolving tone)
    else if (t >= 0.11 && t < 0.19) {
      const p2T = (t - 0.11) / 0.08;
      const env = Math.sin(p2T * Math.PI);
      const tRel = t - 0.11;
      wave = (Math.sin(2 * Math.PI * 250 * tRel) + 0.35 * Math.sin(2 * Math.PI * 375 * tRel) + 0.2 * Math.sin(2 * Math.PI * 125 * tRel)) * env;
    }

    const amp = wave * 26000;
    const left = Math.max(-32768, Math.min(32767, Math.floor(amp * leftVol)));
    const right = Math.max(-32768, Math.min(32767, Math.floor(amp * rightVol)));

    view.setInt16(i * 4, left, true);
    view.setInt16(i * 4 + 2, right, true);
  }

  const header = createStereo16WavHeader(numFrames, sampleRate);
  const total = new Uint8Array(header.length + buffer.byteLength);
  total.set(header);
  total.set(new Uint8Array(buffer), header.length);

  return `data:audio/wav;base64,${uint8ToBase64(total)}`;
}

/**
 * 240ms upward harmonic chime when stepping back inside the cell (C5 -> G5).
 * 16-bit 44.1kHz stereo, pleasant and reassuring.
 */
export function generateBackInsideWav(): string {
  const sampleRate = 44100;
  const duration = 0.24; // 240ms
  const numFrames = Math.floor(sampleRate * duration);
  const buffer = new ArrayBuffer(numFrames * 4);
  const view = new DataView(buffer);

  for (let i = 0; i < numFrames; i++) {
    const t = i / sampleRate;
    let wave = 0;

    if (t < 0.10) {
      // First note: C5 (523.25 Hz)
      const attack = Math.min(1, t / 0.004);
      const decay = Math.exp(-t * 18);
      const env = attack * decay;
      wave = (Math.sin(2 * Math.PI * 523.25 * t) + 0.25 * Math.sin(2 * Math.PI * 1046.5 * t)) * env;
    } else {
      // Second note: G5 (783.99 Hz)
      const t2 = t - 0.10;
      const attack = Math.min(1, t2 / 0.004);
      const decay = Math.exp(-t2 * 14);
      const env = attack * decay;
      wave = (Math.sin(2 * Math.PI * 783.99 * t2) + 0.25 * Math.sin(2 * Math.PI * 1567.98 * t2)) * env;
    }

    const amp = Math.floor(wave * 26000);
    view.setInt16(i * 4, amp, true);
    view.setInt16(i * 4 + 2, amp, true);
  }

  const header = createStereo16WavHeader(numFrames, sampleRate);
  const total = new Uint8Array(header.length + buffer.byteLength);
  total.set(header);
  total.set(new Uint8Array(buffer), header.length);

  return `data:audio/wav;base64,${uint8ToBase64(total)}`;
}

/**
 * 500ms celebratory 3-note major fanfare for completed cell (E5 -> G#5 -> E6).
 * 16-bit 44.1kHz stereo with resonant bell decay.
 */
export function generateCompletionChimeWav(): string {
  const sampleRate = 44100;
  const duration = 0.50; // 500ms
  const numFrames = Math.floor(sampleRate * duration);
  const buffer = new ArrayBuffer(numFrames * 4);
  const view = new DataView(buffer);

  for (let i = 0; i < numFrames; i++) {
    const t = i / sampleRate;
    let freq = 659.25; // E5
    let noteT = t;
    let decayRate = 12;

    if (t < 0.12) {
      freq = 659.25; // E5
      noteT = t;
    } else if (t < 0.24) {
      freq = 830.61; // G#5
      noteT = t - 0.12;
    } else {
      freq = 1318.51; // E6
      noteT = t - 0.24;
      decayRate = 6; // longer resonant ring on triumphant final note
    }

    const attack = Math.min(1, noteT / 0.004);
    const decay = Math.exp(-noteT * decayRate);
    const env = attack * decay;
    const wave = (Math.sin(2 * Math.PI * freq * noteT) + 0.25 * Math.sin(2 * Math.PI * freq * 2 * noteT)) * env;
    const amp = Math.floor(wave * 27000);

    view.setInt16(i * 4, amp, true);
    view.setInt16(i * 4 + 2, amp, true);
  }

  const header = createStereo16WavHeader(numFrames, sampleRate);
  const total = new Uint8Array(header.length + buffer.byteLength);
  total.set(header);
  total.set(new Uint8Array(buffer), header.length);

  return `data:audio/wav;base64,${uint8ToBase64(total)}`;
}
