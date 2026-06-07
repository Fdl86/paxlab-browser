import { formatDb, formatDuration } from "../audio/audioBufferUtils";
import type { PreviewRenderResult, SourceAnalysisResult } from "../audio/types";

interface MasterDashboardProps {
  sourceAnalysis: SourceAnalysisResult | null;
  previewResult: PreviewRenderResult | null;
}

function formatLufs(value: number): string {
  return `${value.toFixed(1)} LUFS estimé`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)} %`;
}

export function MasterDashboard({ sourceAnalysis, previewResult }: MasterDashboardProps) {
  const metrics = previewResult?.afterMetrics ?? sourceAnalysis?.metrics ?? null;
  const before = sourceAnalysis?.metrics ?? previewResult?.beforeMetrics ?? null;

  return (
    <section className="panel dashboard-panel">
      <div className="panel-heading compact-heading">
        <div>
          <p className="eyebrow">Dashboard Preview Master V0.6</p>
          <h2>Cible -13 estimée et contrôles audio</h2>
        </div>
        <span className="status-pill">{previewResult ? "Preview prête" : "Analyse source"}</span>
      </div>

      {!metrics && (
        <div className="empty-state small-empty-state">
          <p>Aucune analyse disponible.</p>
          <span>Importe un fichier audio pour lancer l’analyse locale.</span>
        </div>
      )}

      {metrics && (
        <>
          <div className="metrics-grid dashboard-grid">
            <div className="metric-card success">
              <span>Loudness</span>
              <strong>{formatLufs(metrics.estimatedLufs)}</strong>
            </div>
            <div className="metric-card">
              <span>Peak approx.</span>
              <strong>{formatDb(metrics.approxTruePeakDb)}</strong>
            </div>
            <div className="metric-card">
              <span>Crest factor</span>
              <strong>{formatDb(metrics.crestFactorDb)}</strong>
            </div>
            <div className="metric-card">
              <span>Durée</span>
              <strong>{formatDuration(metrics.durationSeconds)}</strong>
            </div>
            <div className="metric-card">
              <span>Haut total</span>
              <strong>{formatPercent(metrics.highTotalRatio)}</strong>
            </div>
            <div className="metric-card">
              <span>Stéréo</span>
              <strong>{metrics.stereoCorrelation.toFixed(2)}</strong>
            </div>
          </div>

          {previewResult && before && (
            <div className="dashboard-delta">
              <span>Gain appliqué : {previewResult.report.loudness.gainAppliedDb.toFixed(1)} dB</span>
              <span>Original : {formatLufs(before.estimatedLufs)}</span>
              <span>Preview : {formatLufs(previewResult.afterMetrics.estimatedLufs)}</span>
            </div>
          )}

          <p className="message message-info">
            Les valeurs LUFS et true peak sont des estimations internes pour comparaison. Ce n’est pas une mesure EBU R128 certifiée.
          </p>
        </>
      )}
    </section>
  );
}
