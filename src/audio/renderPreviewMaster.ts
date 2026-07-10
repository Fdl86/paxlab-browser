import {
  analyzeAdvancedAudioBuffer
} from "./advancedAnalysis";
import {
  analyzeAudioBuffer,
  applyGainToNewBuffer,
  applySafeTargetGain,
  applyTinyEdgeFade,
  analyzeHeadroomSummary,
  clamp,
  dbToLinear,
  linearToDb,
  removeDcOffset
} from "./audioBufferUtils";
import { getPresetById } from "./previewPresets";
import type { AdvancedAudioMetrics, PreviewRenderResult, PreviewSettings, ProcessingReport } from "./types";

export interface RenderProgressEvent {
  stepIndex: number;
  progress: number;
  label: string;
}

export type RenderProgressCallback = (event: RenderProgressEvent) => void;

function notifyProgress(onProgress: RenderProgressCallback | undefined, stepIndex: number, progress: number, label: string): void {
  onProgress?.({ stepIndex, progress, label });
}

function waitForProgressFrame(durationMs = 110): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, durationMs));
}

const YOUTUBE_SAFE_TARGET_LUFS = -14.4;
const YOUTUBE_MAX_LUFS = -14.0;
const YOUTUBE_PEAK_TARGET_DB = -2.2;
const YOUTUBE_PEAK_TRIGGER_DB = -3.4;
const YOUTUBE_PEAK_CEILING_DB = -1.5;
const YOUTUBE_PEAK_POLISH_THRESHOLD_DB = -15.0;


interface StereoImageMeasurement {
  ratio: number;
  lowRatio: number;
  highRatio: number;
}

interface BassPunchMeasurement {
  ratio: number;
}

interface BassPunchProfile {
  amount: number;
  intensityLabel: string;
  safeMode: boolean;
}

function analyzeBassPunch(source: AudioBuffer): BassPunchMeasurement {
  const stride = Math.max(1, Math.floor(source.sampleRate / 12000));
  const highPassFrequency = 65;
  const lowPassFrequency = 135;
  const highPassRc = 1 / (2 * Math.PI * highPassFrequency);
  const lowPassRc = 1 / (2 * Math.PI * lowPassFrequency);
  const dt = stride / source.sampleRate;
  const highPassAlpha = highPassRc / (highPassRc + dt);
  const lowPassAlpha = dt / (lowPassRc + dt);
  let previousMono = 0;
  let previousHigh = 0;
  let band = 0;
  let fullSquare = 0;
  let bandSquare = 0;
  let samples = 0;

  for (let index = 0; index < source.length; index += stride) {
    let mono = 0;

    for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
      mono += source.getChannelData(channel)[index] ?? 0;
    }

    mono /= Math.max(1, source.numberOfChannels);

    const high = highPassAlpha * (previousHigh + mono - previousMono);
    band += lowPassAlpha * (high - band);
    fullSquare += mono * mono;
    bandSquare += band * band;
    previousMono = mono;
    previousHigh = high;
    samples += 1;
  }

  const safeFull = Math.max(fullSquare / Math.max(1, samples), 1e-12);

  return {
    ratio: Math.sqrt((bandSquare / Math.max(1, samples)) / safeFull)
  };
}

function getBassPunchProfile(settings: PreviewSettings, metrics: AdvancedAudioMetrics): BassPunchProfile {
  if (!settings.bassPunch || settings.vocalPresence) {
    return { amount: 0, intensityLabel: "off", safeMode: false };
  }

  const presetFactor =
    settings.autoIntensity === "safe"
      ? 0.42
      : settings.autoIntensity === "balanced"
        ? 0.62
        : settings.autoIntensity === "youtube"
          ? 0.82
          : settings.autoIntensity === "impact"
            ? 0.52
            : 0.6;
  const alreadyDense = metrics.lowRatio > 0.3 || metrics.subRatio > 0.1;
  const somewhatDense = metrics.lowRatio > 0.22 || metrics.subRatio > 0.075;
  const safetyFactor = alreadyDense ? 0.55 : somewhatDense ? 0.75 : 1;
  const amount = clamp(presetFactor * safetyFactor, 0, 0.9);

  return {
    amount,
    intensityLabel: amount < 0.48 ? "réduite" : amount < 0.7 ? "légère" : "standard",
    safeMode: safetyFactor < 1
  };
}

function analyzeStereoImage(source: AudioBuffer): StereoImageMeasurement {
  if (source.numberOfChannels < 2) {
    return { ratio: 0, lowRatio: 0, highRatio: 0 };
  }

  const left = source.getChannelData(0);
  const right = source.getChannelData(1);
  const stride = Math.max(1, Math.floor(source.sampleRate / 12000));
  const highPassFrequency = 220;
  const rc = 1 / (2 * Math.PI * highPassFrequency);
  const dt = stride / source.sampleRate;
  const alpha = rc / (rc + dt);
  let previousSide = 0;
  let previousHighSide = 0;
  let midSquare = 0;
  let sideSquare = 0;
  let lowSideSquare = 0;
  let highSideSquare = 0;
  let samples = 0;

  for (let index = 0; index < source.length; index += stride) {
    const mid = (left[index] + right[index]) * 0.5;
    const side = (left[index] - right[index]) * 0.5;
    const highSide = alpha * (previousHighSide + side - previousSide);
    const lowSide = side - highSide;

    midSquare += mid * mid;
    sideSquare += side * side;
    lowSideSquare += lowSide * lowSide;
    highSideSquare += highSide * highSide;
    previousSide = side;
    previousHighSide = highSide;
    samples += 1;
  }

  const safeMid = Math.max(midSquare / Math.max(1, samples), 1e-12);

  return {
    ratio: Math.sqrt((sideSquare / Math.max(1, samples)) / safeMid),
    lowRatio: Math.sqrt((lowSideSquare / Math.max(1, samples)) / safeMid),
    highRatio: Math.sqrt((highSideSquare / Math.max(1, samples)) / safeMid)
  };
}

