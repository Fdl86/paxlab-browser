import type { ChangeEvent } from "react";
import { useState } from "react";
import { inferAutoMasterPlan } from "../audio/autoTarget";
import { PREVIEW_PRESETS, getPresetById, getSettingsForPreset, describeSourceRepair } from "../audio/previewPresets";
import type { PreviewSettings, PreviewStatus, SourceRepairLevel, SourceAnalysisResult } from "../audio/types";

interface PreviewControlsProps {
  settings: PreviewSettings;
  previewStatus: PreviewStatus;
  hasAudio: boolean;
  hasPreview: boolean;
  hasPendingChanges: boolean;
  previewRevision: number;
  previewRenderedAt: string | null;
  sourceAnalysis: SourceAnalysisResult | null;
  errorMessage: string | null;
  onSettingsChange: (settings: PreviewSettings) => void;
  onRenderPreview: () => void;
}

type WorkMode = "simple" | "expert";

function repairHelp(level: SourceRepairLevel): string {
  if (level === "strong") {
    return "Fort : utile sur exports Suno agressifs, brillants ou proches du clipping.";
  }

  if (level === "light") {
    return "Léger : conserve davantage l’énergie quand la source est déjà propre.";
  }

  return "Normal : compromis recommandé pour la majorité des morceaux IA.";
}

export function PreviewControls({
  settings,
  previewStatus,
  hasAudio,
  hasPreview,
  hasPendingChanges,
  previewRevision,
  previewRenderedAt,
  sourceAnalysis,
  errorMessage,
  onSettingsChange,
  onRenderPreview
}: PreviewControlsProps) {
  const [mode, setMode] = useState<WorkMode>("simple");
  const preset = getPresetById(settings.presetId);
  const isRendering = previewStatus === "rendering";
  const autoPlan = sourceAnalysis ? inferAutoMasterPlan(sourceAnalysis.metrics) : null;

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
    <section className="panel controls-panel pro-controls-panel">
      <div className="panel-heading compact-heading">
        <div>
          <p className="eyebrow">Rendu local</p>
          <h2>Auto Engine V2</h2>
        </div>
        <div className="mode-toggle" aria-label="Mode de réglage">
          <button type="button" className={mode === "simple" ? "active" : ""} onClick={() => setMode("simple")}>Simple</button>
          <button type="button" className={mode === "expert" ? "active" : ""} onClick={() => setMode("expert")}>Expert</button>
        </div>
      </div>

      <div className="control-room-summary control-room-summary-v2">
        <div>
          <span>Plan auto</span>
          <strong>{autoPlan?.profileLabel ?? "Analyse"}</strong>
        </div>
        <div>
          <span>Cible</span>
          <strong>{settings.targetLufsEstimate.toFixed(1)} LUFS est.</strong>
        </div>
        <div>
          <span>Headroom</span>
          <strong>{Math.abs(settings.maxPeakDb).toFixed(1)} dB</strong>
        </div>
        <div>
          <span>Réparation</span>
          <strong>{describeSourceRepair(settings.sourceRepair).replace("Réparation source ", "")}</strong>
        </div>
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

      <div className="segmented-control-block">
        <span>Réparation source</span>
        <div className="segmented-control">
          {(["light", "normal", "strong"] as SourceRepairLevel[]).map((level) => (
            <button
              key={level}
              type="button"
              className={settings.sourceRepair === level ? "active" : ""}
              onClick={() => updateSettings({ sourceRepair: level })}
            >
              {level === "light" ? "Léger" : level === "strong" ? "Fort" : "Normal"}
            </button>
          ))}
        </div>
        <p className="control-help">{repairHelp(settings.sourceRepair)}</p>
      </div>

      <div className="slider-row primary-slider-row">
        <div>
          <label htmlFor="intensity">Intensité globale</label>
          <span>{settings.intensity} %</span>
        </div>
        <input
          id="intensity"
          type="range"
          min="24"
          max="90"
          step="1"
          value={settings.intensity}
          onChange={(event) => updateSettings({ intensity: Number(event.target.value) })}
        />
      </div>

      {mode === "expert" && (
        <div className="expert-controls">
          <div className="control-group">
            <label htmlFor="highTreatment">Brillance / anti-fizz</label>
            <select
              id="highTreatment"
              value={settings.highTreatment}
              onChange={(event) => updateSettings({ highTreatment: event.target.value as PreviewSettings["highTreatment"] })}
            >
              <option value="verySoft">Très douce</option>
              <option value="soft">Plus douce</option>
              <option value="neutral">Naturelle</option>
              <option value="open">Plus ouverte</option>
            </select>
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
              onChange={(event) => updateSettings({ stereoWidth: Number(event.target.value) })}
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
              onChange={(event) => updateSettings({ density: Number(event.target.value) })}
            />
          </div>

          <div className="slider-row">
            <div>
              <label htmlFor="targetLufs">Cible LUFS estimée</label>
              <span>{settings.targetLufsEstimate.toFixed(1)} LUFS</span>
            </div>
            <input
              id="targetLufs"
              type="range"
              min="-14.8"
              max="-11.8"
              step="0.1"
              value={settings.targetLufsEstimate}
              onChange={(event) => {
                const target = Number(event.target.value);
                updateSettings({ targetLufsEstimate: target, targetRmsDb: target + 0.7 });
              }}
            />
          </div>

          <div className="slider-row">
            <div>
              <label htmlFor="maxPeakDb">Ceiling / headroom</label>
              <span>{settings.maxPeakDb.toFixed(1)} dBTP est.</span>
            </div>
            <input
              id="maxPeakDb"
              type="range"
              min="-1.8"
              max="-0.8"
              step="0.1"
              value={settings.maxPeakDb}
              onChange={(event) => updateSettings({ maxPeakDb: Number(event.target.value) })}
            />
          </div>
        </div>
      )}

      <button
        className="primary-button big-render-button"
        type="button"
        disabled={!hasAudio || isRendering}
        onClick={onRenderPreview}
      >
        {isRendering
          ? "Génération en cours..."
          : hasPreview
            ? "Appliquer et régénérer"
            : "Générer la Preview Master"}
      </button>

      {!hasAudio && <p className="message message-info">Importe un fichier audio pour activer la génération locale.</p>}
      {previewStatus === "rendering" && <p className="message message-info">Lecture arrêtée. Nouvelle Preview en cours.</p>}
      {hasPendingChanges && hasPreview && previewStatus !== "rendering" && (
        <p className="message message-warning">Réglages modifiés. La Preview Master #{previewRevision} reste l’ancienne version tant que tu ne régénères pas.</p>
      )}
      {previewStatus === "ready" && !hasPendingChanges && (
        <p className="message message-success">Preview Master #{previewRevision}{previewRenderedAt ? ` · ${previewRenderedAt}` : ""} prête pour A/B et export.</p>
      )}
      {previewStatus === "error" && errorMessage && <p className="message message-error">{errorMessage}</p>}
    </section>
  );
}
