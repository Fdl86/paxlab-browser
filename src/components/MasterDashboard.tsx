import { inferAutoMasterPlan } from "../audio/autoTarget";
import { formatDb, formatDuration } from "../audio/audioBufferUtils";
import type { AutoMasterPlan, PreviewRenderResult, PreviewSettings, SourceAnalysisResult } from "../audio/types";

interface MasterDashboardProps {
  sourceAnalysis: SourceAnalysisResult | null;
  previewResult: PreviewRenderResult | null;
  previewSettings: PreviewSettings;
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

function formatHeadroomFromPeak(peakDb: number): string {
  return `${Math.max(0, -peakDb).toFixed(1)} dB`;
}

function formatLufsRange(plan: AutoMasterPlan): string {
  return `${plan.targetLufsMinEstimate.toFixed(1)} à ${plan.targetLufsMaxEstimate.toFixed(1)}`;
}

function formatHeadroomRange(plan: AutoMasterPlan): string {
  return `${plan.targetHeadroomMinDb.toFixed(1)} à ${plan.targetHeadroomMaxDb.toFixed(1)} dB`;
}

function calibrationStatus(
  lufs: number,
  headroom: number,
  plan: AutoMasterPlan
): { label: string; tone: "success" | "warning" | "neutral"; detail: string } {
  const lufsInRange = lufs >= plan.targetLufsMinEstimate && lufs <= plan.targetLufsMaxEstimate;
  const headroomInRange = headroom >= plan.targetHeadroomMinDb && headroom <= plan.targetHeadroomMaxDb;
  const lufsMissing = plan.targetLufsMinEstimate - lufs;
  const headroomExcess = headroom - plan.targetHeadroomMaxDb;
  const tooHot = headroom < plan.targetHeadroomMinDb - 0.25;

  if (lufsInRange && headroomInRange) {
    return {
      label: "Cible atteinte",
      tone: "success",
      detail: "Loudness et headroom sont dans la plage prévue."
    };
  }

  if (tooHot) {
    return {
      label: "Sécurité prioritaire",
      tone: "warning",
      detail: `Headroom trop serré de ${Math.abs(headroom - plan.targetHeadroomMinDb).toFixed(1)} dB.`
    };
  }

  if (lufsMissing > 1.3 || headroomExcess > 1.4) {
    return {
      label: "Cible partielle",
      tone: "warning",
      detail: `Il reste environ ${Math.max(0, lufsMissing).toFixed(1)} LUFS ou ${Math.max(0, headroomExcess).toFixed(1)} dB de marge.`
    };
  }

  return {
    label: "Rendu prudent",
    tone: "neutral",
    detail: "La Preview garde volontairement un peu plus de marge."
  };
}

export function MasterDashboard({ sourceAnalysis, previewResult, previewSettings }: MasterDashboardProps) {
  const sourceMetrics = sourceAnalysis?.metrics ?? previewResult?.beforeMetrics ?? null;
  const activeMetrics = previewResult?.afterMetrics ?? sourceMetrics;
  const plan = sourceMetrics
    ? inferAutoMasterPlan(sourceMetrics, {
        autoIntensity: previewResult?.settings.autoIntensity ?? previewSettings.autoIntensity,
        antiFatigue: previewResult?.settings.antiFatigue ?? previewSettings.antiFatigue
      })
    : null;
  const activeHeadroom = activeMetrics ? Math.max(0, -activeMetrics.approxTruePeakDb) : null;
  const renderedHeadroomSummary = previewResult?.report.loudness.headroomSummary ?? null;
  const calibration = previewResult && plan && activeHeadroom !== null
    ? calibrationStatus(previewResult.afterMetrics.estimatedLufs, activeHeadroom, plan)
    : null;
  const lufsDeltaToTarget = previewResult && plan ? previewResult.afterMetrics.estimatedLufs - plan.targetLufsEstimate : null;
  const headroomDeltaToRange = previewResult && plan && activeHeadroom !== null
    ? activeHeadroom < plan.targetHeadroomMinDb
      ? activeHeadroom - plan.targetHeadroomMinDb
      : activeHeadroom > plan.targetHeadroomMaxDb
        ? activeHeadroom - plan.targetHeadroomMaxDb
        : 0
    : null;

  return (
    <section className="panel dashboard-panel auto-engine-panel calibration-panel">
      <div className="panel-heading compact-heading">
        <div>
          <p className="eyebrow">Auto Engine V3.2</p>
          <h2>Dynamic Targeting</h2>
        </div>
        <span className="status-pill">{previewResult ? calibration?.label ?? "Preview analysée" : "Plan auto"}</span>
      </div>

      {!activeMetrics && (
        <div className="empty-state small-empty-state">
          <p>Aucune analyse disponible.</p>
          <span>Importe un fichier audio pour calculer la cible, le ceiling et le headroom.</span>
        </div>
      )}

      {activeMetrics && plan && (
        <>
          <div className="calibration-hero dynamic-target-hero">
            <div>
              <span>Décision automatique</span>
              <strong>{plan.profileLabel}</strong>
              <small>{plan.reason}</small>
            </div>
            <div>
              <span>Plage loudness</span>
              <strong>{formatLufsRange(plan)}</strong>
              <small>Cible centrale {formatLufs(plan.targetLufsEstimate)}</small>
            </div>
            <div>
              <span>Plage headroom</span>
              <strong>{formatHeadroomRange(plan)}</strong>
              <small>Ceiling {formatDb(previewResult?.settings.maxPeakDb ?? plan.ceilingDb)}</small>
            </div>
            <div className={calibration ? `calibration-score ${calibration.tone}` : "calibration-score neutral"}>
              <span>Résultat</span>
              <strong>{calibration?.label ?? "En attente"}</strong>
              <small>{calibration?.detail ?? `Lift prévu ${formatSigned(plan.expectedLiftDb)}`}</small>
            </div>
          </div>

          <div className="metrics-grid dashboard-grid compact-metrics-grid">
            <div className="metric-card">
              <span>Source LUFS</span>
              <strong>{sourceMetrics ? formatLufs(sourceMetrics.estimatedLufs) : "-"}</strong>
            </div>
            <div className="metric-card success">
              <span>{previewResult ? "Preview LUFS" : "LUFS actif"}</span>
              <strong>{formatLufs(activeMetrics.estimatedLufs)}</strong>
            </div>
            <div className="metric-card">
              <span>True Peak approx.</span>
              <strong>{formatDb(activeMetrics.approxTruePeakDb)}</strong>
            </div>
            <div className="metric-card success">
              <span>Headroom final</span>
              <strong>{renderedHeadroomSummary ? `${renderedHeadroomSummary.finalHeadroomDb.toFixed(1)} dB` : formatHeadroomFromPeak(activeMetrics.approxTruePeakDb)}</strong>
            </div>
            <div className="metric-card">
              <span>LRA estimée</span>
              <strong>{activeMetrics.loudnessRangeEstimate.toFixed(1)} LU</strong>
            </div>
            <div className="metric-card">
              <span>Headroom actif moy.</span>
              <strong>{renderedHeadroomSummary ? `${renderedHeadroomSummary.activeAverageHeadroomDb.toFixed(1)} dB` : "-"}</strong>
            </div>
            <div className="metric-card">
              <span>Mode auto</span>
              <strong>{(previewResult?.settings.autoIntensity ?? previewSettings.autoIntensity) === "impact" ? "Impact" : (previewResult?.settings.autoIntensity ?? previewSettings.autoIntensity) === "safe" ? "Prudent" : "Équilibré"}</strong>
            </div>
            <div className="metric-card">
              <span>Aigus fatigants</span>
              <strong>{(previewResult?.settings.antiFatigue ?? previewSettings.antiFatigue) ? "Activé" : "Off"}</strong>
            </div>
          </div>

          {previewResult && sourceMetrics && activeHeadroom !== null && (
            <div className="dashboard-delta auto-delta premium-delta">
              <span>Gain obtenu : {formatSigned(previewResult.report.loudness.gainAppliedDb)}</span>
              <span>Écart cible : {lufsDeltaToTarget !== null ? formatSigned(lufsDeltaToTarget, "LUFS") : "-"}</span>
              <span>Headroom final : {(renderedHeadroomSummary?.finalHeadroomDb ?? activeHeadroom).toFixed(1)} dB / plage {formatHeadroomRange(plan)}</span>
              <span>Headroom actif : {renderedHeadroomSummary ? `${renderedHeadroomSummary.activeAverageHeadroomDb.toFixed(1)} dB moy. (${renderedHeadroomSummary.activeMinHeadroomDb.toFixed(1)}-${renderedHeadroomSummary.activeMaxHeadroomDb.toFixed(1)})` : "-"}</span>
              <span>Écart headroom : {headroomDeltaToRange !== null ? formatSigned(headroomDeltaToRange) : "-"}</span>
              <span>LRA : {sourceMetrics.loudnessRangeEstimate.toFixed(1)} → {previewResult.afterMetrics.loudnessRangeEstimate.toFixed(1)} LU</span>
            </div>
          )}

          <p className="message message-info">
            Dynamic Targeting ne force pas tous les morceaux vers le même chiffre. Le headroom final vient du peak max du rendu ; le headroom actif moyen ignore les silences pour donner une lecture plus utile.
          </p>
        </>
      )}
    </section>
  );
}
