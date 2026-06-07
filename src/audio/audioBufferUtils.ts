import type { AudioMetrics } from "./types";

const MIN_DB = -120;

export function linearToDb(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return MIN_DB;
  }

  return 20 * Math.log10(value);
}

export function dbToLinear(db: number): number {
  return 10 ** (db / 20);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function analyzeAudioBuffer(buffer: AudioBuffer): AudioMetrics {
  let peak = 0;
  let sumSquares = 0;
  let sampleCount = 0;

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);

    for (let index = 0; index < data.length; index += 1) {
      const sample = data[index];
      const absSample = Math.abs(sample);

      if (absSample > peak) {
        peak = absSample;
      }

      sumSquares += sample * sample;
      sampleCount += 1;
    }
  }

  const rms = sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0;
  const peakDb = linearToDb(peak);
  const rmsDb = linearToDb(rms);

  return {
    peakLinear: peak,
    peakDb,
    rmsLinear: rms,
    rmsDb,
    crestFactorDb: peakDb - rmsDb,
    durationSeconds: buffer.duration
  };
}

export function cloneAudioBuffer(source: AudioBuffer): AudioBuffer {
  const cloned = new AudioBuffer({
    numberOfChannels: source.numberOfChannels,
    length: source.length,
    sampleRate: source.sampleRate
  });

  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    cloned.copyToChannel(source.getChannelData(channel), channel);
  }

  return cloned;
}

export function applyGainToNewBuffer(source: AudioBuffer, gain: number): AudioBuffer {
  const processed = new AudioBuffer({
    numberOfChannels: source.numberOfChannels,
    length: source.length,
    sampleRate: source.sampleRate
  });

  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    const input = source.getChannelData(channel);
    const output = processed.getChannelData(channel);

    for (let index = 0; index < input.length; index += 1) {
      output[index] = clamp(input[index] * gain, -1, 1);
    }
  }

  return processed;
}

export function applySafeTargetGain(
  source: AudioBuffer,
  targetRmsDb: number,
  maxPeakDb: number
): AudioBuffer {
  const metrics = analyzeAudioBuffer(source);

  if (metrics.peakLinear <= 0 || metrics.rmsLinear <= 0) {
    return cloneAudioBuffer(source);
  }

  const requiredLiftDb = targetRmsDb - metrics.rmsDb;
  const gainForRms = dbToLinear(requiredLiftDb);
  const peakCeilingLiftDb = maxPeakDb - metrics.peakDb;

  // Dev07.1 : un fichier Suno très bas doit pouvoir être réellement poussé vers
  // sa cible automatique. On autorise donc une marge au-dessus du ceiling avant
  // limiteur, mais avec un garde-fou absolu pour éviter les sources corrompues.
  const limiterWorkRoomDb =
    requiredLiftDb > 8 ? 6.4 : requiredLiftDb > 6 ? 5.2 : requiredLiftDb > 4 ? 3.4 : 2.1;
  const protectedLiftLimitDb = clamp(
    Math.max(1.2, peakCeilingLiftDb + limiterWorkRoomDb),
    1.2,
    12.8
  );
  const finalGain = Math.min(gainForRms, dbToLinear(protectedLiftLimitDb));

  return applyGainToNewBuffer(source, finalGain);
}

export function removeDcOffset(source: AudioBuffer): { buffer: AudioBuffer; maxOffset: number } {
  const processed = new AudioBuffer({
    numberOfChannels: source.numberOfChannels,
    length: source.length,
    sampleRate: source.sampleRate
  });

  let maxOffset = 0;

  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    const input = source.getChannelData(channel);
    const output = processed.getChannelData(channel);
    let sum = 0;

    for (let index = 0; index < input.length; index += 1) {
      sum += input[index];
    }

    const offset = sum / Math.max(1, input.length);
    maxOffset = Math.max(maxOffset, Math.abs(offset));

    for (let index = 0; index < input.length; index += 1) {
      output[index] = clamp(input[index] - offset, -1, 1);
    }
  }

  return { buffer: processed, maxOffset };
}

