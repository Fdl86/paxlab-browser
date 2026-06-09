import { buildAdvisor } from "../audio/smartAdvisor";
import type { PreviewRenderResult, PreviewSettings, SourceAnalysisResult } from "../audio/types";

interface SmartAdvisorPanelProps {
  sourceAnalysis: SourceAnalysisResult | null;
  previewResult: PreviewRenderResult | null;
  settings: PreviewSettings;
  isRendering: boolean;
  onApplySettings: (settings: PreviewSettings) => void;
}

export function SmartAdvisorPanel({
  sourceAnalysis,
  previewResult,
  settings,
  isRendering,
  onApplySettings
}: SmartAdvisorPanelProps) {
  const advisor = buildAdvisor(sourceAnalysis, settings, previewResult);

  return (
    <section className="panel advisor-panel">
      <div className="panel-heading compact-heading">
        <div>
          <p className="eyebrow">Smart Repair</p>
          <h2>Conseil automatique</h2>
        </div>
        <span className="status-pill">Confiance {advisor.confidence}</span>
      </div>

      <div className="advisor-summary">
        <strong>{advisor.summary}</strong>
        <span>Simple, prudent, local. Rien n’est appliqué sans validation.</span>
      </div>

      {advisor.moves.length > 0 && (
        <div className="advisor-list">
          {advisor.moves.slice(0, 4).map((move) => (
            <div key={move.id} className={`advisor-move ${move.severity}`}>
              <strong>{move.title}</strong>
              <span>{move.detail}</span>
            </div>
          ))}
        </div>
      )}

      <div className="advisor-actions single-action">
        <button
          type="button"
          className="primary-button compact-primary"
          disabled={!advisor.recommendedSettings || isRendering}
          onClick={() => advisor.recommendedSettings && onApplySettings(advisor.recommendedSettings)}
        >
          Utiliser ce conseil
          <small>Charge les réglages recommandés. Génère ensuite la Preview avec le bouton principal.</small>
        </button>
      </div>
    </section>
  );
}
