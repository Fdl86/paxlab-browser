import { clamp } from "./audioBufferUtils";
import { getSettingsForPreset } from "./previewPresets";
import type {
  AdvancedAudioMetrics,
  AutoIntensityId,
  AutoMasterPlan,
  PreviewPresetId,
  PreviewSettings,
  SourceRepairLevel
} from "./types";

export interface AutoPlanOptions {
  autoIntensity?: AutoIntensityId;
  antiFatigue?: boolean;
  vocalPresence?: boolean;
  spacePreserve?: boolean;
}

function oneDecimal(value: number): number {
  return Number(value.toFixed(1));
}

function inferSafety(metrics: AdvancedAudioMetrics, antiFatigue: boolean) {
  const clipped = metrics.clippingSamples > 25 || metrics.approxTruePeakDb > -0.35;
  const veryCompact = metrics.crestFactorDb < 6.8 || metrics.loudnessRangeEstimate < 3.8;
  const compact = metrics.crestFactorDb < 7.8 || metrics.loudnessRangeEstimate < 4.6;
  const fatiguingHigh = antiFatigue || metrics.highTotalRatio > 0.4 || metrics.fizzRatio > 0.08;

  return { clipped, veryCompact, compact, fatiguingHigh };
}

function inferCeiling(
  metrics: AdvancedAudioMetrics,
  autoIntensity: AutoIntensityId,
  antiFatigue: boolean
): { ceiling: number; minHeadroom: number; maxHeadroom: number } {
  const { clipped, veryCompact, compact, fatiguingHigh } = inferSafety(metrics, antiFatigue);

  if (autoIntensity === "youtube") {
    if (clipped || veryCompact || fatiguingHigh) {
      return { ceiling: -2.0, minHeadroom: 1.8, maxHeadroom: 4.0 };
    }

    if (compact) {
      return { ceiling: -1.9, minHeadroom: 1.6, maxHeadroom: 3.8 };
    }

    return { ceiling: -1.8, minHeadroom: 1.5, maxHeadroom: 3.5 };
  }

  if (clipped) {
    return { ceiling: -2.4, minHeadroom: 2.0, maxHeadroom: 4.0 };
  }

  if (antiFatigue && (fatiguingHigh || compact)) {
    return { ceiling: -2.8, minHeadroom: 2.4, maxHeadroom: 4.2 };
  }

  if (autoIntensity === "safe") {
    return fatiguingHigh || veryCompact
      ? { ceiling: -3.2, minHeadroom: 2.8, maxHeadroom: 4.4 }
      : { ceiling: -2.8, minHeadroom: 2.4, maxHeadroom: 4.0 };
  }

  if (autoIntensity === "impact") {
    if (fatiguingHigh || veryCompact) {
      return { ceiling: -1.8, minHeadroom: 1.5, maxHeadroom: 3.2 };
    }

    return { ceiling: -1.2, minHeadroom: 1.0, maxHeadroom: 2.4 };
  }

  if (fatiguingHigh || veryCompact) {
    return { ceiling: -2.6, minHeadroom: 2.0, maxHeadroom: 4.0 };
  }

  if (compact) {
    return { ceiling: -2.2, minHeadroom: 1.8, maxHeadroom: 3.5 };
  }

  return { ceiling: -1.8, minHeadroom: 1.4, maxHeadroom: 3.2 };
}

function intensityTargetShift(autoIntensity: AutoIntensityId, antiFatigue: boolean): number {
  if (autoIntensity === "youtube") {
    return antiFatigue ? -1.15 : -0.95;
  }

  const shift = autoIntensity === "safe" ? -1.0 : autoIntensity === "impact" ? 0.8 : -0.2;
  return shift + (antiFatigue ? -0.55 : 0);
}

export function inferTargetLufs(metrics: AdvancedAudioMetrics): number {
  return inferAutoMasterPlan(metrics).targetLufsEstimate;
}