export function applyTinyEdgeFade(source: AudioBuffer, fadeMs = 8): AudioBuffer {
  const processed = cloneAudioBuffer(source);
  const fadeLength = Math.min(
    Math.floor((source.sampleRate * fadeMs) / 1000),
    Math.floor(source.length / 2)
  );

  if (fadeLength <= 1) {
    return processed;
  }

  for (let channel = 0; channel < processed.numberOfChannels; channel += 1) {
    const data = processed.getChannelData(channel);

    for (let index = 0; index < fadeLength; index += 1) {
      const fadeIn = index / fadeLength;
      const fadeOut = (fadeLength - index) / fadeLength;
      data[index] *= fadeIn;
      data[data.length - 1 - index] *= fadeOut;
    }
  }

  return processed;
}

export function formatDb(value: number): string {
  if (!Number.isFinite(value) || value <= MIN_DB + 0.01) {
    return "-∞ dB";
  }

  return `${value.toFixed(1)} dB`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return "0:00";
  }

  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return "0 o";
  }

  const units = ["o", "Ko", "Mo", "Go"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );

  const value = bytes / 1024 ** unitIndex;

  return `${value.toLocaleString("fr-FR", {
    maximumFractionDigits: value >= 10 ? 1 : 2
  })} ${units[unitIndex]}`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString("fr-FR");
}

export interface HeadroomSummaryResult {
  finalHeadroomDb: number;
  activeAverageHeadroomDb: number;
  activeMinHeadroomDb: number;
  activeMaxHeadroomDb: number;
  activeWindows: number;
}

function percentile(sortedValues: number[], ratio: number): number {
  if (!sortedValues.length) {
    return 0;
  }

  const index = clamp(Math.round((sortedValues.length - 1) * ratio), 0, sortedValues.length - 1);
  return sortedValues[index] ?? sortedValues[sortedValues.length - 1] ?? 0;
}

export function analyzeHeadroomSummary(buffer: AudioBuffer): HeadroomSummaryResult {
  const globalMetrics = analyzeAudioBuffer(buffer);
  const finalHeadroomDb = Math.max(0, -globalMetrics.peakDb);
  const windowSize = Math.max(512, Math.floor(buffer.sampleRate * 0.08));
  const hopSize = Math.max(256, Math.floor(windowSize / 2));
  const activeHeadrooms: number[] = [];

  for (let start = 0; start < buffer.length; start += hopSize) {
    const end = Math.min(buffer.length, start + windowSize);
    let peak = 0;
    let sumSquares = 0;
    let sampleCount = 0;

    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);

      for (let index = start; index < end; index += 1) {
        const sample = data[index] ?? 0;
        const abs = Math.abs(sample);
        peak = Math.max(peak, abs);
        sumSquares += sample * sample;
        sampleCount += 1;
      }
    }

    const rms = sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0;
    const peakDb = linearToDb(peak);
    const rmsDb = linearToDb(rms);

    // On ignore les blancs et les fins de fade, sinon le headroom instantané
    // paraît énorme et ne décrit plus le rendu utile du morceau.
    if (peakDb > -42 && rmsDb > -50) {
      activeHeadrooms.push(Math.max(0, -peakDb));
    }
  }

  if (!activeHeadrooms.length) {
    return {
      finalHeadroomDb,
      activeAverageHeadroomDb: finalHeadroomDb,
      activeMinHeadroomDb: finalHeadroomDb,
      activeMaxHeadroomDb: finalHeadroomDb,
      activeWindows: 0
    };
  }

  activeHeadrooms.sort((a, b) => a - b);
  const trimmedStart = Math.floor(activeHeadrooms.length * 0.05);
  const trimmedEnd = Math.max(trimmedStart + 1, Math.ceil(activeHeadrooms.length * 0.9));
  const trimmed = activeHeadrooms.slice(trimmedStart, trimmedEnd);
  const average = trimmed.reduce((sum, value) => sum + value, 0) / Math.max(1, trimmed.length);

  return {
    finalHeadroomDb,
    activeAverageHeadroomDb: average,
    activeMinHeadroomDb: percentile(activeHeadrooms, 0.05),
    activeMaxHeadroomDb: percentile(activeHeadrooms, 0.85),
    activeWindows: activeHeadrooms.length
  };
}
