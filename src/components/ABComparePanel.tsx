import type { PlaybackSource, PreviewStatus } from "../audio/types";

interface ABComparePanelProps {
  activeSource: PlaybackSource;
  canUsePreview: boolean;
  previewStatus: PreviewStatus;
  onSwitchSource: (source: PlaybackSource) => void;
}

export function ABComparePanel({
  activeSource,
  canUsePreview,
  previewStatus,
  onSwitchSource
}: ABComparePanelProps) {
  return (
    <section className="panel ab-panel">
      <div className="panel-heading compact-heading">
        <div>
          <p className="eyebrow">Comparaison A/B</p>
          <h2>Source active</h2>
        </div>
        <span className="status-pill">
          {activeSource === "original" ? "Original" : "Preview Master"}
        </span>
      </div>

      <div className="ab-switch">
        <button
          type="button"
          className={activeSource === "original" ? "switch-button active" : "switch-button"}
          onClick={() => onSwitchSource("original")}
        >
          Original
        </button>
        <button
          type="button"
          className={activeSource === "preview" ? "switch-button active" : "switch-button"}
          disabled={!canUsePreview}
          onClick={() => onSwitchSource("preview")}
        >
          Preview Master
        </button>
      </div>

      <p className="panel-note">
        La bascule conserve la position de lecture. Le son est relancé localement depuis le même timing.
      </p>

      {!canUsePreview && previewStatus !== "rendering" && (
        <p className="message message-info">
          Génère une Preview Master pour activer la comparaison A/B.
        </p>
      )}
    </section>
  );
}
