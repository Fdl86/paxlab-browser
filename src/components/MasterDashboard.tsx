import type { CSSProperties } from "react";
import { inferAutoMasterPlan } from "../audio/autoTarget";
import { formatDb } from "../audio/audioBufferUtils";
import type { AutoMasterPlan, PreviewRenderResult, PreviewSettings, SourceAnalysisResult } from "../audio/types";

interface MasterDashboardProps {
  sourceAnalysis: SourceAnalysisResult | null;
  previewResult: PreviewRenderResult | null;
  previewSettings: PreviewSettings;
}

type ObjectiveTone = "success" | "warning" | "neutral" | "danger";

interface ObjectiveItem {
  label: string;
  target: string;
  result: string;
  status: string;
  tone: ObjectiveTone;
  marker: number;
  note: string;
}

function formatLufs(value: number): string {
  return `${value.toFixed(1)} LUFS est.`;
}

function formatSigned(value: number, suffix = "dB"): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)} ${suffix}`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)} %`;
}

function formatLufsRange(plan: AutoMasterPlan): string {
  return `${plan.targetLufsMinEstimate.toFixed(1)} à ${plan.targetLufsMaxEstimate.toFixed(1)}`;
}

function formatPeakMarginRange(plan: AutoMasterPlan): string {
  return `${plan.targetHeadroomMinDb.toFixed(1)} à ${plan.targetHeadroomMaxDb.toFixed(1)} dB`;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function rangeMarker(value: number, min: number, max: number): number {
  if (max === min) {
    return 50;
  }

  return clampPercent(((value - min) / (max - min)) * 100);
}

function getObjectiveToneClass(tone: ObjectiveTone): string {
  return `visual-objective ${tone}`;
}

function lufsObjective(result: PreviewRenderResult, plan: AutoMasterPlan): ObjectiveItem {
  const value = result.afterMetrics.estimatedLufs;
  const isYoutubeMix = result.settings.autoIntensity === "youtube";
  const isInRange = value >= plan.targetLufsMinEstimate && value <= plan.targetLufsMaxEstimate;
  const isTooHot = isYoutubeMix ? value > -14.0 : value > plan.targetLufsMaxEstimate + 0.5;

  return {
    label: isYoutubeMix ? "LUFS YouTube" : "LUFS",
    target: isYoutubeMix ? "≤ -14.0 LUFS" : `${formatLufsRange(plan)} LUFS`,
    result: value.toFixed(1),
    status: isInRange ? "Atteint" : isTooHot ? "Trop fort" : "Partiel",
    tone: isInRange ? "success" : isTooHot ? "warning" : "neutral",
    marker: rangeMarker(value, plan.targetLufsMinEstimate - 1.5, plan.targetLufsMaxEstimate + 1.5),
    note: isInRange ? (isYoutubeMix ? "Sous le maximum visé." : "Dans la plage prévue.") : isTooHot ? "Plus fort que la cible prévue." : "Rendu plus prudent."
  };
}

function peakMarginObjective(result: PreviewRenderResult, plan: AutoMasterPlan): ObjectiveItem {
  const summary = result.report.loudness.headroomSummary;
  const value = summary?.finalHeadroomDb ?? result.report.loudness.achievedHeadroomDb;
  const isInRange = value >= plan.targetHeadroomMinDb && value <= plan.targetHeadroomMaxDb;
  const tooTight = value < plan.targetHeadroomMinDb - 0.25;

  return {
    label: "Marge peak",
    target: `Plafond ${formatDb(result.report.loudness.ceilingDb)}`,
    result: `${value.toFixed(1)} dB`,
    status: tooTight ? "Serré" : isInRange ? "OK" : "Plus prudent",
    tone: isInRange ? "success" : tooTight ? "warning" : "neutral",
    marker: rangeMarker(value, Math.max(0, plan.targetHeadroomMinDb - 1.5), plan.targetHeadroomMaxDb + 1.5),
    note: isInRange ? "Marge de sécurité cohérente." : tooTight ? "Marge serrée, écoute obligatoire." : "Peak réel plus bas que le plafond : source ou cible LUFS prudente."
  };
}

function peakMarker(value: number, ceiling: number): number {
  const lowerBound = ceiling - 2.0;
  const upperBound = ceiling + 1.0;
  return rangeMarker(value, lowerBound, upperBound);
}

function peakObjective(result: PreviewRenderResult, plan: AutoMasterPlan): ObjectiveItem {
  const value = result.afterMetrics.peakDb;
  const estimatedSafetyPeak = result.afterMetrics.approxTruePeakDb;
  const ceiling = result.report.loudness.ceilingDb ?? result.settings.maxPeakDb ?? plan.ceilingDb;
  const softToleranceDb = 0.35;
  const hardSafetyLimitDb = -1.0;
  const isCritical = value > hardSafetyLimitDb || estimatedSafetyPeak > hardSafetyLimitDb + 0.15;
  const isSafe = !isCritical && value <= ceiling + softToleranceDb;
  const nearCeiling = value > ceiling - 0.8 && isSafe;

  return {
    label: "Peak global",
    target: `≤ ${formatDb(ceiling)}`,
    result: formatDb(value),
    status: isSafe ? nearCeiling ? "Contrôlé" : "Sécurisé" : "À vérifier",
    tone: isSafe ? "success" : "warning",
    marker: peakMarker(value, ceiling),
    note: isSafe
      ? "Peak global dans la marge prévue."
      : "Peak global à surveiller avant export final."
  };
}

function fizzObjective(result: PreviewRenderResult): ObjectiveItem {
  const before = result.beforeMetrics.fizzRatio;
  const after = result.afterMetrics.fizzRatio;
  const reduction = before > 0 ? (before - after) / before : 0;
  const softened = after <= before * 0.98;

  return {
    label: "Brillance IA",
    target: result.settings.antiFatigue ? "Réduction prioritaire" : "Contrôle doux",
    result: `${formatPercent(before)} → ${formatPercent(after)}`,
    status: softened ? "Adouci" : "Stable",
    tone: softened ? "success" : "neutral",
    marker: clampPercent(100 - Math.max(0, reduction) * 100),
    note: softened ? "Brillance IA / fizz réduits." : "Pas de dureté excessive détectée."
  };
}

function dynamicsMarker(result: PreviewRenderResult, value: number): number {
  const isYoutubeMix = result.settings.autoIntensity === "youtube";
  const isImpact = result.settings.autoIntensity === "impact" || result.settings.presetId === "power";

  if (isYoutubeMix) {
    return rangeMarker(value, 10, 22);
  }

  if (isImpact) {
    return rangeMarker(value, 7, 15);
  }

  return rangeMarker(value, 7, 17);
}

function dynamicsObjective(result: PreviewRenderResult): ObjectiveItem {
  const before = result.beforeMetrics.crestFactorDb;
  const after = result.afterMetrics.crestFactorDb;
  const delta = before - after;
  const isYoutubeMix = result.settings.autoIntensity === "youtube";
  const isImpact = result.settings.autoIntensity === "impact" || result.settings.presetId === "power";
  const tooDense = after < 7;
  const controlled = !tooDense && delta >= -0.5;
  const preserved = !tooDense && (isYoutubeMix || delta < -0.5);
  const target = isYoutubeMix ? "Préserver la respiration" : isImpact ? "Densifier sans écraser" : "Contrôler sans tasser";

  return {
    label: "Dynamique",
    target,
    result: `${before.toFixed(1)} → ${after.toFixed(1)} dB`,
    status: tooDense ? "Dense" : preserved ? "Préservée" : controlled ? "Contrôlée" : "Cohérente",
    tone: tooDense ? "warning" : "success",
    marker: dynamicsMarker(result, after),
    note: tooDense
      ? "Rendu très dense à vérifier à l’écoute."
      : isYoutubeMix
        ? "Respiration conservée pour le Mix YouTube."
        : "Dynamique cohérente pour la Preview."
  };
}

function decisionCopy(result: PreviewRenderResult, plan: AutoMasterPlan): string {
  const gain = result.report.loudness.gainAppliedDb;
  const headroom = result.report.loudness.headroomSummary?.finalHeadroomDb ?? result.report.loudness.achievedHeadroomDb;

  if (result.settings.autoIntensity === "youtube") {
    return `PAXLAB a généré un Mix YouTube : -14 LUFS intégré max estimé, peak prudent, grave stabilisé et aigus IA contrôlés. Marge peak finale : ${headroom.toFixed(1)} dB.`;
  }

  if (result.settings.antiFatigue) {
    return `PAXLAB a privilégié un rendu ${result.settings.autoIntensity === "impact" ? "puissant" : "contrôlé"}, avec AI Brightness Smoothing actif et marge peak finale à ${headroom.toFixed(1)} dB.`;
  }

  if (result.settings.autoIntensity === "impact") {
    return `Source compatible avec un lift fort : gain ${formatSigned(gain)}, plage LUFS visée ${formatLufsRange(plan)} et marge peak finale à ${headroom.toFixed(1)} dB.`;
  }

  if (result.settings.autoIntensity === "safe") {
    return `PAXLAB a choisi une approche propre : plus de marge, moins de densité forcée et un rendu à valider tranquillement à l’écoute.`;
  }

  return `PAXLAB a choisi un rendu équilibré : niveau renforcé, peak sécurisé et dynamique gardée sous contrôle.`;
}

export function MasterDashboard({ sourceAnalysis, previewResult, previewSettings }: MasterDashboardProps) {
  const sourceMetrics = sourceAnalysis?.metrics ?? previewResult?.beforeMetrics ?? null;
  const plan = sourceMetrics
    ? inferAutoMasterPlan(sourceMetrics, {
        autoIntensity: previewResult?.settings.autoIntensity ?? previewSettings.autoIntensity,
        antiFatigue: previewResult?.settings.antiFatigue ?? previewSettings.antiFatigue,
        spacePreserve: previewResult?.settings.spacePreserve ?? previewSettings.spacePreserve
      })
    : null;

  if (!sourceMetrics || !plan) {
    return (
      <section className="panel dashboard-panel visual-report-panel">
        <div className="panel-heading compact-heading">
          <div>
            <p className="eyebrow">Rapport de Preview</p>
            <h2>Objectifs du rendu</h2>
          </div>
          <span className="status-pill">En attente</span>
        </div>
        <div className="empty-state small-empty-state">
          <p>Aucune analyse disponible.</p>
          <span>Importe un fichier audio pour afficher le rapport de Preview.</span>
        </div>
      </section>
    );
  }

  if (!previewResult) {
    return (
      <section className="panel dashboard-panel visual-report-panel">
        <div className="panel-heading compact-heading">
          <div>
            <p className="eyebrow">Rapport de Preview</p>
            <h2>Choix automatique du rendu</h2>
          </div>
          <span className="status-pill">Plan auto</span>
        </div>
        <div className="visual-decision-card">
          <span>Pourquoi ce rendu ?</span>
          <strong>{plan.profileLabel}</strong>
          <p>{plan.reason}</p>
          <div className="visual-chip-row">
            <span>Objectif {formatLufsRange(plan)} LUFS</span>
            <span>Marge peak {formatPeakMarginRange(plan)}</span>
            <span>Ceiling {formatDb(plan.ceilingDb)}</span>
          </div>
        </div>
      </section>
    );
  }

  const headroom = previewResult.report.loudness.headroomSummary?.finalHeadroomDb ?? previewResult.report.loudness.achievedHeadroomDb;
  const lufs = previewResult.afterMetrics.estimatedLufs;
  const objectiveItems = [
    lufsObjective(previewResult, plan),
    peakMarginObjective(previewResult, plan),
    peakObjective(previewResult, plan),
    fizzObjective(previewResult),
    dynamicsObjective(previewResult)
  ];
  const successfulItems = objectiveItems.filter((item) => item.tone === "success").length;
  const globalStatus = successfulItems >= 4 ? "Objectifs validés" : successfulItems >= 3 ? "Rendu contrôlé" : "À vérifier";

  return (
    <section className="panel dashboard-panel visual-report-panel">
      <div className="panel-heading compact-heading visual-report-heading">
        <div>
          <p className="eyebrow">Rapport de Preview</p>
          <h2>Objectifs et résultat</h2>
        </div>
        <span className="status-pill">{globalStatus}</span>
      </div>

      <div className="visual-summary-strip" aria-label="Résumé du rendu">
        <div>
          <span>Gain obtenu</span>
          <strong>{formatSigned(previewResult.report.loudness.gainAppliedDb)}</strong>
        </div>
        <div>
          <span>LUFS rendu</span>
          <strong>{lufs.toFixed(1)}</strong>
        </div>
        <div>
          <span>Marge peak</span>
          <strong>{headroom.toFixed(1)} dB</strong>
        </div>
        <div>
          <span>Aigus</span>
          <strong>{previewResult.afterMetrics.fizzRatio < previewResult.beforeMetrics.fizzRatio ? "Adoucis" : "Stables"}</strong>
        </div>
      </div>

      <div className="visual-objectives-grid" aria-label="Objectifs atteints indicateur par indicateur">
        {objectiveItems.map((item) => (
          <article key={item.label} className={getObjectiveToneClass(item.tone)}>
            <div className="visual-objective-topline">
              <span>{item.label}</span>
              <b>{item.status}</b>
            </div>
            <strong>{item.result}</strong>
            <small>Objectif : {item.target}</small>
            <div className="visual-range-bar" style={{ "--marker": `${item.marker}%` } as CSSProperties} aria-hidden="true">
              <i />
            </div>
            <p>{item.note}</p>
          </article>
        ))}
      </div>

      <div className="visual-decision-card compact">
        <span>Pourquoi ce rendu ?</span>
        <strong>{plan.profileLabel}</strong>
        <p>{decisionCopy(previewResult, plan)}</p>
      </div>
    </section>
  );
}
