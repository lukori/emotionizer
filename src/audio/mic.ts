let noiseFloor = 0.08; // raised by sensitivity slider in loud environments

export function setNoiseFloor(v: number): void {
  noiseFloor = Math.max(0, Math.min(0.95, v));
}

let analyser: AnalyserNode | null = null;
let source: MediaStreamAudioSourceNode | null = null;
let stream: MediaStream | null = null;
let audioCtx: AudioContext | null = null;
let freqData: Uint8Array<ArrayBuffer> = new Uint8Array(0);

export async function startMic(): Promise<boolean> {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioCtx = new AudioContext();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    freqData = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
    source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    return true;
  } catch {
    return false;
  }
}

export function stopMic(): void {
  source?.disconnect();
  stream?.getTracks().forEach((t) => t.stop());
  audioCtx?.close().catch(() => {});
  audioCtx = null;
  analyser = null;
  source = null;
  stream = null;
  freqData = new Uint8Array(0) as Uint8Array<ArrayBuffer>;
}

export function isMicActive(): boolean {
  return analyser !== null;
}

export function getFrequencyBars(count: number): number[] {
  if (!analyser) return Array(count).fill(0);
  analyser.getByteFrequencyData(freqData);
  const binRange = Math.floor(freqData.length * 0.4);
  const step = binRange / count;
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    result.push(freqData[Math.floor(i * step)] / 255);
  }
  return result;
}

export function getRms(): number {
  if (!analyser) return 0;
  analyser.getByteFrequencyData(freqData);
  let sum = 0;
  for (const v of freqData) sum += v * v;
  return Math.sqrt(sum / freqData.length) / 255;
}

/**
 * Returns { rms, tilt } for lip-sync frame selection.
 * tilt = ratio of upper-mid (F2 region ~1.4–3kHz) to mid (F1 region ~500–1.2kHz) energy.
 * High tilt → bright/EE sounds; low tilt → round/O sounds.
 * Assumes fftSize=256, sampleRate≈44100 → ~172Hz per bin.
 */
export function getSpeechFeatures(): { rms: number; tilt: number } {
  if (!analyser) return { rms: 0, tilt: 0 };
  analyser.getByteFrequencyData(freqData);

  let sum = 0;
  for (const v of freqData) sum += v * v;
  const rawRms = Math.sqrt(sum / freqData.length) / 255;
  const rms = Math.max(0, (rawRms - noiseFloor) / Math.max(0.01, 1 - noiseFloor));

  // bins 3–7  ≈ 516–1204 Hz  (F1 region)
  // bins 8–17 ≈ 1376–2924 Hz (F2 region, EE second formant lives here)
  let midSum = 0;
  for (let i = 3; i <= 7; i++) midSum += freqData[i];
  let upperSum = 0;
  for (let i = 8; i <= 17; i++) upperSum += freqData[i];

  const midAvg = midSum / 5;
  const upperAvg = upperSum / 10;
  const tilt = midAvg > 8 ? upperAvg / (midAvg + 1) : 0;

  return { rms, tilt };
}
