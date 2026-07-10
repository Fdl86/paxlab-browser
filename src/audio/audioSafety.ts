import { clamp, dbToLinear, linearToDb } from "./audioBufferUtils";

export interface PeakSafetyMeasurement {
  peakLinear: number;
  peakDb: number;
  nonFiniteSamples: number;
  samplesAboveCeiling: number;
}

export interface LinkedLimiterStats {
  active: boolean;
  ceilingDb: number;
  lookaheadMs: number;
  releaseMs: number;
  peakBeforeDb: number;
  peakAfterDb: number;
  maxReductionDb: number;
  averageReductionDb: number;
  samplesAboveCeiling: number;
  nonFiniteSamples: number;
}

export interface LinkedLimiterResult {
  buffer: AudioBuffer;
  stats: LinkedLimiterStats;
}

export interface LinkedLimiterOptions {
  lookaheadMs?: number;
  releaseMs?: number;
}

function createEmptyLike(source: AudioBuffer): AudioBuffer {
  return new AudioBuffer({
    numberOfChannels: source.numberOfChannels,
    length: source.length,
    sampleRate: source.sampleRate
  });
}

function safeSample(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function measurePeakSafety(source: AudioBuffer, ceilingLinear = 1): PeakSafetyMeasurement {
  const ceiling = Math.max(1e-9, Math.abs(ceilingLinear));
  let peak = 0;
  let nonFiniteSamples = 0;
  let samplesAboveCeiling = 0;

  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    const data = source.getChannelData(channel);

    for (let index = 0; index < data.length; index += 1) {
      const raw = data[index];

      if (!Number.isFinite(raw)) {
        nonFiniteSamples += 1;
        continue;
      }

      const abs = Math.abs(raw);
      peak = Math.max(peak, abs);

      if (abs > ceiling) {
        samplesAboveCeiling += 1;
      }
    }
  }

  return {
    peakLinear: peak,
    peakDb: linearToDb(peak),
    nonFiniteSamples,
    samplesAboveCeiling
  };
}

export function sanitizeAudioBuffer(source: AudioBuffer): { buffer: AudioBuffer; nonFiniteSamples: number } {
  const output = createEmptyLike(source);
  let nonFiniteSamples = 0;

  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    const input = source.getChannelData(channel);
    const data = output.getChannelData(channel);

    for (let index = 0; index < input.length; index += 1) {
      const sample = input[index];

      if (Number.isFinite(sample)) {
        data[index] = sample;
      } else {
        data[index] = 0;
        nonFiniteSamples += 1;
      }
    }
  }

  return { buffer: output, nonFiniteSamples };
}

/**
 * Limiteur offline multicanal lié.
 *
 * Le détecteur observe une fenêtre future courte. Une seule enveloppe de gain
 * est ensuite appliquée à tous les canaux afin de préserver l'image stéréo.
 * L'attaque est anticipée par le lookahead et le relâchement reste progressif.
 */
