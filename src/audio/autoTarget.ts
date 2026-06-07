import { clamp } from "./audioBufferUtils";
import { getSettingsForPreset } from "./previewPresets";
import type {
  AdvancedAudioMetrics,
  AutoMasterPlan,
  PreviewPresetId,
  PreviewSettings,
  SourceRepairLevel
} from "./types";

function spectralCorrectionFor(metrics: AdvancedAudioMetrics): number {
  return clamp((metrics.highTotalRatio - 0.28) * 2.2, -0.9, 1.1);
}

function oneDecimal(value: number): number {
  return Number(value.toFixed(1));
}

function inferCeiling(metrics: AdvancedAudioMetrics): number {
  const clipped = metrics.clippingSamples > 25 || metrics.approxTruePeakDb > -0.35;
  const compact = metrics.crestFactorDb < 7.2 || metrics.loudnessRangeEstimate < 4.2;
  const harsh = metrics.highTotalRatio > 0.42 || metrics.fizzRatio > 0.085;

  if (clipped) {
    return -1.5;
  }

  if (compact && harsh) {
    return -1.3;
  }

  if (compact) {
    return -1.2;
  }

  return -1.0;
}

export function inferTargetLufs(metrics: AdvancedAudioMetrics): number {
  return inferAutoMasterPlan(metrics).targetLufsEstimate;
}

export function targetLufsToRmsTarget(metrics: AdvancedAudioMetrics, targetLufs: number): number {
  const correction = spectralCorrectionFor(metrics);
  return clamp(targetLufs + 0.7 - correction, -16.5, -11.1);
}

export function inferAutoMasterPlan(metrics: AdvancedAudioMetrics): AutoMasterPlan {
  const clipped = metrics.clippingSamples > 25 || metrics.approxTruePeakDb > -0.35;
  const veryCompact = metrics.crestFactorDb < 6.8 || metrics.loudnessRangeEstimate < 3.8;
  const compact = metrics.crestFactorDb < 7.8 || metrics.loudnessRangeEstimate < 4.6;
  const fatiguingHigh = metrics.highTotalRatio > 0.4 || metrics.fizzRatio > 0.08;
  const veryQuiet = metrics.estimatedLufs <= -17;
  const quiet = metrics.estimatedLufs <= -15.2;
  const moderate = metrics.estimatedLufs <= -13.4;
  const alreadyLoud = metrics.estimatedLufs > -12.2;
  const ceilingDb = inferCeiling(metrics);

  let targetLufsEstimate = -12.8;
  let profile: AutoMasterPlan["profile"] = "balancedLift";
  let profileLabel = "Auto équilibré";
  let compressionIntent: AutoMasterPlan["compressionIntent"] = "modéré";
  let safetyIntent: AutoMasterPlan["safetyIntent"] = "normal";
  let reason = "Niveau source moyen : montée de niveau contrôlée et ceiling autour de -1 dBTP estimé.";

  if (clipped) {
    targetLufsEstimate = -13.8;
    profile = "protect";
    profileLabel = "Auto protecteur";
    compressionIntent = "léger";
    safetyIntent = "protecteur";
    reason = "Pics déjà très proches du plafond : priorité à la sécurité et au soft repair avant le loudness.";
  } else if (alreadyLoud && veryCompact) {
    targetLufsEstimate = -14.0;
    profile = "preserve";
    profileLabel = "Auto préservation";
    compressionIntent = "préserver";
    safetyIntent = "prudent";
    reason = "Source déjà forte et compacte : éviter de pousser le morceau inutilement.";
  } else if (alreadyLoud) {
    targetLufsEstimate = fatiguingHigh ? -13.7 : -13.4;
    profile = "preserve";
    profileLabel = "Auto prudent";
    compressionIntent = "léger";
    safetyIntent = "prudent";
    reason = "Source déjà assez forte : légère mise en forme sans chercher à écraser.";
  } else if (veryQuiet && !compact) {
    targetLufsEstimate = -12.1;
    profile = "strongLift";
    profileLabel = "Auto lift fort";
    compressionIntent = "fort prudent";
    reason = "Source très basse et encore dynamique : gain assumé, ceiling proche de -1 dBTP estimé.";
  } else if (veryQuiet) {
    targetLufsEstimate = fatiguingHigh ? -12.9 : -12.7;
    profile = "strongLift";
    profileLabel = "Auto lift contrôlé";
    compressionIntent = compact ? "modéré" : "fort prudent";
    reason = "Source très basse mais compacte : montée franche avec headroom protégé.";
  } else if (quiet) {
    targetLufsEstimate = fatiguingHigh ? -12.6 : -12.3;
    profile = "strongLift";
    profileLabel = "Auto lift";
    compressionIntent = compact ? "modéré" : "fort prudent";
    reason = "Source sous le niveau cible : montée automatique et headroom contrôlé.";
  } else if (moderate) {
    targetLufsEstimate = fatiguingHigh ? -12.9 : -12.6;
    profile = "balancedLift";
    profileLabel = "Auto équilibré";
    compressionIntent = compact ? "léger" : "modéré";
    reason = "Source intermédiaire : rapprochement d’un niveau de comparaison plus franc.";
  }

  if (fatiguingHigh && targetLufsEstimate > -12.6 && !veryQuiet) {
    targetLufsEstimate -= 0.3;
  }

  if (veryCompact && !veryQuiet && targetLufsEstimate > -13.4) {
    targetLufsEstimate = -13.4;
  }

  if (veryCompact && veryQuiet && targetLufsEstimate > -12.9) {
    targetLufsEstimate = -12.9;
  }

  const targetRmsDb = targetLufsToRmsTarget(metrics, targetLufsEstimate);

  return {
    profile,
    profileLabel,
    targetLufsEstimate: oneDecimal(targetLufsEstimate),
    targetRmsDb: oneDecimal(targetRmsDb),
    ceilingDb: oneDecimal(ceilingDb),
    targetHeadroomDb: oneDecimal(Math.abs(ceilingDb)),
    expectedLiftDb: oneDecimal(clamp(targetLufsEstimate - metrics.estimatedLufs, -1.8, 8.8)),
    compressionIntent,
    safetyIntent,
    reason
  };
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
  const plan = inferAutoMasterPlan(metrics);

  const highTreatment =
    metrics.fizzRatio > 0.075 || metrics.highTotalRatio > 0.42
      ? "verySoft"
      : metrics.highTotalRatio > 0.34
        ? "soft"
        : base.highTreatment;

  const liftPush = clamp(plan.expectedLiftDb, 0, 8.8);
  const intensity = clamp(
    base.intensity +
      liftPush * 3.2 +
      (metrics.fizzRatio > 0.08 ? 8 : 0) +
      (metrics.highTotalRatio > 0.4 ? 6 : 0) +
      (metrics.crestFactorDb < 7 ? -5 : 0),
    34,
    88
  );

  const density = clamp(
    base.density +
      (metrics.crestFactorDb > 11 ? 7 : 0) +
      (plan.profile === "strongLift" ? 5 : 0) -
      (metrics.crestFactorDb < 7 ? 8 : 0),
    16,
    62
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
    targetRmsDb: plan.targetRmsDb,
    targetLufsEstimate: plan.targetLufsEstimate,
    maxPeakDb: plan.ceilingDb,
    stereoWidth: Math.round(stereoWidth),
    density: Math.round(density),
    sourceRepair: inferSourceRepair(metrics)
  };
}
