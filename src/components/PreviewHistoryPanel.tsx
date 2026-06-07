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

function formatLabel(settings: PreviewSettings): string {
  return `${describeSourceRepair(settings.sourceRepair)} · ${describeHighTreatment(settings.highTreatment)} · ${settings.targetLufsEstimate.toFixed(1)} LUFS est.`;
}

export function PreviewHistoryPanel({
  items,
  activeRevision,
  isRendering,
  onSelect
}: PreviewHistoryPanelProps) {
  return (
    <section className="panel history-panel">
      <div className="panel-heading compact-heading">
        <div>
          <p className="eyebrow">Historique Preview</p>
          <h2>Versions de comparaison</h2>
        </div>
        <span className="status-pill">{items.length}/6</span>
      </div>

      {!items.length && (
        <div className="empty-state small-empty-state">
          <p>Aucune Preview générée.</p>
          <span>Chaque rendu sera conservé ici pour comparer sans confusion.</span>
        </div>
      )}

      {items.length > 0 && (
        <div className="history-list">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === activeRevision ? "history-item active" : "history-item"}
              disabled={isRendering}
              onClick={() => onSelect(item)}
            >
              <span>
                Preview Master #{item.id}
                <small>{item.renderedAt}</small>
              </span>
              <strong>{formatLabel(item.settings)}</strong>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
