import { buildSettingsFromAnalysis, inferAutoMasterPlan } from "./autoTarget";
import { getSettingsForPreset } from "./previewPresets";
import type { PreviewSettings, SourceAnalysisResult, PreviewRenderResult } from "./types";

export interface AdvisorMove {
  id: string;
  title: string;
  detail: string;
  severity: "info" | "warning" | "success";
}

export interface AdvisorResult {
  summary: string;
  moves: AdvisorMove[];
  recommendedSettings: PreviewSettings | null;
  confidence: "faible" | "correcte" | "forte";
}

export function buildAdvisor(
  sourceAnalysis: SourceAnalysisResult | null,
  currentSettings: PreviewSettings,
  previewResult: PreviewRenderResult | null
): AdvisorResult {
  if (!sourceAnalysis) {
    return {
      summary: "Importe un morceau pour obtenir une proposition automatique.",
      moves: [],
      recommendedSettings: null,
      confidence: "faible"
    };
  }

  const metrics = sourceAnalysis.metrics;
  const moves: AdvisorMove[] = [];
  const plan = inferAutoMasterPlan(metrics, {
    autoIntensity: currentSettings.autoIntensity,
    antiFatigue: currentSettings.antiFatigue,
    spacePreserve: currentSettings.spacePreserve
  });
  const recommended = buildSettingsFromAnalysis(metrics, currentSettings.presetId, {
    autoIntensity: currentSettings.autoIntensity,
    antiFatigue: currentSettings.antiFatigue,
    spacePreserve: currentSettings.spacePreserve
  });

  moves.push({
    id: "auto-plan",
    title: `Objectif indicatif : ${plan.profileLabel}`,
    detail: `LUFS visé ${plan.targetLufsMinEstimate.toFixed(1)} à ${plan.targetLufsMaxEstimate.toFixed(1)}, headroom ${plan.targetHeadroomMinDb.toFixed(1)} à ${plan.targetHeadroomMaxDb.toFixed(1)} dB. Le résultat réel peut rester plus prudent si le peak ou la dynamique l’imposent.`,
    severity: "info"
  });

  if (metrics.highTotalRatio > 0.38 || metrics.fizzRatio > 0.075) {
    moves.push({
      id: "shimmer",
      title: "Brillance IA à calmer",
      detail: "AI shimmer / fizz détecté dans le haut du spectre. Réparation source renforcée recommandée.",
      severity: "warning"
    });
    recommended.highTreatment = "verySoft";
    recommended.sourceRepair = "strong";
    recommended.antiFatigue = true;
    recommended.autoIntensity = currentSettings.autoIntensity === "impact" ? "balanced" : currentSettings.autoIntensity;
    recommended.intensity = Math.max(recommended.intensity, 72);
  }

  if (metrics.lowRatio > 0.46 || metrics.subRatio > 0.065) {
    moves.push({
      id: "mud",
      title: "Bas du spectre chargé",
      detail: "Le grave ou bas-médium peut masquer la voix et provoquer une impression de mix épais.",
      severity: "info"
    });
    recommended.presetId = recommended.presetId === "open" ? "balanced" : recommended.presetId;
  }

  if (metrics.clippingSamples > 25 || metrics.approxTruePeakDb > -0.4) {
    moves.push({
      id: "clip",
      title: "Pics très proches du plafond",
      detail: "Soft de-clip et limiteur de sécurité doivent rester prudents pour éviter les craquements.",
      severity: "warning"
    });
    recommended.sourceRepair = "strong";
    recommended.maxPeakDb = -1.4;
  }

  if (metrics.crestFactorDb < 7 || metrics.loudnessRangeEstimate < 4.2) {
    moves.push({
      id: "dense",
      title: "Morceau déjà dense",
      detail: "Cible de niveau plus prudente pour ne pas écraser davantage la dynamique.",
      severity: "info"
    });
    recommended.targetLufsEstimate = Math.min(recommended.targetLufsEstimate, -13.8);
    recommended.targetRmsDb = Math.min(recommended.targetRmsDb, -13.1);
    recommended.density = Math.min(recommended.density, 38);
  }

  if (metrics.stereoCorrelation < 0.18) {
    moves.push({
      id: "stereo",
      title: "Stéréo très large",
      detail: "Réduction légère de largeur pour stabiliser le centre et limiter le flou.",
      severity: "info"
    });
    recommended.stereoWidth = Math.min(recommended.stereoWidth, 96);
  }

  if (moves.length === 1) {
    moves.push({
      id: "clean",
      title: "Source plutôt saine",
      detail: "Traitement léger conseillé : conserver la clarté et éviter de trop assombrir le morceau.",
      severity: "success"
    });
    Object.assign(recommended, getSettingsForPreset("balanced"), {
      targetLufsEstimate: recommended.targetLufsEstimate,
      targetRmsDb: recommended.targetRmsDb,
      sourceRepair: "light",
      autoIntensity: currentSettings.autoIntensity,
      antiFatigue: currentSettings.antiFatigue,
      spacePreserve: currentSettings.spacePreserve
    });
  }

  if (previewResult) {
    const deltaHigh = previewResult.afterMetrics.highTotalRatio - previewResult.beforeMetrics.highTotalRatio;
    if (deltaHigh > 0.02) {
      moves.unshift({
        id: "preview-high",
        title: "Preview encore brillante",
        detail: "La Preview garde beaucoup d’énergie dans les aigus. Un profil plus doux peut être préférable.",
        severity: "warning"
      });
    }
  }

  const confidence = moves.some((move) => move.severity === "warning") ? "forte" : "correcte";
  const summary = moves.some((move) => move.id === "shimmer")
    ? "Recommandation : lift auto avec réparation forte et aigus très doux."
    : moves.some((move) => move.id === "clean")
      ? "Recommandation : traitement léger, source déjà assez propre."
      : `Recommandation : ${plan.profileLabel.toLowerCase()}, objectif indicatif ${plan.targetLufsMinEstimate.toFixed(1)} à ${plan.targetLufsMaxEstimate.toFixed(1)} LUFS est.`;

  return {
    summary,
    moves,
    recommendedSettings: recommended,
    confidence
  };
}
