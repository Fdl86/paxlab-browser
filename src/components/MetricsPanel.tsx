import { formatDb } from "../audio/audioBufferUtils";
import { describeHighTreatment } from "../audio/previewPresets";
import type { PreviewRenderResult, SourceAnalysisResult } from "../audio/types";

interface MetricsPanelProps {
  result: PreviewRenderResult | null;
  sourceAnalysis: SourceAnalysisResult | null;
}

function formatRatio(value: number): string {
  return `${(value * 100).toFixed(1)} %`;
}

function formatLufs(value: number): string {
  return `${value.toFixed(1)} LUFS est.`;
}

export function MetricsPanel({ result, sourceAnalysis }: MetricsPanelProps) {
  const sourceMetrics = sourceAnalysis?.metrics ?? result?.beforeMetrics ?? null;

  return (
    <section className="panel metrics-panel">
      <div className="panel-heading">
        <p className="eyebrow">Mesures indicatives</p>
        <h2>Analyse source et avant / après preview</h2>
      </div>

      {!sourceMetrics && !result && (
        <div className="empty-state small-empty-state">
          <p>Aucune mesure disponible.</p>
          <span>Les mesures apparaîtront ici après analyse locale.</span>
        </div>
      )}

      {sourceMetrics && !result && (
        <>
          <div className="metrics-grid">
            <div className="metric-card">
              <span>RMS source</span>
              <strong>{formatDb(sourceMetrics.rmsDb)}</strong>
            </div>
            <div className="metric-card">
              <span>Peak source</span>
              <strong>{formatDb(sourceMetrics.peakDb)}</strong>
            </div>
            <div className="metric-card">
              <span>LUFS estimé</span>
              <strong>{formatLufs(sourceMetrics.estimatedLufs)}</strong>
            </div>
            <div className="metric-card">
              <span>Fizz 9-16 kHz</span>
              <strong>{formatRatio(sourceMetrics.fizzRatio)}</strong>
            </div>
            <div className="metric-card">
              <span>Balance L/R</span>
              <strong>{formatDb(sourceMetrics.leftRightBalanceDb)}</strong>
            </div>
            <div className="metric-card">
              <span>Corrélation stéréo</span>
              <strong>{sourceMetrics.stereoCorrelation.toFixed(2)}</strong>
            </div>
          </div>

          <p className="message message-info">
            Analyse source terminée. Génère une Preview Master pour afficher la comparaison avant / après.
          </p>
        </>
      )}

      {result && (
        <>
          <div className="metrics-grid">
            <div className="metric-card">
              <span>Original LUFS estimé</span>
              <strong>{formatLufs(result.beforeMetrics.estimatedLufs)}</strong>
            </div>
            <div className="metric-card success">
              <span>Preview LUFS estimé</span>
              <strong>{formatLufs(result.afterMetrics.estimatedLufs)}</strong>
            </div>
            <div className="metric-card">
              <span>Original peak</span>
              <strong>{formatDb(result.beforeMetrics.peakDb)}</strong>
            </div>
            <div className="metric-card success">
              <span>Preview peak</span>
              <strong>{formatDb(result.afterMetrics.peakDb)}</strong>
            </div>
            <div className="metric-card">
              <span>Original crest</span>
              <strong>{formatDb(result.beforeMetrics.crestFactorDb)}</strong>
            </div>
            <div className="metric-card success">
              <span>Preview crest</span>
              <strong>{formatDb(result.afterMetrics.crestFactorDb)}</strong>
            </div>
            <div className="metric-card">
              <span>Original fizz</span>
              <strong>{formatRatio(result.beforeMetrics.fizzRatio)}</strong>
            </div>
            <div className="metric-card success">
              <span>Preview fizz</span>
              <strong>{formatRatio(result.afterMetrics.fizzRatio)}</strong>
            </div>
          </div>

          <div className="render-summary">
            <span>Rendu local : {(result.renderTimeMs / 1000).toFixed(2)} s</span>
            <span>{describeHighTreatment(result.settings.highTreatment)}</span>
            <span>Cible auto : {result.settings.targetLufsEstimate.toFixed(1)} LUFS est.</span>
            <span>Ceiling : {result.settings.maxPeakDb.toFixed(1)} dBTP est. / headroom {Math.abs(result.settings.maxPeakDb).toFixed(1)} dB</span>
            <span>Gain obtenu : {result.report.loudness.gainAppliedDb >= 0 ? "+" : ""}{result.report.loudness.gainAppliedDb.toFixed(1)} dB approx.</span>
          </div>

          <p className="message message-info">
            Ces mesures sont utiles pour comparer. Elles ne remplacent pas une analyse LUFS officielle ou un contrôle mastering externe.
          </p>
        </>
      )}
    </section>
  );
}