function stereoChangePercent(before: number, after: number): number {
  if (!Number.isFinite(before) || !Number.isFinite(after) || before <= 1e-9) {
    return 0;
  }

  return ((after - before) / before) * 100;
}

interface ProcessingProfile {
  highShelfGain: number;
  harshDipGain: number;
  fizzDipGain: number;
  airGain: number;
  presenceGain: number;
  lowShelfGain: number;
  subControlFrequency: number;
  compressorThreshold: number;
  compressorRatio: number;
  makeupGain: number;
  dehissReductionDb: number;
}

interface CleanupResult {
  buffer: AudioBuffer;
  clippedSamplesDetected: number;
  clicksRepaired: number;
  declipActive: boolean;
  declickActive: boolean;
}

function repairMultiplier(settings: PreviewSettings): number {
  if (settings.sourceRepair === "strong") {
    return 1.25;
  }

  if (settings.sourceRepair === "light") {
    return 0.72;
  }

  return 1;
}

function repairLabel(settings: PreviewSettings): string {
  if (settings.sourceRepair === "strong") {
    return "Forte";
  }

  if (settings.sourceRepair === "light") {
    return "Légère";
  }

  return "Normale";
}

function getProcessingProfile(settings: PreviewSettings): ProcessingProfile {
  const amount = clamp(settings.intensity / 100, 0, 1);
  const isYoutubeMix = settings.autoIntensity === "youtube";
  const spaceFactor = settings.spacePreserve || isYoutubeMix ? 0.78 : 1;
  const repair = repairMultiplier(settings) * (settings.antiFatigue ? 1.18 : 1) * (isYoutubeMix ? 1.06 : 1);

  const highTreatmentGain =
    settings.highTreatment === "verySoft"
      ? (settings.antiFatigue ? -5.2 : -4.1)
      : settings.highTreatment === "soft"
        ? (settings.antiFatigue ? -3.5 : -2.7)
        : settings.highTreatment === "open"
          ? 1.0
          : -0.5;

  const presetWeight =
    isYoutubeMix
      ? 0.92
      : settings.presetId === "smooth"
        ? 1.18
        : settings.presetId === "open"
          ? 0.65
          : settings.presetId === "balanced"
            ? 0.86
            : settings.presetId === "power"
              ? 0.78
              : 1;

  const powerBoost = settings.presetId === "power" ? 0.8 : 0;

  return {
    highShelfGain: highTreatmentGain * amount * presetWeight,
    harshDipGain: (settings.antiFatigue ? -3.1 : -2.3) * amount * presetWeight * repair * spaceFactor,
    fizzDipGain:
      settings.highTreatment === "verySoft"
        ? (settings.antiFatigue ? -4.2 : -3.2) * amount * repair
        : settings.highTreatment === "soft"
          ? (settings.antiFatigue ? -2.9 : -2.0) * amount * repair
          : settings.highTreatment === "open"
            ? -0.4 * amount * repair
            : -1.0 * amount * repair,
    airGain: settings.highTreatment === "open" ? 0.9 * amount : (settings.antiFatigue ? -0.9 : -0.35) * amount,
    presenceGain: isYoutubeMix ? (settings.antiFatigue ? -0.35 : -0.15) * amount : settings.highTreatment === "open" ? 0.65 * amount : (settings.antiFatigue ? -0.75 : -0.45) * amount,
    lowShelfGain: isYoutubeMix ? 0.08 * amount : settings.presetId === "open" ? -0.35 * amount : 0.45 * amount + powerBoost,
    subControlFrequency: isYoutubeMix ? 30 : settings.presetId === "power" ? 30 : 34,
    compressorThreshold: -23 + 8 * (1 - amount) - settings.density * 0.04 + (settings.spacePreserve ? 1.4 : 0) + (isYoutubeMix ? 0.9 : 0),
    compressorRatio: (1.45 + 1.05 * amount + settings.density * 0.012) * (settings.spacePreserve ? 0.84 : 1) * (isYoutubeMix ? 0.9 : 1),
    makeupGain: 1 + 0.08 * amount + settings.density * (settings.spacePreserve || isYoutubeMix ? 0.001 : 0.0018) + (settings.autoIntensity === "impact" && !settings.spacePreserve ? 0.035 : 0),
    dehissReductionDb:
      (settings.highTreatment === "verySoft"
        ? 2.2
        : settings.highTreatment === "soft"
          ? 1.35
          : settings.highTreatment === "open"
            ? 0.25
            : 0.75) * repair + (settings.antiFatigue ? 0.55 : 0) + (isYoutubeMix ? 0.35 : 0)
  };
}

function createEmptyLike(source: AudioBuffer): AudioBuffer {
  return new AudioBuffer({
    numberOfChannels: source.numberOfChannels,
    length: source.length,
    sampleRate: source.sampleRate
  });
}

