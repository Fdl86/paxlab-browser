import type { PreviewRenderResult } from "../audio/types";

interface ProcessingReportPanelProps {
  result: PreviewRenderResult | null;
}

export function ProcessingReportPanel({ result }: ProcessingReportPanelProps) {
  return (
    <section className="panel processing-panel">
      <div className="panel-heading">
        <p className="eyebrow">Chaîne appliquée</p>
        <h2>Rapport de traitement local</h2>
      </div>

      {!result && (
        <div className="empty-state small-empty-state">
          <p>Aucune Preview générée.</p>
          <span>Le rapport apparaîtra après génération de la Preview Master.</span>
        </div>
      )}

      {result && (
        <>
          <div className="chain-list">
            {result.report.appliedMoves.map((move) => (
              <span key={move}>{move}</span>
            ))}
          </div>

          <div className="report-grid">
            <div className="report-card">
              <span>Profil</span>
              <strong>{result.report.profileLabel}</strong>
            </div>
            <div className="report-card">
              <span>Anti-fizz</span>
              <strong>{result.report.brightnessLabel}</strong>
            </div>
            <div className="report-card">
              <span>Clics réparés</span>
              <strong>{result.report.cleanup.clicksRepaired}</strong>
            </div>
            <div className="report-card">
              <span>Samples proches clip</span>
              <strong>{result.report.cleanup.clippedSamplesDetected}</strong>
            </div>
            <div className="report-card">
              <span>Réduction aigus</span>
              <strong>{result.report.tone.antiFizzReductionDb.toFixed(1)} dB approx.</strong>
            </div>
            <div className="report-card">
              <span>Limiter</span>
              <strong>{result.report.loudness.limiterActive ? "Actif" : "Inactif"}</strong>
            </div>
          </div>

          <p className="message message-success">
            Rendu local terminé en {(result.renderTimeMs / 1000).toFixed(2)} s. Le fichier source n’a pas été modifié.
          </p>
        </>
      )}
    </section>
  );
}
