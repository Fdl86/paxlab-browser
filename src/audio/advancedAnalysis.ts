import { clamp, linearToDb } from "./audioBufferUtils";
import type {
  AdvancedAudioMetrics,
  ListeningObservation,
  ListeningZone,
  ListeningZoneFamily,
  SourceAnalysisResult
} from "./types";

const FFT_SIZE = 2048;
const MAX_ANALYSIS_FRAMES = 72;
const MAX_ZONE_WINDOWS = 180;
const MIN_DB = -120;

interface SpectrumRatios {
  subRatio: number;
  lowRatio: number;
  presenceRatio: number;
  brightnessRatio: number;
  fizzRatio: number;
  ultraHighRatio: number;
  highTotalRatio: number;
  spectralCentroidHz: number;
}

interface WindowMetrics extends SpectrumRatios {
  startSeconds: number;
  endSeconds: number;
  centerSeconds: number;
  rmsDb: number;
  peakDb: number;
  crestFactorDb: number;
  stereoCorrelation: number;
  leftRightBalanceDb: number;
}

function nextPowerFrameStart(frameIndex: number, frameCount: number, totalLength: number): number {
  if (frameCount <= 1) {
    return 0;
  }

  const usableLength = Math.max(1, totalLength - FFT_SIZE);
  return Math.floor((frameIndex / (frameCount - 1)) * usableLength);
}

function hann(index: number, size: number): number {
  return 0.5 * (1 - Math.cos((2 * Math.PI * index) / Math.max(1, size - 1)));
}

function fft(real: Float64Array, imag: Float64Array): void {
  const n = real.length;
  let j = 0;

  for (let i = 1; i < n; i += 1) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;

    if (i < j) {
      const realTemp = real[i];
      real[i] = real[j];
      real[j] = realTemp;

      const imagTemp = imag[i];
      imag[i] = imag[j];
      imag[j] = imagTemp;
    }
  }

  for (let length = 2; length <= n; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const wLengthReal = Math.cos(angle);
    const wLengthImag = Math.sin(angle);

    for (let i = 0; i < n; i += length) {
      let wReal = 1;
      let wImag = 0;

      for (let k = 0; k < length / 2; k += 1) {
        const evenIndex = i + k;
        const oddIndex = evenIndex + length / 2;
        const oddReal = real[oddIndex] * wReal - imag[oddIndex] * wImag;
        const oddImag = real[oddIndex] * wImag + imag[oddIndex] * wReal;

        real[oddIndex] = real[evenIndex] - oddReal;
        imag[oddIndex] = imag[evenIndex] - oddImag;
        real[evenIndex] += oddReal;
        imag[evenIndex] += oddImag;

        const nextWReal = wReal * wLengthReal - wImag * wLengthImag;
        wImag = wReal * wLengthImag + wImag * wLengthReal;
        wReal = nextWReal;
      }
    }
  }
}

function getMonoSample(buffer: AudioBuffer, index: number): number {
  let sum = 0;
  const channelCount = buffer.numberOfChannels;

  for (let channel = 0; channel < channelCount; channel += 1) {
    sum += buffer.getChannelData(channel)[index] ?? 0;
  }

  return sum / Math.max(1, channelCount);
}

function analyzeSpectrumFrame(buffer: AudioBuffer, startIndex: number, length = FFT_SIZE): SpectrumRatios {
  const size = FFT_SIZE;
  const real = new Float64Array(size);
  const imag = new Float64Array(size);

  for (let i = 0; i < size; i += 1) {
    const sourceIndex = Math.min(buffer.length - 1, startIndex + i);
    const sample = sourceIndex >= 0 && sourceIndex < buffer.length ? getMonoSample(buffer, sourceIndex) : 0;
    real[i] = sample * hann(i, size);
  }

  fft(real, imag);

  let total = 1e-18;
  let sub = 0;
  let low = 0;
  let presence = 0;
  let brightness = 0;
  let fizz = 0;
  let ultra = 0;
  let centroidWeighted = 0;

  const nyquistBins = size / 2;
  for (let bin = 1; bin < nyquistBins; bin += 1) {
    const frequency = (bin * buffer.sampleRate) / size;
    const magnitude = real[bin] * real[bin] + imag[bin] * imag[bin];
    total += magnitude;
    centroidWeighted += magnitude * frequency;

    if (frequency < 40) {
      sub += magnitude;
    } else if (frequency < 250) {
      low += magnitude;
    } else if (frequency >= 2000 && frequency < 5000) {
      presence += magnitude;
    } else if (frequency >= 5000 && frequency < 9000) {
      brightness += magnitude;
    } else if (frequency >= 9000 && frequency < 16000) {
      fizz += magnitude;
    } else if (frequency >= 16000 && frequency < 20000) {
      ultra += magnitude;
    }
  }

  return {
    subRatio: sub / total,
    lowRatio: low / total,
    presenceRatio: presence / total,
    brightnessRatio: brightness / total,
    fizzRatio: fizz / total,
    ultraHighRatio: ultra / total,
    highTotalRatio: (presence + brightness + fizz + ultra) / total,
    spectralCentroidHz: centroidWeighted / total
  };
}

