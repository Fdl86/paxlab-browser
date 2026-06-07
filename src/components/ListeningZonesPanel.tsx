import { formatDuration } from "../audio/audioBufferUtils";
import type { ListeningZone, SourceAnalysisResult } from "../audio/types";

interface ListeningZonesPanelProps {
  analysis: SourceAnalysisResult | null;
  onSeek: (time: number) => void;
}

function priorityLabel(zone: ListeningZone): string {
  if (zone.priority === "haute") {
    return "Priorité haute";
  }
  if (zone.priority === "moyenne") {
    return "Priorité moyenne";
  }
  return "Priorité basse";
}

export function ListeningZonesPanel({ analysis, onSeek }: ListeningZonesPanelProps) {
  const zones = analysis?.listeningZones ?? [];

  return (
    <section className="panel zones-panel">
      <div className="panel-heading compact-heading">
        <div>
          <p className="eyebrow">Zones d’écoute suggérées</p>
          <h2>Passages à vérifier</h2>
        </div>
        <span className="status-pill">{zones.length} zone(s)</span>
      </div>

      {!analysis && (
        <div className="empty-state small-empty-state">
          <p>Analyse en attente.</p>
          <span>Les zones seront calculées localement après import.</span>
        </div>
      )}

      {analysis && zones.length === 0 && (
        <p className="message message-success">
          Aucune zone prioritaire détectée. L’écoute reste la référence.
        </p>
      )}

      {zones.length > 0 && (
        <div className="zones-list">
          {zones.map((zone, index) => (
            <article className="zone-card" key={zone.id}>
              <div className="zone-header">
                <div>
                  <span className="zone-index">Zone {index + 1}</span>
                  <strong>{zone.primaryFamily}</strong>
                </div>
                <button type="button" onClick={() => onSeek(zone.startSeconds)}>
                  Écouter
                </button>
              </div>

              <div className="zone-time-row">
                <span>{formatDuration(zone.startSeconds)}</span>
                <span>{formatDuration(zone.endSeconds)}</span>
                <span>{priorityLabel(zone)}</span>
              </div>

              <ul>
                {zone.observations.map((observation) => (
                  <li key={`${zone.id}-${observation.family}`}>
                    <strong>{observation.label}</strong>
                    <span>{observation.detail}</span>
                    <em>{observation.listeningTip}</em>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}

      {analysis && (
        <p className="panel-note">
          Fenêtres analysées : {analysis.windowsAnalyzed}. Repérage indicatif, sans diagnostic automatique définitif.
        </p>
      )}
    </section>
  );
}
