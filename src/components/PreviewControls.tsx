import type { ChangeEvent } from "react";
import { PREVIEW_PRESETS, getPresetById, getSettingsForPreset } from "../audio/previewPresets";
import type { PreviewSettings, PreviewStatus } from "../audio/types";

interface PreviewControlsProps {
  settings: PreviewSettings;
  previewStatus: PreviewStatus;
  hasAudio: boolean;
  hasPreview: boolean;
  hasPendingChanges: boolean;
  errorMessage: string | null;
  onSettingsChange: (settings: PreviewSettings) => void;
  onRenderPreview: () => void;
}

export function PreviewControls({
  settings,
  previewStatus,
  hasAudio,
  hasPreview,
  hasPendingChanges,
  errorMessage,
  onSettingsChange,
  onRenderPreview
}: PreviewControlsProps) {
  const preset = getPresetById(settings.presetId);
  const isRendering = previewStatus === "rendering";

  function updateSettings(partial: Partial<PreviewSettings>) {
    onSettingsChange({
      ...settings,
      ...partial
    });
  }

  function handlePresetChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextPresetId = event.target.value as PreviewSettings["presetId"];
    onSettingsChange(getSettingsForPreset(nextPresetId));
  }

  return (
    <section className="panel controls-panel">
      <div className="panel-heading">
        <p className="eyebrow">Preview Master locale</p>
        <h2>Réglages audio</h2>
      </div>

      <div className="control-group">
        <label htmlFor="preset">Preset</label>
        <select id="preset" value={settings.presetId} onChange={handlePresetChange}>
          {PREVIEW_PRESETS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <p className="control-help">{preset.description}</p>
      </div>

      <div className="control-group">
        <label htmlFor="highTreatment">Traitement des aigus</label>
        <select
          id="highTreatment"
          value={settings.highTreatment}
          onChange={(event) =>
            updateSettings({
              highTreatment: event.target.value as PreviewSettings["highTreatment"]
            })
          }
        >
          <option value="soft">Adoucir les aigus fatigants</option>
          <option value="neutral">Rester neutre</option>
          <option value="open">Ouvrir légèrement le haut</option>
        </select>
        <p className="control-help">
          Les changements de liste ne recalculent pas automatiquement la preview.
        </p>
      </div>

      <div className="slider-row">
        <div>
          <label htmlFor="intensity">Intensité du traitement</label>
          <span>{settings.intensity} %</span>
        </div>
        <input
          id="intensity"
          type="range"
          min="0"
          max="100"
          step="1"
          value={settings.intensity}
          onChange={(event) =>
            updateSettings({
              intensity: Number(event.target.value)
            })
          }
        />
      </div>

      <div className="slider-row">
        <div>
          <label htmlFor="targetRms">Niveau cible indicatif</label>
          <span>{settings.targetRmsDb.toFixed(1)} dB RMS simple</span>
        </div>
        <input
          id="targetRms"
          type="range"
          min="-16"
          max="-12"
          step="0.5"
          value={settings.targetRmsDb}
          onChange={(event) =>
            updateSettings({
              targetRmsDb: Number(event.target.value)
            })
          }
        />
        <p className="control-help">
          Référence d’écoute pratique. Ce n’est pas une mesure LUFS officielle.
        </p>
      </div>

      <button
        className="primary-button"
        type="button"
        disabled={!hasAudio || isRendering}
        onClick={onRenderPreview}
      >
        {isRendering
          ? "Génération en cours..."
          : hasPreview
            ? "Appliquer les réglages"
            : "Générer la Preview Master"}
      </button>

      {!hasAudio && (
        <p className="message message-info">
          Importe d’abord un fichier audio pour activer la génération locale.
        </p>
      )}

      {hasPendingChanges && hasPreview && previewStatus !== "rendering" && (
        <p className="message message-warning">
          Réglages modifiés. Clique sur “Appliquer les réglages” pour recalculer la preview.
        </p>
      )}

      {previewStatus === "ready" && !hasPendingChanges && (
        <p className="message message-success">
          Preview Master générée en mémoire navigateur. Aucun export n’est créé.
        </p>
      )}

      {previewStatus === "error" && errorMessage && (
        <p className="message message-error">{errorMessage}</p>
      )}
    </section>
  );
}