function cleanupInputBuffer(inputBuffer: AudioBuffer, settings: PreviewSettings): CleanupResult {
  const repair = repairMultiplier(settings);
  const clipThreshold = settings.sourceRepair === "strong" ? 0.975 : settings.sourceRepair === "light" ? 0.992 : 0.985;
  const clickThreshold = settings.sourceRepair === "strong" ? 0.34 : settings.sourceRepair === "light" ? 0.52 : 0.42;
  const output = createEmptyLike(inputBuffer);
  let clippedSamplesDetected = 0;
  let clicksRepaired = 0;

  for (let channel = 0; channel < inputBuffer.numberOfChannels; channel += 1) {
    const input = inputBuffer.getChannelData(channel);
    const data = new Float32Array(input);

    for (let index = 1; index < data.length - 1; index += 1) {
      const value = data[index];
      const previous = data[index - 1];
      const next = data[index + 1];
      const absValue = Math.abs(value);

      if (absValue >= clipThreshold) {
        clippedSamplesDetected += 1;
        const sign = Math.sign(value) || 1;
        const overshoot = clamp((absValue - clipThreshold) / Math.max(0.006, 1 - clipThreshold), 0, 1);
        const softCeiling = clipThreshold + 0.006 / repair;
        data[index] = sign * (softCeiling + 0.004 * Math.tanh(overshoot));
      }

      const neighborAverage = (previous + next) * 0.5;
      const localJump = Math.abs(value - neighborAverage);
      const neighborDelta = Math.abs(previous - next);

      if (localJump > clickThreshold && localJump > neighborDelta * (settings.sourceRepair === "strong" ? 2.6 : 3.2)) {
        data[index] = neighborAverage;
        clicksRepaired += 1;
      }
    }

    output.copyToChannel(data, channel);
  }

  return {
    buffer: output,
    clippedSamplesDetected,
    clicksRepaired,
    declipActive: clippedSamplesDetected > 0,
    declickActive: clicksRepaired > 0
  };
}

function applyStereoWidth(source: AudioBuffer, widthPercent: number, sourceStereoRatio?: number): AudioBuffer {
  if (source.numberOfChannels < 2) {
    return source;
  }

  const output = createEmptyLike(source);
  const leftIn = source.getChannelData(0);
  const rightIn = source.getChannelData(1);
  const leftOut = output.getChannelData(0);
  const rightOut = output.getChannelData(1);
  const baseWidth = clamp(widthPercent / 100, 0.7, 1.18);
  const safetyFactor = sourceStereoRatio === undefined
    ? 1
    : sourceStereoRatio > 0.6
      ? 0.7
      : sourceStereoRatio > 0.45
        ? 0.85
        : 1;
  const width = baseWidth > 1 ? 1 + (baseWidth - 1) * safetyFactor : baseWidth;

  for (let index = 0; index < source.length; index += 1) {
    const mid = (leftIn[index] + rightIn[index]) * 0.5;
    const side = (leftIn[index] - rightIn[index]) * 0.5 * width;
    leftOut[index] = clamp(mid + side, -1, 1);
    rightOut[index] = clamp(mid - side, -1, 1);
  }

  for (let channel = 2; channel < source.numberOfChannels; channel += 1) {
    output.copyToChannel(source.getChannelData(channel), channel);
  }

  return output;
}

function applyStereoSpace(source: AudioBuffer, enabled: boolean): AudioBuffer {
  if (!enabled || source.numberOfChannels < 2) {
    return source;
  }

  const output = createEmptyLike(source);
  const leftIn = source.getChannelData(0);
  const rightIn = source.getChannelData(1);
  const leftOut = output.getChannelData(0);
  const rightOut = output.getChannelData(1);
  const sideLift = 0.14;
  const highPassFrequency = 220;
  const rc = 1 / (2 * Math.PI * highPassFrequency);
  const dt = 1 / source.sampleRate;
  const alpha = rc / (rc + dt);
  let previousSide = 0;
  let previousHighSide = 0;

  for (let index = 0; index < source.length; index += 1) {
    const left = leftIn[index];
    const right = rightIn[index];
    const mid = (left + right) * 0.5;
    const side = (left - right) * 0.5;
    const highSide = alpha * (previousHighSide + side - previousSide);
    const wideSide = side + highSide * sideLift;

    leftOut[index] = clamp(mid + wideSide, -1, 1);
    rightOut[index] = clamp(mid - wideSide, -1, 1);
    previousSide = side;
    previousHighSide = highSide;
  }

  for (let channel = 2; channel < source.numberOfChannels; channel += 1) {
    output.copyToChannel(source.getChannelData(channel), channel);
  }

  return output;
}

function applyGentleDensity(source: AudioBuffer, density: number): AudioBuffer {
  const blend = clamp(density / 100, 0, 1) * 0.16;

  if (blend <= 0.001) {
    return source;
  }

  const output = createEmptyLike(source);
  const drive = 1.08 + clamp(density / 100, 0, 1) * 0.18;

  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    const input = source.getChannelData(channel);
    const data = output.getChannelData(channel);

    for (let index = 0; index < source.length; index += 1) {
      const clean = input[index];
      const saturated = Math.tanh(clean * drive);
      data[index] = clamp(clean * (1 - blend) + saturated * blend, -1, 1);
    }
  }

  return output;
}

function applyImprovedLimiter(source: AudioBuffer, maxPeakDb: number): { buffer: AudioBuffer; active: boolean; reductionDb: number } {
  const ceiling = dbToLinear(maxPeakDb);
  const output = createEmptyLike(source);
  let peakBefore = 0;
  let peakAfter = 0;
  let active = false;

  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    const input = source.getChannelData(channel);
    const data = output.getChannelData(channel);

    for (let index = 0; index < source.length; index += 1) {
      const sample = input[index];
      const abs = Math.abs(sample);
      peakBefore = Math.max(peakBefore, abs);

      if (abs > ceiling) {
        active = true;
        const sign = Math.sign(sample) || 1;
        const excess = abs / ceiling;
        data[index] = sign * ceiling * Math.tanh(excess) / Math.tanh(1);
      } else {
        data[index] = sample;
      }

      if (Math.abs(data[index]) > ceiling) {
        data[index] = Math.sign(data[index]) * ceiling;
      }

      peakAfter = Math.max(peakAfter, Math.abs(data[index]));
    }
  }

  const reductionDb = Math.max(0, linearToDb(peakBefore || 1e-9) - linearToDb(peakAfter || 1e-9));

  return {
    buffer: output,
    active,
    reductionDb
  };
}

