export interface WaveformBin {
  min: number;
  max: number;
}

export interface WaveformStatsBin {
  rms: number;
  peak: number;
}

export interface WaveformRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_WAVEFORM_WIDTH = 860;
export const DEFAULT_WAVEFORM_HEIGHT = 110;
export const DEFAULT_WAVEFORM_SCALE_Y = 50;

const bufferIds = new WeakMap<AudioBuffer, number>();
const waveformCache = new WeakMap<AudioBuffer, Map<string, WaveformBin[]>>();
let nextBufferId = 1;

function getBufferId(buffer: AudioBuffer | null): number {
  if (!buffer) {
    return 0;
  }

  const existingId = bufferIds.get(buffer);
  if (existingId) {
    return existingId;
  }

  const newId = nextBufferId;
  nextBufferId += 1;
  bufferIds.set(buffer, newId);
  return newId;
}

export function getAdaptiveBinCount(buffer: AudioBuffer | null): number {
  if (!buffer) {
    return 0;
  }

  const duration = buffer.duration;

  if (duration < 5) {
    return 160;
  }

  if (duration < 15) {
    return 220;
  }

  if (duration < 60) {
    return 320;
  }

  return 420;
}

function percentile(sortedValues: number[], ratio: number): number {
  if (!sortedValues.length) {
    return 0;
  }

  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.round((sortedValues.length - 1) * ratio)),
  );

  return sortedValues[index] ?? 0;
}

function buildWaveformStats(
  buffer: AudioBuffer | null,
  bins = 420,
): WaveformStatsBin[] {
  if (!buffer || buffer.length <= 0) {
    return [];
  }

  const channelCount = buffer.numberOfChannels;
  const step = Math.max(1, Math.floor(buffer.length / bins));
  const waveformStats: WaveformStatsBin[] = [];

  for (let bin = 0; bin < bins; bin += 1) {
    const start = bin * step;
    const end = Math.min(buffer.length, start + step);
    let peak = 0;
    let sumSquares = 0;
    let sampleCount = 0;

    for (let channel = 0; channel < channelCount; channel += 1) {
      const data = buffer.getChannelData(channel);

      for (let index = start; index < end; index += 1) {
        const sample = data[index] ?? 0;
        const abs = Math.abs(sample);
        peak = Math.max(peak, abs);
        sumSquares += sample * sample;
        sampleCount += 1;
      }
    }

    waveformStats.push({
      rms: sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0,
      peak: Math.min(1, peak),
    });
  }

  return waveformStats;
}

function getReferenceRms(stats: WaveformStatsBin[]): number {
  const rmsValues = stats
    .map((item) => item.rms)
    .filter((value) => Number.isFinite(value) && value > 0.00001)
    .sort((a, b) => a - b);

  return Math.max(0.0008, percentile(rmsValues, 0.92));
}

export function buildWaveformBins(
  buffer: AudioBuffer | null,
  referenceBuffer: AudioBuffer | null,
  bins = 420,
): WaveformBin[] {
  const activeStats = buildWaveformStats(buffer, bins);

  if (!activeStats.length) {
    return [];
  }

  const referenceStats = buildWaveformStats(referenceBuffer ?? buffer, bins);
  const referenceRms = getReferenceRms(
    referenceStats.length ? referenceStats : activeStats,
  );
  const waveformBins: WaveformBin[] = [];

  for (let index = 0; index < activeStats.length; index += 1) {
    const previous = activeStats[index - 1] ??
      activeStats[index] ?? { rms: 0, peak: 0 };
    const current = activeStats[index] ?? { rms: 0, peak: 0 };
    const next = activeStats[index + 1] ?? current;
    const smoothedRms =
      previous.rms * 0.18 + current.rms * 0.64 + next.rms * 0.18;
    const smoothedPeak =
      previous.peak * 0.12 + current.peak * 0.76 + next.peak * 0.12;

    const rmsBody =
      Math.pow(Math.min(3.2, smoothedRms / referenceRms), 0.72) * 0.42;
    const peakAccent =
      Math.pow(
        Math.min(3.8, smoothedPeak / Math.max(referenceRms * 2.8, 0.001)),
        0.48,
      ) * 0.12;
    const amplitude = Math.min(0.84, Math.max(0.012, rmsBody + peakAccent));

    waveformBins.push({
      min: -amplitude,
      max: amplitude,
    });
  }

  return waveformBins;
}

export function getCachedWaveformBins(
  buffer: AudioBuffer | null,
  referenceBuffer: AudioBuffer | null,
): WaveformBin[] {
  if (!buffer) {
    return [];
  }

  const bins = getAdaptiveBinCount(buffer);
  const referenceId = getBufferId(referenceBuffer ?? buffer);
  const cacheKey = `structure:${bins}:${referenceId}`;
  const existingCache = waveformCache.get(buffer);
  const cached = existingCache?.get(cacheKey);

  if (cached) {
    return cached;
  }

  const built = buildWaveformBins(buffer, referenceBuffer ?? buffer, bins);
  const cache = existingCache ?? new Map<string, WaveformBin[]>();
  cache.set(cacheKey, built);
  waveformCache.set(buffer, cache);
  return built;
}

export function buildWaveformRects(
  waveformBins: WaveformBin[],
  width = DEFAULT_WAVEFORM_WIDTH,
  height = DEFAULT_WAVEFORM_HEIGHT,
  scaleY = DEFAULT_WAVEFORM_SCALE_Y,
): WaveformRect[] {
  const step = width / Math.max(1, waveformBins.length);
  const centerY = height / 2;

  return waveformBins.map((bin, index) => {
    const barWidth = Math.max(1.2, Math.min(3.2, step * 0.52));
    const amplitude = Math.max(Math.abs(bin.max), Math.abs(bin.min));
    const barHeight = Math.max(6, amplitude * scaleY * 2);
    const x = index * step + Math.max(0, (step - barWidth) / 2);
    const y = centerY - barHeight / 2;

    return { x, y, width: barWidth, height: barHeight };
  });
}
