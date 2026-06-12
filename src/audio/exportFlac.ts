import { clamp } from "./audioBufferUtils";

export interface FlacExportOptions {
  bitDepth: 16 | 24;
  compression?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  chunkSamples?: number;
}

type FlacRuntime = {
  isReady?: () => boolean;
  on?: (event: string, callback: () => void) => void;
  onready?: (callback: () => void) => void;
  off?: (event: string, callback: () => void) => void;
  create_libflac_encoder: (...args: unknown[]) => number;
  init_encoder_stream: (...args: unknown[]) => number;
  init_encoder_ogg_stream: (...args: unknown[]) => number;
  FLAC__stream_encoder_process_interleaved: (...args: unknown[]) => number;
  FLAC__stream_encoder_finish: (...args: unknown[]) => number;
  FLAC__stream_encoder_get_state: (...args: unknown[]) => number;
  FLAC__stream_encoder_delete: (...args: unknown[]) => void;
};

class BrowserFlacEncoder {
  private readonly Flac: FlacRuntime;
  private readonly id: number;
  private readonly channelCount: number;
  private readonly data: Uint8Array[] = [];
  private initializedValue = false;
  private finishedValue = false;

  constructor(
    flac: FlacRuntime,
    options: {
      sampleRate: number;
      channels: number;
      bitsPerSample: number;
      compression: number;
      totalSamples: number;
      verify: boolean;
      isOgg: boolean;
    }
  ) {
    this.Flac = flac;
    this.channelCount = options.channels;
    this.id = flac.create_libflac_encoder(
      options.sampleRate,
      options.channels,
      options.bitsPerSample,
      options.compression,
      options.totalSamples,
      options.verify
    );

    if (!this.id) {
      return;
    }

    const writeCallback = (chunk: Uint8Array) => {
      const copy = new Uint8Array(chunk.byteLength);
      copy.set(chunk);
      this.data.push(copy);
    };

    const initStatus = options.isOgg
      ? flac.init_encoder_ogg_stream(this.id, writeCallback, undefined)
      : flac.init_encoder_stream(this.id, writeCallback, undefined);

    this.initializedValue = initStatus === 0;
  }

  get initialized(): boolean {
    return this.initializedValue;
  }

  encode(pcmData?: Int32Array, numberOfSamples?: number, isInterleaved = true): boolean {
    if (!this.id || !this.initializedValue || this.finishedValue) {
      return false;
    }

    if (!pcmData) {
      return this.finish();
    }

    if (!isInterleaved) {
      throw new Error("Encodage FLAC non interleavé non supporté.");
    }

    const sampleCount =
      numberOfSamples ?? Math.floor(pcmData.length / Math.max(1, this.channelCount));

    return Boolean(this.Flac.FLAC__stream_encoder_process_interleaved(this.id, pcmData, sampleCount));
  }

  getSamples(): Uint8Array {
    const totalLength = this.data.reduce((total, chunk) => total + chunk.byteLength, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of this.data) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return merged;
  }

  destroy(): void {
    if (this.id) {
      this.Flac.FLAC__stream_encoder_delete(this.id);
    }
    this.data.length = 0;
    this.initializedValue = false;
    this.finishedValue = true;
  }

  private finish(): boolean {
    const ok = Boolean(this.Flac.FLAC__stream_encoder_finish(this.id));
    this.finishedValue = ok;
    return ok;
  }
}

type SparkMd5ArrayBuffer = {
  append: (buffer: ArrayBuffer) => void;
  end: () => string;
};

type FlacModules = {
  Flac: FlacRuntime;
  SparkMD5ArrayBuffer: new () => SparkMd5ArrayBuffer;
};

const DEFAULT_COMPRESSION_LEVEL = 5;
const DEFAULT_CHUNK_SAMPLES = 65536;
let flacModulesPromise: Promise<FlacModules> | null = null;
let flacReadyPromise: Promise<void> | null = null;

function getBasePath(): string {
  const base = import.meta.env.BASE_URL || "/";
  return base.endsWith("/") ? base : `${base}/`;
}

async function loadFlacModules(): Promise<FlacModules> {
  if (!flacModulesPromise) {
    const globalTarget = window as unknown as { FLAC_SCRIPT_LOCATION?: string };
    globalTarget.FLAC_SCRIPT_LOCATION = `${getBasePath()}flac/`;

    flacModulesPromise = Promise.all([
      import("libflacjs/dist/libflac.min.js"),
      import("spark-md5")
    ]).then(([flacModule, sparkModule]) => {
      const flacCandidate = flacModule as unknown as { default?: FlacRuntime } & FlacRuntime;
      const Flac = (flacCandidate.default ?? flacCandidate) as FlacRuntime;
      const sparkCandidate = sparkModule as unknown as { default?: { ArrayBuffer: new () => SparkMd5ArrayBuffer }; ArrayBuffer?: new () => SparkMd5ArrayBuffer };
      const SparkMD5ArrayBuffer = (sparkCandidate.default?.ArrayBuffer ?? sparkCandidate.ArrayBuffer) as new () => SparkMd5ArrayBuffer;

      if (!Flac || !SparkMD5ArrayBuffer) {
        throw new Error("Modules FLAC incomplets.");
      }

      return { Flac, SparkMD5ArrayBuffer };
    });
  }

  return flacModulesPromise;
}

function isFlacReady(Flac: FlacRuntime): boolean {
  return typeof Flac.isReady === "function" && Flac.isReady();
}

