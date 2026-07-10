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

function formatBassPunchPercent(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) < 0.5) {
    return "Stable";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(1)} %`;
}

function formatBassPunchRatio(value: number): string {
  return `${(value * 100).toFixed(1)} %`;
}

function buildTreatmentSummary(result: PreviewRenderResult): string {
  const parts = [result.report.profileLabel];

  if (result.report.tone.antiFizzReductionDb > 0.2) {
    parts.push("Anti-fizz doux");
  }

  if (result.settings.bassPunch && result.report.bassPunch.active) {
    parts.push(`Basses ${formatBassPunchPercent(result.report.bassPunch.changePercent)}`);
  }

  if (result.settings.stereoSpace) {
    parts.push(`Stéréo ${formatStereoPercent(result.report.stereoImage.changePercent)}`);
  }

  const headroom = result.report.loudness.headroomSummary?.finalHeadroomDb ?? result.report.loudness.achievedHeadroomDb;
  parts.push(`Marge peak ${headroom.toFixed(1)} dB`);

  if (result.report.cleanup.clicksRepaired > 0) {
    parts.push(`${result.report.cleanup.clicksRepaired} clic réparé${result.report.cleanup.clicksRepaired > 1 ? "s" : ""}`);
  }

  return parts.join(" · ");
}

function buildTreatmentSentence(result: PreviewRenderResult): string {
  const brightness = result.afterMetrics.fizzRatio < result.beforeMetrics.fizzRatio ? "aigus IA adoucis" : "aigus IA contrôlés";
  const bass = result.settings.bassPunch && result.report.bassPunch.active ? "basses renforcées avec dose réduite" : "grave stabilisé";
  const stereo = result.settings.stereoSpace ? "ouverture stéréo légère" : "image stéréo conservée";
  const headroom = result.report.loudness.headroomSummary?.finalHeadroomDb ?? result.report.loudness.achievedHeadroomDb;

  return `${brightness}, ${bass}, ${stereo}, marge finale ${headroom.toFixed(1)} dB.`;
}

interface JournalCardProps {
  label: string;
  value: string;
  detail?: string;
  active?: boolean;
}

function JournalCard({ label, value, detail, active = false }: JournalCardProps) {
  return (
    <article className={`journal-card${active ? " active" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </article>
  );
}

export function ProcessingReportPanel({ result }: ProcessingReportPanelProps) {
  return (
    <section className="panel processing-panel treatment-panel">
      <div className="panel-heading compact-heading treatment-heading">
        <div>
          <p className="eyebrow">Traitement appliqué</p>
          <h2>Chaîne locale</h2>
        </div>
        {result && <span className="status-pill ready-pill">Terminé</span>}
      </div>

      {!result && (
        <div className="empty-state small-empty-state">
          <p>Aucun traitement appliqué.</p>
          <span>Le résumé apparaîtra après génération de la rendu.</span>
        </div>
      )}

      {result && (
        <>
          <div className="treatment-summary-card">
            <div>
              <span>Résumé</span>
              <strong>{result.report.profileLabel} validé localement</strong>
              <p>{buildTreatmentSentence(result)}</p>
            </div>
            <strong className="treatment-status">Export sécurisé</strong>
          </div>

          <div className="treatment-chip-row" aria-label="Résumé de la chaîne appliquée">
            <span>{result.report.profileLabel}</span>
            <span>{result.report.tone.sourceRepairLabel}</span>
            <span>{result.report.brightnessLabel}</span>
            {result.settings.bassPunch && result.report.bassPunch.active && (
              <span>Basses {formatBassPunchPercent(result.report.bassPunch.changePercent)}</span>
            )}
            {result.settings.stereoSpace && (
              <span>Stéréo {formatStereoPercent(result.report.stereoImage.changePercent)}</span>
            )}
            <span>Marge peak {(result.report.loudness.headroomSummary?.finalHeadroomDb ?? result.report.loudness.achievedHeadroomDb).toFixed(1)} dB</span>
          </div>

          <details className="technical-journal">
            <summary>
              <span className="journal-summary-copy">
                <span>Journal technique</span>
                <small>{buildTreatmentSummary(result)}</small>
              </span>
              <strong className="journal-toggle-pill" aria-hidden="true">
                <span className="journal-toggle-open">Afficher</span>
                <span className="journal-toggle-close">Masquer</span>
              </strong>
            </summary>

            <div className="journal-grid">
              <JournalCard label="Profil" value={result.report.profileLabel} detail="Preset de rendu" />
              <JournalCard label="Objectif" value={`${result.report.loudness.targetLufsEstimate.toFixed(1)} LUFS est.`} detail="Cible initiale" />
              <JournalCard label="Résultat" value={`${result.afterMetrics.estimatedLufs.toFixed(1)} LUFS est.`} detail="Rendu généré" active />
              <JournalCard label="Marge finale" value={`${(result.report.loudness.headroomSummary?.finalHeadroomDb ?? result.report.loudness.achievedHeadroomDb).toFixed(1)} dB`} detail="Sécurité peak" active />
              <JournalCard label="Anti-fizz" value={result.settings.antiFatigue ? "Actif" : result.report.brightnessLabel} detail={`${result.report.tone.antiFizzReductionDb.toFixed(1)} dB approx.`} />
              <JournalCard label="Basses punchy" value={result.settings.bassPunch ? formatBassPunchPercent(result.report.bassPunch.changePercent) : "Off"} detail={result.settings.bassPunch ? `${formatBassPunchRatio(result.report.bassPunch.beforeRatio)} à ${formatBassPunchRatio(result.report.bassPunch.afterRatio)}` : "Grave conservé"} />
              <JournalCard label="Espace stéréo" value={result.settings.stereoSpace ? formatStereoPercent(result.report.stereoImage.changePercent) : "Off"} detail={`${formatStereoRatio(result.report.stereoImage.beforeRatio)} à ${formatStereoRatio(result.report.stereoImage.afterRatio)}`} active={result.settings.stereoSpace} />
              <JournalCard label="Réparations" value={`${result.report.cleanup.clicksRepaired} clic`} detail={`${result.report.cleanup.clippedSamplesDetected} sample proche clip`} />
              <JournalCard label="Ceiling" value={`${result.report.loudness.ceilingDb.toFixed(1)} dBTP est.`} detail="Plafond prudent" />
              <JournalCard label="Rendu local" value={`${(result.renderTimeMs / 1000).toFixed(2)} s`} detail="Traitement navigateur" />
            </div>
          </details>
        </>
      )}
    </section>
  );
}
