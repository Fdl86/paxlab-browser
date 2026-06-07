import { clamp } from "./audioBufferUtils";
import { getSettingsForPreset } from "./previewPresets";
import type { AdvancedAudioMetrics, PreviewPresetId, PreviewSettings, SourceRepairLevel } from "./types";

function spectralCorrectionFor(metrics: AdvancedAudioMetrics): number {
  return clamp((metrics.highTotalRatio - 0.28) * 2.2, -0.9, 1.1);
}

export function inferTargetLufs(metrics: AdvancedAudioMetrics): number {
  const isAlreadyVeryLoud = metrics.estimatedLufs > -10.5;
  const isCompact = metrics.crestFactorDb < 7.5 || metrics.loudnessRangeEstimate < 4.5;
  const isFatiguingHigh = metrics.highTotalRatio > 0.38 || metrics.fizzRatio > 0.075;
  const isQuiet = metrics.estimatedLufs < -17;

  if (isAlreadyVeryLoud && isCompact) {
    return -14.2;
  }

  if (isFatiguingHigh && isCompact) {
    return -13.9;
  }

  if (isFatiguingHigh) {
    return -13.7;
  }

  if (isQuiet && metrics.crestFactorDb > 10) {
    return -13.1;
  }

  if (metrics.estimatedLufs > -12) {
    return -13.6;
  }

  return -13.2;
}

export function targetLufsToRmsTarget(metrics: AdvancedAudioMetrics, targetLufs: number): number {
  const correction = spectralCorrectionFor(metrics);
  return clamp(targetLufs + 0.7 - correction, -16, -12);
}


function inferSourceRepair(metrics: AdvancedAudioMetrics): SourceRepairLevel {
  const harshOrFizz = metrics.fizzRatio > 0.075 || metrics.highTotalRatio > 0.4;
  const clipped = metrics.clippingSamples > 25 || metrics.approxTruePeakDb > -0.4;
  const compact = metrics.crestFactorDb < 7.3 || metrics.loudnessRangeEstimate < 4.5;

  if ((harshOrFizz && compact) || clipped) {
    return "strong";
  }

  if (harshOrFizz || metrics.noiseFloorEstimateDb > -50) {
    return "normal";
  }

  return "light";
}

export function buildSettingsFromAnalysis(
  metrics: AdvancedAudioMetrics,
  presetId: PreviewPresetId = "auto"
): PreviewSettings {
  const base = getSettingsForPreset(presetId);
  const targetLufsEstimate = inferTargetLufs(metrics);
  const targetRmsDb = targetLufsToRmsTarget(metrics, targetLufsEstimate);

  const highTreatment =
    metrics.fizzRatio > 0.075 || metrics.highTotalRatio > 0.42
      ? "verySoft"
      : metrics.highTotalRatio > 0.34
        ? "soft"
        : base.highTreatment;

  const intensity = clamp(
    base.intensity +
      (metrics.fizzRatio > 0.08 ? 8 : 0) +
      (metrics.highTotalRatio > 0.4 ? 6 : 0) +
      (metrics.crestFactorDb < 7 ? -4 : 0),
    34,
    84
  );

  const density = clamp(
    base.density + (metrics.crestFactorDb > 11 ? 6 : -4),
    18,
    58
  );

  const stereoWidth = clamp(
    metrics.stereoCorrelation < 0.18 ? 96 : base.stereoWidth,
    90,
    106
  );

  return {
    ...base,
    highTreatment,
    intensity: Math.round(intensity),
    targetRmsDb: Number(targetRmsDb.toFixed(1)),
    targetLufsEstimate: Number(targetLufsEstimate.toFixed(1)),
    stereoWidth: Math.round(stereoWidth),
    density: Math.round(density),
    sourceRepair: inferSourceRepair(metrics)
  };
}