function waitForFlacReady(Flac: FlacRuntime): Promise<void> {
  if (isFlacReady(Flac)) {
    return Promise.resolve();
  }

  if (!flacReadyPromise) {
    flacReadyPromise = new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        reject(new Error("Initialisation de l’encodeur FLAC trop longue."));
      }, 10000);

      const finish = () => {
        window.clearTimeout(timeoutId);
        resolve();
      };

      try {
        if (typeof Flac.on === "function") {
          Flac.on("ready", finish);
        } else if (typeof Flac.onready === "function") {
          Flac.onready(finish);
        } else {
          reject(new Error("Encodeur FLAC indisponible dans ce navigateur."));
        }
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Initialisation FLAC impossible."));
      }
    });
  }

  return flacReadyPromise;
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

function writeMd5Sample(view: DataView, offset: number, value: number, bitDepth: 16 | 24): number {
  if (bitDepth === 16) {
    view.setInt16(offset, value, true);
    return offset + 2;
  }

  const unsignedValue = value < 0 ? value + 0x1000000 : value;
  view.setUint8(offset, unsignedValue & 0xff);
  view.setUint8(offset + 1, (unsignedValue >> 8) & 0xff);
  view.setUint8(offset + 2, (unsignedValue >> 16) & 0xff);
  return offset + 3;
}

function writeInterleavedChunk(
  output: Int32Array,
  md5Bytes: Uint8Array,
  channelData: Float32Array[],
  startSample: number,
  chunkLength: number,
  channelCount: number,
  bitDepth: 16 | 24
) {
  let writeIndex = 0;
  let md5Offset = 0;
  const md5View = new DataView(md5Bytes.buffer);

  for (let sampleIndex = 0; sampleIndex < chunkLength; sampleIndex += 1) {
    const absoluteSample = startSample + sampleIndex;

    for (let channel = 0; channel < channelCount; channel += 1) {
      const value = floatToSignedInteger(channelData[channel]?.[absoluteSample] ?? 0, bitDepth);
      output[writeIndex] = value;
      writeIndex += 1;
      md5Offset = writeMd5Sample(md5View, md5Offset, value, bitDepth);
    }
  }
}

function patchStreamInfoMd5(encoded: Uint8Array, md5Hex: string) {
  if (encoded.length < 42) {
    return;
  }

  const isNativeFlac =
    encoded[0] === 0x66 &&
    encoded[1] === 0x4c &&
    encoded[2] === 0x61 &&
    encoded[3] === 0x43;
  const isStreamInfo = (encoded[4] & 0x7f) === 0;
  const streamInfoLength = (encoded[5] << 16) | (encoded[6] << 8) | encoded[7];

  if (!isNativeFlac || !isStreamInfo || streamInfoLength !== 34) {
    return;
  }

  const md5Start = 4 + 4 + 18;
  for (let index = 0; index < 16; index += 1) {
    encoded[md5Start + index] = Number.parseInt(md5Hex.slice(index * 2, index * 2 + 2), 16);
  }
}

export async function encodeFlacFromAudioBuffer(
  buffer: AudioBuffer,
  options: FlacExportOptions = { bitDepth: 24 }
): Promise<Blob> {
  const bitDepth = options.bitDepth;
  const compression = options.compression ?? DEFAULT_COMPRESSION_LEVEL;
  const channelCount = buffer.numberOfChannels;
  const sampleCount = buffer.length;
  const sampleRate = Math.round(buffer.sampleRate);
  const chunkSamples = Math.max(1024, Math.round(options.chunkSamples ?? DEFAULT_CHUNK_SAMPLES));

  if (channelCount < 1 || channelCount > 8) {
    throw new Error("L’export FLAC local supporte 1 à 8 canaux.");
  }

  if (sampleRate < 1 || sampleRate > 0xfffff) {
    throw new Error("Fréquence d’échantillonnage non supportée pour l’export FLAC.");
  }

  if (sampleCount <= 0) {
    throw new Error("Aucun échantillon à exporter.");
  }

  if (bitDepth !== 16 && bitDepth !== 24) {
    throw new Error("L’export FLAC supporte uniquement 16-bit et 24-bit.");
  }

  const { Flac, SparkMD5ArrayBuffer } = await loadFlacModules();
  await waitForFlacReady(Flac);

  const encoder = new BrowserFlacEncoder(Flac, {
    sampleRate,
    channels: channelCount,
    bitsPerSample: bitDepth,
    compression,
    totalSamples: sampleCount,
    verify: false,
    isOgg: false
  });

  if (!encoder.initialized) {
    encoder.destroy();
    throw new Error("Encodeur FLAC non initialisé.");
  }

  const channelData = Array.from({ length: channelCount }, (_, channel) => buffer.getChannelData(channel));
  const md5 = new SparkMD5ArrayBuffer();
  const bytesPerSample = bitDepth / 8;

  try {
    for (let startSample = 0; startSample < sampleCount; startSample += chunkSamples) {
      const currentChunkLength = Math.min(chunkSamples, sampleCount - startSample);
      const interleaved = new Int32Array(currentChunkLength * channelCount);
      const md5Bytes = new Uint8Array(currentChunkLength * channelCount * bytesPerSample);
      writeInterleavedChunk(interleaved, md5Bytes, channelData, startSample, currentChunkLength, channelCount, bitDepth);
      md5.append(md5Bytes.buffer);

      const ok = encoder.encode(interleaved, currentChunkLength, true);
      if (!ok) {
        throw new Error("Encodage FLAC interrompu.");
      }
    }

    const finished = encoder.encode();
    if (!finished) {
      throw new Error("Finalisation FLAC impossible.");
    }

    const encoded = encoder.getSamples();
    if (!encoded || encoded.length <= 0) {
      throw new Error("Fichier FLAC vide.");
    }

    const encodedCopy = new Uint8Array(encoded.byteLength);
    encodedCopy.set(encoded);
    patchStreamInfoMd5(encodedCopy, md5.end());

    return new Blob([encodedCopy.buffer], { type: "audio/flac" });
  } finally {
    encoder.destroy();
  }
}