function inferDehissActive(beforeHighRatio: number, profile: ProcessingProfile): boolean {
  return beforeHighRatio > 0.34 && profile.dehissReductionDb > 0.5;
}

function applyPostLoudnessCalibration(
  source: AudioBuffer,
  targetLufsEstimate: number,
  maxPeakDb: number,
  autoIntensity: PreviewSettings["autoIntensity"],
  antiFatigue: boolean,
  spacePreserve: boolean
): { buffer: AudioBuffer; limiterActive: boolean; limiterReductionDb: number; correctionGainDb: number } {
  let current = source;
  let limiterActive = false;
  let limiterReductionDb = 0;
  let correctionGainDb = 0;
  let upwardCorrectionDb = 0;
  const maxExtraDb = (autoIntensity === "impact" ? 4.2 : autoIntensity === "youtube" ? 2.6 : antiFatigue || autoIntensity === "safe" ? 2.2 : 3.2) * (spacePreserve ? 0.62 : 1);

  if (autoIntensity !== "youtube") {
    const initialMetrics = analyzeAdvancedAudioBuffer(current);
    const initialGapDb = targetLufsEstimate - initialMetrics.estimatedLufs;

    if (initialGapDb < -0.35) {
      const trimDb = clamp(initialGapDb, -6, 0);
      current = applyGainToNewBuffer(current, dbToLinear(trimDb));
      const limited = applyImprovedLimiter(current, maxPeakDb);
      current = limited.buffer;
      limiterActive = limiterActive || limited.active;
      limiterReductionDb = Math.max(limiterReductionDb, limited.reductionDb);
      correctionGainDb += trimDb;
    }
  }

  for (let pass = 0; pass < 3; pass += 1) {
    const metrics = analyzeAdvancedAudioBuffer(current);
    const loudnessGapDb = targetLufsEstimate - metrics.estimatedLufs;

    if (loudnessGapDb <= 0.35 || upwardCorrectionDb >= maxExtraDb) {
      break;
    }

    const currentHeadroomDb = Math.max(0, -metrics.approxTruePeakDb);
    const ceilingHeadroomDb = Math.abs(maxPeakDb);
    const roomBeforeLimiterDb = Math.max(0, currentHeadroomDb - ceilingHeadroomDb);
    const limiterAllowanceDb = (autoIntensity === "impact" ? 1.8 : autoIntensity === "youtube" ? 0.9 : antiFatigue || autoIntensity === "safe" ? 0.8 : 1.25) * (spacePreserve ? 0.45 : 1);
    const passGainDb = clamp(
      Math.min(loudnessGapDb, roomBeforeLimiterDb + limiterAllowanceDb, maxExtraDb - upwardCorrectionDb),
      0,
      2.4
    );

    if (passGainDb < 0.15) {
      break;
    }

    current = applyGainToNewBuffer(current, dbToLinear(passGainDb));
    const limited = applyImprovedLimiter(current, maxPeakDb);
    current = limited.buffer;
    limiterActive = limiterActive || limited.active;
    limiterReductionDb = Math.max(limiterReductionDb, limited.reductionDb);
    upwardCorrectionDb += passGainDb;
    correctionGainDb += passGainDb;
  }

  return {
    buffer: current,
    limiterActive,
    limiterReductionDb,
    correctionGainDb
  };
}

interface YoutubeClampResult {
  buffer: AudioBuffer;
  clampGainDb: number;
  beforeLufs: number;
  afterLufs: number;
  metrics: AdvancedAudioMetrics;
}

interface YoutubePeakPolishResult {
  buffer: AudioBuffer;
  peakLiftDb: number;
  beforePeakDb: number;
  afterPeakDb: number;
  loudnessTrimDb: number;
  metrics: AdvancedAudioMetrics;
}

function applyYoutubeFinalLoudnessClamp(
  source: AudioBuffer,
  knownMetrics?: AdvancedAudioMetrics
): YoutubeClampResult {
  const before = knownMetrics ?? analyzeAdvancedAudioBuffer(source);

  if (before.estimatedLufs <= YOUTUBE_SAFE_TARGET_LUFS) {
    return {
      buffer: source,
      clampGainDb: 0,
      beforeLufs: before.estimatedLufs,
      afterLufs: before.estimatedLufs,
      metrics: before
    };
  }

  const clampGainDb = clamp(YOUTUBE_SAFE_TARGET_LUFS - before.estimatedLufs, -8, 0);
  const clampedBuffer = applyGainToNewBuffer(source, dbToLinear(clampGainDb));
  const after = analyzeAdvancedAudioBuffer(clampedBuffer);

  return {
    buffer: clampedBuffer,
    clampGainDb,
    beforeLufs: before.estimatedLufs,
    afterLufs: after.estimatedLufs,
    metrics: after
  };
}

