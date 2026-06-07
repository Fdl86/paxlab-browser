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
        <h2>Chaîne automatique V0.6</h2>
      </div>

      <div className="chain-badges">
        <span>-13 estimé</span>
        <span>Anti-fizz</span>
        <span>De-click</span>
        <span>EQ M/S</span>
        <span>Limiteur</span>
      </div>

      <div className="control-group">
        <label htmlFor="preset">Profil de rendu</label>
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
        <label htmlFor="highTreatment">Brillance / anti-fizz</label>
        <select
          id="highTreatment"
          value={settings.highTreatment}
          onChange={(event) =>
            updateSettings({
              highTreatment: event.target.value as PreviewSettings["highTreatment"]
            })
          }
        >
          <option value="verySoft">Très douce</option>
          <option value="soft">Plus douce</option>
          <option value="neutral">Naturelle</option>
          <option value="open">Plus ouverte</option>
        </select>
        <p className="control-help">
          Changer cette valeur ne relance pas le traitement tant que tu ne valides pas.
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
          Repère pratique proche -13 estimé. Ce n’est pas une mesure LUFS officielle.
        </p>
      </div>

      <div className="slider-row">
        <div>
          <label htmlFor="stereoWidth">Largeur stéréo</label>
          <span>{settings.stereoWidth} %</span>
        </div>
        <input
          id="stereoWidth"
          type="range"
          min="85"
          max="112"
          step="1"
          value={settings.stereoWidth}
          onChange={(event) =>
            updateSettings({
              stereoWidth: Number(event.target.value)
            })
          }
        />
      </div>

      <div className="slider-row">
        <div>
          <label htmlFor="density">Densité harmonique</label>
          <span>{settings.density} %</span>
        </div>
        <input
          id="density"
          type="range"
          min="0"
          max="80"
          step="1"
          value={settings.density}
          onChange={(event) =>
            updateSettings({
              density: Number(event.target.value)
            })
          }
        />
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
            ? "Appliquer les réglages et régénérer"
            : "Générer la Preview Master"}
      </button>

      {!hasAudio && (
        <p className="message message-info">
          Importe d’abord un fichier audio pour activer la génération locale.
        </p>
      )}

      {hasPendingChanges && hasPreview && previewStatus !== "rendering" && (
        <p className="message message-warning">
          Réglages modifiés. La Preview affichée utilise encore les réglages validés précédents.
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
