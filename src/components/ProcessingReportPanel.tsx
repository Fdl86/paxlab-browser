import type { PreviewRenderResult } from "../audio/types";

interface ProcessingReportPanelProps {
  result: PreviewRenderResult | null;
}

function formatStereoPercent(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) < 0.5) {
    return "Stable";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(1)} %`;
}

function formatStereoRatio(value: number): string {
  return value.toFixed(3);
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
              <span>Réparation</span>
              <strong>{result.report.tone.sourceRepairLabel}</strong>
            </div>
            <div className="report-card">
              <span>Anti-fizz</span>
              <strong>{result.settings.antiFatigue ? "AI Brightness Smoothing" : result.settings.vocalPresence ? "Présence vocale" : result.report.brightnessLabel}</strong>
            </div>
            <div className="report-card">
              <span>Espace stéréo</span>
              <strong>{result.settings.stereoSpace ? formatStereoPercent(result.report.stereoImage.changePercent) : "Off"}</strong>
              <small>{formatStereoRatio(result.report.stereoImage.beforeRatio)} -&gt; {formatStereoRatio(result.report.stereoImage.afterRatio)}</small>
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
              <span>Objectif initial</span>
              <strong>{result.report.loudness.targetLufsEstimate.toFixed(1)} LUFS est.</strong>
            </div>
            <div className="report-card success">
              <span>Résultat obtenu</span>
              <strong>{result.afterMetrics.estimatedLufs.toFixed(1)} LUFS est.</strong>
            </div>
            <div className="report-card">
              <span>Plage marge peak</span>
              <strong>{result.report.loudness.targetHeadroomMinDb?.toFixed(1) ?? "-"} à {result.report.loudness.targetHeadroomMaxDb?.toFixed(1) ?? "-"} dB</strong>
            </div>
            <div className="report-card">
              <span>Marge peak finale</span>
              <strong>{(result.report.loudness.headroomSummary?.finalHeadroomDb ?? result.report.loudness.achievedHeadroomDb).toFixed(1)} dB</strong>
            </div>
            <div className="report-card">
              <span>Marge peak active moy.</span>
              <strong>{result.report.loudness.headroomSummary ? `${result.report.loudness.headroomSummary.activeAverageHeadroomDb.toFixed(1)} dB` : "-"}</strong>
            </div>
            <div className="report-card">
              <span>Plage active</span>
              <strong>{result.report.loudness.headroomSummary ? `${result.report.loudness.headroomSummary.activeMinHeadroomDb.toFixed(1)} à ${result.report.loudness.headroomSummary.activeMaxHeadroomDb.toFixed(1)} dB` : "-"}</strong>
            </div>
            <div className="report-card">
              <span>Limiteur</span>
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
