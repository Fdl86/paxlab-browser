import { inferAutoMasterPlan } from "../audio/autoTarget";
import { formatDb, formatDuration } from "../audio/audioBufferUtils";
import type { PreviewRenderResult, SourceAnalysisResult } from "../audio/types";

interface MasterDashboardProps {
  sourceAnalysis: SourceAnalysisResult | null;
  previewResult: PreviewRenderResult | null;
}

function formatLufs(value: number): string {
  return `${value.toFixed(1)} LUFS est.`;
}

function formatSignedDb(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)} dB`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)} %`;
}

function formatHeadroomFromPeak(peakDb: number): string {
  return `${Math.max(0, -peakDb).toFixed(1)} dB`;
}

function calibrationStatus(deltaLufs: number, headroomDelta: number): { label: string; tone: "success" | "warning" | "neutral" } {
  const absDelta = Math.abs(deltaLufs);
  const absHeadroom = Math.abs(headroomDelta);

  if (absDelta <= 0.8 && absHeadroom <= 0.8) {
    return { label: "Cible atteinte", tone: "success" };
  }

  if (absDelta <= 1.6 && absHeadroom <= 1.4) {
    return { label: "Très proche", tone: "neutral" };
  }

  return { label: "À ajuster", tone: "warning" };
}

export function MasterDashboard({ sourceAnalysis, previewResult }: MasterDashboardProps) {
  const sourceMetrics = sourceAnalysis?.metrics ?? previewResult?.beforeMetrics ?? null;
  const activeMetrics = previewResult?.afterMetrics ?? sourceMetrics;
  const plan = sourceMetrics ? inferAutoMasterPlan(sourceMetrics) : null;
  const targetLufs = previewResult?.settings.targetLufsEstimate ?? plan?.targetLufsEstimate ?? null;
  const targetHeadroom = previewResult?.report.loudness.targetHeadroomDb ?? plan?.targetHeadroomDb ?? null;
  const achievedHeadroom = previewResult ? previewResult.report.loudness.achievedHeadroomDb : activeMetrics ? Math.max(0, -activeMetrics.approxTruePeakDb) : null;
  const lufsDelta = previewResult && targetLufs !== null ? previewResult.afterMetrics.estimatedLufs - targetLufs : null;
  const headroomDelta = previewResult && achievedHeadroom !== null && targetHeadroom !== null ? achievedHeadroom - targetHeadroom : null;
  const calibration = lufsDelta !== null && headroomDelta !== null ? calibrationStatus(lufsDelta, headroomDelta) : null;

  return (
    <section className="panel dashboard-panel auto-engine-panel calibration-panel">
      <div className="panel-heading compact-heading">
        <div>
          <p className="eyebrow">Auto Engine V3</p>
          <h2>Calibration automatique</h2>
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
          <div className="calibration-hero">
            <div>
              <span>Décision automatique</span>
              <strong>{plan.profileLabel}</strong>
              <small>{plan.reason}</small>
            </div>
            <div>
              <span>Cible loudness</span>
              <strong>{targetLufs !== null ? formatLufs(targetLufs) : "-"}</strong>
              <small>Déduite du fichier source</small>
            </div>
            <div>
              <span>Headroom cible</span>
              <strong>{targetHeadroom !== null ? `${targetHeadroom.toFixed(1)} dB` : "-"}</strong>
              <small>Ceiling {formatDb(previewResult?.settings.maxPeakDb ?? plan.ceilingDb)}</small>
            </div>
            <div className={calibration ? `calibration-score ${calibration.tone}` : "calibration-score neutral"}>
              <span>Résultat</span>
              <strong>{calibration?.label ?? "En attente"}</strong>
              <small>
                {previewResult && lufsDelta !== null && headroomDelta !== null
                  ? `Écart ${formatSignedDb(lufsDelta)} LUFS / ${formatSignedDb(headroomDelta)} headroom`
                  : `Lift prévu ${formatSignedDb(plan.expectedLiftDb)}`}
              </small>
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
              <span>Headroom obtenu</span>
              <strong>{formatHeadroomFromPeak(activeMetrics.approxTruePeakDb)}</strong>
            </div>
            <div className="metric-card">
              <span>LRA estimée</span>
              <strong>{activeMetrics.loudnessRangeEstimate.toFixed(1)} LU</strong>
            </div>
            <div className="metric-card">
              <span>Haut total</span>
              <strong>{formatPercent(activeMetrics.highTotalRatio)}</strong>
            </div>
            <div className="metric-card">
              <span>Stéréo</span>
              <strong>{activeMetrics.stereoCorrelation.toFixed(2)}</strong>
            </div>
            <div className="metric-card">
              <span>Durée</span>
              <strong>{formatDuration(activeMetrics.durationSeconds)}</strong>
            </div>
          </div>

          {previewResult && sourceMetrics && (
            <div className="dashboard-delta auto-delta premium-delta">
              <span>Gain obtenu : {formatSignedDb(previewResult.report.loudness.gainAppliedDb)}</span>
              <span>Ceiling : {formatDb(previewResult.report.loudness.ceilingDb)}</span>
              <span>Headroom : {previewResult.report.loudness.achievedHeadroomDb.toFixed(1)} dB / cible {previewResult.report.loudness.targetHeadroomDb.toFixed(1)} dB</span>
              <span>LRA : {sourceMetrics.loudnessRangeEstimate.toFixed(1)} → {previewResult.afterMetrics.loudnessRangeEstimate.toFixed(1)} LU</span>
            </div>
          )}

          <p className="message message-info">
            Auto Engine V3 pousse davantage les sources trop faibles, puis calibre le résultat avec cible LUFS estimée, ceiling et headroom. Les valeurs restent indicatives et doivent être validées à l’écoute.
          </p>
        </>
      )}
    </section>
  );
}