function averageSpectrum(buffer: AudioBuffer): SpectrumRatios {
  const frameCount = Math.min(
    MAX_ANALYSIS_FRAMES,
    Math.max(1, Math.floor(buffer.length / FFT_SIZE))
  );

  const totals: SpectrumRatios = {
    subRatio: 0,
    lowRatio: 0,
    presenceRatio: 0,
    brightnessRatio: 0,
    fizzRatio: 0,
    ultraHighRatio: 0,
    highTotalRatio: 0,
    spectralCentroidHz: 0
  };

  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = nextPowerFrameStart(frame, frameCount, buffer.length);
    const ratios = analyzeSpectrumFrame(buffer, start);
    totals.subRatio += ratios.subRatio;
    totals.lowRatio += ratios.lowRatio;
    totals.presenceRatio += ratios.presenceRatio;
    totals.brightnessRatio += ratios.brightnessRatio;
    totals.fizzRatio += ratios.fizzRatio;
    totals.ultraHighRatio += ratios.ultraHighRatio;
    totals.highTotalRatio += ratios.highTotalRatio;
    totals.spectralCentroidHz += ratios.spectralCentroidHz;
  }

  return {
    subRatio: totals.subRatio / frameCount,
    lowRatio: totals.lowRatio / frameCount,
    presenceRatio: totals.presenceRatio / frameCount,
    brightnessRatio: totals.brightnessRatio / frameCount,
    fizzRatio: totals.fizzRatio / frameCount,
    ultraHighRatio: totals.ultraHighRatio / frameCount,
    highTotalRatio: totals.highTotalRatio / frameCount,
    spectralCentroidHz: totals.spectralCentroidHz / frameCount
  };
}

interface BiquadCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

interface BiquadState {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

interface IntegratedLoudnessEstimate {
  integratedLufs: number;
  shortTermLufs: number;
  loudnessRange: number;
}

function createBiquadState(): BiquadState {
  return { x1: 0, x2: 0, y1: 0, y2: 0 };
}

function processBiquadSample(input: number, coefficients: BiquadCoefficients, state: BiquadState): number {
  const output =
    coefficients.b0 * input +
    coefficients.b1 * state.x1 +
    coefficients.b2 * state.x2 -
    coefficients.a1 * state.y1 -
    coefficients.a2 * state.y2;

  state.x2 = state.x1;
  state.x1 = input;
  state.y2 = state.y1;
  state.y1 = output;

  return output;
}

function normalizeBiquad(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number): BiquadCoefficients {
  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0
  };
}

function createHighPassCoefficients(sampleRate: number, frequency: number, q: number): BiquadCoefficients {
  const omega = (2 * Math.PI * frequency) / sampleRate;
  const cosOmega = Math.cos(omega);
  const sinOmega = Math.sin(omega);
  const alpha = sinOmega / (2 * q);

  const b0 = (1 + cosOmega) / 2;
  const b1 = -(1 + cosOmega);
  const b2 = (1 + cosOmega) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cosOmega;
  const a2 = 1 - alpha;

  return normalizeBiquad(b0, b1, b2, a0, a1, a2);
}

function createHighShelfCoefficients(sampleRate: number, frequency: number, gainDb: number): BiquadCoefficients {
  const amplitude = Math.pow(10, gainDb / 40);
  const omega = (2 * Math.PI * frequency) / sampleRate;
  const cosOmega = Math.cos(omega);
  const sinOmega = Math.sin(omega);
  const sqrtA = Math.sqrt(amplitude);
  const alpha = (sinOmega / 2) * Math.sqrt(2);

  const b0 = amplitude * ((amplitude + 1) + (amplitude - 1) * cosOmega + 2 * sqrtA * alpha);
  const b1 = -2 * amplitude * ((amplitude - 1) + (amplitude + 1) * cosOmega);
  const b2 = amplitude * ((amplitude + 1) + (amplitude - 1) * cosOmega - 2 * sqrtA * alpha);
  const a0 = (amplitude + 1) - (amplitude - 1) * cosOmega + 2 * sqrtA * alpha;
  const a1 = 2 * ((amplitude - 1) - (amplitude + 1) * cosOmega);
  const a2 = (amplitude + 1) - (amplitude - 1) * cosOmega - 2 * sqrtA * alpha;

  return normalizeBiquad(b0, b1, b2, a0, a1, a2);
}

