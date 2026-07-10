import { buildSafeAudioFilename, encodeWavFromAudioBuffer } from "../src/audio/exportWav";

class TestAudioBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  readonly duration: number;
  private readonly channels: Float32Array[];

  constructor(options: { numberOfChannels: number; length: number; sampleRate: number }) {
    this.numberOfChannels = options.numberOfChannels;
    this.length = options.length;
    this.sampleRate = options.sampleRate;
    this.duration = options.length / options.sampleRate;
    this.channels = Array.from(
      { length: options.numberOfChannels },
      () => new Float32Array(options.length),
    );
  }

  getChannelData(channel: number): Float32Array {
    const data = this.channels[channel];
    if (!data) {
      throw new Error(`Canal invalide: ${channel}`);
    }
    return data;
  }
}

(globalThis as unknown as { AudioBuffer: typeof AudioBuffer }).AudioBuffer =
  TestAudioBuffer as unknown as typeof AudioBuffer;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function readAscii(view: DataView, offset: number, length: number): string {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(view.getUint8(offset + index));
  }
  return value;
}

async function testWav(bitDepth: 16 | 24): Promise<void> {
  const buffer = new TestAudioBuffer({ numberOfChannels: 2, length: 4800, sampleRate: 48000 }) as unknown as AudioBuffer;
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  for (let index = 0; index < buffer.length; index += 1) {
    left[index] = 0.8 * Math.sin((2 * Math.PI * 440 * index) / buffer.sampleRate);
    right[index] = 0.55 * Math.sin((2 * Math.PI * 660 * index) / buffer.sampleRate);
  }

  const blob = encodeWavFromAudioBuffer(buffer, { bitDepth });
  const bytesPerSample = bitDepth / 8;
  const expectedSize = 44 + buffer.length * buffer.numberOfChannels * bytesPerSample;
  const view = new DataView(await blob.arrayBuffer());

  assert(blob.type === "audio/wav", `${bitDepth}-bit: MIME WAV invalide.`);
  assert(blob.size === expectedSize, `${bitDepth}-bit: taille WAV invalide.`);
  assert(readAscii(view, 0, 4) === "RIFF", `${bitDepth}-bit: entête RIFF absent.`);
  assert(readAscii(view, 8, 4) === "WAVE", `${bitDepth}-bit: entête WAVE absent.`);
  assert(readAscii(view, 12, 4) === "fmt ", `${bitDepth}-bit: bloc fmt absent.`);
  assert(readAscii(view, 36, 4) === "data", `${bitDepth}-bit: bloc data absent.`);
  assert(view.getUint16(22, true) === 2, `${bitDepth}-bit: nombre de canaux invalide.`);
  assert(view.getUint32(24, true) === 48000, `${bitDepth}-bit: sample rate invalide.`);
  assert(view.getUint16(34, true) === bitDepth, `${bitDepth}-bit: profondeur invalide.`);
  assert(view.getUint32(40, true) === expectedSize - 44, `${bitDepth}-bit: taille data invalide.`);
}

function testSafeFilenames(): void {
  assert(
    buildSafeAudioFilename("Été / Démo.wav", "paxlab-preview-2-24bit", "flac") ===
      "ete-demo-paxlab-preview-2-24bit.flac",
    "Le nom FLAC doit être normalisé.",
  );
  assert(
    buildSafeAudioFilename("Track.mp3", "paxlab-preview-3-16bit", "wav") ===
      "track-paxlab-preview-3-16bit.wav",
    "Le nom WAV doit conserver le suffixe demandé.",
  );
}

async function main(): Promise<void> {
  await testWav(16);
  console.log("OK - WAV 16-bit");
  await testWav(24);
  console.log("OK - WAV 24-bit");
  testSafeFilenames();
  console.log("OK - noms export");
  console.log("Export tests: 3/3 OK");
}

void main().catch((error: unknown) => {
  console.error(error);
  throw error;
});