export function applyLinkedLookaheadLimiter(
  source: AudioBuffer,
  ceilingDb: number,
  options: LinkedLimiterOptions = {}
): LinkedLimiterResult {
  const ceiling = clamp(dbToLinear(ceilingDb), 1e-6, 1);
  const lookaheadMs = clamp(options.lookaheadMs ?? 3, 0, 10);
  const releaseMs = clamp(options.releaseMs ?? 85, 20, 300);
  const lookaheadSamples = Math.max(0, Math.round((source.sampleRate * lookaheadMs) / 1000));
  const releaseSamples = Math.max(1, Math.round((source.sampleRate * releaseMs) / 1000));
  const releaseCoefficient = Math.exp(-1 / releaseSamples);
  const output = createEmptyLike(source);
  const channelInputs = Array.from({ length: source.numberOfChannels }, (_, channel) => source.getChannelData(channel));
  const channelOutputs = Array.from({ length: source.numberOfChannels }, (_, channel) => output.getChannelData(channel));

  // Une deque monotone de taille lookahead + 1 suffit. Elle contient les pics
  // multicanaux de la fenêtre [sample courant, sample courant + lookahead].
  const dequeCapacity = Math.max(2, lookaheadSamples + 2);
  const dequeIndices = new Int32Array(dequeCapacity);
  const dequePeaks = new Float32Array(dequeCapacity);
  let dequeHead = 0;
  let dequeLength = 0;

  const dequePosition = (offset: number): number => (dequeHead + offset) % dequeCapacity;
  const dequeFrontIndex = (): number => dequeIndices[dequeHead] ?? -1;
  const dequeFrontPeak = (): number => dequePeaks[dequeHead] ?? 0;

  const popFront = (): void => {
    if (dequeLength <= 0) {
      return;
    }
    dequeHead = (dequeHead + 1) % dequeCapacity;
    dequeLength -= 1;
  };

  const popBack = (): void => {
    if (dequeLength > 0) {
      dequeLength -= 1;
    }
  };

  const pushBack = (index: number, peak: number): void => {
    const position = dequePosition(dequeLength);
    dequeIndices[position] = index;
    dequePeaks[position] = peak;
    dequeLength += 1;
  };

  let currentGain = 1;
  let peakBefore = 0;
  let peakAfter = 0;
  let maxReductionDb = 0;
  let reductionDbSum = 0;
  let reductionFrames = 0;
  let samplesAboveCeiling = 0;
  let nonFiniteSamples = 0;

  const finalInputIndex = source.length + lookaheadSamples;

  for (let scanIndex = 0; scanIndex < finalInputIndex; scanIndex += 1) {
    if (scanIndex < source.length) {
      let framePeak = 0;

      for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
        const raw = channelInputs[channel][scanIndex];

        if (!Number.isFinite(raw)) {
          nonFiniteSamples += 1;
          continue;
        }

        const abs = Math.abs(raw);
        framePeak = Math.max(framePeak, abs);
        peakBefore = Math.max(peakBefore, abs);

        if (abs > ceiling) {
          samplesAboveCeiling += 1;
        }
      }

      while (dequeLength > 0) {
        const backPosition = dequePosition(dequeLength - 1);
        const backPeak = dequePeaks[backPosition] ?? 0;

        if (backPeak > framePeak) {
          break;
        }

        popBack();
      }

      pushBack(scanIndex, framePeak);
    }

    const outputIndex = scanIndex - lookaheadSamples;

    if (outputIndex < 0 || outputIndex >= source.length) {
      continue;
    }

    while (dequeLength > 0 && dequeFrontIndex() < outputIndex) {
      popFront();
    }

    const detectedPeak = dequeLength > 0 ? dequeFrontPeak() : 0;
    const targetGain = detectedPeak > ceiling ? ceiling / Math.max(detectedPeak, 1e-12) : 1;

    if (targetGain < currentGain) {
      // Attaque immédiate, anticipée par le lookahead.
      currentGain = targetGain;
    } else {
      // Relâchement progressif pour éviter les variations de gain audibles.
      currentGain = targetGain + releaseCoefficient * (currentGain - targetGain);
    }

    currentGain = clamp(currentGain, 0, 1);
    const reductionDb = currentGain < 0.999999 ? -linearToDb(currentGain) : 0;

    if (reductionDb > 0.0001) {
      maxReductionDb = Math.max(maxReductionDb, reductionDb);
      reductionDbSum += reductionDb;
      reductionFrames += 1;
    }

    for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
      const input = safeSample(channelInputs[channel][outputIndex]);
      const limited = input * currentGain;
      // Protection ultime contre les erreurs d'arrondi. Ce clamp appartient au
      // limiteur final, jamais à un étage DSP intermédiaire.
      const safeOutput = clamp(limited, -ceiling, ceiling);
      channelOutputs[channel][outputIndex] = safeOutput;
      peakAfter = Math.max(peakAfter, Math.abs(safeOutput));
    }
  }

  const averageReductionDb = reductionFrames > 0 ? reductionDbSum / reductionFrames : 0;

  return {
    buffer: output,
    stats: {
      active: maxReductionDb > 0.001,
      ceilingDb,
      lookaheadMs,
      releaseMs,
      peakBeforeDb: linearToDb(peakBefore),
      peakAfterDb: linearToDb(peakAfter),
      maxReductionDb,
      averageReductionDb,
      samplesAboveCeiling,
      nonFiniteSamples
    }
  };
}