function loudnessFromEnergy(energy: number): number {
  return -0.691 + 10 * Math.log10(Math.max(energy, 1e-18));
}

function gatedIntegratedLoudness(blockEnergies: number[]): number {
  const absoluteGated = blockEnergies.filter((energy) => loudnessFromEnergy(energy) > -70);

  if (!absoluteGated.length) {
    return MIN_DB;
  }

  const absoluteMean = absoluteGated.reduce((sum, energy) => sum + energy, 0) / absoluteGated.length;
  const relativeGate = loudnessFromEnergy(absoluteMean) - 10;
  const relativeGated = absoluteGated.filter((energy) => loudnessFromEnergy(energy) > relativeGate);
  const finalBlocks = relativeGated.length ? relativeGated : absoluteGated;
  const finalMean = finalBlocks.reduce((sum, energy) => sum + energy, 0) / finalBlocks.length;

  return loudnessFromEnergy(finalMean);
}

function blockLoudnessValues(chunkEnergies: Float64Array, chunkSamples: Int32Array, windowChunks: number): number[] {
  const values: number[] = [];
  const safeWindow = Math.max(1, Math.min(windowChunks, chunkEnergies.length));
  const lastStart = Math.max(0, chunkEnergies.length - safeWindow);

  for (let start = 0; start <= lastStart; start += 1) {
    let energy = 0;
    let samples = 0;

    for (let offset = 0; offset < safeWindow; offset += 1) {
      energy += chunkEnergies[start + offset] ?? 0;
      samples += chunkSamples[start + offset] ?? 0;
    }

    if (samples > 0) {
      const loudness = loudnessFromEnergy(energy / samples);
      if (loudness > -70) {
        values.push(loudness);
      }
    }
  }

  return values;
}

function estimateIntegratedLoudness(buffer: AudioBuffer): IntegratedLoudnessEstimate {
  if (!buffer.length || !buffer.numberOfChannels) {
    return { integratedLufs: MIN_DB, shortTermLufs: MIN_DB, loudnessRange: 0 };
  }

  const sampleRate = buffer.sampleRate;
  const hopSamples = Math.max(1, Math.round(sampleRate * 0.1));
  const chunkCount = Math.max(1, Math.ceil(buffer.length / hopSamples));
  const chunkEnergies = new Float64Array(chunkCount);
  const chunkSamples = new Int32Array(chunkCount);

  for (let chunk = 0; chunk < chunkCount; chunk += 1) {
    const start = chunk * hopSamples;
    const end = Math.min(buffer.length, start + hopSamples);
    chunkSamples[chunk] = Math.max(0, end - start);
  }

  const preFilter = createHighShelfCoefficients(sampleRate, 1681.974450955533, 4);
  const rlbFilter = createHighPassCoefficients(sampleRate, 38.13547087602444, 0.5003270373238773);

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    const preState = createBiquadState();
    const rlbState = createBiquadState();

    for (let index = 0; index < data.length; index += 1) {
      const preFiltered = processBiquadSample(data[index], preFilter, preState);
      const weighted = processBiquadSample(preFiltered, rlbFilter, rlbState);
      const chunk = Math.min(chunkCount - 1, Math.floor(index / hopSamples));
      chunkEnergies[chunk] += weighted * weighted;
    }
  }

  const momentaryChunks = Math.max(1, Math.round(0.4 / 0.1));
  const shortTermChunks = Math.max(1, Math.round(3 / 0.1));
  const momentaryEnergies: number[] = [];
  const safeMomentary = Math.min(momentaryChunks, chunkCount);
  const lastMomentaryStart = Math.max(0, chunkCount - safeMomentary);

  for (let start = 0; start <= lastMomentaryStart; start += 1) {
    let energy = 0;
    let samples = 0;

    for (let offset = 0; offset < safeMomentary; offset += 1) {
      energy += chunkEnergies[start + offset] ?? 0;
      samples += chunkSamples[start + offset] ?? 0;
    }

    if (samples > 0) {
      momentaryEnergies.push(energy / samples);
    }
  }

  const integratedLufs = gatedIntegratedLoudness(momentaryEnergies);
  const shortTermValues = blockLoudnessValues(chunkEnergies, chunkSamples, shortTermChunks);
  const gatedShortTerm = shortTermValues.filter((value) => value > integratedLufs - 20 && value > -70);
  const rangeValues = gatedShortTerm.length ? gatedShortTerm : shortTermValues;

  return {
    integratedLufs,
    shortTermLufs: shortTermValues.length ? Math.max(...shortTermValues) : integratedLufs,
    loudnessRange: calcRange(rangeValues)
  };
}