function applyYoutubePeakPolish(
  source: AudioBuffer,
  maxPeakDb: number,
  knownMetrics?: AdvancedAudioMetrics
): YoutubePeakPolishResult {
  const before = knownMetrics ?? analyzeAdvancedAudioBuffer(source);
  const polishTargetDb = Math.min(YOUTUBE_PEAK_TARGET_DB, maxPeakDb);
  const polishCeilingDb = Math.min(YOUTUBE_PEAK_CEILING_DB, maxPeakDb);

  if (
    before.estimatedLufs > YOUTUBE_MAX_LUFS - 0.1 ||
    before.peakLinear <= 0 ||
    before.peakDb >= YOUTUBE_PEAK_TRIGGER_DB ||
    before.peakDb >= polishTargetDb
  ) {
    return {
      buffer: source,
      peakLiftDb: 0,
      beforePeakDb: before.peakDb,
      afterPeakDb: before.peakDb,
      loudnessTrimDb: 0,
      metrics: before
    };
  }

  const desiredPeakLiftDb = clamp(polishTargetDb - before.peakDb, 0, 2.4);

  if (desiredPeakLiftDb < 0.35) {
    return {
      buffer: source,
      peakLiftDb: 0,
      beforePeakDb: before.peakDb,
      afterPeakDb: before.peakDb,
      loudnessTrimDb: 0,
      metrics: before
    };
  }

  const threshold = dbToLinear(YOUTUBE_PEAK_POLISH_THRESHOLD_DB);
  const ceiling = dbToLinear(polishCeilingDb);
  const maxMultiplier = dbToLinear(desiredPeakLiftDb);
  const peakSpan = Math.max(before.peakLinear - threshold, 1e-6);
  const output = createEmptyLike(source);

  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    const input = source.getChannelData(channel);
    const data = output.getChannelData(channel);

    for (let index = 0; index < source.length; index += 1) {
      const sample = input[index];
      const abs = Math.abs(sample);

      if (abs <= threshold) {
        data[index] = sample;
        continue;
      }

      const weight = Math.min(Math.max((abs - threshold) / peakSpan, 0), 1);
      const shapedWeight = weight * weight;
      const multiplier = 1 + (maxMultiplier - 1) * shapedWeight;
      const polished = sample * multiplier;
      data[index] = clamp(polished, -ceiling, ceiling);
    }
  }

  let polishedBuffer = output;
  let after = analyzeAdvancedAudioBuffer(polishedBuffer);
  let loudnessTrimDb = 0;

  if (after.estimatedLufs > YOUTUBE_SAFE_TARGET_LUFS) {
    loudnessTrimDb = clamp(YOUTUBE_SAFE_TARGET_LUFS - after.estimatedLufs, -2, 0);
    polishedBuffer = applyGainToNewBuffer(polishedBuffer, dbToLinear(loudnessTrimDb));
    after = analyzeAdvancedAudioBuffer(polishedBuffer);
  }

  return {
    buffer: polishedBuffer,
    peakLiftDb: Math.max(0, after.peakDb - before.peakDb),
    beforePeakDb: before.peakDb,
    afterPeakDb: after.peakDb,
    loudnessTrimDb,
    metrics: after
  };
}