export function targetLufsToRmsTarget(metrics: AdvancedAudioMetrics, targetLufs: number): number {
  const lufsRmsDelta = clamp(metrics.estimatedLufs - metrics.rmsDb, -1.5, 5.8);
  const safetyBias = targetLufs <= -14 ? -0.15 : 0;
  return clamp(targetLufs - lufsRmsDelta + safetyBias, -20.5, -9.2);
}

export function inferAutoMasterPlan(
  metrics: AdvancedAudioMetrics,
  options: AutoPlanOptions = {}
): AutoMasterPlan {
  const autoIntensity = options.autoIntensity ?? "balanced";
  const antiFatigue = Boolean(options.antiFatigue);
  const spacePreserve = Boolean(options.spacePreserve);
  const { clipped, veryCompact, compact, fatiguingHigh } = inferSafety(metrics, antiFatigue);
  const ultraQuiet = metrics.estimatedLufs <= -22;
  const veryQuiet = metrics.estimatedLufs <= -18;
  const quiet = metrics.estimatedLufs <= -15.5;
  const moderate = metrics.estimatedLufs <= -13.2;
  const alreadyLoud = metrics.estimatedLufs > -11.3;
  const ceilingPlan = inferCeiling(metrics, autoIntensity, antiFatigue);

  let targetLufsEstimate = -13.1;
  let profile: AutoMasterPlan["profile"] = "balancedLift";
  let profileLabel = "Auto équilibré";
  let compressionIntent: AutoMasterPlan["compressionIntent"] = "modéré";
  let safetyIntent: AutoMasterPlan["safetyIntent"] = "normal";
  let reason = "Niveau source moyen : montée de niveau contrôlée, puis headroom dynamique selon sécurité.";

  if (autoIntensity === "youtube") {
    targetLufsEstimate = clipped || veryCompact || fatiguingHigh ? -14.6 : compact ? -14.5 : -14.4;
    profile = "youtubeMix";
    profileLabel = "Mix YouTube";
    compressionIntent = compact || veryCompact ? "léger" : "modéré";
    safetyIntent = clipped || fatiguingHigh ? "prudent" : "normal";
    reason = "Preset YouTube : PAXLAB vise un LUFS intégré sous -14 avec clamp final, un peak plus prudent, un grave stabilisé et des aigus IA contrôlés pour l’upload vidéo.";
  } else if (clipped) {
    targetLufsEstimate = -13.6;
    profile = "protect";
    profileLabel = "Auto protecteur";
    compressionIntent = "léger";
    safetyIntent = "protecteur";
    reason = "Pics déjà proches du plafond : PAXLAB privilégie la réparation et garde plus de marge.";
  } else if (alreadyLoud && veryCompact) {
    targetLufsEstimate = -12.8;
    profile = "preserve";
    profileLabel = "Auto préservation";
    compressionIntent = "préserver";
    safetyIntent = "prudent";
    reason = "Source déjà forte et compacte : le traitement évite de pousser inutilement.";
  } else if (alreadyLoud) {
    targetLufsEstimate = fatiguingHigh ? -13.0 : -12.4;
    profile = "preserve";
    profileLabel = "Auto prudent";
    compressionIntent = "léger";
    safetyIntent = "prudent";
    reason = "Source déjà assez forte : mise en forme et sécurité, sans course au volume.";
  } else if (ultraQuiet && !compact) {
    targetLufsEstimate = fatiguingHigh ? -12.1 : -11.5;
    profile = "strongLift";
    profileLabel = "Auto lift très fort";
    compressionIntent = "fort prudent";
    reason = "Source très basse : PAXLAB peut pousser franchement, avec contrôle de headroom.";
  } else if (ultraQuiet) {
    targetLufsEstimate = fatiguingHigh ? -12.7 : -12.1;
    profile = "strongLift";
    profileLabel = "Auto lift fort contrôlé";
    compressionIntent = compact ? "modéré" : "fort prudent";
    reason = "Source très basse mais compacte : gain important, avec marge plus prudente.";
  } else if (veryQuiet && !compact) {
    targetLufsEstimate = fatiguingHigh ? -12.1 : -11.6;
    profile = "strongLift";
    profileLabel = "Auto lift fort";
    compressionIntent = "fort prudent";
    reason = "Source basse et dynamique : rapprochement d’une Preview plus dense.";
  } else if (veryQuiet) {
    targetLufsEstimate = fatiguingHigh ? -12.5 : -12.0;
    profile = "strongLift";
    profileLabel = "Auto lift contrôlé";
    compressionIntent = compact ? "modéré" : "fort prudent";
    reason = "Source basse mais déjà dense : lift contrôlé pour préserver l’écoute.";
  } else if (quiet) {
    targetLufsEstimate = fatiguingHigh ? -12.4 : -12.0;
    profile = "strongLift";
    profileLabel = "Auto lift";
    compressionIntent = compact ? "modéré" : "fort prudent";
    reason = "Source sous le niveau cible : montée automatique et marge contrôlée.";
  } else if (moderate) {
    targetLufsEstimate = fatiguingHigh ? -12.6 : -12.2;
    profile = "balancedLift";
    profileLabel = "Auto équilibré";
    compressionIntent = compact ? "léger" : "modéré";
    reason = "Source intermédiaire : densité supplémentaire sans forcer le plafond.";
  }

  if (autoIntensity === "youtube") {
    if (antiFatigue) {
      targetLufsEstimate -= 0.25;
      reason = `${reason} AI Brightness Smoothing actif : le preset YouTube garde un rendu encore plus confortable.`;
    }
  } else {
    targetLufsEstimate += intensityTargetShift(autoIntensity, antiFatigue);
  }

  if (spacePreserve && autoIntensity !== "youtube") {
    targetLufsEstimate -= autoIntensity === "impact" ? 0.45 : 0.35;
    compressionIntent = compressionIntent === "fort prudent" ? "modéré" : compressionIntent === "modéré" ? "léger" : compressionIntent;
    reason = `${reason} Préserver l’espace actif : PAXLAB garde plus de respiration et limite moins fort.`;
  }

  if (autoIntensity === "impact" && veryCompact && !veryQuiet) {
    targetLufsEstimate = Math.min(targetLufsEstimate, -11.2);
  }

  if (autoIntensity === "youtube") {
    profileLabel = antiFatigue ? "Mix YouTube anti-fatigue" : "Mix YouTube";
  } else if (autoIntensity === "safe") {
    profileLabel = `${profileLabel} prudent`;
  } else if (autoIntensity === "impact") {
    profileLabel = `${profileLabel} impact`;
  }

  if (antiFatigue && autoIntensity !== "youtube") {
    profileLabel = `${profileLabel} anti-fatigue`;
    reason = `${reason} Option AI Brightness Smoothing active : le haut du spectre est calmé et la cible reste plus confortable.`;
  }

  targetLufsEstimate = autoIntensity === "youtube"
    ? clamp(targetLufsEstimate, -15.4, -14.4)
    : clamp(
        targetLufsEstimate,
        autoIntensity === "safe" || antiFatigue ? -15.2 : -14.4,
        autoIntensity === "impact" && !antiFatigue ? -10.4 : autoIntensity === "safe" || antiFatigue ? -12.9 : -11.4
      );

  const targetRmsDb = targetLufsToRmsTarget(metrics, targetLufsEstimate);
  const lufsToleranceLow = autoIntensity === "youtube" ? 0.55 : autoIntensity === "safe" ? 0.9 : antiFatigue ? 1.0 : 0.75;
  const lufsToleranceHigh = autoIntensity === "youtube" ? Math.max(0.1, -14.0 - targetLufsEstimate) : autoIntensity === "impact" ? 0.5 : 0.4;

  return {
    profile,
    profileLabel,
    targetLufsEstimate: oneDecimal(targetLufsEstimate),
    targetLufsMinEstimate: oneDecimal(targetLufsEstimate - lufsToleranceLow),
    targetLufsMaxEstimate: oneDecimal(targetLufsEstimate + lufsToleranceHigh),
    targetRmsDb: oneDecimal(targetRmsDb),
    ceilingDb: oneDecimal(ceilingPlan.ceiling),
    targetHeadroomDb: oneDecimal(Math.abs(ceilingPlan.ceiling)),
    targetHeadroomMinDb: oneDecimal(ceilingPlan.minHeadroom),
    targetHeadroomMaxDb: oneDecimal(ceilingPlan.maxHeadroom),
    expectedLiftDb: oneDecimal(clamp(targetLufsEstimate - metrics.estimatedLufs, -2.2, 10.2)),
    compressionIntent,
    safetyIntent,
    reason
  };
}