function safeCorrelation(left: Float32Array, right: Float32Array, start = 0, end = left.length): number {
  let sumLeft = 0;
  let sumRight = 0;
  let sumLeftSq = 0;
  let sumRightSq = 0;
  let sumBoth = 0;
  let count = 0;
  const safeEnd = Math.min(end, left.length, right.length);

  for (let index = start; index < safeEnd; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    sumLeft += leftValue;
    sumRight += rightValue;
    sumLeftSq += leftValue * leftValue;
    sumRightSq += rightValue * rightValue;
    sumBoth += leftValue * rightValue;
    count += 1;
  }

  if (count <= 1) {
    return 1;
  }

  const covariance = sumBoth - (sumLeft * sumRight) / count;
  const varianceLeft = sumLeftSq - (sumLeft * sumLeft) / count;
  const varianceRight = sumRightSq - (sumRight * sumRight) / count;
  const denominator = Math.sqrt(Math.max(varianceLeft * varianceRight, 1e-18));

  return clamp(covariance / denominator, -1, 1);
}

function calcRange(values: number[]): number {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const low = sorted[Math.floor(sorted.length * 0.1)] ?? sorted[0];
  const high = sorted[Math.floor(sorted.length * 0.9)] ?? sorted[sorted.length - 1];
  return Math.max(0, high - low);
}

export function analyzeAdvancedAudioBuffer(buffer: AudioBuffer): AdvancedAudioMetrics {
  let peak = 0;
  let sumSquares = 0;
  let sampleCount = 0;
  let clippingSamples = 0;
  let leftSumSquares = 0;
  let rightSumSquares = 0;

  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) {
      const sample = data[index];
      const abs = Math.abs(sample);
      peak = Math.max(peak, abs);
      sumSquares += sample * sample;
      sampleCount += 1;

      if (abs >= 0.997) {
        clippingSamples += 1;
      }
    }
  }

  for (let index = 0; index < buffer.length; index += 1) {
    leftSumSquares += left[index] * left[index];
    rightSumSquares += right[index] * right[index];
  }

  const spectrum = averageSpectrum(buffer);
  const loudness = estimateIntegratedLoudness(buffer);
  const rms = sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0;
  const rmsDb = linearToDb(rms);
  const peakDb = linearToDb(peak);
  const leftRmsDb = linearToDb(Math.sqrt(leftSumSquares / Math.max(1, buffer.length)));
  const rightRmsDb = linearToDb(Math.sqrt(rightSumSquares / Math.max(1, buffer.length)));
  const estimatedLufs = loudness.integratedLufs;
  const shortTermLufsEstimate = loudness.shortTermLufs;

  const approxTruePeakDb = peakDb + clamp(spectrum.highTotalRatio * 1.4, 0.1, 0.9);

  return {
    peakLinear: peak,
    peakDb,
    rmsLinear: rms,
    rmsDb,
    crestFactorDb: peakDb - rmsDb,
    durationSeconds: buffer.duration,
    estimatedLufs,
    shortTermLufsEstimate,
    loudnessRangeEstimate: loudness.loudnessRange,
    approxTruePeakDb,
    leftRightBalanceDb: leftRmsDb - rightRmsDb,
    stereoCorrelation: safeCorrelation(left, right),
    clippingSamples,
    clippingRatio: clippingSamples / Math.max(1, sampleCount),
    noiseFloorEstimateDb: Math.min(rmsDb - 26, -58 + spectrum.highTotalRatio * 14),
    ...spectrum
  };
}

