import { clamp } from "./audioBufferUtils";

export interface WavExportOptions {
  bitDepth: 16 | 24;
}

function writeString(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function interleave(buffer: AudioBuffer): Float32Array {
  const channelCount = buffer.numberOfChannels;
  const length = buffer.length;
  const output = new Float32Array(length * channelCount);

  for (let frame = 0; frame < length; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      output[frame * channelCount + channel] = buffer.getChannelData(channel)[frame] ?? 0;
    }
  }

  return output;
}

function writePcm16(view: DataView, offset: number, sample: number): void {
  const safeSample = clamp(sample, -1, 1);
  const value = safeSample < 0 ? safeSample * 0x8000 : safeSample * 0x7fff;
  view.setInt16(offset, Math.round(value), true);
}

function writePcm24(view: DataView, offset: number, sample: number): void {
  const safeSample = clamp(sample, -1, 1);
  const value = Math.round(safeSample < 0 ? safeSample * 0x800000 : safeSample * 0x7fffff);

  view.setUint8(offset, value & 0xff);
  view.setUint8(offset + 1, (value >> 8) & 0xff);
  view.setUint8(offset + 2, (value >> 16) & 0xff);
}

export function encodeWavFromAudioBuffer(
  buffer: AudioBuffer,
  options: WavExportOptions = { bitDepth: 24 }
): Blob {
  const bitDepth = options.bitDepth;
  const bytesPerSample = bitDepth / 8;
  const channelCount = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const samples = interleave(buffer);
  const dataSize = samples.length * bytesPerSample;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");

  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, bitDepth, true);

  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    if (bitDepth === 24) {
      writePcm24(view, offset, samples[index]);
    } else {
      writePcm16(view, offset, samples[index]);
    }
    offset += bytesPerSample;
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

export function buildSafeAudioFilename(sourceName: string | null, suffix: string, extension: "wav" | "flac" = "wav"): string {
  const baseName = sourceName?.replace(/\.[^/.]+$/, "") || "paxlab-audio";
  const safeBaseName = baseName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  return `${safeBaseName || "paxlab-audio"}-${suffix}.${extension}`;
}
