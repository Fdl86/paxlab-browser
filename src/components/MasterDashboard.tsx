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

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)} %`;
}

function formatHeadroomFromPeak(peakDb: number): string {
  return `${Math.max(0, -peakDb).toFixed(1)} dB`;
}

export function MasterDashboard({ sourceAnalysis, previewResult }: MasterDashboardProps) {
  const sourceMetrics = sourceAnalysis?.metrics ?? previewResult?.beforeMetrics ?? null;
  const activeMetrics = previewResult?.afterMetrics ?? sourceMetrics;
  const plan = sourceMetrics ? inferAutoMasterPlan(sourceMetrics) : null;

  return (
    <section className="panel dashboard-panel auto-engine-panel">
      <div className="panel-heading compact-heading">
        <div>
          <p className="eyebrow">Auto Engine V2</p>
          <h2>Analyse automatique, LUFS cible et headroom</h2>
        </div>
        <span className="status-pill">{previewResult ? "Preview analysée" : "Plan auto"}</span>
      </div>

      {!activeMetrics && (
        <div className="empty-state small-empty-state">
          <p>Aucune analyse disponible.</p>
          <span>Importe un fichier audio pour lancer l’analyse locale.</span>
        </div>
      )}

      {activeMetrics && plan && (
        <>
          <div className="auto-plan-card">
            <div>
              <span>Plan automatique</span>
              <strong>{plan.profileLabel}</strong>
              <small>{plan.reason}</small>
            </div>
            <div>
              <span>Cible Preview</span>
              <strong>{formatLufs(previewResult?.settings.targetLufsEstimate ?? plan.targetLufsEstimate)}</strong>
              <small>Calculée depuis la source</small>
            </div>
            <div>
              <span>Ceiling</span>
              <strong>{formatDb(previewResult?.settings.maxPeakDb ?? plan.ceilingDb)}</strong>
              <small>Headroom cible {(previewResult?.report.loudness.targetHeadroomDb ?? plan.targetHeadroomDb).toFixed(1)} dB</small>
            </div>
            <div>
              <span>Lift estimé</span>
              <strong>{plan.expectedLiftDb >= 0 ? "+" : ""}{plan.expectedLiftDb.toFixed(1)} dB</strong>
              <small>Compression {plan.compressionIntent}</small>
            </div>
          </div>

          <div className="metrics-grid dashboard-grid">
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
              <span>Headroom</span>
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
            <div className="dashboard-delta auto-delta">
              <span>Gain obtenu : {previewResult.report.loudness.gainAppliedDb >= 0 ? "+" : ""}{previewResult.report.loudness.gainAppliedDb.toFixed(1)} dB approx.</span>
              <span>Ceiling : {formatDb(previewResult.report.loudness.ceilingDb)}</span>
              <span>Headroom obtenu : {previewResult.report.loudness.achievedHeadroomDb.toFixed(1)} dB</span>
              <span>LRA : {sourceMetrics.loudnessRangeEstimate.toFixed(1)} → {previewResult.afterMetrics.loudnessRangeEstimate.toFixed(1)} LU</span>
            </div>
          )}

          <p className="message message-info">
            Auto Engine V2 adapte le niveau cible, le ceiling et le headroom selon la source. Les valeurs restent indicatives et doivent être validées à l’écoute.
          </p>
        </>
      )}
    </section>
  );
}