function analyzeWindow(buffer: AudioBuffer, startIndex: number, endIndex: number): WindowMetrics {
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  let peak = 0;
  let sumSquares = 0;
  let leftSq = 0;
  let rightSq = 0;
  let count = 0;

  for (let index = startIndex; index < endIndex; index += 1) {
    const mono = (left[index] + right[index]) * 0.5;
    peak = Math.max(peak, Math.abs(mono));
    sumSquares += mono * mono;
    leftSq += left[index] * left[index];
    rightSq += right[index] * right[index];
    count += 1;
  }

  const rmsDb = linearToDb(Math.sqrt(sumSquares / Math.max(1, count)));
  const peakDb = linearToDb(peak);
  const leftDb = linearToDb(Math.sqrt(leftSq / Math.max(1, count)));
  const rightDb = linearToDb(Math.sqrt(rightSq / Math.max(1, count)));
  const spectrum = analyzeSpectrumFrame(buffer, startIndex);

  return {
    startSeconds: startIndex / buffer.sampleRate,
    endSeconds: endIndex / buffer.sampleRate,
    centerSeconds: (startIndex + endIndex) / 2 / buffer.sampleRate,
    rmsDb,
    peakDb,
    crestFactorDb: peakDb - rmsDb,
    stereoCorrelation: safeCorrelation(left, right, startIndex, endIndex),
    leftRightBalanceDb: leftDb - rightDb,
    ...spectrum
  };
}

function observation(
  family: ListeningZoneFamily,
  label: string,
  score: number,
  detail: string,
  listeningTip: string
): ListeningObservation {
  return {
    family,
    label,
    score: clamp(score, 0, 100),
    detail,
    listeningTip
  };
}

function buildObservations(metrics: WindowMetrics): ListeningObservation[] {
  const observations: ListeningObservation[] = [];

  if (metrics.presenceRatio > 0.16) {
    observations.push(
      observation(
        "Présence 2-5 kHz",
        "Présence potentiellement fatigante",
        (metrics.presenceRatio - 0.12) * 360,
        `Ratio présence ${(metrics.presenceRatio * 100).toFixed(1)} %`,
        "Écoute les voix, guitares et attaques de caisse claire."
      )
    );
  }

  if (metrics.brightnessRatio > 0.12) {
    observations.push(
      observation(
        "Brillance 5-9 kHz",
        "Brillance à vérifier",
        (metrics.brightnessRatio - 0.09) * 420,
        `Brillance ${(metrics.brightnessRatio * 100).toFixed(1)} %`,
        "Vérifie si les cymbales ou sifflantes piquent l'oreille."
      )
    );
  }

  if (metrics.fizzRatio > 0.11) {
    observations.push(
      observation(
        "Fizz 9-16 kHz",
        "Fizz IA possible",
        (metrics.fizzRatio - 0.08) * 470,
        `Fizz ${(metrics.fizzRatio * 100).toFixed(1)} %`,
        "Écoute les cymbales, reverbs brillantes et guitares saturées."
      )
    );
  }

  if (metrics.ultraHighRatio > 0.035) {
    observations.push(
      observation(
        "Très haut aigu 16-20 kHz",
        "Très haut aigu chargé",
        (metrics.ultraHighRatio - 0.02) * 780,
        `Ultra aigu ${(metrics.ultraHighRatio * 100).toFixed(1)} %`,
        "À vérifier surtout au casque ou sur enceintes brillantes."
      )
    );
  }

  if (metrics.crestFactorDb < 6.5 && metrics.rmsDb > -28) {
    observations.push(
      observation(
        "Dynamique compacte",
        "Dynamique compacte",
        (7.5 - metrics.crestFactorDb) * 12,
        `Crest ${metrics.crestFactorDb.toFixed(1)} dB`,
        "Vérifie si le passage semble écrasé ou fatigant."
      )
    );
  }

  if (metrics.peakDb > -1.1) {
    observations.push(
      observation(
        "Pics proches du plafond",
        "Pics proches du plafond",
        (-metrics.peakDb + 1.6) * 35,
        `Peak ${metrics.peakDb.toFixed(1)} dBFS`,
        "Écoute les attaques fortes et éventuels craquements."
      )
    );
  }

  if (metrics.stereoCorrelation < 0.18) {
    observations.push(
      observation(
        "Stéréo instable",
        "Stéréo très large ou instable",
        (0.28 - metrics.stereoCorrelation) * 120,
        `Corrélation ${metrics.stereoCorrelation.toFixed(2)}`,
        "Vérifie si le centre flotte ou si le son devient flou."
      )
    );
  }

  if (metrics.subRatio > 0.075) {
    observations.push(
      observation(
        "Sub sous 40 Hz",
        "Sub à surveiller",
        (metrics.subRatio - 0.045) * 500,
        `Sub ${(metrics.subRatio * 100).toFixed(1)} %`,
        "Écoute si le bas mange le morceau ou déclenche du pompage."
      )
    );
  }

  if (Math.abs(metrics.leftRightBalanceDb) > 1.5) {
    observations.push(
      observation(
        "Déséquilibre spectral",
        "Balance gauche/droite à vérifier",
        (Math.abs(metrics.leftRightBalanceDb) - 1) * 20,
        `Écart L/R ${metrics.leftRightBalanceDb.toFixed(1)} dB`,
        "Vérifie si l'image semble tirer d'un côté."
      )
    );
  }

  if (metrics.highTotalRatio > 0.38 && metrics.rmsDb < -31) {
    observations.push(
      observation(
        "Bruit large bande possible",
        "Bruit large bande possible",
        (metrics.highTotalRatio - 0.32) * 230,
        `Aigus totaux ${(metrics.highTotalRatio * 100).toFixed(1)} % sur passage calme`,
        "Écoute les queues de reverb, souffles ou nappes granuleuses."
      )
    );
  }

  return observations.sort((a, b) => b.score - a.score);
}