async function renderPreviewMasterInternal(
  inputBuffer: AudioBuffer,
  settings: PreviewSettings,
  onProgress?: RenderProgressCallback
): Promise<PreviewRenderResult> {
  const startedAt = performance.now();
  notifyProgress(onProgress, 0, 8, "Chargement local");
  await waitForProgressFrame(220);
  const beforeMetrics = analyzeAdvancedAudioBuffer(inputBuffer);
  const beforeStereoImage = analyzeStereoImage(inputBuffer);
  const beforeBassPunch = analyzeBassPunch(inputBuffer);
  notifyProgress(onProgress, 1, 22, "Analyse du morceau");
  await waitForProgressFrame(240);
  const profile = getProcessingProfile(settings);
  const bassPunchProfile = getBassPunchProfile(settings, beforeMetrics);
  const bassPunchActive = bassPunchProfile.amount > 0;
  const preset = getPresetById(settings.presetId);
  notifyProgress(onProgress, 2, 34, "Cible automatique");
  await waitForProgressFrame(240);

  const cleanup = cleanupInputBuffer(inputBuffer, settings);

  const offlineContext = new OfflineAudioContext(
    cleanup.buffer.numberOfChannels,
    cleanup.buffer.length,
    cleanup.buffer.sampleRate
  );

  const source = offlineContext.createBufferSource();
  source.buffer = cleanup.buffer;

  const highPass = offlineContext.createBiquadFilter();
  highPass.type = "highpass";
  highPass.frequency.value = profile.subControlFrequency;
  highPass.Q.value = 0.7;

  const lowShelf = offlineContext.createBiquadFilter();
  lowShelf.type = "lowshelf";
  lowShelf.frequency.value = 115;
  lowShelf.gain.value = profile.lowShelfGain;

  const bassPunchWeight = offlineContext.createBiquadFilter();
  bassPunchWeight.type = "lowshelf";
  bassPunchWeight.frequency.value = 72;
  bassPunchWeight.gain.value = bassPunchActive ? 0.32 * bassPunchProfile.amount : 0;

  const bassPunchKick = offlineContext.createBiquadFilter();
  bassPunchKick.type = "peaking";
  bassPunchKick.frequency.value = 92;
  bassPunchKick.Q.value = 0.9;
  bassPunchKick.gain.value = bassPunchActive ? 1.15 * bassPunchProfile.amount : 0;

  const bassPunchMudDip = offlineContext.createBiquadFilter();
  bassPunchMudDip.type = "peaking";
  bassPunchMudDip.frequency.value = 240;
  bassPunchMudDip.Q.value = 0.85;
  bassPunchMudDip.gain.value = bassPunchActive ? -0.7 * bassPunchProfile.amount : 0;

  const lowMudDip = offlineContext.createBiquadFilter();
  lowMudDip.type = "peaking";
  lowMudDip.frequency.value = 320;
  lowMudDip.Q.value = 0.9;
  lowMudDip.gain.value = settings.autoIntensity === "youtube" ? -1.15 : settings.presetId === "power" ? -0.4 : -0.9;

  const vocalPresenceActive = Boolean(settings.vocalPresence && !settings.antiFatigue);

  const vocalMudDip = offlineContext.createBiquadFilter();
  vocalMudDip.type = "peaking";
  vocalMudDip.frequency.value = 300;
  vocalMudDip.Q.value = 0.85;
  vocalMudDip.gain.value = vocalPresenceActive ? -0.45 : 0;

  const vocalBodyLift = offlineContext.createBiquadFilter();
  vocalBodyLift.type = "peaking";
  vocalBodyLift.frequency.value = 1850;
  vocalBodyLift.Q.value = 0.95;
  vocalBodyLift.gain.value = vocalPresenceActive ? (settings.autoIntensity === "youtube" ? 0.65 : 0.8) : 0;

  const vocalArticulationLift = offlineContext.createBiquadFilter();
  vocalArticulationLift.type = "peaking";
  vocalArticulationLift.frequency.value = 3100;
  vocalArticulationLift.Q.value = 1.05;
  vocalArticulationLift.gain.value = vocalPresenceActive ? 0.38 : 0;

  const presence = offlineContext.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = 1700;
  presence.Q.value = 0.8;
  presence.gain.value = profile.presenceGain;

  const harshDip = offlineContext.createBiquadFilter();
  harshDip.type = "peaking";
  harshDip.frequency.value = 3600;
  harshDip.Q.value = 1.25;
  harshDip.gain.value = profile.harshDipGain;

  const brightnessDip = offlineContext.createBiquadFilter();
  brightnessDip.type = "peaking";
  brightnessDip.frequency.value = 7200;
  brightnessDip.Q.value = 1.05;
  brightnessDip.gain.value = profile.highShelfGain * 0.58;

  const fizzDip = offlineContext.createBiquadFilter();
  fizzDip.type = "peaking";
  fizzDip.frequency.value = 11200;
  fizzDip.Q.value = 1.15;
  fizzDip.gain.value = profile.fizzDipGain;

  const highShelf = offlineContext.createBiquadFilter();
  highShelf.type = "highshelf";
  highShelf.frequency.value = 14500;
  highShelf.gain.value = profile.airGain - profile.dehissReductionDb * 0.35;

  const compressor = offlineContext.createDynamicsCompressor();
  compressor.threshold.value = profile.compressorThreshold;
  compressor.knee.value = 22;
  compressor.ratio.value = profile.compressorRatio;
  compressor.attack.value = 0.012;
  compressor.release.value = 0.19;

  const makeup = offlineContext.createGain();
  makeup.gain.value = profile.makeupGain;

  source
    .connect(highPass)
    .connect(lowShelf)
    .connect(bassPunchWeight)
    .connect(bassPunchKick)
    .connect(lowMudDip)
    .connect(bassPunchMudDip)
    .connect(vocalMudDip)
    .connect(presence)
    .connect(vocalBodyLift)
    .connect(vocalArticulationLift)
    .connect(harshDip)
    .connect(brightnessDip)
    .connect(fizzDip)
    .connect(highShelf)
    .connect(compressor)
    .connect(makeup)
    .connect(offlineContext.destination);

  source.start(0);
  notifyProgress(onProgress, 3, 48, "Correction du spectre");
  await waitForProgressFrame(260);

  const renderedBuffer = await offlineContext.startRendering();
  notifyProgress(onProgress, 4, 64, "Optimisation dynamique");
  await waitForProgressFrame(240);
  const stereoWidthBuffer = applyStereoWidth(renderedBuffer, settings.stereoWidth, beforeStereoImage.ratio);
  const stereoBuffer = applyStereoSpace(stereoWidthBuffer, settings.stereoSpace);
  const isYoutubeMix = settings.autoIntensity === "youtube";
  const effectiveDensity = settings.spacePreserve || isYoutubeMix ? Math.round(settings.density * (isYoutubeMix ? 0.72 : 0.54)) : settings.density;
  const effectiveMaxPeakDb = isYoutubeMix ? Math.min(settings.maxPeakDb, -1.8) : settings.spacePreserve ? Math.min(settings.maxPeakDb, -2.0) : settings.maxPeakDb;
  const effectiveTargetLufs = isYoutubeMix ? Math.min(settings.targetLufsEstimate, YOUTUBE_SAFE_TARGET_LUFS) : settings.spacePreserve ? settings.targetLufsEstimate - 0.45 : settings.targetLufsEstimate;
  const effectiveTargetRmsDb = isYoutubeMix ? Math.min(settings.targetRmsDb, -16.8) : settings.spacePreserve ? settings.targetRmsDb - 0.45 : settings.targetRmsDb;
  const densityBuffer = applyGentleDensity(stereoBuffer, effectiveDensity);
  const preGainMetrics = analyzeAudioBuffer(densityBuffer);
  notifyProgress(onProgress, 5, 76, "Normalisation du niveau");
  await waitForProgressFrame(240);
  const leveledBuffer = applySafeTargetGain(
    densityBuffer,
    effectiveTargetRmsDb,
    effectiveMaxPeakDb
  );
  const firstLimiter = applyImprovedLimiter(leveledBuffer, effectiveMaxPeakDb);
  const calibrated = applyPostLoudnessCalibration(
    firstLimiter.buffer,
    effectiveTargetLufs,
    effectiveMaxPeakDb,
    settings.autoIntensity,
    settings.antiFatigue,
    settings.spacePreserve && !isYoutubeMix
  );
  notifyProgress(onProgress, 6, 88, "Sécurité peak");
  await waitForProgressFrame(220);
  const limiter = {
    buffer: calibrated.buffer,
    active: firstLimiter.active || calibrated.limiterActive,
    reductionDb: Math.max(firstLimiter.reductionDb, calibrated.limiterReductionDb)
  };
  const dcCorrection = removeDcOffset(limiter.buffer);
  const fadedBuffer = applyTinyEdgeFade(dcCorrection.buffer);
  const initialYoutubeClamp = isYoutubeMix
    ? applyYoutubeFinalLoudnessClamp(fadedBuffer)
    : { buffer: fadedBuffer, clampGainDb: 0, beforeLufs: 0, afterLufs: 0, metrics: beforeMetrics };
  const youtubePeakPolish = isYoutubeMix
    ? applyYoutubePeakPolish(initialYoutubeClamp.buffer, effectiveMaxPeakDb, initialYoutubeClamp.metrics)
    : { buffer: initialYoutubeClamp.buffer, peakLiftDb: 0, beforePeakDb: 0, afterPeakDb: 0, loudnessTrimDb: 0, metrics: initialYoutubeClamp.metrics };
  const finalYoutubeClamp = isYoutubeMix && youtubePeakPolish.peakLiftDb > 0.05
    ? applyYoutubeFinalLoudnessClamp(youtubePeakPolish.buffer, youtubePeakPolish.metrics)
    : {
        buffer: youtubePeakPolish.buffer,
        clampGainDb: 0,
        beforeLufs: youtubePeakPolish.metrics.estimatedLufs,
        afterLufs: youtubePeakPolish.metrics.estimatedLufs,
        metrics: youtubePeakPolish.metrics
      };
  const finalPeakLimiter = isYoutubeMix
    ? applyImprovedLimiter(finalYoutubeClamp.buffer, effectiveMaxPeakDb)
    : { buffer: finalYoutubeClamp.buffer, active: false, reductionDb: 0 };
  const youtubeClampGainDb = initialYoutubeClamp.clampGainDb + finalYoutubeClamp.clampGainDb + youtubePeakPolish.loudnessTrimDb;
  const youtubeClamp = {
    buffer: finalPeakLimiter.buffer,
    clampGainDb: youtubeClampGainDb,
    beforeLufs: initialYoutubeClamp.beforeLufs,
    afterLufs: finalYoutubeClamp.afterLufs
  };
  const finalBuffer = finalPeakLimiter.buffer;
  const afterMetrics = analyzeAdvancedAudioBuffer(finalBuffer);
  const afterStereoImage = analyzeStereoImage(finalBuffer);
  const afterBassPunch = analyzeBassPunch(finalBuffer);
  const stereoImage = {
    beforeRatio: beforeStereoImage.ratio,
    afterRatio: afterStereoImage.ratio,
    changePercent: stereoChangePercent(beforeStereoImage.ratio, afterStereoImage.ratio),
    lowChangePercent: stereoChangePercent(beforeStereoImage.lowRatio, afterStereoImage.lowRatio),
    highChangePercent: stereoChangePercent(beforeStereoImage.highRatio, afterStereoImage.highRatio)
  };
  const bassPunch = {
    active: bassPunchActive,
    beforeRatio: beforeBassPunch.ratio,
    afterRatio: afterBassPunch.ratio,
    changePercent: stereoChangePercent(beforeBassPunch.ratio, afterBassPunch.ratio),
    intensityLabel: bassPunchProfile.intensityLabel,
    safeMode: bassPunchProfile.safeMode
  };

  const gainAppliedDb = afterMetrics.estimatedLufs - beforeMetrics.estimatedLufs;
  const achievedHeadroomDb = Math.max(0, -afterMetrics.approxTruePeakDb);
  const headroomSummary = analyzeHeadroomSummary(finalBuffer);
  const dehissActive = inferDehissActive(beforeMetrics.highTotalRatio, profile);
  const antiFizzReductionDb =
    Math.abs(profile.highShelfGain * 0.58) + Math.abs(profile.fizzDipGain) + profile.dehissReductionDb * 0.35;

  const appliedMoves: string[] = [`réparation source ${repairLabel(settings).toLowerCase()}`];
  if (cleanup.declipActive) {
    appliedMoves.push("de-clipper prudent");
  }
  if (cleanup.declickActive) {
    appliedMoves.push("de-clicker micro-clics");
  }
  if (dehissActive) {
    appliedMoves.push("de-hiss aigu léger");
  }
  if (antiFizzReductionDb > 0.8) {
    appliedMoves.push(settings.antiFatigue ? "AI Brightness Smoothing / brillance IA" : "anti-fizz / contrôle des aigus");
  }
  if (vocalPresenceActive) {
    appliedMoves.push("présence vocale subtile");
  }
  if (bassPunchActive) {
    appliedMoves.push(bassPunchProfile.safeMode ? "Basses punchy : dose réduite, grave déjà dense" : "Basses punchy : kick renforcé, bas contrôlé");
  }
  if (Math.abs(profile.lowShelfGain) > 0.2 || profile.subControlFrequency > 30) {
    appliedMoves.push("contrôle sub et bas du spectre");
  }
  if (settings.stereoWidth !== 100) {
    appliedMoves.push("EQ M/S simplifiée et largeur stéréo");
  }
  if (settings.stereoSpace) {
    appliedMoves.push("espace stéréo M/S sécurisé");
  }
  if (settings.density > 0) {
    appliedMoves.push("densité harmonique douce");
  }
  appliedMoves.push(isYoutubeMix ? "compression YouTube douce" : "compression douce");
  if (isYoutubeMix) {
    appliedMoves.push("Mix YouTube : LUFS intégré sous -14 avec clamp final");
    appliedMoves.push("EQ de traduction YouTube : sub, boue, harsh et shimmer contrôlés");
  }
  appliedMoves.push(`auto target ${effectiveTargetLufs.toFixed(1)} LUFS intégré est.`);
  appliedMoves.push(`ceiling ${effectiveMaxPeakDb.toFixed(1)} dBTP est.`);
  if (settings.spacePreserve) {
    appliedMoves.push("préservation de l’espace / limiteur plus doux");
  }
  if (calibrated.correctionGainDb > 0.15) {
    appliedMoves.push(`calibration loudness +${calibrated.correctionGainDb.toFixed(1)} dB`);
  }
  if (calibrated.correctionGainDb < -0.15) {
    appliedMoves.push(`calibration loudness ${calibrated.correctionGainDb.toFixed(1)} dB`);
  }
  if (isYoutubeMix && youtubePeakPolish.peakLiftDb > 0.2) {
    appliedMoves.push(`peak polish YouTube +${youtubePeakPolish.peakLiftDb.toFixed(1)} dB crête`);
  }
  if (isYoutubeMix && youtubeClamp.clampGainDb < -0.05) {
    appliedMoves.push(`clamp YouTube final ${youtubeClamp.clampGainDb.toFixed(1)} dB`);
  }
  if (limiter.active || finalPeakLimiter.active) {
    appliedMoves.push("limiteur de sécurité");
  }
  if (dcCorrection.maxOffset > 0.0008) {
    appliedMoves.push("recentrage DC offset");
  }

  notifyProgress(onProgress, 7, 96, "Préparation export");
  await waitForProgressFrame(260);
  const renderTimeMs = performance.now() - startedAt;
  const report: ProcessingReport = {
    profileLabel: preset.label,
    brightnessLabel:
      settings.highTreatment === "verySoft"
        ? "Très douce"
        : settings.highTreatment === "soft"
          ? "Plus douce"
          : settings.highTreatment === "open"
            ? "Plus ouverte"
            : "Naturelle",
    targetLabel: isYoutubeMix
      ? `${effectiveTargetLufs.toFixed(1)} LUFS intégré est. / max -14.0`
      : `${effectiveTargetLufs.toFixed(1)} LUFS intégré est. / RMS indicatif`,
    appliedMoves,
    cleanup: {
      declipActive: cleanup.declipActive,
      declickActive: cleanup.declickActive,
      dehissActive,
      clippedSamplesDetected: cleanup.clippedSamplesDetected,
      clicksRepaired: cleanup.clicksRepaired,
      dehissReductionDb: dehissActive ? profile.dehissReductionDb : 0
    },
    tone: {
      sourceRepairLabel: repairLabel(settings),
      antiFizzActive: antiFizzReductionDb > 0.8,
      antiFizzReductionDb,
      subControlActive: profile.subControlFrequency > 30,
      stereoControlActive: settings.stereoWidth !== 100 || settings.stereoSpace,
      densityActive: effectiveDensity > 0,
      compressionActive: true
    },
    loudness: {
      gainAppliedDb,
      targetRmsDb: effectiveTargetRmsDb,
      targetLufsEstimate: effectiveTargetLufs,
      targetLufsMinEstimate: effectiveTargetLufs - (isYoutubeMix ? 0.75 : settings.autoIntensity === "safe" || settings.antiFatigue || settings.spacePreserve ? 1.15 : 0.9),
      targetLufsMaxEstimate: isYoutubeMix ? YOUTUBE_MAX_LUFS : effectiveTargetLufs + (settings.autoIntensity === "impact" && !settings.spacePreserve ? 0.5 : 0.4),
      ceilingDb: effectiveMaxPeakDb,
      targetHeadroomDb: Math.abs(effectiveMaxPeakDb),
      targetHeadroomMinDb: isYoutubeMix ? Math.max(1.5, Math.abs(effectiveMaxPeakDb) - 0.4) : Math.max(1, Math.abs(effectiveMaxPeakDb) - 0.4),
      targetHeadroomMaxDb: isYoutubeMix ? Math.max(3.5, Math.abs(effectiveMaxPeakDb) + 0.4) : settings.spacePreserve ? 4.4 : settings.autoIntensity === "safe" || settings.antiFatigue ? 4.3 : settings.autoIntensity === "impact" ? 2.5 : 3.5,
      achievedHeadroomDb,
      headroomSummary,
      limiterActive: limiter.active || finalPeakLimiter.active,
      limiterReductionDb: Math.max(limiter.reductionDb, finalPeakLimiter.reductionDb)
    },
    stereoImage,
    bassPunch,
    performance: {
      renderTimeMs
    }
  };

  return {
    buffer: finalBuffer,
    beforeMetrics,
    afterMetrics,
    renderTimeMs,
    settings: { ...settings },
    report
  };
}

export async function renderPreviewMaster(
  inputBuffer: AudioBuffer,
  settings: PreviewSettings,
  onProgress?: RenderProgressCallback
): Promise<PreviewRenderResult> {
  try {
    return await renderPreviewMasterInternal(inputBuffer, settings, onProgress);
  } catch (error) {
    const baseMessage = error instanceof Error ? error.message : "Erreur inconnue.";
    throw new Error(
      `Rendu local impossible. ${baseMessage} Essaie un fichier plus court, un format WAV/MP3 différent, ou recharge la page si le navigateur manque de mémoire.`
    );
  }
}
