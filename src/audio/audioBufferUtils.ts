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

  const gainForRms = dbToLinear(targetRmsDb - metrics.rmsDb);
  const gainForPeakCeiling = dbToLinear(maxPeakDb - metrics.peakDb);
  const finalGain = Math.min(gainForRms, gainForPeakCeiling);

  return applyGainToNewBuffer(source, finalGain);
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