function priorityFromScore(score: number): "haute" | "moyenne" | "basse" {
  if (score >= 72) {
    return "haute";
  }
  if (score >= 42) {
    return "moyenne";
  }
  return "basse";
}

export function suggestListeningZones(buffer: AudioBuffer): { zones: ListeningZone[]; windowsAnalyzed: number } {
  const windowSeconds = 3;
  const stepSeconds = buffer.duration > 360 ? 2 : 1;
  const windowSamples = Math.max(FFT_SIZE, Math.floor(windowSeconds * buffer.sampleRate));
  const stepSamples = Math.max(FFT_SIZE, Math.floor(stepSeconds * buffer.sampleRate));
  const candidates: ListeningZone[] = [];
  let windowsAnalyzed = 0;

  const maxStart = Math.max(0, buffer.length - windowSamples);
  const estimatedWindows = Math.floor(maxStart / stepSamples) + 1;
  const stride = Math.max(1, Math.ceil(estimatedWindows / MAX_ZONE_WINDOWS));

  for (let windowIndex = 0; windowIndex < estimatedWindows; windowIndex += stride) {
    const start = Math.min(maxStart, windowIndex * stepSamples);
    const end = Math.min(buffer.length, start + windowSamples);
    const metrics = analyzeWindow(buffer, start, end);
    windowsAnalyzed += 1;

    if (metrics.rmsDb < -58) {
      continue;
    }

    const observations = buildObservations(metrics);
    if (!observations.length) {
      continue;
    }

    const score = clamp(
      observations[0].score + observations.slice(1, 3).reduce((sum, item) => sum + item.score * 0.3, 0),
      0,
      100
    );

    candidates.push({
      id: `${Math.round(metrics.centerSeconds * 1000)}-${observations[0].family}`,
      startSeconds: Math.max(0, metrics.centerSeconds - 4),
      endSeconds: Math.min(buffer.duration, metrics.centerSeconds + 4),
      centerSeconds: metrics.centerSeconds,
      priority: priorityFromScore(score),
      score,
      primaryFamily: observations[0].family,
      observations: observations.slice(0, 3)
    });
  }

  const selected: ListeningZone[] = [];
  const familyCount = new Map<ListeningZoneFamily, number>();

  for (const candidate of candidates.sort((a, b) => b.score - a.score)) {
    const tooClose = selected.some((zone) => Math.abs(zone.centerSeconds - candidate.centerSeconds) < 9);
    const currentFamilyCount = familyCount.get(candidate.primaryFamily) ?? 0;

    if (tooClose || currentFamilyCount >= 2) {
      continue;
    }

    selected.push(candidate);
    familyCount.set(candidate.primaryFamily, currentFamilyCount + 1);

    if (selected.length >= 8) {
      break;
    }
  }

  return {
    zones: selected.sort((a, b) => a.startSeconds - b.startSeconds),
    windowsAnalyzed
  };
}

export function analyzeSource(buffer: AudioBuffer): SourceAnalysisResult {
  const startedAt = performance.now();
  const metrics = analyzeAdvancedAudioBuffer(buffer);
  const { zones, windowsAnalyzed } = suggestListeningZones(buffer);

  return {
    metrics,
    listeningZones: zones,
    analysisTimeMs: performance.now() - startedAt,
    windowsAnalyzed
  };
}
