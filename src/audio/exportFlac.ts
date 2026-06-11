import { clamp } from "./audioBufferUtils";

export interface FlacExportOptions {
  bitDepth: 16 | 24;
  blockSize?: number;
}

interface FlacFrameInfo {
  frameIndex: number;
  startSample: number;
  blockSamples: number;
  byteLength: number;
}

const DEFAULT_BLOCK_SIZE = 4096;

function writeString(view: DataView, offset: number, value: string): number {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }

  return offset + value.length;
}

function writeUint24(view: DataView, offset: number, value: number): number {
  const safeValue = Math.min(0xffffff, Math.max(0, Math.round(value)));
  view.setUint8(offset, (safeValue >> 16) & 0xff);
  view.setUint8(offset + 1, (safeValue >> 8) & 0xff);
  view.setUint8(offset + 2, safeValue & 0xff);
  return offset + 3;
}

function getBytesPerSample(bitDepth: 16 | 24): number {
  return bitDepth / 8;
}

function getSampleSizeCode(bitDepth: 16 | 24): number {
  return bitDepth === 16 ? 4 : 6;
}

function utf8NumberLength(value: number): number {
  if (value < 0x80) return 1;
  if (value < 0x800) return 2;
  if (value < 0x10000) return 3;
  if (value < 0x200000) return 4;
  if (value < 0x4000000) return 5;
  return 6;
}

function writeUtf8Number(view: DataView, offset: number, value: number): number {
  if (value < 0x80) {
    view.setUint8(offset, value);
    return offset + 1;
  }

  const length = utf8NumberLength(value);
  const bytes = new Array<number>(length);

  for (let index = length - 1; index > 0; index -= 1) {
    bytes[index] = 0x80 | (value & 0x3f);
    value >>= 6;
  }

  const firstByteMasks = [0, 0, 0xc0, 0xe0, 0xf0, 0xf8, 0xfc];
  const payloadBits = 8 - length - 1;
  bytes[0] = firstByteMasks[length] | (value & ((1 << payloadBits) - 1));

  for (let index = 0; index < bytes.length; index += 1) {
    view.setUint8(offset + index, bytes[index]);
  }

  return offset + length;
}

function crc8(view: DataView, start: number, length: number): number {
  let crc = 0;

  for (let offset = start; offset < start + length; offset += 1) {
    crc ^= view.getUint8(offset);
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x80) !== 0 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
  }

  return crc;
}

function crc16(view: DataView, start: number, length: number): number {
  let crc = 0;

  for (let offset = start; offset < start + length; offset += 1) {
    crc ^= view.getUint8(offset) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x8005) & 0xffff : (crc << 1) & 0xffff;
    }
  }

  return crc;
}

function writeFrameHeader(
  view: DataView,
  offset: number,
  frameIndex: number,
  blockSamples: number,
  channelCount: number,
  bitDepth: 16 | 24
): number {
  const start = offset;
  const blockSizeCode = 7;
  const sampleRateCode = 0;
  const channelAssignment = channelCount - 1;
  const sampleSizeCode = getSampleSizeCode(bitDepth);

  view.setUint8(offset, 0xff);
  view.setUint8(offset + 1, 0xf8);
  view.setUint8(offset + 2, (blockSizeCode << 4) | sampleRateCode);
  view.setUint8(offset + 3, (channelAssignment << 4) | (sampleSizeCode << 1));
  offset += 4;

  offset = writeUtf8Number(view, offset, frameIndex);
  view.setUint16(offset, blockSamples - 1, false);
  offset += 2;

  view.setUint8(offset, crc8(view, start, offset - start));
  return offset + 1;
}

function floatToSignedInteger(sample: number, bitDepth: 16 | 24): number {
  const safeSample = clamp(sample, -1, 1);

  if (bitDepth === 16) {
    const value = safeSample < 0 ? safeSample * 0x8000 : safeSample * 0x7fff;
    return Math.max(-0x8000, Math.min(0x7fff, Math.round(value)));
  }

  const value = safeSample < 0 ? safeSample * 0x800000 : safeSample * 0x7fffff;
  return Math.max(-0x800000, Math.min(0x7fffff, Math.round(value)));
}

function writeSignedSample(view: DataView, offset: number, sample: number, bitDepth: 16 | 24): number {
  const value = floatToSignedInteger(sample, bitDepth);

  if (bitDepth === 16) {
    view.setInt16(offset, value, false);
    return offset + 2;
  }

  const unsignedValue = value < 0 ? value + 0x1000000 : value;
  view.setUint8(offset, (unsignedValue >> 16) & 0xff);
  view.setUint8(offset + 1, (unsignedValue >> 8) & 0xff);
  view.setUint8(offset + 2, unsignedValue & 0xff);
  return offset + 3;
}