function inferSourceRepair(metrics: AdvancedAudioMetrics, antiFatigue: boolean): SourceRepairLevel {
  const harshOrFizz = antiFatigue || metrics.fizzRatio > 0.075 || metrics.highTotalRatio > 0.4;
  const clipped = metrics.clippingSamples > 25 || metrics.approxTruePeakDb > -0.4;
  const compact = metrics.crestFactorDb < 7.3 || metrics.loudnessRangeEstimate < 4.5;

  if ((harshOrFizz && compact) || clipped || antiFatigue) {
    return "strong";
  }

  if (harshOrFizz || metrics.noiseFloorEstimateDb > -50) {
    return "normal";
  }

  return "light";
}

export function buildSettingsFromAnalysis(
  metrics: AdvancedAudioMetrics,
  presetId: PreviewPresetId = "auto",
  options: AutoPlanOptions = {}
): PreviewSettings {
  const base = getSettingsForPreset(presetId);
  const autoIntensity = options.autoIntensity ?? base.autoIntensity ?? "balanced";
  const antiFatigue = options.antiFatigue ?? base.antiFatigue ?? false;
  const vocalPresence = antiFatigue ? false : options.vocalPresence ?? base.vocalPresence ?? false;
  const spacePreserve = options.spacePreserve ?? base.spacePreserve ?? false;
  const plan = inferAutoMasterPlan(metrics, { autoIntensity, antiFatigue, spacePreserve });

  const isYoutubeMix = autoIntensity === "youtube";
  const highTreatment = isYoutubeMix
    ? antiFatigue || metrics.fizzRatio > 0.065 || metrics.highTotalRatio > 0.38
      ? "verySoft"
      : "soft"
    : antiFatigue
      ? "verySoft"
      : metrics.fizzRatio > 0.075 || metrics.highTotalRatio > 0.42
        ? "verySoft"
        : metrics.highTotalRatio > 0.34
          ? "soft"
          : base.highTreatment;

  const liftPush = clamp(plan.expectedLiftDb, 0, 10.5);
  const intensity = clamp(
    base.intensity +
      liftPush * (autoIntensity === "impact" ? 4.0 : autoIntensity === "youtube" ? 2.7 : autoIntensity === "safe" ? 2.8 : 3.4) +
      (metrics.fizzRatio > 0.08 ? 8 : 0) +
      (metrics.highTotalRatio > 0.4 ? 6 : 0) +
      (metrics.crestFactorDb < 7 ? -5 : 0) +
      (antiFatigue ? 8 : 0),
    32,
    autoIntensity === "impact" ? 98 : autoIntensity === "youtube" ? 86 : 92
  );

  const density = clamp(
    base.density +
      (metrics.crestFactorDb > 11 ? 7 : 0) +
      (plan.profile === "strongLift" ? 5 : 0) +
      (autoIntensity === "impact" ? 5 : 0) -
      (autoIntensity === "youtube" ? 8 : 0) -
      (autoIntensity === "safe" ? 6 : 0) -
      (antiFatigue ? 5 : 0) -
      (spacePreserve ? 9 : 0) -
      (metrics.crestFactorDb < 7 ? 8 : 0),
    12,
    autoIntensity === "youtube" ? 48 : 66
  );

  const stereoWidth = clamp(
    metrics.stereoCorrelation < 0.18 ? 96 : base.stereoWidth,
    90,
    autoIntensity === "youtube" ? 102 : antiFatigue ? 102 : 108
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
    sourceRepair: isYoutubeMix && !antiFatigue ? "normal" : inferSourceRepair(metrics, antiFatigue),
    autoIntensity,
    antiFatigue,
    vocalPresence,
    spacePreserve
  };
}
