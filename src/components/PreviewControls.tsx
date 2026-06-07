import type { ChangeEvent } from "react";
import { PREVIEW_PRESETS, getPresetById, getSettingsForPreset } from "../audio/previewPresets";
import type { PreviewSettings, PreviewStatus } from "../audio/types";

interface PreviewControlsProps {
  settings: PreviewSettings;
  previewStatus: PreviewStatus;
  hasAudio: boolean;
  hasPreview: boolean;
  hasPendingChanges: boolean;
  previewRevision: number;
  previewRenderedAt: string | null;
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
  previewRevision,
  previewRenderedAt,
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
    const nextPresetSettings = getSettingsForPreset(nextPresetId);

    onSettingsChange({
      ...nextPresetSettings,
      targetRmsDb: settings.targetRmsDb,
      targetLufsEstimate: settings.targetLufsEstimate
    });
  }

  return (
    <section className="panel controls-panel">
      <div className="panel-heading">
        <p className="eyebrow">Preview Master locale</p>
        <h2>Chaîne automatique V0.8</h2>
      </div>

      <div className="chain-badges">
        <span>Cible auto : {settings.targetLufsEstimate.toFixed(1)} LUFS est.</span>
        <span>Anti-fizz</span>
        <span>De-click</span>
        <span>EQ M/S</span>
        <span>Limiteur sécurité</span>
      </div>

      <div className="auto-target-card">
        <span>Cible calculée depuis l’analyse</span>
        <strong>{settings.targetLufsEstimate.toFixed(1)} LUFS estimé</strong>
        <p>Conversion interne : {settings.targetRmsDb.toFixed(1)} dB RMS simple. La valeur s’adapte au niveau, aux aigus et à la dynamique du fichier source.</p>
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

      {previewStatus === "rendering" && (
        <p className="message message-info">
          Lecture arrêtée. Génération d’une nouvelle Preview Master en cours.
        </p>
      )}

      {hasPendingChanges && hasPreview && previewStatus !== "rendering" && (
        <p className="message message-warning">
          Réglages modifiés. La Preview Master #{previewRevision} reste l’ancienne version.
          Clique sur “Appliquer les réglages et régénérer” pour créer une nouvelle Preview.
        </p>
      )}

      {previewStatus === "ready" && !hasPendingChanges && (
        <p className="message message-success">
          Preview Master #{previewRevision}{previewRenderedAt ? ` · version générée à ${previewRenderedAt}` : ""}.
          Elle est sélectionnée pour la prochaine lecture et peut être exportée localement.
        </p>
      )}

      {previewStatus === "error" && errorMessage && (
        <p className="message message-error">{errorMessage}</p>
      )}
    </section>
  );
}
