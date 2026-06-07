import { formatDb } from "../audio/audioBufferUtils";
import { describeHighTreatment } from "../audio/previewPresets";
import type { PreviewRenderResult } from "../audio/types";

interface MetricsPanelProps {
  result: PreviewRenderResult | null;
}

export function MetricsPanel({ result }: MetricsPanelProps) {
  return (
    <section className="panel metrics-panel">
      <div className="panel-heading">
        <p className="eyebrow">Mesures indicatives</p>
        <h2>Avant / Après preview</h2>
      </div>

      {!result && (
        <div className="empty-state small-empty-state">
          <p>Aucune Preview Master générée.</p>
          <span>
            Les mesures apparaîtront ici après calcul local dans le navigateur.
          </span>
        </div>
      )}

      {result && (
        <>
          <div className="metrics-grid">
            <div className="metric-card">
              <span>Original RMS simple</span>
              <strong>{formatDb(result.beforeMetrics.rmsDb)}</strong>
            </div>
            <div className="metric-card success">
              <span>Preview RMS simple</span>
              <strong>{formatDb(result.afterMetrics.rmsDb)}</strong>
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
              <span>Crest original</span>
              <strong>{formatDb(result.beforeMetrics.crestFactorDb)}</strong>
            </div>
            <div className="metric-card success">
              <span>Crest preview</span>
              <strong>{formatDb(result.afterMetrics.crestFactorDb)}</strong>
            </div>
          </div>

          <div className="render-summary">
            <span>Rendu local : {(result.renderTimeMs / 1000).toFixed(2)} s</span>
            <span>{describeHighTreatment(result.settings.highTreatment)}</span>
            <span>Cible indicative : {result.settings.targetRmsDb.toFixed(1)} dB RMS simple</span>
          </div>

          <p className="message message-info">
            Ces mesures sont utiles pour comparer, mais ne remplacent pas une analyse LUFS officielle.
          </p>
        </>
      )}
    </section>
  );
}
