import { describeHighTreatment, describeSourceRepair } from "../audio/previewPresets";
import type { PreviewRenderResult, PreviewSettings } from "../audio/types";

export interface PreviewHistoryItem {
  id: number;
  renderedAt: string;
  result: PreviewRenderResult;
  settings: PreviewSettings;
}

interface PreviewHistoryPanelProps {
  items: PreviewHistoryItem[];
  activeRevision: number;
  isRendering: boolean;
  onSelect: (item: PreviewHistoryItem) => void;
}

function formatAuto(settings: PreviewSettings): string {
  if (settings.autoIntensity === "impact") {
    return "Impact";
  }

  if (settings.autoIntensity === "youtube") {
    return "Mix YouTube";
  }

  if (settings.autoIntensity === "safe") {
    return "Nettoyage léger";
  }

  return "Traitement naturel";
}

function formatLabel(settings: PreviewSettings): string {
  const fatigue = settings.antiFatigue ? " · Anti-fatigue" : "";
  return `${formatAuto(settings)} · ${describeSourceRepair(settings.sourceRepair)} · ${describeHighTreatment(settings.highTreatment)}${fatigue}`;
}

function formatDb(value: number): string {
  return `${value.toFixed(1)} dB`;
}

function formatLufs(value: number): string {
  return `${value.toFixed(1)} LUFS`;
}

export function PreviewHistoryPanel({
  items,
  activeRevision,
  isRendering,
  onSelect
}: PreviewHistoryPanelProps) {
  return (
    <section className="panel history-panel premium-history-panel">
      <div className="panel-heading compact-heading">
        <div>
          <p className="eyebrow">Historique Preview</p>
          <h2>Versions comparables</h2>
        </div>
        <span className="status-pill">{items.length}/6</span>
      </div>

      {!items.length && (
        <div className="empty-state small-empty-state">
          <p>Aucune Preview générée.</p>
          <span>Chaque rendu sera conservé ici avec loudness, headroom et réglages.</span>
        </div>
      )}

      {items.length > 0 && (
        <div className="history-list premium-history-list">
          {items.map((item) => {
            const headroom = Math.max(0, -item.result.afterMetrics.approxTruePeakDb);
            const gain = item.result.report.loudness.gainAppliedDb;

            return (
              <button
                key={item.id}
                type="button"
                className={item.id === activeRevision ? "history-item active premium-history-item" : "history-item premium-history-item"}
                disabled={isRendering}
                onClick={() => onSelect(item)}
              >
                <span className="history-item-title">
                  Preview #{item.id}
                  <small>{item.renderedAt}</small>
                </span>
                <strong>{formatLabel(item.settings)}</strong>
                <div className="history-mini-metrics">
                  <span>{formatLufs(item.result.afterMetrics.estimatedLufs)}</span>
                  <span>TP {formatDb(item.result.afterMetrics.approxTruePeakDb)}</span>
                  <span>HR {headroom.toFixed(1)} dB</span>
                  <span>{gain >= 0 ? "+" : ""}{gain.toFixed(1)} dB</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