function getFrameByteLength(frameIndex: number, blockSamples: number, channelCount: number, bitDepth: 16 | 24): number {
  const headerLength = 4 + utf8NumberLength(frameIndex) + 2 + 1;
  const subframesLength = channelCount * (1 + blockSamples * getBytesPerSample(bitDepth));
  const crcLength = 2;
  return headerLength + subframesLength + crcLength;
}

function getFrameInfos(sampleCount: number, channelCount: number, bitDepth: 16 | 24, blockSize: number): FlacFrameInfo[] {
  const frames: FlacFrameInfo[] = [];

  for (let startSample = 0, frameIndex = 0; startSample < sampleCount; startSample += blockSize, frameIndex += 1) {
    const blockSamples = Math.min(blockSize, sampleCount - startSample);
    frames.push({
      frameIndex,
      startSample,
      blockSamples,
      byteLength: getFrameByteLength(frameIndex, blockSamples, channelCount, bitDepth)
    });
  }

  return frames;
}

function writeStreamInfo(
  view: DataView,
  offset: number,
  sampleRate: number,
  sampleCount: number,
  channelCount: number,
  bitDepth: 16 | 24,
  minBlockSize: number,
  maxBlockSize: number,
  minFrameSize: number,
  maxFrameSize: number
): number {
  view.setUint8(offset, 0x80);
  offset = writeUint24(view, offset + 1, 34);

  view.setUint16(offset, minBlockSize, false);
  view.setUint16(offset + 2, maxBlockSize, false);
  offset += 4;

  offset = writeUint24(view, offset, minFrameSize);
  offset = writeUint24(view, offset, maxFrameSize);

  const streamInfoBits =
    (BigInt(sampleRate) << 44n) |
    (BigInt(channelCount - 1) << 41n) |
    (BigInt(bitDepth - 1) << 36n) |
    BigInt(sampleCount);

  for (let byteIndex = 7; byteIndex >= 0; byteIndex -= 1) {
    view.setUint8(offset + (7 - byteIndex), Number((streamInfoBits >> BigInt(byteIndex * 8)) & 0xffn));
  }
  offset += 8;

  for (let index = 0; index < 16; index += 1) {
    view.setUint8(offset + index, 0);
  }

  return offset + 16;
}

export function encodeFlacFromAudioBuffer(
  buffer: AudioBuffer,
  options: FlacExportOptions = { bitDepth: 24 }
): Blob {
  const bitDepth = options.bitDepth;
  const blockSize = Math.min(65535, Math.max(16, Math.round(options.blockSize ?? DEFAULT_BLOCK_SIZE)));
  const channelCount = buffer.numberOfChannels;
  const sampleCount = buffer.length;
  const sampleRate = Math.round(buffer.sampleRate);

  if (channelCount < 1 || channelCount > 8) {
    throw new Error("L’export FLAC local supporte 1 à 8 canaux.");
  }

  if (sampleRate < 1 || sampleRate > 0xfffff) {
    throw new Error("Fréquence d’échantillonnage non supportée pour l’export FLAC.");
  }

  if (sampleCount <= 0) {
    throw new Error("Aucun échantillon à exporter.");
  }

  const frames = getFrameInfos(sampleCount, channelCount, bitDepth, blockSize);
  const minBlockSize = Math.min(...frames.map((frame) => frame.blockSamples));
  const maxBlockSize = Math.max(...frames.map((frame) => frame.blockSamples));
  const minFrameSize = Math.min(...frames.map((frame) => frame.byteLength));
  const maxFrameSize = Math.max(...frames.map((frame) => frame.byteLength));
  const metadataLength = 4 + 4 + 34;
  const totalLength = metadataLength + frames.reduce((sum, frame) => sum + frame.byteLength, 0);
  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);
  const channelData = Array.from({ length: channelCount }, (_, channel) => buffer.getChannelData(channel));

  let offset = writeString(view, 0, "fLaC");
  offset = writeStreamInfo(
    view,
    offset,
    sampleRate,
    sampleCount,
    channelCount,
    bitDepth,
    minBlockSize,
    maxBlockSize,
    minFrameSize,
    maxFrameSize
  );

  for (const frame of frames) {
    const frameStart = offset;
    offset = writeFrameHeader(view, offset, frame.frameIndex, frame.blockSamples, channelCount, bitDepth);

    for (let channel = 0; channel < channelCount; channel += 1) {
      view.setUint8(offset, 0x02);
      offset += 1;

      const samples = channelData[channel];
      const endSample = frame.startSample + frame.blockSamples;
      for (let sampleIndex = frame.startSample; sampleIndex < endSample; sampleIndex += 1) {
        offset = writeSignedSample(view, offset, samples[sampleIndex] ?? 0, bitDepth);
      }
    }

    const frameCrc = crc16(view, frameStart, offset - frameStart);
    view.setUint16(offset, frameCrc, false);
    offset += 2;
  }

  return new Blob([arrayBuffer], { type: "audio/flac" });
}
